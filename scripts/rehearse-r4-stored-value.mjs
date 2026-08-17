#!/usr/bin/env node

/** Ensayo aislado de 0032 sobre un export D1 en 0031; nunca toca el origen. */
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
const TABLES = ['stored_value_accounts', 'stored_value_reservations',
  'stored_value_applications', 'stored_value_refund_allocations', 'stored_value_ledger_entries'];

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
    orders: db.prepare('SELECT * FROM orders ORDER BY id').all(),
    payments: db.prepare(`SELECT id,order_id,provider,provider_reference,currency,
      expected_amount_cents,status,version,idempotency_key,created_at,updated_at
      FROM payments ORDER BY id`).all(),
    transactions: db.prepare('SELECT * FROM payment_transactions ORDER BY id').all(),
    refunds: db.prepare('SELECT * FROM refunds ORDER BY id').all(),
    bundles: db.prepare('SELECT * FROM bundles ORDER BY id').all(),
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
  for (const trigger of ['stored_value_ledger_guard', 'stored_value_refund_allocation_guard',
    'stored_value_payment_guard', 'stored_value_payment_insert_guard']) {
    if (!exists(db, 'trigger', trigger)) throw new Error(`${phase}: falta ${trigger}`);
  }
  for (const index of ['idx_stored_value_accounts_owner', 'idx_stored_value_accounts_state',
    'idx_stored_value_reservations_account', 'idx_stored_value_applications_account',
    'idx_stored_value_refunds_refund', 'idx_stored_value_ledger_account',
    'idx_stored_value_ledger_order']) {
    if (!exists(db, 'index', index)) throw new Error(`${phase}: falta ${index}`);
  }
  if (!db.prepare("SELECT 1 FROM pragma_table_info('payments') WHERE name='stored_value_expected_cents'").get()) {
    throw new Error(`${phase}: falta payments.stored_value_expected_cents`);
  }
  if (scalar(db, 'SELECT count(*) AS value FROM payments WHERE stored_value_expected_cents<>0') !== 0) {
    throw new Error(`${phase}: el backfill de pagos no es cero`);
  }
}

const args = argsOf(process.argv.slice(2));
const baseline = resolve(args.baseline);
const directory = join(resolve(args.output), `r4-stored-value-${Date.now()}`);
mkdirSync(directory, { recursive: true });
const forwardPath = join(directory, 'forward.sqlite');
const dumpPath = join(directory, 'migrated.sql');
const restorePath = join(directory, 'restored.sqlite');
const db = new DatabaseSync(forwardPath);
db.exec('PRAGMA foreign_keys=OFF');
db.exec(readFileSync(baseline, 'utf8'));
db.exec('PRAGMA foreign_keys=ON');
integrity(db, 'preflight');
if (!exists(db, 'table', 'bundles') || exists(db, 'table', 'stored_value_accounts')) {
  throw new Error('baseline debe estar en 0031');
}
const before = snapshot(db);
const beforeHash = hash(before);
db.exec(readFileSync(resolve('migrations/0032_stored_value.sql'), 'utf8'));
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
process.stdout.write(`${JSON.stringify({ ...summary, beforeHash,
  dumpBytes: statSync(dumpPath).size, artifactDirectory: directory }, null, 2)}\n`);
