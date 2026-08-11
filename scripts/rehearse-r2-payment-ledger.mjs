#!/usr/bin/env node

/**
 * Ensayo no destructivo de R2.9 sobre un export D1. Acepta una base en 0008,
 * materializa 0009/0010 solo dentro de la copia aislada, aplica 0011 + backfill
 * por moneda y prueba replay, dump y restore. Nunca imprime filas ni PII.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { paymentLedgerBackfillSql } from '../src/modules/payments/infrastructure/payment-ledger-backfill.ts';

function argumentsFrom(argv) {
  const result = { allowRequiresReview: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--baseline') result.baseline = argv[++index];
    else if (argv[index] === '--output-dir') result.outputDir = argv[++index];
    else if (argv[index] === '--currency') result.currency = argv[++index];
    else if (argv[index] === '--allow-requires-review') result.allowRequiresReview = true;
    else throw new Error(`Argumento desconocido: ${argv[index]}`);
  }
  if (!result.baseline || !result.outputDir || !result.currency) {
    throw new Error(
      'Uso: node scripts/rehearse-r2-payment-ledger.mjs ' +
      '--baseline <export.sql> --output-dir <directorio> --currency <ISO-4217> ' +
      '[--allow-requires-review]',
    );
  }
  result.currency = result.currency.toUpperCase();
  return result;
}

function scalar(db, sql) {
  return Number(db.prepare(sql).get()?.value ?? 0);
}

function assertZero(db, id, sql) {
  const failures = scalar(db, sql);
  if (!Number.isInteger(failures) || failures !== 0) throw new Error(`${id} bloqueado: ${failures}`);
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function tableExists(db, table) {
  return scalar(db, `SELECT count(*) AS value FROM sqlite_master WHERE type='table' AND name='${table}'`) === 1;
}

function columnExists(db, table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
}

function legacySnapshot(db) {
  return {
    orders: db.prepare(`
      SELECT id, order_number, subtotal_cents, shipping_cents, total_cents,
             status, stripe_session_id, stripe_payment_intent, created_at, updated_at
      FROM orders ORDER BY id
    `).all(),
    events: db.prepare(`
      SELECT id, order_id, from_status, to_status, note, created_at
      FROM order_events ORDER BY id
    `).all(),
  };
}

function paymentSnapshot(db) {
  return {
    orderCurrencies: db.prepare('SELECT id, currency FROM orders ORDER BY id').all(),
    payments: db.prepare('SELECT * FROM payments ORDER BY id').all(),
    transactions: db.prepare('SELECT * FROM payment_transactions ORDER BY id').all(),
    refunds: db.prepare('SELECT * FROM refunds ORDER BY id').all(),
    refundItems: db.prepare('SELECT * FROM refund_items ORDER BY refund_id, order_item_id').all(),
  };
}

function prepareR28(db) {
  if (!tableExists(db, 'inventory_balances')) {
    db.exec(readFileSync(resolve('migrations/0009_inventory_ledger.sql'), 'utf8'));
  }
  if (!tableExists(db, 'inventory_reservations')) {
    db.exec(readFileSync(resolve('migrations/0010_inventory_reservations.sql'), 'utf8'));
  }
  if (!columnExists(db, 'inventory_balances', 'reservation_version')) {
    throw new Error('prepare:r2.8 bloqueado: falta reservation_version');
  }
}

function preflight(db, allowRequiresReview) {
  assertZero(db, 'preflight:foreign_keys', 'SELECT count(*) AS value FROM pragma_foreign_key_check');
  assertZero(db, 'preflight:integrity', "SELECT count(*) AS value FROM pragma_integrity_check WHERE integrity_check <> 'ok'");
  assertZero(db, 'preflight:invalid_money', `
    SELECT count(*) AS value FROM orders
    WHERE typeof(subtotal_cents) <> 'integer' OR subtotal_cents < 0
       OR typeof(shipping_cents) <> 'integer' OR shipping_cents < 0
       OR typeof(total_cents) <> 'integer' OR total_cents < 0
       OR total_cents <> subtotal_cents + shipping_cents
  `);
  assertZero(db, 'preflight:paid_without_provider_evidence', `
    SELECT count(*) AS value FROM orders o
    WHERE (
      o.status IN ('paid', 'shipped', 'delivered')
      OR (o.status = 'cancelled' AND EXISTS (
        SELECT 1 FROM order_events e WHERE e.order_id = o.id AND e.to_status = 'paid'
      ))
    ) AND o.stripe_session_id IS NULL AND o.stripe_payment_intent IS NULL
  `);
  assertZero(db, 'preflight:duplicate_payment_reference', `
    SELECT coalesce(sum(c - 1), 0) AS value FROM (
      SELECT count(*) AS c FROM orders
      WHERE stripe_payment_intent IS NOT NULL
      GROUP BY stripe_payment_intent HAVING count(*) > 1
    )
  `);
  const requiresReview = scalar(db, `
    SELECT count(*) AS value FROM orders o
    WHERE o.status = 'cancelled' AND EXISTS (
      SELECT 1 FROM order_events e WHERE e.order_id = o.id AND e.to_status = 'paid'
    )
  `);
  if (requiresReview > 0 && !allowRequiresReview) {
    throw new Error(`preflight:requires_review bloqueado: ${requiresReview}`);
  }
  return requiresReview;
}

function verify(db, phase, currency) {
  assertZero(db, `${phase}:foreign_keys`, 'SELECT count(*) AS value FROM pragma_foreign_key_check');
  assertZero(db, `${phase}:integrity`, "SELECT count(*) AS value FROM pragma_integrity_check WHERE integrity_check <> 'ok'");
  assertZero(db, `${phase}:currency`, `
    SELECT count(*) AS value FROM orders WHERE currency <> '${currency}'
  `);
  assertZero(db, `${phase}:payment_count`, `
    SELECT abs((SELECT count(*) FROM orders) - (SELECT count(*) FROM payments)) AS value
  `);
  assertZero(db, `${phase}:missing_or_multiple_payment`, `
    SELECT count(*) AS value FROM (
      SELECT o.id FROM orders o LEFT JOIN payments p ON p.order_id = o.id
      GROUP BY o.id HAVING count(p.id) <> 1
    )
  `);
  assertZero(db, `${phase}:payment_projection`, `
    SELECT count(*) AS value
    FROM orders o JOIN payments p ON p.order_id = o.id
    WHERE p.currency <> o.currency OR p.expected_amount_cents <> o.total_cents
       OR p.status <> CASE
         WHEN o.status = 'pending' THEN 'pending'
         WHEN o.status IN ('paid', 'shipped', 'delivered') THEN 'captured'
         WHEN o.status = 'cancelled' AND EXISTS (
           SELECT 1 FROM order_events e WHERE e.order_id = o.id AND e.to_status = 'paid'
         ) THEN 'requires_review'
         ELSE 'cancelled'
       END
  `);
  assertZero(db, `${phase}:capture_balance`, `
    SELECT count(*) AS value FROM (
      SELECT p.id, p.status, p.expected_amount_cents,
             count(t.id) AS transaction_count,
             coalesce(sum(CASE WHEN t.type='capture' AND t.status='succeeded' THEN t.amount_cents ELSE 0 END), 0) AS captured
      FROM payments p LEFT JOIN payment_transactions t ON t.payment_id = p.id
      GROUP BY p.id
      HAVING (
        p.status IN ('captured', 'requires_review')
        AND (transaction_count <> 1 OR captured <> p.expected_amount_cents)
      ) OR (
        p.status IN ('pending', 'cancelled')
        AND (transaction_count <> 0 OR captured <> 0)
      )
    )
  `);
  assertZero(db, `${phase}:refunds_not_backfilled`, `
    SELECT (SELECT count(*) FROM refunds) + (SELECT count(*) FROM refund_items) AS value
  `);
  assertZero(db, `${phase}:sensitive_columns`, `
    SELECT count(*) AS value FROM pragma_table_info('payments')
    WHERE lower(name) LIKE '%email%' OR lower(name) LIKE '%address%'
       OR lower(name) LIKE '%name%' OR lower(name) LIKE '%pan%'
       OR lower(name) LIKE '%cvc%' OR lower(name) LIKE '%card%'
  `);
}

const args = argumentsFrom(process.argv.slice(2));
const baselinePath = resolve(args.baseline);
const runDirectory = join(resolve(args.outputDir), `r2-payment-ledger-${Date.now()}`);
mkdirSync(runDirectory, { recursive: true });
const forwardPath = join(runDirectory, 'forward.sqlite');
const backfillPath = join(runDirectory, 'backfill.sql');
const dumpPath = join(runDirectory, 'migrated.sql');
const restoredPath = join(runDirectory, 'restored.sqlite');

const db = new DatabaseSync(forwardPath);
db.exec('PRAGMA foreign_keys = OFF;');
db.exec(readFileSync(baselinePath, 'utf8'));
db.exec('PRAGMA foreign_keys = ON;');
prepareR28(db);
if (tableExists(db, 'payments')) throw new Error('preflight bloqueado: baseline ya contiene R2.9');
const requiresReview = preflight(db, args.allowRequiresReview);
const legacyHash = digest(legacySnapshot(db));
db.exec(readFileSync(resolve('migrations/0011_payment_ledger.sql'), 'utf8'));
const backfill = paymentLedgerBackfillSql(args.currency);
writeFileSync(backfillPath, backfill, 'utf8');
db.exec(backfill);
verify(db, 'forward', args.currency);
if (digest(legacySnapshot(db)) !== legacyHash) throw new Error('forward bloqueado: cambió el contrato legacy');
const canonicalHash = digest(paymentSnapshot(db));
db.exec(backfill);
verify(db, 'replay', args.currency);
if (digest(paymentSnapshot(db)) !== canonicalHash) throw new Error('replay bloqueado: backfill no idempotente');
const summary = {
  baselineBytes: statSync(baselinePath).size,
  orders: scalar(db, 'SELECT count(*) AS value FROM orders'),
  payments: scalar(db, 'SELECT count(*) AS value FROM payments'),
  transactions: scalar(db, 'SELECT count(*) AS value FROM payment_transactions'),
  requiresReview,
  legacyHash,
  canonicalHash,
};
db.close();

const dump = execFileSync('/usr/bin/sqlite3', [forwardPath, '.dump'], {
  encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
});
writeFileSync(dumpPath, dump, 'utf8');
const restored = new DatabaseSync(restoredPath);
restored.exec('PRAGMA foreign_keys = OFF;');
restored.exec(dump);
restored.exec('PRAGMA foreign_keys = ON;');
verify(restored, 'restore', args.currency);
if (digest(legacySnapshot(restored)) !== legacyHash) throw new Error('restore bloqueado: hash legacy distinto');
if (digest(paymentSnapshot(restored)) !== canonicalHash) throw new Error('restore bloqueado: hash canónico distinto');
restored.close();

process.stdout.write(`${JSON.stringify({
  ...summary,
  dumpBytes: statSync(dumpPath).size,
  artifactDirectory: runDirectory,
}, null, 2)}\n`);
