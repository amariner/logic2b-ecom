#!/usr/bin/env node

/** Ensayo aislado de 0016 sobre un export D1 en 0015; nunca toca la base origen. */
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
    throw new Error('Uso: node scripts/rehearse-r3-order-amendments.mjs --baseline <export.sql> --output-dir <directorio>');
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

function columnExists(db, table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function legacySnapshot(db) {
  return {
    orders: db.prepare(`
      SELECT id, order_number, address_json, subtotal_cents, shipping_cents,
             total_cents, status, currency FROM orders ORDER BY id
    `).all(),
    items: db.prepare(`
      SELECT id, order_id, product_id, variant_id, unit_price_cents, qty
      FROM order_items ORDER BY id
    `).all(),
    payments: db.prepare('SELECT * FROM payments ORDER BY id').all(),
    transactions: db.prepare('SELECT * FROM payment_transactions ORDER BY id').all(),
    refunds: db.prepare(`
      SELECT id, order_id, payment_id, status, subtotal_cents, shipping_cents,
             total_cents, provider_reference, idempotency_key, version,
             created_at, updated_at, operation_type
      FROM refunds ORDER BY id
    `).all(),
  };
}

function preflight(db) {
  if (!columnExists(db, 'refunds', 'operation_type')) {
    throw new Error('preflight bloqueado: falta 0013');
  }
  if (!columnExists(db, 'order_notes', 'version')) {
    throw new Error('preflight bloqueado: falta 0015');
  }
  if (columnExists(db, 'orders', 'edit_version')) {
    throw new Error('preflight bloqueado: baseline ya contiene 0016');
  }
  assertZero(db, 'preflight:foreign_keys', 'SELECT count(*) AS value FROM pragma_foreign_key_check');
  assertZero(db, 'preflight:integrity', "SELECT count(*) AS value FROM pragma_integrity_check WHERE integrity_check <> 'ok'");
  assertZero(db, 'preflight:duplicate_variants', `
    SELECT count(*) AS value FROM (
      SELECT order_id, variant_id FROM order_items WHERE variant_id IS NOT NULL
      GROUP BY order_id, variant_id HAVING count(*) > 1
    )
  `);
  assertZero(db, 'preflight:refund_without_single_capture', `
    SELECT count(*) AS value FROM refunds r
    WHERE r.total_cents > 0 AND 1 <> (
      SELECT count(*) FROM payment_transactions capture
      WHERE capture.payment_id=r.payment_id
        AND capture.type='capture' AND capture.status='succeeded'
    )
  `);
  assertZero(db, 'preflight:refund_exceeds_capture', `
    SELECT count(*) AS value FROM refunds r
    WHERE r.total_cents > COALESCE((
      SELECT sum(capture.amount_cents) FROM payment_transactions capture
      WHERE capture.payment_id=r.payment_id
        AND capture.type='capture' AND capture.status='succeeded'
    ), 0)
  `);
}

function verify(db, phase) {
  assertZero(db, `${phase}:foreign_keys`, 'SELECT count(*) AS value FROM pragma_foreign_key_check');
  assertZero(db, `${phase}:integrity`, "SELECT count(*) AS value FROM pragma_integrity_check WHERE integrity_check <> 'ok'");
  assertZero(db, `${phase}:current_qty`, 'SELECT count(*) AS value FROM order_items WHERE current_qty IS NULL OR current_qty <> qty');
  assertZero(db, `${phase}:edit_version`, 'SELECT count(*) AS value FROM orders WHERE edit_version <> 1');
  assertZero(db, `${phase}:refund_allocations`, `
    SELECT abs(
      (SELECT count(*) FROM refunds WHERE total_cents > 0)
      - (SELECT count(*) FROM refund_payment_allocations)
    ) AS value
  `);
  assertZero(db, `${phase}:allocation_sum`, `
    SELECT count(*) AS value FROM refunds r
    WHERE r.total_cents > 0 AND r.total_cents <> COALESCE((
      SELECT sum(a.amount_cents) FROM refund_payment_allocations a WHERE a.refund_id=r.id
    ), 0)
  `);
}

function canonicalSnapshot(db) {
  return {
    versions: db.prepare('SELECT id, edit_version FROM orders ORDER BY id').all(),
    quantities: db.prepare('SELECT id, current_qty FROM order_items ORDER BY id').all(),
    allocations: db.prepare(`
      SELECT refund_id, payment_id, capture_transaction_id, amount_cents,
             status, provider_reference, idempotency_key, version
      FROM refund_payment_allocations ORDER BY id
    `).all(),
  };
}

const args = parseArgs(process.argv.slice(2));
const baselinePath = resolve(args.baseline);
const runDirectory = join(resolve(args.outputDir), `r3-order-amendments-${Date.now()}`);
mkdirSync(runDirectory, { recursive: true });
const forwardPath = join(runDirectory, 'forward.sqlite');
const dumpPath = join(runDirectory, 'migrated.sql');
const restoredPath = join(runDirectory, 'restored.sqlite');

const db = new DatabaseSync(forwardPath);
db.exec('PRAGMA foreign_keys = OFF;');
const baselineSql = readFileSync(baselinePath, 'utf8');
if (!/CREATE TABLE (?:IF NOT EXISTS )?[`"]?orders\b/i.test(baselineSql)) {
  for (const migration of readdirSync(resolve('migrations'))
    .filter((name) => /^00(?:0[1-9]|1[0-5])_.*\.sql$/.test(name))
    .sort()) {
    db.exec(readFileSync(resolve('migrations', migration), 'utf8'));
  }
}
db.exec(baselineSql);
db.exec('PRAGMA foreign_keys = ON;');
preflight(db);
const legacyHash = digest(legacySnapshot(db));
db.exec(readFileSync(resolve('migrations/0016_order_amendments.sql'), 'utf8'));
verify(db, 'forward');
if (digest(legacySnapshot(db)) !== legacyHash) throw new Error('forward bloqueado: cambió el contrato legacy');
const canonicalHash = digest(canonicalSnapshot(db));
const summary = {
  baselineBytes: statSync(baselinePath).size,
  orders: scalar(db, 'SELECT count(*) AS value FROM orders'),
  orderItems: scalar(db, 'SELECT count(*) AS value FROM order_items'),
  refunds: scalar(db, 'SELECT count(*) AS value FROM refunds'),
  allocations: scalar(db, 'SELECT count(*) AS value FROM refund_payment_allocations'),
  legacyHash,
  canonicalHash,
};
db.close();

const dump = execFileSync('/usr/bin/sqlite3', [forwardPath, '.dump'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
writeFileSync(dumpPath, dump, 'utf8');
const restored = new DatabaseSync(restoredPath);
restored.exec('PRAGMA foreign_keys = OFF;');
restored.exec(dump);
restored.exec('PRAGMA foreign_keys = ON;');
verify(restored, 'restore');
if (digest(legacySnapshot(restored)) !== legacyHash) throw new Error('restore bloqueado: hash legacy distinto');
if (digest(canonicalSnapshot(restored)) !== canonicalHash) throw new Error('restore bloqueado: hash canónico distinto');
restored.close();

process.stdout.write(`${JSON.stringify({
  ...summary,
  dumpBytes: statSync(dumpPath).size,
  artifactDirectory: runDirectory,
}, null, 2)}\n`);
