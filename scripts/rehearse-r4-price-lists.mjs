#!/usr/bin/env node

/** Ensayo aislado de 0030 sobre un export D1 en 0029; nunca toca el origen. */
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
const TABLES = ['price_lists', 'price_list_products', 'price_list_companies', 'price_list_applications'];

function integrity(db, phase) {
  if (scalar(db, 'SELECT count(*) AS value FROM pragma_foreign_key_check') !== 0) throw new Error(`${phase}: foreign keys`);
  if (scalar(db, "SELECT count(*) AS value FROM pragma_integrity_check WHERE integrity_check <> 'ok'") !== 0) {
    throw new Error(`${phase}: integrity`);
  }
}

function snapshot(db) {
  return {
    orders: db.prepare('SELECT * FROM orders ORDER BY id').all(),
    orderItems: db.prepare('SELECT * FROM order_items ORDER BY id').all(),
    refunds: db.prepare('SELECT * FROM refunds ORDER BY id').all(),
    returns: db.prepare('SELECT * FROM return_requests ORDER BY id').all(),
    promotions: db.prepare('SELECT * FROM promotion_codes ORDER BY id').all(),
    promotionUsages: db.prepare('SELECT * FROM promotion_code_usages ORDER BY id').all(),
    automaticDiscounts: db.prepare('SELECT * FROM automatic_discounts ORDER BY id').all(),
    automaticApplications: db.prepare('SELECT * FROM automatic_discount_applications ORDER BY id').all(),
    quantityOffers: db.prepare('SELECT * FROM quantity_offers ORDER BY id').all(),
    quantityApplications: db.prepare('SELECT * FROM quantity_offer_applications ORDER BY id').all(),
    combinationPolicies: db.prepare('SELECT * FROM discount_combination_policies ORDER BY id').all(),
    combinationApplications: db.prepare('SELECT * FROM discount_combination_applications ORDER BY id').all(),
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
  if (!exists(db, 'trigger', 'price_list_application_insert_guard')) {
    throw new Error(`${phase}: falta price_list_application_insert_guard`);
  }
  for (const index of [
    'idx_price_lists_active', 'idx_price_list_companies_hash', 'idx_price_list_applications_list',
  ]) {
    if (!exists(db, 'index', index)) throw new Error(`${phase}: falta ${index}`);
  }
}

const args = argsOf(process.argv.slice(2));
const baseline = resolve(args.baseline);
const directory = join(resolve(args.output), `r4-price-lists-${Date.now()}`);
mkdirSync(directory, { recursive: true });
const forwardPath = join(directory, 'forward.sqlite');
const dumpPath = join(directory, 'migrated.sql');
const restorePath = join(directory, 'restored.sqlite');
const db = new DatabaseSync(forwardPath);
db.exec('PRAGMA foreign_keys=OFF');
db.exec(readFileSync(baseline, 'utf8'));
db.exec('PRAGMA foreign_keys=ON');
integrity(db, 'preflight');
if (!exists(db, 'table', 'discount_combination_policies') || exists(db, 'table', 'price_lists')) {
  throw new Error('baseline debe estar en 0029');
}
const before = snapshot(db);
const beforeHash = hash(before);
db.exec(readFileSync(resolve('migrations/0030_contextual_price_lists.sql'), 'utf8'));
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
