#!/usr/bin/env node

/** Ensayo aislado de 0037 sobre un export D1 en 0036; nunca toca el origen. */
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
    orders: db.prepare('SELECT * FROM orders ORDER BY id').all(),
    items: db.prepare('SELECT * FROM order_items ORDER BY id').all(),
    payments: db.prepare('SELECT * FROM payments ORDER BY id').all(),
    profiles: db.prepare('SELECT * FROM customer_profiles ORDER BY id').all(),
    addresses: db.prepare(`SELECT * FROM customer_address_revisions
      ORDER BY address_id, revision`).all(),
    merges: db.prepare('SELECT * FROM customer_profile_merges ORDER BY idempotency_key').all(),
  };
}

function verify(db, phase) {
  integrity(db, phase);
  if (!exists(db, 'table', 'customer_consent_evidence')) {
    throw new Error(`${phase}: falta customer_consent_evidence`);
  }
  if (scalar(db, 'SELECT count(*) AS value FROM customer_consent_evidence') !== 0) {
    throw new Error(`${phase}: 0037 inventó evidencia`);
  }
  for (const trigger of ['customer_consent_evidence_insert_guard',
    'customer_consent_evidence_update_guard']) {
    if (!exists(db, 'trigger', trigger)) throw new Error(`${phase}: falta ${trigger}`);
  }
  for (const index of ['idx_customer_consent_profile_scope_version',
    'idx_customer_consent_contact_scope_version', 'idx_customer_consent_profile_history',
    'idx_customer_consent_contact_history', 'idx_customer_consent_withdrawal']) {
    if (!exists(db, 'index', index)) throw new Error(`${phase}: falta ${index}`);
  }
}

const args = argsOf(process.argv.slice(2));
const baseline = resolve(args.baseline);
const directory = join(resolve(args.output), `r5-consent-evidence-${Date.now()}`);
mkdirSync(directory, { recursive: true });
const forwardPath = join(directory, 'forward.sqlite');
const dumpPath = join(directory, 'migrated.sql');
const restorePath = join(directory, 'restored.sqlite');
const db = new DatabaseSync(forwardPath);
db.exec('PRAGMA foreign_keys=OFF');
db.exec(readFileSync(baseline, 'utf8'));
db.exec('PRAGMA foreign_keys=ON');
integrity(db, 'preflight');
if (!exists(db, 'table', 'customer_profiles') ||
    !exists(db, 'table', 'customer_profile_merges') ||
    exists(db, 'table', 'customer_consent_evidence')) {
  throw new Error('baseline debe estar exactamente en 0036');
}
const before = snapshot(db);
const beforeHash = hash(before);
db.exec(readFileSync(resolve('migrations/0037_consent_evidence.sql'), 'utf8'));
verify(db, 'forward');
if (hash(snapshot(db)) !== beforeHash) throw new Error('0037 alteró datos existentes');
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
