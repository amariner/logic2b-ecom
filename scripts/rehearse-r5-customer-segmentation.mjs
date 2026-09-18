#!/usr/bin/env node

/** Ensayo aislado 0044 → 0045. El restore de historia con guards activos se
 * verifica además en customer-segmentation-backup.test.ts; .dump no lo sustituye. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const TABLES = ['customer_segment_definitions', 'customer_segment_runs',
  'customer_segment_run_snapshots', 'customer_segment_results', 'customer_segment_publications'];
function argsOf(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === '--') continue;
    if (argv[index] === '--baseline-sqlite') args.baseline = argv[++index];
    else if (argv[index] === '--output-dir') args.output = argv[++index];
    else throw new Error(`Argumento desconocido: ${argv[index]}`);
  }
  if (!args.baseline || !args.output) throw new Error('Uso: --baseline-sqlite <0044.sqlite> --output-dir <directorio>');
  if (!statSync(args.baseline).isFile()) throw new Error('La base de origen debe ser un fichero existente.');
  return args;
}
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const scalar = (db, sql) => Number(db.prepare(sql).get()?.value ?? 0);
const identifier = (name) => `"${name.replaceAll('"', '""')}"`;
function integrity(db) {
  if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Existen errores de foreign keys.');
  if (db.prepare('PRAGMA integrity_check').all().some((row) => row.integrity_check !== 'ok')) throw new Error('Falla integrity_check.');
}
function tables(db) { return db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(({ name }) => name); }
function legacySnapshot(db, names) {
  return names.map((name) => ({
    table: name,
    rows: db.prepare(`SELECT * FROM ${identifier(name)}`).all()
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  }));
}
function insert(db, table, row) {
  const entries = Object.entries(row);
  db.prepare(`INSERT INTO ${identifier(table)} (${entries.map(([key]) => identifier(key)).join(',')})
    VALUES (${entries.map(() => '?').join(',')})`).run(...entries.map(([, value]) => value));
}
function expectRejected(action, code) {
  try { action(); } catch (error) {
    if (!String(error).includes(code)) throw error;
    return;
  }
  throw new Error(`El probe esperaba rechazo ${code}.`);
}
function probe(db) {
  const timestamp = '2026-09-18T10:00:00.000Z';
  const fingerprint = 'a'.repeat(64);
  const runId = 'segment-run:rehearsal';
  const template = { conditions: [{ fact: 'orders.count', operator: 'gte', parameter: 'minimum_orders' }],
    id: 'rehearsal', parameters: [{ max: 100, min: 0, name: 'minimum_orders' }], version: 1 };
  const snapshot = {
    run_id: runId, revision: 1, state: 'requested', started_at: null, finished_at: null, cursor: null,
    total_candidates: 0, processed_candidates: 0, matched_customers: 0, error_code: null,
    source_snapshot_ref: null, source_snapshot_fingerprint: null, facts_policy_id: null,
    facts_policy_version: null, facts_captured_at: null, currency: null, last_position: 0,
    recorded_at: timestamp, actor_id: 'operator:rehearsal', idempotency_key: 'rehearsal:requested', command_fingerprint: fingerprint,
  };
  db.exec('SAVEPOINT segmentation_probe');
  try {
    insert(db, TABLES[0], { segment_id: 'rehearsal', definition_version: 1,
      template_id: template.id, template_version: 1, template_json: JSON.stringify(template),
      parameters_json: '{"minimum_orders":2}', definition_fingerprint: fingerprint,
      created_at: timestamp, created_by: 'operator:rehearsal', idempotency_key: 'rehearsal:definition', command_fingerprint: fingerprint });
    insert(db, TABLES[1], { run_id: runId, segment_id: 'rehearsal', definition_version: 1, generation: 1,
      requested_at: timestamp, requested_by: 'operator:rehearsal', idempotency_key: 'rehearsal:request', command_fingerprint: fingerprint });
    insert(db, TABLES[2], snapshot);
    insert(db, 'customer_profiles', { id: 'customer:segmentation-rehearsal', primary_email: 'segmentation-rehearsal@example.test',
      email_identity_hash: hash('segmentation-rehearsal'), status: 'active', version: 1, created_at: timestamp, updated_at: timestamp });
    insert(db, TABLES[3], { run_id: runId, customer_profile_id: 'customer:segmentation-rehearsal', position: 1,
      customer_profile_version: 1, facts_json: '{"customer.age_days":null,"orders.count":3,"orders.days_since_last":null,"orders.total_spent_cents":null}',
      facts_fingerprint: fingerprint, matches: null, missing_facts_json: null, evaluated_revision: null });
    Object.assign(snapshot, { revision: 2, state: 'running', started_at: timestamp, total_candidates: 1,
      source_snapshot_ref: 'rehearsal:source', source_snapshot_fingerprint: fingerprint, facts_policy_id: 'rehearsal',
      facts_policy_version: 1, facts_captured_at: timestamp, currency: 'EUR', cursor: 'rehearsal:cursor', idempotency_key: 'rehearsal:start' });
    insert(db, TABLES[2], snapshot);
    expectRejected(() => db.exec(`UPDATE customer_segment_results SET facts_fingerprint='${'b'.repeat(64)}'`), 'immutable');
    db.exec('SAVEPOINT rejected_progress');
    try {
      db.exec("UPDATE customer_segment_results SET matches=1,missing_facts_json='[]',evaluated_revision=3");
      expectRejected(() => insert(db, TABLES[2], { ...snapshot, revision: 3, idempotency_key: 'rehearsal:invalid-progress' }), 'snapshot_invalid');
    } finally {
      db.exec('ROLLBACK TO rejected_progress; RELEASE rejected_progress');
    }
    if (scalar(db, 'SELECT count(*) AS value FROM customer_segment_results WHERE evaluated_revision IS NOT NULL') !== 0) {
      throw new Error('El lote rechazado dejó resultados parciales.');
    }
    db.exec("UPDATE customer_segment_results SET matches=1,missing_facts_json='[]',evaluated_revision=3");
    Object.assign(snapshot, { revision: 3, processed_candidates: 1, matched_customers: 1,
      last_position: 1, cursor: null, idempotency_key: 'rehearsal:progress' });
    insert(db, TABLES[2], snapshot);
    Object.assign(snapshot, { revision: 4, state: 'completed', finished_at: timestamp, idempotency_key: 'rehearsal:complete' });
    insert(db, TABLES[2], snapshot);
    insert(db, TABLES[4], { segment_id: 'rehearsal', publication_version: 1, run_id: runId, definition_version: 1,
      generation: 1, published_at: timestamp, published_by: 'operator:rehearsal', idempotency_key: 'rehearsal:publish', command_fingerprint: fingerprint });
    expectRejected(() => db.exec('UPDATE customer_segment_publications SET publication_version=2'), 'immutable');
    integrity(db);
  } finally {
    db.exec('ROLLBACK TO segmentation_probe; RELEASE segmentation_probe');
  }
}

const args = argsOf(process.argv.slice(2));
const directory = join(resolve(args.output), `r5-customer-segmentation-${Date.now()}`);
mkdirSync(directory, { recursive: true });
const forwardPath = join(directory, 'forward.sqlite');
execFileSync('/usr/bin/sqlite3', [resolve(args.baseline), `.backup ${JSON.stringify(forwardPath)}`]);
const db = new DatabaseSync(forwardPath);
try {
  db.exec('PRAGMA foreign_keys=ON');
  integrity(db);
  const names = tables(db);
  if (!names.includes('customer_return_access_refs') || TABLES.some((name) => names.includes(name))) {
    throw new Error('La base debe estar en 0044, sin segmentación instalada.');
  }
  const before = legacySnapshot(db, names);
  const beforeHash = hash(before);
  db.exec(readFileSync(resolve('migrations/0045_customer_segmentation.sql'), 'utf8'));
  integrity(db);
  if (hash(legacySnapshot(db, names)) !== beforeHash) throw new Error('La expansión alteró datos legacy.');
  const added = tables(db).filter((name) => !names.includes(name)).sort();
  if (JSON.stringify(added) !== JSON.stringify([...TABLES].sort())) throw new Error('La expansión no contiene exactamente las cinco tablas previstas.');
  if (TABLES.some((name) => scalar(db, `SELECT count(*) AS value FROM ${name}`) !== 0)) throw new Error('La expansión hizo un backfill no autorizado.');
  probe(db);
  integrity(db);
  if (hash(legacySnapshot(db, names)) !== beforeHash || TABLES.some((name) => scalar(db, `SELECT count(*) AS value FROM ${name}`) !== 0)) {
    throw new Error('Los probes no devolvieron la copia al estado inicial.');
  }
  const report = {
    baseline: resolve(args.baseline), migration: '0045_customer_segmentation.sql',
    legacyTables: before.map(({ table, rows }) => ({ table, count: rows.length })),
    beforeHash, afterHash: hash(legacySnapshot(db, names)), newEmptyTables: TABLES,
    foreignKeyErrors: 0, integrity: 'ok', transactionalProbe: 'passed',
    restoreEvidence: 'Run tests/customer-segmentation-backup.test.ts with final guards active.',
    artifactDirectory: directory,
  };
  writeFileSync(join(directory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally { db.close(); }
