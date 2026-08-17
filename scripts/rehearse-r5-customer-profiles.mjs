#!/usr/bin/env node

/** Ensayo aislado de 0036 sobre un export D1 en 0035; nunca toca el origen. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function argsOf(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--') continue;
    if (argv[index] === '--baseline') args.baseline = argv[++index];
    else if (argv[index] === '--output-dir') args.output = argv[++index];
    else throw new Error(`Argumento desconocido: ${argv[index]}`);
  }
  if (!args.baseline || !args.output) {
    throw new Error('Uso: --baseline <export.sql> --output-dir <directorio>');
  }
  return args;
}

const scalar = (db, sql) => Number(db.prepare(sql).get()?.value ?? 0);
const exists = (db, type, name) => Boolean(db.prepare(
  'SELECT 1 FROM sqlite_master WHERE type=? AND name=?',
).get(type, name));
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const NEW_TABLES = ['customer_profiles', 'customer_address_revisions', 'customer_profile_merges'];

function integrity(db, phase) {
  if (scalar(db, 'SELECT count(*) AS value FROM pragma_foreign_key_check') !== 0) {
    throw new Error(`${phase}: foreign keys`);
  }
  if (scalar(db, "SELECT count(*) AS value FROM pragma_integrity_check WHERE integrity_check <> 'ok'") !== 0) {
    throw new Error(`${phase}: integrity`);
  }
}

function snapshot(db) {
  return {
    products: db.prepare('SELECT * FROM products ORDER BY id').all(),
    variants: db.prepare('SELECT * FROM product_variants ORDER BY id').all(),
    balances: db.prepare('SELECT * FROM inventory_balances ORDER BY variant_id').all(),
    orders: db.prepare(`SELECT id, order_number, email, customer_name, address_json,
      subtotal_cents, shipping_cents, total_cents, status, stripe_session_id,
      stripe_payment_intent, tracking_carrier, tracking_number, created_at, updated_at, currency
      FROM orders ORDER BY id`).all(),
    items: db.prepare('SELECT * FROM order_items ORDER BY id').all(),
    payments: db.prepare('SELECT * FROM payments ORDER BY id').all(),
    subscriptions: db.prepare('SELECT * FROM subscriptions ORDER BY id').all(),
    preliminaryOrders: db.prepare('SELECT * FROM preliminary_orders ORDER BY id').all(),
  };
}

function verify(db, phase) {
  integrity(db, phase);
  for (const table of NEW_TABLES) {
    if (!exists(db, 'table', table)) throw new Error(`${phase}: falta ${table}`);
    if (scalar(db, `SELECT count(*) AS value FROM ${table}`) !== 0) {
      throw new Error(`${phase}: 0036 inventó filas de cliente`);
    }
  }
  if (scalar(db, `SELECT count(*) AS value FROM pragma_table_info('orders')
    WHERE name='customer_profile_id'`) !== 1) {
    throw new Error(`${phase}: falta orders.customer_profile_id`);
  }
  if (scalar(db, 'SELECT count(*) AS value FROM orders WHERE customer_profile_id IS NOT NULL') !== 0) {
    throw new Error(`${phase}: 0036 enlazó pedidos existentes`);
  }
  for (const trigger of ['customer_address_revision_guard', 'customer_profile_merge_guard',
    'customer_profile_merge_apply', 'customer_profile_merge_update_guard']) {
    if (!exists(db, 'trigger', trigger)) throw new Error(`${phase}: falta ${trigger}`);
  }
  for (const index of ['idx_customer_profiles_merge_target',
    'idx_customer_address_revisions_profile', 'idx_customer_address_revisions_current',
    'idx_customer_profile_merges_source', 'idx_customer_profile_merges_target',
    'idx_orders_customer_profile']) {
    if (!exists(db, 'index', index)) throw new Error(`${phase}: falta ${index}`);
  }
}

const args = argsOf(process.argv.slice(2));
const baseline = resolve(args.baseline);
const directory = join(resolve(args.output), `r5-customer-profiles-${Date.now()}`);
mkdirSync(directory, { recursive: true });
const forwardPath = join(directory, 'forward.sqlite');
const dumpPath = join(directory, 'migrated.sql');
const restorePath = join(directory, 'restored.sqlite');
const db = new DatabaseSync(forwardPath);
db.exec('PRAGMA foreign_keys=OFF');
db.exec(readFileSync(baseline, 'utf8'));
db.exec('PRAGMA foreign_keys=ON');
integrity(db, 'preflight');
if (!exists(db, 'table', 'preliminary_orders') || exists(db, 'table', 'customer_profiles') ||
    scalar(db, `SELECT count(*) AS value FROM pragma_table_info('orders')
      WHERE name='customer_profile_id'`) !== 0) {
  throw new Error('baseline debe estar exactamente en 0035');
}
const before = snapshot(db);
const beforeHash = hash(before);
db.exec(readFileSync(resolve('migrations/0036_customer_profiles.sql'), 'utf8'));
verify(db, 'forward');
if (hash(snapshot(db)) !== beforeHash) throw new Error('0036 alteró datos existentes');
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
process.stdout.write(`${JSON.stringify({ ...summary, beforeHash,
  dumpBytes: statSync(dumpPath).size, artifactDirectory: directory }, null, 2)}\n`);
