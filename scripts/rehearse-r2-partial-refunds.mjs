#!/usr/bin/env node

/**
 * Ensayo no destructivo de R2.13 sobre un export D1 en 0012. Materializa 0013
 * solo dentro de una copia aislada y prueba guardas, dump y restore sin
 * imprimir pedidos, clientes ni otras filas operativas.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function argumentsFrom(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--') continue;
    if (argv[index] === '--baseline') result.baseline = argv[++index];
    else if (argv[index] === '--output-dir') result.outputDir = argv[++index];
    else throw new Error(`Argumento desconocido: ${argv[index]}`);
  }
  if (!result.baseline || !result.outputDir) {
    throw new Error(
      'Uso: node scripts/rehearse-r2-partial-refunds.mjs ' +
      '--baseline <export.sql> --output-dir <directorio>',
    );
  }
  return result;
}

function scalar(db, sql) {
  return Number(db.prepare(sql).get()?.value ?? 0);
}

function assertZero(db, id, sql) {
  const failures = scalar(db, sql);
  if (!Number.isInteger(failures) || failures !== 0) {
    throw new Error(`${id} bloqueado: ${failures}`);
  }
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function tableExists(db, table) {
  return scalar(
    db,
    `SELECT count(*) AS value FROM sqlite_master WHERE type='table' AND name='${table}'`,
  ) === 1;
}

function columnExists(db, table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
}

function expectSqlError(db, sql, pattern, id) {
  try {
    db.exec(sql);
  } catch (error) {
    if (error instanceof Error && pattern.test(error.message)) return;
    throw error;
  }
  throw new Error(`${id} bloqueado: la guarda acepto una escritura incompatible`);
}

function legacySnapshot(db) {
  return {
    orders: db.prepare(`
      SELECT id, subtotal_cents, shipping_cents, total_cents, status,
             stripe_session_id, stripe_payment_intent, currency, created_at, updated_at
      FROM orders ORDER BY id
    `).all(),
    payments: db.prepare('SELECT * FROM payments ORDER BY id').all(),
    refunds: db.prepare(`
      SELECT id, order_id, payment_id, status, reason, subtotal_cents,
             shipping_cents, total_cents, provider_reference, idempotency_key,
             version, created_at, updated_at
      FROM refunds ORDER BY id
    `).all(),
    refundItems: db.prepare(`
      SELECT * FROM refund_items ORDER BY refund_id, order_item_id
    `).all(),
    fulfillments: db.prepare('SELECT * FROM fulfillments ORDER BY id').all(),
    fulfillmentItems: db.prepare(`
      SELECT * FROM fulfillment_items ORDER BY fulfillment_id, order_item_id
    `).all(),
  };
}

function canonicalSnapshot(db) {
  return {
    refunds: db.prepare(`
      SELECT id, operation_type, status, version FROM refunds ORDER BY id
    `).all(),
    schema: db.prepare(`
      SELECT type, name, sql FROM sqlite_master
      WHERE name IN ('idx_refunds_order_operation', 'refund_item_partial_guard')
      ORDER BY type, name
    `).all(),
  };
}

function preflight(db) {
  if (!tableExists(db, 'payments') || !tableExists(db, 'refunds')) {
    throw new Error('preflight bloqueado: falta R2.9/0011');
  }
  if (!tableExists(db, 'fulfillments') || !tableExists(db, 'fulfillment_items')) {
    throw new Error('preflight bloqueado: falta R2.11/0012');
  }
  if (columnExists(db, 'refunds', 'operation_type')) {
    throw new Error('preflight bloqueado: baseline ya contiene R2.13');
  }
  assertZero(db, 'preflight:foreign_keys', 'SELECT count(*) AS value FROM pragma_foreign_key_check');
  assertZero(
    db,
    'preflight:integrity',
    "SELECT count(*) AS value FROM pragma_integrity_check WHERE integrity_check <> 'ok'",
  );
  assertZero(db, 'preflight:refund_item_order', `
    SELECT count(*) AS value
    FROM refund_items ri
    LEFT JOIN refunds r ON r.id = ri.refund_id
    LEFT JOIN order_items oi ON oi.id = ri.order_item_id
    WHERE r.id IS NULL OR oi.id IS NULL OR r.order_id <> oi.order_id
  `);
  assertZero(db, 'preflight:reserved_quantity', `
    SELECT count(*) AS value FROM (
      SELECT oi.id
      FROM order_items oi
      WHERE
        coalesce((
          SELECT sum(ri.quantity)
          FROM refund_items ri
          JOIN refunds r ON r.id = ri.refund_id
          WHERE ri.order_item_id = oi.id AND r.status <> 'cancelled'
        ), 0)
        + coalesce((
          SELECT sum(fi.quantity)
          FROM fulfillment_items fi
          JOIN fulfillments f ON f.id = fi.fulfillment_id
          WHERE fi.order_item_id = oi.id AND f.status <> 'cancelled'
        ), 0) > oi.qty
    )
  `);
}

function verify(db, phase) {
  assertZero(db, `${phase}:foreign_keys`, 'SELECT count(*) AS value FROM pragma_foreign_key_check');
  assertZero(
    db,
    `${phase}:integrity`,
    "SELECT count(*) AS value FROM pragma_integrity_check WHERE integrity_check <> 'ok'",
  );
  assertZero(db, `${phase}:operation_type`, `
    SELECT count(*) AS value FROM refunds
    WHERE operation_type NOT IN (
      'total_cancellation', 'partial_cancellation', 'return', 'adjustment'
    )
  `);
  assertZero(db, `${phase}:legacy_default`, `
    SELECT count(*) AS value FROM refunds
    WHERE operation_type <> 'total_cancellation'
  `);
  assertZero(db, `${phase}:index`, `
    SELECT abs(1 - count(*)) AS value FROM sqlite_master
    WHERE type='index' AND name='idx_refunds_order_operation'
  `);
  assertZero(db, `${phase}:trigger`, `
    SELECT abs(1 - count(*)) AS value FROM sqlite_master
    WHERE type='trigger' AND name='refund_item_partial_guard'
  `);
}

function probeGuards(db) {
  const now = '2026-08-12T00:00:00.000Z';
  db.exec('SAVEPOINT r213_probe;');
  try {
    db.exec(`
      INSERT INTO products (id, slug, name, price_cents, stock, category)
      VALUES (-213001, '__r213_rehearsal__', 'R2.13', 1000, 10, 'rehearsal');
      INSERT INTO product_variants (
        id, product_id, sku, title, price_cents, status, is_default, option_signature
      ) VALUES (-213001, -213001, '__R213__', '', 1000, 'active', 1, NULL);
      INSERT INTO orders (
        id, order_number, email, customer_name, address_json,
        subtotal_cents, shipping_cents, total_cents, status, stripe_session_id, currency
      ) VALUES
        (-213001, '__R213_A__', 'rehearsal@example.invalid', 'R2.13', '{}',
          3000, 0, 3000, 'paid', '__r213_session_a__', 'EUR'),
        (-213002, '__R213_B__', 'rehearsal@example.invalid', 'R2.13', '{}',
          1000, 0, 1000, 'paid', '__r213_session_b__', 'EUR');
      INSERT INTO order_items (
        id, order_id, product_id, variant_id, name_snapshot, unit_price_cents, qty
      ) VALUES
        (-213001, -213001, -213001, -213001, 'R2.13', 1000, 3),
        (-213002, -213002, -213001, -213001, 'R2.13', 1000, 1);
      INSERT INTO payments (
        id, order_id, provider, provider_reference, currency, expected_amount_cents,
        status, idempotency_key, created_at, updated_at
      ) VALUES
        (-213001, -213001, 'simulated', '__r213_pi_a__', 'EUR', 3000,
          'captured', '__r213_payment_a__', '${now}', '${now}'),
        (-213002, -213002, 'simulated', '__r213_pi_b__', 'EUR', 1000,
          'captured', '__r213_payment_b__', '${now}', '${now}');
      INSERT INTO refunds (
        id, order_id, payment_id, status, reason, subtotal_cents, shipping_cents,
        total_cents, idempotency_key, version, created_at, updated_at, operation_type
      ) VALUES
        (-213001, -213001, -213001, 'pending', 'R2.13 A', 2000, 0, 2000,
          '__r213_refund_a__', 1, '${now}', '${now}', 'partial_cancellation'),
        (-213002, -213001, -213001, 'pending', 'R2.13 B', 2000, 0, 2000,
          '__r213_refund_b__', 1, '${now}', '${now}', 'partial_cancellation'),
        (-213003, -213002, -213002, 'pending', 'R2.13 C', 1000, 0, 1000,
          '__r213_refund_c__', 1, '${now}', '${now}', 'partial_cancellation');
      INSERT INTO fulfillments (
        id, order_id, status, carrier, tracking_number, idempotency_key,
        shipped_at, created_at, updated_at
      ) VALUES (-213001, -213001, 'shipped', 'R2.13', '__R213_TRACK__',
        '__r213_fulfillment__', '${now}', '${now}', '${now}');
      INSERT INTO fulfillment_items (
        fulfillment_id, order_id, order_item_id, quantity, created_at
      ) VALUES (-213001, -213001, -213001, 1, '${now}');
      INSERT INTO refund_items (
        refund_id, order_item_id, quantity, amount_cents, restock_decision
      ) VALUES (-213001, -213001, 2, 2000, 'restock');
    `);
    expectSqlError(db, `
      INSERT INTO refund_items (
        refund_id, order_item_id, quantity, amount_cents, restock_decision
      ) VALUES (-213002, -213001, 1, 1000, 'restock');
    `, /refund_item_quantity_conflict/, 'probe:quantity');
    expectSqlError(db, `
      INSERT INTO refund_items (
        refund_id, order_item_id, quantity, amount_cents, restock_decision
      ) VALUES (-213003, -213001, 1, 1000, 'restock');
    `, /refund_item_order_conflict/, 'probe:order');
    db.exec(`
      UPDATE refunds SET status='cancelled' WHERE id=-213001;
      INSERT INTO refund_items (
        refund_id, order_item_id, quantity, amount_cents, restock_decision
      ) VALUES (-213002, -213001, 2, 2000, 'restock');
      UPDATE refunds SET status='failed' WHERE id=-213002;
      INSERT INTO refunds (
        id, order_id, payment_id, status, reason, subtotal_cents, shipping_cents,
        total_cents, idempotency_key, version, created_at, updated_at, operation_type
      ) VALUES (-213004, -213001, -213001, 'pending', 'R2.13 D', 1000, 0, 1000,
        '__r213_refund_d__', 1, '${now}', '${now}', 'partial_cancellation');
    `);
    expectSqlError(db, `
      INSERT INTO refund_items (
        refund_id, order_item_id, quantity, amount_cents, restock_decision
      ) VALUES (-213004, -213001, 1, 1000, 'restock');
    `, /refund_item_quantity_conflict/, 'probe:failed_reservation');
  } finally {
    db.exec('ROLLBACK TO r213_probe; RELEASE r213_probe;');
  }
}

const args = argumentsFrom(process.argv.slice(2));
const baselinePath = resolve(args.baseline);
const runDirectory = join(resolve(args.outputDir), `r2-partial-refunds-${Date.now()}`);
mkdirSync(runDirectory, { recursive: true });
const forwardPath = join(runDirectory, 'forward.sqlite');
const dumpPath = join(runDirectory, 'migrated.sql');
const restoredPath = join(runDirectory, 'restored.sqlite');

const db = new DatabaseSync(forwardPath);
db.exec('PRAGMA foreign_keys = OFF;');
db.exec(readFileSync(baselinePath, 'utf8'));
db.exec('PRAGMA foreign_keys = ON;');
preflight(db);
const legacyHash = digest(legacySnapshot(db));
db.exec(readFileSync(resolve('migrations/0013_partial_refund_guards.sql'), 'utf8'));
verify(db, 'forward');
if (digest(legacySnapshot(db)) !== legacyHash) {
  throw new Error('forward bloqueado: cambio el contrato R2.12');
}
probeGuards(db);
verify(db, 'replay');
const canonicalHash = digest(canonicalSnapshot(db));
const summary = {
  baselineBytes: statSync(baselinePath).size,
  refunds: scalar(db, 'SELECT count(*) AS value FROM refunds'),
  refundItems: scalar(db, 'SELECT count(*) AS value FROM refund_items'),
  fulfillments: scalar(db, 'SELECT count(*) AS value FROM fulfillments'),
  legacyHash,
  canonicalHash,
};
db.close();

const dump = execFileSync('/usr/bin/sqlite3', [forwardPath, '.dump'], {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
writeFileSync(dumpPath, dump, 'utf8');
const restored = new DatabaseSync(restoredPath);
restored.exec('PRAGMA foreign_keys = OFF;');
restored.exec(dump);
restored.exec('PRAGMA foreign_keys = ON;');
verify(restored, 'restore');
if (digest(legacySnapshot(restored)) !== legacyHash) {
  throw new Error('restore bloqueado: hash R2.12 distinto');
}
if (digest(canonicalSnapshot(restored)) !== canonicalHash) {
  throw new Error('restore bloqueado: hash canonico distinto');
}
probeGuards(restored);
restored.close();

process.stdout.write(`${JSON.stringify({
  ...summary,
  dumpBytes: statSync(dumpPath).size,
  artifactDirectory: runDirectory,
}, null, 2)}\n`);
