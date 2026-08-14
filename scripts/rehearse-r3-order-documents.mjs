#!/usr/bin/env node

/** Ensayo aislado de 0024 sobre un export D1 en 0023; nunca toca el origen. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function argsOf(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--') continue;
    if (argv[i] === '--baseline') args.baseline = argv[++i];
    else if (argv[i] === '--output-dir') args.output = argv[++i];
    else throw new Error(`Argumento desconocido: ${argv[i]}`);
  }
  if (!args.baseline || !args.output) throw new Error('Uso: --baseline <export.sql> --output-dir <directorio>');
  return args;
}

const scalar = (db, sql) => Number(db.prepare(sql).get()?.value ?? 0);
const exists = (db, table) => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table));
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const DOCUMENT_TABLES = ['order_document_templates', 'order_documents',
  'order_document_artifacts', 'order_document_events'];

function integrity(db, phase) {
  if (scalar(db, 'SELECT count(*) AS value FROM pragma_foreign_key_check') !== 0) throw new Error(`${phase}: foreign keys`);
  if (scalar(db, "SELECT count(*) AS value FROM pragma_integrity_check WHERE integrity_check <> 'ok'") !== 0) throw new Error(`${phase}: integrity`);
}

function snapshot(db) {
  const tables = ['orders', 'order_items', 'payments', 'payment_transactions', 'refunds',
    'refund_items', 'fulfillments', 'fulfillment_items', 'return_requests',
    'return_request_lines', 'return_events', 'return_inventory_movements',
    'return_exchange_lines', 'inventory_balances', 'inventory_movements',
    'inventory_locations', 'inventory_location_balances', 'inventory_location_movements'];
  return Object.fromEntries(tables.map((table) => [table,
    db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));
}

function verify(db, phase) {
  integrity(db, phase);
  for (const table of DOCUMENT_TABLES) {
    if (!exists(db, table)) throw new Error(`${phase}: falta ${table}`);
    if (scalar(db, `SELECT count(*) AS value FROM ${table}`) !== 0) {
      throw new Error(`${phase}: la migración inventó filas en ${table}`);
    }
  }
}

const args = argsOf(process.argv.slice(2));
const baseline = resolve(args.baseline);
const directory = join(resolve(args.output), `r3-order-documents-${Date.now()}`);
mkdirSync(directory, { recursive: true });
const forwardPath = join(directory, 'forward.sqlite');
const dumpPath = join(directory, 'migrated.sql');
const restorePath = join(directory, 'restored.sqlite');
const db = new DatabaseSync(forwardPath);
db.exec('PRAGMA foreign_keys=OFF');
const sql = readFileSync(baseline, 'utf8');
if (!/CREATE TABLE (?:IF NOT EXISTS )?[`"]?orders\b/i.test(sql)) {
  for (const name of readdirSync(resolve('migrations'))
    .filter((name) => /^00(?:0[1-9]|1[0-9]|2[0-3])_.*\.sql$/.test(name)).sort()) {
    db.exec(readFileSync(resolve('migrations', name), 'utf8'));
  }
}
db.exec(sql);
db.exec('PRAGMA foreign_keys=ON');
integrity(db, 'preflight');
if (!exists(db, 'return_requests') || exists(db, 'order_documents')) {
  throw new Error('baseline debe estar en 0023');
}
const beforeHash = hash(snapshot(db));
db.exec(readFileSync(resolve('migrations/0024_order_documents.sql'), 'utf8'));
verify(db, 'forward');
if (hash(snapshot(db)) !== beforeHash) throw new Error('la migración alteró datos existentes');
const summary = {
  orders: scalar(db, 'SELECT count(*) AS value FROM orders'),
  fulfillments: scalar(db, 'SELECT count(*) AS value FROM fulfillments'),
  refunds: scalar(db, 'SELECT count(*) AS value FROM refunds'),
  returns: scalar(db, 'SELECT count(*) AS value FROM return_requests'),
  beforeHash,
};
db.close();
const dump = execFileSync('/usr/bin/sqlite3', [forwardPath, '.dump'],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
writeFileSync(dumpPath, dump);
const restored = new DatabaseSync(restorePath);
restored.exec('PRAGMA foreign_keys=OFF');
restored.exec(dump);
restored.exec('PRAGMA foreign_keys=ON');
verify(restored, 'restore');
if (hash(snapshot(restored)) !== beforeHash) throw new Error('restore divergente');
restored.close();
process.stdout.write(`${JSON.stringify({ ...summary, dumpBytes: statSync(dumpPath).size,
  artifactDirectory: directory }, null, 2)}\n`);
