#!/usr/bin/env node

/** Ensayo reproducible con D1 local/workerd; nunca utiliza bindings remotos. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getPlatformProxy, unstable_splitSqlQuery as splitSql } from 'wrangler';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arguments_ = process.argv.slice(2).filter((argument) => argument !== '--');
if (arguments_.length > 2 || (arguments_.length && (arguments_[0] !== '--output-dir' || !arguments_[1]))) {
  throw new Error('Uso: node scripts/rehearse-r5-customer-segmentation-d1.mjs [--output-dir <directorio>]');
}
const outputRoot = resolve(arguments_[1] ?? join(root, 'tmp/segmentation-d1'));
await mkdir(outputRoot, { recursive: true });
const output = await mkdtemp(join(outputRoot, 'rehearsal-'));
const configPath = join(output, 'wrangler.json');
await writeFile(configPath, JSON.stringify({
  name: 'segmentation-rehearsal-local', compatibility_date: '2026-07-01',
  d1_databases: [
    { binding: 'SOURCE', database_name: 'segmentation-source-local', database_id: '00000000-0000-0000-0000-000000000001', remote: false },
    { binding: 'RESTORE', database_name: 'segmentation-restore-local', database_id: '00000000-0000-0000-0000-000000000002', remote: false },
  ],
}, null, 2));

// Se reutiliza el compilador ya instalado por Wrangler; ninguna dependencia nueva.
const wranglerRequire = createRequire(import.meta.resolve('wrangler'));
const { build } = wranglerRequire('esbuild');
const bundlePath = join(output, 'harness.mjs');
await build({
  stdin: { contents: [
    "export { createD1CustomerSegmentationRepository } from './src/modules/customers/infrastructure/d1-customer-segmentation-repository';",
    "export { createCustomerSegmentFacts, defineCustomerSegmentTemplate } from './src/modules/customers/domain/customer-segmentation';",
    "export { exportD1Backup } from './src/composition/backup';",
    "export { BACKUP_TABLES, BACKUP_SCHEMA_VERSION } from './src/lib/backup';",
    "export { CUSTOMER_SEGMENT_BACKUP_TABLES } from './src/modules/customers';",
    "export { seedStatements } from './seed/seed';",
  ].join('\n'), resolveDir: root, loader: 'ts' },
  bundle: true, platform: 'node', target: 'node22', format: 'esm', outfile: bundlePath,
});
const {
  createD1CustomerSegmentationRepository, createCustomerSegmentFacts,
  defineCustomerSegmentTemplate, exportD1Backup,
  BACKUP_TABLES, BACKUP_SCHEMA_VERSION, CUSTOMER_SEGMENT_BACKUP_TABLES, seedStatements,
} = await import(pathToFileURL(bundlePath).href);
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const ordered = (rows) => [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
async function query(db, sql, ...bindings) { return (await db.prepare(sql).bind(...bindings).all()).results; }
async function count(db, table, runId) {
  return (await query(db, `SELECT count(*) AS value FROM ${table}${runId ? ' WHERE run_id=?' : ''}`, ...(runId ? [runId] : [])))[0].value;
}
async function readTables(db, names) {
  const result = await db.batch(names.map((table) => db.prepare(`SELECT * FROM ${table}`)));
  assert.equal(result.length, names.length);
  return Object.fromEntries(names.map((table, index) => [table, ordered(result[index].results)]));
}
async function executeSql(db, sql) {
  const statements = splitSql(sql).filter((statement) => statement.trim());
  const result = await db.batch(statements.map((statement) => db.prepare(statement)));
  assert.equal(result.length, statements.length);
  assert.ok(result.every((entry) => entry.success));
  return statements.length;
}
const report = {
  runtime: 'Wrangler getPlatformProxy / local workerd D1', remoteBindings: false,
  nodeVersion: process.version, wranglerVersion: wranglerRequire('../package.json').version,
  schema: BACKUP_SCHEMA_VERSION, output, checks: [],
};
const check = (message, data = {}) => {
  report.checks.push({ message, ...data });
  console.log(`✓ ${message}`);
};
console.log(`Ensayo aislado: ${output}`);
let platform;
try {
  platform = await getPlatformProxy({ configPath, envFiles: [], remoteBindings: false,
    persist: { path: join(output, 'state') } });
  const { SOURCE: source, RESTORE: restored } = platform.env;
  const migrations = (await readdir(join(root, 'migrations'))).filter((name) => /^\d{4}_.*\.sql$/.test(name)).sort();
  assert.equal(migrations.at(-1), '0045_customer_segmentation.sql', 'Revisar el ensayo si cambia el esquema canónico.');
  for (const migration of migrations.filter((name) => name < '0045')) {
    const sql = await readFile(join(root, 'migrations', migration), 'utf8');
    await Promise.all([executeSql(source, sql), executeSql(restored, sql)]);
  }
  await source.batch(seedStatements('public-demo').map((sql) => source.prepare(sql)));
  const timestamp = new Date(Date.now() - 86_400_000).toISOString();
  const candidates = Array.from({ length: 100 }, (_, index) => ({
    customerProfileId: `customer:rehearsal-${index + 1}`, customerProfileVersion: 1,
    facts: createCustomerSegmentFacts({ 'orders.count': index % 3 === 0 ? null : index }),
  }));
  await source.batch(candidates.map((candidate, index) => source.prepare(`INSERT INTO customer_profiles
    (id,primary_email,email_identity_hash,status,version,created_at,updated_at)
    VALUES (?,?,?,'active',1,?,?)`).bind(candidate.customerProfileId,
    `rehearsal-${index + 1}@example.test`, hash(candidate.customerProfileId), timestamp, timestamp)));
  const legacyNames = (await query(source, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name"))
    .map((row) => row.name);
  const legacyBefore = await readTables(source, legacyNames);
  const legacyHash = hash(legacyBefore);
  const migration = await readFile(join(root, 'migrations/0045_customer_segmentation.sql'), 'utf8');
  await Promise.all([executeSql(source, migration), executeSql(restored, migration)]);
  assert.equal(hash(await readTables(source, legacyNames)), legacyHash);
  for (const table of CUSTOMER_SEGMENT_BACKUP_TABLES) assert.equal(await count(source, table), 0);
  check('0044 → 0045 conserva todas las filas legacy y crea cinco tablas vacías', { legacyHash, legacyTables: legacyNames.length });

  let sequence = 0;
  let minute = 0;
  const base = Date.now() - 12 * 60 * 60 * 1000;
  const ctx = (key) => ({ actorId: 'actor:rehearsal', idempotencyKey: `rehearsal:${key}`,
    occurredAt: new Date(base + (++minute * 60_000)).toISOString() });
  const batchLengths = [];
  const monitored = { prepare: source.prepare.bind(source), batch(statements) {
    batchLengths.push(statements.length);
    return source.batch(statements);
  } };
  const options = { newId: () => `local-${++sequence}` };
  const repo = createD1CustomerSegmentationRepository(monitored, options);
  const template = defineCustomerSegmentTemplate({ id: 'orders.minimum', version: 1,
    parameters: [{ name: 'minimum', min: 1, max: 100 }],
    conditions: [{ fact: 'orders.count', operator: 'gte', parameter: 'minimum' }] });
  const segmentId = 'segment.rehearsal';
  const define = (expectedVersion) => repo.appendDefinition({ ...ctx(`definition:${expectedVersion + 1}`),
    segmentId, expectedVersion, template, parameters: { minimum: expectedVersion + 1 } });
  const request = async (definitionVersion, key) => (await repo.requestRun({ ...ctx(`request:${key}`), segmentId, definitionVersion })).value;
  const sourceSnapshot = (key, values = candidates) => ({ ref: `source:${key}`, policyId: 'facts.synthetic', policyVersion: 1,
    capturedAt: timestamp, currency: 'EUR', candidates: values });
  await define(0);
  const first = await request(1, 'first');
  const late = await request(1, 'late');
  const oversized = { ...ctx('start:oversized'), runId: late.runId, expectedRevision: 1,
    snapshot: sourceSnapshot('oversized', [...candidates, { ...candidates[0], customerProfileId: 'customer:over-limit' }]) };
  await assert.rejects(repo.startRun(oversized), /límite técnico de 100/);
  assert.equal(await count(source, 'customer_segment_results', late.runId), 0);
  assert.equal(await count(source, 'customer_segment_run_snapshots', late.runId), 1);
  check('101 candidatos se rechazan antes de escribir población o inicio');

  const firstStart = { ...ctx('start:first'), runId: first.runId, expectedRevision: 1, snapshot: sourceSnapshot('first') };
  const beforeStartBatches = batchLengths.length;
  await repo.startRun(firstStart);
  assert.deepEqual(batchLengths.slice(beforeStartBatches).filter((length) => length > 1), [101]);
  assert.equal(await count(source, 'customer_segment_results', first.runId), 100);
  check('100 candidatos y su fotografía se importan en un único db.batch de 101 sentencias');

  let injectFailure = true;
  const faulty = { prepare: source.prepare.bind(source), batch(statements) {
    if (injectFailure && statements.length === 101) {
      injectFailure = false;
      return source.batch([...statements, source.prepare('INSERT INTO missing_segmentation_rehearsal_table (id) VALUES (1)')]);
    }
    return source.batch(statements);
  } };
  const failedRepo = createD1CustomerSegmentationRepository(faulty, options);
  await assert.rejects(failedRepo.startRun({ ...ctx('start:injected'), runId: late.runId,
    expectedRevision: 1, snapshot: sourceSnapshot('injected') }), /missing_segmentation_rehearsal_table/);
  assert.equal(injectFailure, false);
  assert.equal(await count(source, 'customer_segment_results', late.runId), 0);
  assert.equal(await count(source, 'customer_segment_run_snapshots', late.runId), 1);
  check('Un fallo D1 inyectado tras el lote revierte candidatos e inicio completos');
  await assert.rejects(repo.startRun({ ...ctx('start:reused-source'), runId: late.runId,
    expectedRevision: 1, snapshot: sourceSnapshot('first', [
      { ...candidates[0], facts: createCustomerSegmentFacts({ 'orders.count': 50 }) }, ...candidates.slice(1),
    ]) }), (error) => error.code === 'customer_segmentation_conflict');
  assert.equal(await count(source, 'customer_segment_results', late.runId), 0);
  assert.equal(await count(source, 'customer_segment_run_snapshots', late.runId), 1);
  check('Reutilizar una referencia con otros hechos aborta también todo el lote');

  async function finish(run, key, start = true) {
    if (start) await repo.startRun({ ...ctx(`start:${key}`), runId: run.runId, expectedRevision: 1, snapshot: sourceSnapshot(key) });
    let current = (await repo.readRun(run.runId)).snapshot;
    while (current.processedCandidates < current.totalCandidates) {
      current = (await repo.appendProgress({ ...ctx(`progress:${key}:${current.revision}`), runId: run.runId,
        expectedRevision: current.revision, cursor: current.cursor, limit: 40 })).value;
    }
    await repo.completeRun({ ...ctx(`complete:${key}`), runId: run.runId, expectedRevision: current.revision });
  }
  await finish(first, 'first', false);
  const oldPublish = { ...ctx('publish:first'), segmentId, runId: first.runId, expectedPublicationVersion: 0 };
  await repo.publish(oldPublish);
  await define(1);
  const second = await request(2, 'second');
  await finish(second, 'second');
  await repo.publish({ ...ctx('publish:second'), segmentId, runId: second.runId, expectedPublicationVersion: 1 });
  await finish(late, 'late');
  await assert.rejects(repo.publish({ ...ctx('publish:late'), segmentId, runId: late.runId, expectedPublicationVersion: 2 }),
    (error) => error.code === 'customer_segmentation_conflict');
  const partial = await request(2, 'partial');
  const partialStart = await repo.startRun({ ...ctx('start:partial'), runId: partial.runId,
    expectedRevision: 1, snapshot: sourceSnapshot('partial') });
  await repo.appendProgress({ ...ctx('progress:partial'), runId: partial.runId, expectedRevision: 2, cursor: partialStart.value.cursor, limit: 40 });
  const failed = await request(2, 'failed');
  await repo.failRun({ ...ctx('fail:before-start'), runId: failed.runId, expectedRevision: 1, errorCode: 'source.unavailable' });
  const failedAfter = await request(2, 'failed-after-start');
  const failedStart = await repo.startRun({ ...ctx('start:failed'), runId: failedAfter.runId,
    expectedRevision: 1, snapshot: sourceSnapshot('failed-after-start') });
  await repo.appendProgress({ ...ctx('progress:failed'), runId: failedAfter.runId,
    expectedRevision: 2, cursor: failedStart.value.cursor, limit: 40 });
  await repo.failRun({ ...ctx('fail:after-start'), runId: failedAfter.runId, expectedRevision: 3, errorCode: 'source.unavailable' });
  const empty = await request(2, 'empty');
  await repo.startRun({ ...ctx('start:empty'), runId: empty.runId, expectedRevision: 1, snapshot: sourceSnapshot('empty', []) });
  await repo.completeRun({ ...ctx('complete:empty'), runId: empty.runId, expectedRevision: 2 });
  await define(2);
  await request(3, 'requested');
  assert.equal(hash(await readTables(source, legacyNames)), legacyHash);
  check('Lifecycle completo, publicación histórica y estados parciales conservan el hash legacy');

  const backup = await exportD1Backup(source);
  const backupPath = join(output, 'backup-schema-38.sql');
  await writeFile(backupPath, backup.sql);
  const restoreStatements = await executeSql(restored, backup.sql);
  const sourceTables = await readTables(source, BACKUP_TABLES);
  const restoredTables = await readTables(restored, BACKUP_TABLES);
  assert.deepEqual(restoredTables, sourceTables);
  assert.deepEqual(await query(source, 'PRAGMA foreign_key_check'), []);
  assert.deepEqual(await query(restored, 'PRAGMA foreign_key_check'), []);
  const restoreRepo = createD1CustomerSegmentationRepository(restored);
  assert.deepEqual(await restoreRepo.readMembership(segmentId, candidates[1].customerProfileId), { state: 'stale', reason: 'definition_changed' });
  const replay = await restoreRepo.publish(oldPublish);
  assert.equal(replay.outcome, 'replayed');
  assert.equal(replay.value.version, 1);
  assert.equal(replay.current.version, 2);
  assert.equal((await restoreRepo.readRun(partial.runId)).snapshot.processedCandidates, 40);
  check('Backup38 restaurado en D1 vacío con triggers activos, igualdad total, replay y cero errores FK', {
    restoreStatements, backupPath, tableCount: BACKUP_TABLES.length, tablesHash: hash(sourceTables),
    segmentationCounts: Object.fromEntries(CUSTOMER_SEGMENT_BACKUP_TABLES.map((table) => [table, sourceTables[table].length])),
  });
  report.result = 'passed';
  report.backupSha256 = createHash('sha256').update(backup.sql).digest('hex');
  await writeFile(join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`PASS — informe: ${join(output, 'report.json')}`);
} catch (error) {
  report.result = 'failed';
  report.error = String(error?.stack ?? error);
  await writeFile(join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  throw error;
} finally {
  await platform?.dispose();
}
