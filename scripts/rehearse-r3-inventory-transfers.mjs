#!/usr/bin/env node

/** Ensayo aislado de 0020 sobre un export D1 en 0019; nunca toca el origen. */
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
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const exists = (db, table) => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table));
function integrity(db, phase) {
  if (scalar(db, 'SELECT count(*) AS value FROM pragma_foreign_key_check') !== 0) throw new Error(`${phase}: foreign keys`);
  if (scalar(db, "SELECT count(*) AS value FROM pragma_integrity_check WHERE integrity_check <> 'ok'") !== 0) throw new Error(`${phase}: integrity`);
}
function snapshot(db) {
  return {
    balances: db.prepare('SELECT * FROM inventory_balances ORDER BY variant_id').all(),
    movements: db.prepare('SELECT * FROM inventory_movements ORDER BY id').all(),
    locations: db.prepare('SELECT * FROM inventory_locations ORDER BY id').all(),
    locationBalances: db.prepare('SELECT * FROM inventory_location_balances ORDER BY location_id, variant_id').all(),
    locationMovements: db.prepare('SELECT * FROM inventory_location_movements ORDER BY id').all(),
    products: db.prepare('SELECT id, stock FROM products ORDER BY id').all(),
  };
}
function verify(db, phase) {
  integrity(db, phase);
  for (const table of ['inventory_transfers', 'inventory_transfer_lines', 'inventory_transfer_receipts', 'inventory_transfer_receipt_lines', 'inventory_transfer_movements']) {
    if (!exists(db, table)) throw new Error(`${phase}: falta ${table}`);
  }
  if (scalar(db, 'SELECT count(*) AS value FROM inventory_transfers') !== 0) throw new Error(`${phase}: la migración inventó transferencias`);
}

const args = argsOf(process.argv.slice(2));
const baseline = resolve(args.baseline);
const directory = join(resolve(args.output), `r3-inventory-transfers-${Date.now()}`);
mkdirSync(directory, { recursive: true });
const forwardPath = join(directory, 'forward.sqlite');
const dumpPath = join(directory, 'migrated.sql');
const restorePath = join(directory, 'restored.sqlite');
const db = new DatabaseSync(forwardPath);
db.exec('PRAGMA foreign_keys=OFF');
const sql = readFileSync(baseline, 'utf8');
if (!/CREATE TABLE (?:IF NOT EXISTS )?[`"]?orders\b/i.test(sql)) {
  for (const name of readdirSync(resolve('migrations')).filter((name) => /^00(?:0[1-9]|1[0-9])_.*\.sql$/.test(name)).sort()) {
    db.exec(readFileSync(resolve('migrations', name), 'utf8'));
  }
}
db.exec(sql);
db.exec('PRAGMA foreign_keys=ON');
integrity(db, 'preflight');
if (!exists(db, 'inventory_locations') || exists(db, 'inventory_transfers')) throw new Error('baseline debe estar en 0019');
const beforeHash = hash(snapshot(db));
db.exec(readFileSync(resolve('migrations/0020_inventory_transfers.sql'), 'utf8'));
verify(db, 'forward');
if (hash(snapshot(db)) !== beforeHash) throw new Error('la migración alteró inventario existente');
const summary = {
  variants: scalar(db, 'SELECT count(*) AS value FROM inventory_balances'),
  locations: scalar(db, 'SELECT count(*) AS value FROM inventory_locations'),
  beforeHash,
};
db.close();
const dump = execFileSync('/usr/bin/sqlite3', [forwardPath, '.dump'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
writeFileSync(dumpPath, dump);
const restored = new DatabaseSync(restorePath);
restored.exec('PRAGMA foreign_keys=OFF'); restored.exec(dump); restored.exec('PRAGMA foreign_keys=ON');
verify(restored, 'restore');
if (hash(snapshot(restored)) !== beforeHash) throw new Error('restore divergente');
restored.close();
process.stdout.write(`${JSON.stringify({ ...summary, dumpBytes: statSync(dumpPath).size, artifactDirectory: directory }, null, 2)}\n`);
