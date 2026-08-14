#!/usr/bin/env node

/** Ensayo aislado de 0031 sobre un export D1 en 0030; nunca toca el origen. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
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
const exists = (db, type, name) => Boolean(db.prepare(
  'SELECT 1 FROM sqlite_master WHERE type=? AND name=?',
).get(type, name));
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const TABLES = ['bundles', 'bundle_groups', 'bundle_components', 'order_bundle_components',
  'bundle_applications', 'bundle_return_inventory_movements'];

function integrity(db, phase) {
  if (scalar(db, 'SELECT count(*) AS value FROM pragma_foreign_key_check') !== 0) throw new Error(`${phase}: foreign keys`);
  if (scalar(db, "SELECT count(*) AS value FROM pragma_integrity_check WHERE integrity_check <> 'ok'") !== 0) {
    throw new Error(`${phase}: integrity`);
  }
}

function snapshot(db) {
  return {
    products: db.prepare('SELECT * FROM products ORDER BY id').all(),
    variants: db.prepare('SELECT * FROM product_variants ORDER BY id').all(),
    balances: db.prepare('SELECT * FROM inventory_balances ORDER BY variant_id').all(),
    orders: db.prepare('SELECT * FROM orders ORDER BY id').all(),
    orderItems: db.prepare('SELECT * FROM order_items ORDER BY id').all(),
    refunds: db.prepare('SELECT * FROM refunds ORDER BY id').all(),
    returns: db.prepare('SELECT * FROM return_requests ORDER BY id').all(),
    priceLists: db.prepare('SELECT * FROM price_lists ORDER BY id').all(),
    priceListApplications: db.prepare('SELECT * FROM price_list_applications ORDER BY id').all(),
  };
}

function verify(db, phase) {
  integrity(db, phase);
  for (const table of TABLES) {
    if (!exists(db, 'table', table)) throw new Error(`${phase}: falta ${table}`);
    if (scalar(db, `SELECT count(*) AS value FROM ${table}`) !== 0) {
      throw new Error(`${phase}: la migración inventó filas en ${table}`);
    }
  }
  for (const trigger of ['bundle_group_insert_guard', 'bundle_component_insert_guard',
    'bundle_state_activation_guard', 'order_bundle_component_insert_guard',
    'bundle_application_insert_guard']) {
    if (!exists(db, 'trigger', trigger)) throw new Error(`${phase}: falta ${trigger}`);
  }
  for (const index of ['idx_bundles_active', 'idx_bundle_components_product',
    'idx_order_bundle_components_bundle', 'idx_bundle_applications_bundle',
    'idx_bundle_return_movements_location']) {
    if (!exists(db, 'index', index)) throw new Error(`${phase}: falta ${index}`);
  }
}

const args = argsOf(process.argv.slice(2));
const baseline = resolve(args.baseline);
const directory = join(resolve(args.output), `r4-bundles-${Date.now()}`);
mkdirSync(directory, { recursive: true });
const forwardPath = join(directory, 'forward.sqlite');
const dumpPath = join(directory, 'migrated.sql');
const restorePath = join(directory, 'restored.sqlite');
const db = new DatabaseSync(forwardPath);
db.exec('PRAGMA foreign_keys=OFF');
db.exec(readFileSync(baseline, 'utf8'));
db.exec('PRAGMA foreign_keys=ON');
integrity(db, 'preflight');
if (!exists(db, 'table', 'price_lists') || exists(db, 'table', 'bundles')) {
  throw new Error('baseline debe estar en 0030');
}
const before = snapshot(db);
const beforeHash = hash(before);
db.exec(readFileSync(resolve('migrations/0031_bundles.sql'), 'utf8'));
verify(db, 'forward');
if (hash(snapshot(db)) !== beforeHash) throw new Error('la migración alteró datos existentes');
const summary = Object.fromEntries(Object.entries(before).map(([key, rows]) => [key, rows.length]));
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
process.stdout.write(`${JSON.stringify({ ...summary, beforeHash, dumpBytes: statSync(dumpPath).size,
  artifactDirectory: directory }, null, 2)}\n`);
