#!/usr/bin/env node

/** Ensayo aislado de 0019 sobre un export D1 en 0018; nunca toca el origen. */
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
function globalSnapshot(db) {
  return {
    balances: db.prepare('SELECT * FROM inventory_balances ORDER BY variant_id').all(),
    movements: db.prepare('SELECT * FROM inventory_movements ORDER BY id').all(),
    reservations: db.prepare('SELECT * FROM inventory_reservations ORDER BY id').all(),
    products: db.prepare('SELECT id, stock FROM products ORDER BY id').all(),
  };
}
function verify(db, phase) {
  integrity(db, phase);
  if (!exists(db, 'inventory_locations') || !exists(db, 'inventory_location_balances') || !exists(db, 'inventory_location_movements')) throw new Error(`${phase}: tablas ausentes`);
  if (scalar(db, 'SELECT count(*) AS value FROM inventory_locations WHERE is_primary=1') !== 1) throw new Error(`${phase}: principal inválida`);
  if (scalar(db, `SELECT count(*) AS value FROM inventory_balances b LEFT JOIN inventory_location_balances lb
    ON lb.variant_id=b.variant_id AND lb.location_id=(SELECT id FROM inventory_locations WHERE is_primary=1)
    WHERE lb.variant_id IS NULL OR lb.on_hand<>b.on_hand OR lb.reserved<>b.reserved
      OR lb.movement_version<>b.version OR lb.reservation_version<>b.reservation_version`) !== 0) throw new Error(`${phase}: balances divergentes`);
  if (scalar(db, `SELECT count(*) AS value FROM inventory_movements m LEFT JOIN inventory_location_movements lm
    ON lm.source_movement_id=m.id WHERE lm.id IS NULL`) !== 0) throw new Error(`${phase}: movimientos incompletos`);
}

const args = argsOf(process.argv.slice(2));
const baseline = resolve(args.baseline);
const directory = join(resolve(args.output), `r3-inventory-locations-${Date.now()}`);
mkdirSync(directory, { recursive: true });
const forwardPath = join(directory, 'forward.sqlite');
const dumpPath = join(directory, 'migrated.sql');
const restorePath = join(directory, 'restored.sqlite');
const db = new DatabaseSync(forwardPath);
db.exec('PRAGMA foreign_keys=OFF');
const sql = readFileSync(baseline, 'utf8');
if (!/CREATE TABLE (?:IF NOT EXISTS )?[`"]?orders\b/i.test(sql)) {
  for (const name of readdirSync(resolve('migrations')).filter((name) => /^00(?:0[1-9]|1[0-8])_.*\.sql$/.test(name)).sort()) db.exec(readFileSync(resolve('migrations', name), 'utf8'));
}
db.exec(sql);
if (!sql.trim()) {
  const seed = execFileSync(process.execPath, [resolve('seed/generate.ts')], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n').filter((line) => !line.includes('inventory_location')).join('\n');
  db.exec(seed);
}
db.exec('PRAGMA foreign_keys=ON');
integrity(db, 'preflight');
if (!exists(db, 'order_bulk_batches') || exists(db, 'inventory_locations')) throw new Error('baseline debe estar en 0018');
const legacyHash = hash(globalSnapshot(db));
db.exec(readFileSync(resolve('migrations/0019_inventory_locations.sql'), 'utf8'));
verify(db, 'forward');
if (hash(globalSnapshot(db)) !== legacyHash) throw new Error('cambió el inventario global');
const summary = { variants: scalar(db, 'SELECT count(*) AS value FROM inventory_balances'), movements: scalar(db, 'SELECT count(*) AS value FROM inventory_movements'), legacyHash };
db.close();
const dump = execFileSync('/usr/bin/sqlite3', [forwardPath, '.dump'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
writeFileSync(dumpPath, dump);
const restored = new DatabaseSync(restorePath); restored.exec('PRAGMA foreign_keys=OFF'); restored.exec(dump); restored.exec('PRAGMA foreign_keys=ON');
verify(restored, 'restore');
if (hash(globalSnapshot(restored)) !== legacyHash) throw new Error('restore divergente');
restored.close();
process.stdout.write(`${JSON.stringify({ ...summary, dumpBytes: statSync(dumpPath).size, artifactDirectory: directory }, null, 2)}\n`);
