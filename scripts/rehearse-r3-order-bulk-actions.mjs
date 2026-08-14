#!/usr/bin/env node

/** Ensayo aislado de 0018 sobre un export D1 en 0017; nunca toca la base origen. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--') continue;
    if (argv[index] === '--baseline') result.baseline = argv[++index];
    else if (argv[index] === '--output-dir') result.outputDir = argv[++index];
    else throw new Error(`Argumento desconocido: ${argv[index]}`);
  }
  if (!result.baseline || !result.outputDir) {
    throw new Error('Uso: node scripts/rehearse-r3-order-bulk-actions.mjs --baseline <export.sql> --output-dir <directorio>');
  }
  return result;
}

function scalar(db, sql) {
  return Number(db.prepare(sql).get()?.value ?? 0);
}

function assertZero(db, id, sql) {
  const failures = scalar(db, sql);
  if (failures !== 0) throw new Error(`${id} bloqueado: ${failures}`);
}

function tableExists(db, table) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table));
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function legacySnapshot(db) {
  return {
    orders: db.prepare('SELECT * FROM orders ORDER BY id').all(),
    tags: db.prepare('SELECT * FROM order_tags ORDER BY id').all(),
    assignments: db.prepare('SELECT * FROM order_tag_assignments ORDER BY order_id, tag_id').all(),
    holds: db.prepare('SELECT * FROM order_holds ORDER BY id').all(),
    jobs: db.prepare('SELECT * FROM platform_job_runs ORDER BY run_id').all(),
    audit: db.prepare('SELECT * FROM audit_log ORDER BY audit_id').all(),
  };
}

function verifyIntegrity(db, phase) {
  assertZero(db, `${phase}:foreign_keys`, 'SELECT count(*) AS value FROM pragma_foreign_key_check');
  assertZero(db, `${phase}:integrity`, "SELECT count(*) AS value FROM pragma_integrity_check WHERE integrity_check <> 'ok'");
}

function verifyExpanded(db, phase) {
  verifyIntegrity(db, phase);
  if (!tableExists(db, 'order_bulk_batches') || !tableExists(db, 'order_bulk_batch_rows')) {
    throw new Error(`${phase} bloqueado: faltan tablas de acciones masivas`);
  }
  assertZero(db, `${phase}:batches`, 'SELECT count(*) AS value FROM order_bulk_batches');
  assertZero(db, `${phase}:rows`, 'SELECT count(*) AS value FROM order_bulk_batch_rows');
}

const args = parseArgs(process.argv.slice(2));
const baselinePath = resolve(args.baseline);
const runDirectory = join(resolve(args.outputDir), `r3-order-bulk-actions-${Date.now()}`);
mkdirSync(runDirectory, { recursive: true });
const forwardPath = join(runDirectory, 'forward.sqlite');
const dumpPath = join(runDirectory, 'migrated.sql');
const restoredPath = join(runDirectory, 'restored.sqlite');

const db = new DatabaseSync(forwardPath);
db.exec('PRAGMA foreign_keys = OFF;');
const baselineSql = readFileSync(baselinePath, 'utf8');
if (!/CREATE TABLE (?:IF NOT EXISTS )?[`"]?orders\b/i.test(baselineSql)) {
  for (const migration of readdirSync(resolve('migrations'))
    .filter((name) => /^00(?:0[1-9]|1[0-7])_.*\.sql$/.test(name))
    .sort()) {
    db.exec(readFileSync(resolve('migrations', migration), 'utf8'));
  }
}
db.exec(baselineSql);
if (!baselineSql.trim()) {
  const seedSql = execFileSync(process.execPath, [resolve('seed/generate.ts')], {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  }).replace(/^DELETE FROM order_bulk_batch(?:_rows|es);?$/gmu, '');
  db.exec(seedSql);
}
db.exec('PRAGMA foreign_keys = ON;');
verifyIntegrity(db, 'preflight');
if (!tableExists(db, 'order_holds')) throw new Error('preflight bloqueado: falta 0017');
if (tableExists(db, 'order_bulk_batches')) throw new Error('preflight bloqueado: baseline ya contiene 0018');

const legacyHash = digest(legacySnapshot(db));
db.exec(readFileSync(resolve('migrations/0018_order_bulk_actions.sql'), 'utf8'));
verifyExpanded(db, 'forward');
if (digest(legacySnapshot(db)) !== legacyHash) throw new Error('forward bloqueado: cambió el contrato legacy');
const schemaHash = digest({
  batches: db.prepare('SELECT name, type, sql FROM sqlite_master WHERE tbl_name = ? ORDER BY name').all('order_bulk_batches'),
  rows: db.prepare('SELECT name, type, sql FROM sqlite_master WHERE tbl_name = ? ORDER BY name').all('order_bulk_batch_rows'),
});
const summary = {
  baselineBytes: statSync(baselinePath).size,
  orders: scalar(db, 'SELECT count(*) AS value FROM orders'),
  legacyHash,
  schemaHash,
};
db.close();

const dump = execFileSync('/usr/bin/sqlite3', [forwardPath, '.dump'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
writeFileSync(dumpPath, dump, 'utf8');
const restored = new DatabaseSync(restoredPath);
restored.exec('PRAGMA foreign_keys = OFF;');
restored.exec(dump);
restored.exec('PRAGMA foreign_keys = ON;');
verifyExpanded(restored, 'restore');
if (digest(legacySnapshot(restored)) !== legacyHash) throw new Error('restore bloqueado: hash legacy distinto');
const restoredSchemaHash = digest({
  batches: restored.prepare('SELECT name, type, sql FROM sqlite_master WHERE tbl_name = ? ORDER BY name').all('order_bulk_batches'),
  rows: restored.prepare('SELECT name, type, sql FROM sqlite_master WHERE tbl_name = ? ORDER BY name').all('order_bulk_batch_rows'),
});
if (restoredSchemaHash !== schemaHash) throw new Error('restore bloqueado: hash de esquema distinto');
restored.close();

process.stdout.write(`${JSON.stringify({
  ...summary,
  dumpBytes: statSync(dumpPath).size,
  artifactDirectory: runDirectory,
}, null, 2)}\n`);
