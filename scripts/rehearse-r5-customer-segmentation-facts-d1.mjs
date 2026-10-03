#!/usr/bin/env node

/** Fuente de hechos R5.6c: D1/workerd aislado, política sintética y cero bindings remotos. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arguments_ = process.argv.slice(2).filter((argument) => argument !== '--');
if (arguments_.length > 2 || (arguments_.length && (arguments_[0] !== '--output-dir' || !arguments_[1]))) {
  throw new Error('Uso: node scripts/rehearse-r5-customer-segmentation-facts-d1.mjs [--output-dir <directorio>]');
}
const outputRoot = resolve(arguments_[1] ?? join(root, 'tmp/segmentation-facts-d1'));
await mkdir(outputRoot, { recursive: true });
const output = await mkdtemp(join(outputRoot, 'rehearsal-'));
// Evita telemetría y escrituras del CLI fuera del directorio aislado.
process.env.WRANGLER_SEND_METRICS = 'false';
process.env.WRANGLER_LOG_PATH = join(output, 'wrangler.log');
const { getPlatformProxy, unstable_splitSqlQuery: splitSql } = await import('wrangler');
const configPath = join(output, 'wrangler.json');
await writeFile(configPath, JSON.stringify({
  name: 'segmentation-facts-rehearsal-local', compatibility_date: '2026-07-01',
  d1_databases: [
    { binding: 'SOURCE', database_name: 'segmentation-facts-source-local', database_id: '00000000-0000-0000-0000-000000000001', remote: false },
    { binding: 'RESTORE', database_name: 'segmentation-facts-restore-local', database_id: '00000000-0000-0000-0000-000000000002', remote: false },
  ],
}, null, 2));

// Compilador transitivo ya instalado por Wrangler; sin instalar dependencias.
const wranglerRequire = createRequire(import.meta.resolve('wrangler'));
const { build } = wranglerRequire('esbuild');
const bundlePath = join(output, 'harness.mjs');
await build({
  stdin: { contents: [
    "export { createD1CustomerSegmentFactsSource, CUSTOMER_SEGMENT_SOURCE_LIMITS } from './src/composition/customer-segmentation-facts';",
    "export { defineCustomerSegmentFactsPolicy } from './src/modules/customers/application/customer-segmentation-facts';",
    "export { segmentFingerprint } from './src/modules/customers/application/customer-segmentation-contract';",
    "export { createD1CustomerSegmentationRepository } from './src/modules/customers/infrastructure/d1-customer-segmentation-repository';",
    "export { defineCustomerSegmentTemplate } from './src/modules/customers/domain/customer-segmentation';",
    "export { exportD1Backup } from './src/composition/backup';",
    "export { BACKUP_TABLES, BACKUP_SCHEMA_VERSION } from './src/lib/backup';",
  ].join('\n'), resolveDir: root, loader: 'ts' },
  bundle: true, platform: 'node', target: 'node22', format: 'esm', outfile: bundlePath,
});
const {
  createD1CustomerSegmentFactsSource, CUSTOMER_SEGMENT_SOURCE_LIMITS,
  defineCustomerSegmentFactsPolicy, segmentFingerprint,
  createD1CustomerSegmentationRepository, defineCustomerSegmentTemplate,
  exportD1Backup, BACKUP_TABLES, BACKUP_SCHEMA_VERSION,
} = await import(pathToFileURL(bundlePath).href);
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const ordered = (rows) => [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
async function query(db, sql, ...bindings) {
  const result = await db.prepare(sql).bind(...bindings).all();
  assert.equal(result.success, true);
  return result.results;
}
async function readTables(db, names) {
  const result = await db.batch(names.map((table) => db.prepare(`SELECT * FROM ${table}`)));
  assert.equal(result.length, names.length);
  assert.ok(result.every((entry) => entry.success));
  return Object.fromEntries(names.map((table, index) => [table, ordered(result[index].results)]));
}
async function executeSql(db, sql) {
  const statements = splitSql(sql).filter((statement) => statement.trim());
  const result = await db.batch(statements.map((statement) => db.prepare(statement)));
  assert.equal(result.length, statements.length);
  assert.ok(result.every((entry) => entry.success));
  return statements.length;
}
function insert(db, table, row) {
  const columns = Object.keys(row);
  return db.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`)
    .bind(...columns.map((column) => row[column]));
}
const policy = defineCustomerSegmentFactsPolicy({
  schemaVersion: 1, id: 'facts.rehearsal-captured', version: 1,
  population: 'active_profiles', orderStatuses: ['paid', 'shipped', 'delivered'],
  orderEligibility: 'successful_capture', activityBasis: 'last_successful_capture',
  amountBasis: 'captured_payments', refunds: 'subtract', storedValue: 'exclude',
  paymentAdjustments: 'reject', unsettledPayments: 'reject', missingPaymentEvidence: 'null',
  currency: 'EUR', foreignCurrency: 'reject', dayBoundary: 'utc_calendar_days',
});
const report = {
  runtime: 'Wrangler getPlatformProxy / local workerd D1', remoteBindings: false, envFiles: [],
  nodeVersion: process.version, wranglerVersion: wranglerRequire('../package.json').version,
  schema: BACKUP_SCHEMA_VERSION, output, policy, limits: CUSTOMER_SEGMENT_SOURCE_LIMITS, checks: [],
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
  for (const migration of migrations) {
    const sql = await readFile(join(root, 'migrations', migration), 'utf8');
    await Promise.all([executeSql(source, sql), executeSql(restored, sql)]);
  }
  check('Dos D1 vacías reciben exclusivamente las migraciones existentes hasta 0045', { migrationCount: migrations.length });

  const base = Date.now();
  const daysAgo = (days) => new Date(base - days * 86_400_000).toISOString();
  const profileAt = daysAgo(30);
  const orderAt = daysAgo(14);
  const captureAt = daysAgo(7);
  const profileId = 'customer:facts-captured';
  const missingId = 'customer:facts-missing';
  const emptyId = 'customer:facts-empty';
  const mergedId = 'customer:facts-merged';
  const profileRow = (id) => ({
    id, primary_email: `${id.slice('customer:'.length)}@example.test`, email_identity_hash: hash(id),
    status: 'active', version: 1, created_at: profileAt, updated_at: profileAt,
  });
  await source.batch([profileId, missingId, emptyId].map((id) => insert(source, 'customer_profiles', profileRow(id))));
  await source.batch([insert(source, 'customer_profiles', {
    ...profileRow(mergedId), status: 'merged', merged_into_profile_id: profileId,
  })]);
  await source.batch([
    [1, profileId], [2, missingId], [3, mergedId],
  ].map(([id, customerProfileId]) => insert(source, 'orders', {
    id, order_number: `FACTS-${id}`, email: `order-${id}@example.test`,
    customer_name: 'Persona sintética del ensayo', address_json: '{}',
    subtotal_cents: 10000, shipping_cents: 0, total_cents: 10000,
    status: 'paid', currency: 'EUR', customer_profile_id: customerProfileId,
    // También se comprueba la normalización UTC de fechas legacy SQLite.
    created_at: orderAt.slice(0, 19).replace('T', ' '), updated_at: orderAt,
  })));
  await source.batch([insert(source, 'payments', {
    id: 1, order_id: 1, provider: 'simulated', currency: 'EUR', expected_amount_cents: 10000,
    status: 'partially_refunded', version: 1, idempotency_key: 'facts:payment:1',
    created_at: orderAt, updated_at: daysAgo(2),
  })]);
  const transaction = (id, type, amount, at) => insert(source, 'payment_transactions', {
    id, payment_id: 1, type, amount_cents: amount, currency: 'EUR', status: 'succeeded',
    idempotency_key: `facts:transaction:${id}`, occurred_at: at, created_at: at,
  });
  await source.batch([transaction(1, 'capture', 10000, captureAt), transaction(2, 'refund', 2500, daysAgo(2))]);

  const names = (await query(source, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name"))
    .map((row) => row.name);
  const initialHash = hash(await readTables(source, names));
  const sourceBatches = [];
  const readOnly = {
    prepare(sql) {
      assert.match(sql.trim(), /^(?:SELECT|WITH)\b/i, 'La fuente solo puede preparar lecturas.');
      assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER|ATTACH|DETACH)\b/i);
      return source.prepare(sql);
    },
    batch(statements) { sourceBatches.push(statements.length); return source.batch(statements); },
  };
  const factsSource = createD1CustomerSegmentFactsSource(readOnly, policy);
  const snapshot = await factsSource.capture();
  assert.deepEqual(sourceBatches, [7], 'La captura debe ser un solo batch de siete lecturas.');
  assert.equal(hash(await readTables(source, names)), initialHash);
  assert.equal(snapshot.candidates.length, 3);
  assert.ok(!snapshot.candidates.some((candidate) => candidate.customerProfileId === mergedId));
  const candidate = (id) => snapshot.candidates.find((value) => value.customerProfileId === id);
  const dayDifference = (at) => Math.floor(Date.parse(snapshot.capturedAt) / 86_400_000) - Math.floor(Date.parse(at) / 86_400_000);
  assert.deepEqual(candidate(profileId).facts, {
    'customer.age_days': dayDifference(profileAt), 'orders.count': 1,
    'orders.days_since_last': dayDifference(captureAt), 'orders.total_spent_cents': 7500,
  });
  assert.deepEqual(candidate(missingId).facts, {
    'customer.age_days': dayDifference(profileAt), 'orders.count': null,
    'orders.days_since_last': null, 'orders.total_spent_cents': null,
  });
  assert.deepEqual(candidate(emptyId).facts, {
    'customer.age_days': dayDifference(profileAt), 'orders.count': 0,
    'orders.days_since_last': null, 'orders.total_spent_cents': 0,
  });
  const { ref, ...content } = snapshot;
  assert.equal(ref, `source:${await segmentFingerprint(policy)}:${await segmentFingerprint(content)}`);
  assert.doesNotMatch(JSON.stringify(snapshot), /example\.test|Persona sintética|address_json|primary_email/);
  check('Captura real en siete SELECT: 10000−2500=7500 céntimos, ausencia de pago null, sin pedidos cero y merged excluido', {
    sourceRef: snapshot.ref, capturedAt: snapshot.capturedAt, candidates: snapshot.candidates.length, sourceTablesHash: initialHash,
  });

  const ignoreRefunds = defineCustomerSegmentFactsPolicy({ ...policy, refunds: 'ignore' });
  const gross = await createD1CustomerSegmentFactsSource(readOnly, ignoreRefunds).capture();
  assert.equal(gross.candidates.find((value) => value.customerProfileId === profileId).facts['orders.total_spent_cents'], 10000);
  assert.notEqual(gross.ref.split(':')[1], snapshot.ref.split(':')[1]);
  await assert.rejects(createD1CustomerSegmentFactsSource(readOnly, {
    ...policy, missingPaymentEvidence: 'reject',
  }).capture(), /carece de evidencia/);
  assert.equal(hash(await readTables(source, names)), initialHash);
  check('La política explícita cambia el importe y su huella; reject aborta por evidencia ausente sin escribir');

  let sequence = 0;
  const ctx = (key) => ({ actorId: 'actor:facts-rehearsal', idempotencyKey: `facts-rehearsal:${key}`,
    occurredAt: new Date().toISOString() });
  const repo = createD1CustomerSegmentationRepository(source, { newId: () => `facts-local-${++sequence}` });
  const template = defineCustomerSegmentTemplate({ id: 'spending.minimum', version: 1,
    parameters: [{ name: 'minimum', min: 1, max: 100000 }],
    conditions: [{ fact: 'orders.total_spent_cents', operator: 'gte', parameter: 'minimum' }] });
  const segmentId = 'segment.facts-rehearsal';
  await repo.appendDefinition({ ...ctx('definition'), segmentId, expectedVersion: 0, template, parameters: { minimum: 7200 } });
  const run = (await repo.requestRun({ ...ctx('request'), segmentId, definitionVersion: 1 })).value;
  await repo.startRun({ ...ctx('start'), runId: run.runId, expectedRevision: 1, snapshot });
  let current = (await repo.readRun(run.runId)).snapshot;
  while (current.processedCandidates < current.totalCandidates) {
    current = (await repo.appendProgress({ ...ctx(`progress:${current.revision}`), runId: run.runId,
      expectedRevision: current.revision, cursor: current.cursor, limit: 2 })).value;
  }
  await repo.completeRun({ ...ctx('complete'), runId: run.runId, expectedRevision: current.revision });
  const publication = { ...ctx('publish'), segmentId, runId: run.runId, expectedPublicationVersion: 0 };
  await repo.publish(publication);
  const membership = await repo.readMembership(segmentId, profileId);
  assert.equal(membership.state, 'evaluated');
  assert.equal(membership.matches, true);
  const missing = await repo.readMembership(segmentId, missingId);
  assert.equal(missing.state, 'evaluated');
  assert.equal(missing.matches, false);
  assert.deepEqual(missing.missingFacts, ['orders.total_spent_cents']);
  assert.equal((await repo.readMembership(segmentId, emptyId)).matches, false);
  const completed = await repo.readRun(run.runId);
  assert.equal(completed.snapshot.sourceSnapshotRef, snapshot.ref);
  assert.equal(completed.snapshot.factsPolicyId, policy.id);
  assert.equal(completed.snapshot.factsCapturedAt, snapshot.capturedAt);
  assert.equal(completed.snapshot.matchedCustomers, 1);
  check('La captura alimenta definición→solicitud→inicio→progreso→completado→publicación, conservando ref/política/fecha', {
    runId: run.runId, processedCandidates: completed.snapshot.processedCandidates,
    matchedCustomers: completed.snapshot.matchedCustomers,
  });

  await source.batch([transaction(3, 'refund', 500, daysAgo(1))]);
  const afterRefundHash = hash(await readTables(source, names));
  const changed = await factsSource.capture();
  assert.equal(changed.candidates.find((value) => value.customerProfileId === profileId).facts['orders.total_spent_cents'], 7000);
  assert.notEqual(changed.ref, snapshot.ref);
  assert.equal(candidate(profileId).facts['orders.total_spent_cents'], 7500);
  assert.equal((await repo.readRun(run.runId)).snapshot.sourceSnapshotRef, snapshot.ref);
  assert.equal((await repo.readMembership(segmentId, profileId)).matches, true);
  assert.equal(hash(await readTables(source, names)), afterRefundHash);
  check('Otro reembolso cambia la nueva captura a 7000 sin reescribir los 7500 ni la publicación anterior');

  const backup = await exportD1Backup(source);
  const backupPath = join(output, `backup-schema-${BACKUP_SCHEMA_VERSION}.sql`);
  await writeFile(backupPath, backup.sql);
  const restoreStatements = await executeSql(restored, backup.sql);
  const sourceTables = await readTables(source, BACKUP_TABLES);
  assert.deepEqual(await readTables(restored, BACKUP_TABLES), sourceTables);
  const restoredRepo = createD1CustomerSegmentationRepository(restored);
  assert.deepEqual(await restoredRepo.readRun(run.runId), await repo.readRun(run.runId));
  assert.deepEqual(await restoredRepo.readMembership(segmentId, profileId), membership);
  assert.equal((await restoredRepo.publish(publication)).outcome, 'replayed');
  assert.equal((await restoredRepo.readRun(run.runId)).snapshot.sourceSnapshotRef, snapshot.ref);
  assert.deepEqual(await query(source, 'PRAGMA foreign_key_check'), []);
  assert.deepEqual(await query(restored, 'PRAGMA foreign_key_check'), []);
  check('Backup38 restaura todas las filas, referencia y pertenencia publicadas con replay idempotente y cero errores FK', {
    tableCount: BACKUP_TABLES.length, tablesHash: hash(sourceTables), restoreStatements,
    backupPath, backupSha256: createHash('sha256').update(backup.sql).digest('hex'),
  });

  // La prueba de volumen va al final: no altera la evidencia anterior ni necesita truncar tablas.
  await source.batch(Array.from({ length: 97 }, (_, index) => insert(source, 'customer_profiles',
    profileRow(`customer:facts-limit-${String(index + 1).padStart(3, '0')}`))));
  const limit100Hash = hash(await readTables(source, names));
  const maximum = await factsSource.capture();
  assert.equal(maximum.candidates.length, 100);
  assert.equal(new Set(maximum.candidates.map((value) => value.customerProfileId)).size, 100);
  assert.equal(hash(await readTables(source, names)), limit100Hash);
  check('100 perfiles activos se capturan completos, sin truncamiento ni escrituras', { candidates: maximum.candidates.length });

  await source.batch([insert(source, 'customer_profiles', profileRow('customer:facts-limit-101'))]);
  const limit101Hash = hash(await readTables(source, names));
  await assert.rejects(factsSource.capture(), /límite técnico de 100 \(profiles\)/);
  assert.equal(hash(await readTables(source, names)), limit101Hash);
  assert.ok(sourceBatches.every((length) => length === 7));
  check('101 perfiles activos abortan toda la captura y conservan todas las tablas', {
    captureAttempts: sourceBatches.length, readBatchSize: 7, sourceTablesHash: limit101Hash,
  });
  report.result = 'passed';
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
