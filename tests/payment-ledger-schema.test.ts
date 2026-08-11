import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import migration1 from '../migrations/0001_init.sql?raw';
import migration2 from '../migrations/0002_collections_and_product_capabilities.sql?raw';
import migration3 from '../migrations/0003_contact_requests.sql?raw';
import migration4 from '../migrations/0004_event_outbox.sql?raw';
import migration5 from '../migrations/0005_audit_log.sql?raw';
import migration6 from '../migrations/0006_platform_job_runs.sql?raw';
import migration7 from '../migrations/0007_product_variants.sql?raw';
import migration8 from '../migrations/0008_product_media_attributes.sql?raw';
import migration9 from '../migrations/0009_inventory_ledger.sql?raw';
import migration10 from '../migrations/0010_inventory_reservations.sql?raw';
import migration11 from '../migrations/0011_payment_ledger.sql?raw';
import { paymentLedgerBackfillSql } from '../src/modules/payments';

const beforePaymentLedger = [
  migration1, migration2, migration3, migration4, migration5,
  migration6, migration7, migration8, migration9, migration10,
];

function historicalDatabase(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  for (const migration of beforePaymentLedger) db.exec(migration);
  db.exec(`
    INSERT INTO orders (
      id, order_number, email, customer_name, address_json,
      subtotal_cents, shipping_cents, total_cents, status,
      stripe_session_id, stripe_payment_intent, created_at, updated_at
    ) VALUES
      (1, 'R29-PENDING', 'p@example.com', 'Pending', '{}', 1000, 0, 1000,
       'pending', 'sim_sess_pending', NULL, '2026-08-01T10:00:00.000Z', '2026-08-01T10:00:00.000Z'),
      (2, 'R29-PAID', 'p@example.com', 'Paid', '{}', 1500, 500, 2000,
       'paid', 'cs_paid', 'pi_paid', '2026-08-01T11:00:00.000Z', '2026-08-01T11:05:00.000Z'),
      (3, 'R29-REVIEW', 'p@example.com', 'Review', '{}', 3000, 0, 3000,
       'cancelled', 'cs_review', 'pi_review', '2026-08-01T12:00:00.000Z', '2026-08-01T12:10:00.000Z'),
      (4, 'R29-CANCELLED', 'p@example.com', 'Cancelled', '{}', 900, 0, 900,
       'cancelled', NULL, NULL, '2026-08-01T13:00:00.000Z', '2026-08-01T13:31:00.000Z');
    INSERT INTO order_events (order_id, from_status, to_status, note, created_at)
    VALUES (3, 'pending', 'paid', 'Pago confirmado', '2026-08-01T12:05:00.000Z'),
           (3, 'paid', 'cancelled', 'Cancelado', '2026-08-01T12:10:00.000Z');
  `);
  return db;
}

describe('migración R2.9 del ledger de pagos', () => {
  it('congela moneda, proveedor, estado y capturas sin inventar reembolsos', () => {
    const db = historicalDatabase();
    db.exec(migration11);
    db.exec(paymentLedgerBackfillSql('EUR'));

    expect(db.prepare(`
      SELECT order_id, provider, provider_reference, currency,
             expected_amount_cents, status, version
      FROM payments ORDER BY order_id
    `).all()).toEqual([
      { order_id: 1, provider: 'simulated', provider_reference: 'sim_sess_pending', currency: 'EUR', expected_amount_cents: 1000, status: 'pending', version: 1 },
      { order_id: 2, provider: 'stripe', provider_reference: 'pi_paid', currency: 'EUR', expected_amount_cents: 2000, status: 'captured', version: 1 },
      { order_id: 3, provider: 'stripe', provider_reference: 'pi_review', currency: 'EUR', expected_amount_cents: 3000, status: 'requires_review', version: 1 },
      { order_id: 4, provider: 'legacy', provider_reference: null, currency: 'EUR', expected_amount_cents: 900, status: 'cancelled', version: 1 },
    ]);
    expect(db.prepare(`
      SELECT p.order_id, t.type, t.amount_cents, t.currency, t.status
      FROM payment_transactions t JOIN payments p ON p.id = t.payment_id
      ORDER BY p.order_id
    `).all()).toEqual([
      { order_id: 2, type: 'capture', amount_cents: 2000, currency: 'EUR', status: 'succeeded' },
      { order_id: 3, type: 'capture', amount_cents: 3000, currency: 'EUR', status: 'succeeded' },
    ]);
    expect(db.prepare('SELECT count(*) AS value FROM refunds').get()).toEqual({ value: 0 });
    expect(db.prepare('SELECT count(*) AS value FROM refund_items').get()).toEqual({ value: 0 });
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(db.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });
  });

  it('rechaza sobrecaptura, moneda divergente y reembolso superior al capturado', () => {
    const db = historicalDatabase();
    db.exec(migration11);
    db.exec(paymentLedgerBackfillSql('EUR'));
    const paymentId = Number(db.prepare('SELECT id FROM payments WHERE order_id = 2').get()?.id);

    expect(() => db.prepare(`
      INSERT INTO payment_transactions (
        payment_id, type, amount_cents, currency, status, provider_reference,
        idempotency_key, occurred_at, created_at
      ) VALUES (?, 'capture', 1, 'EUR', 'succeeded', 'pi_extra',
        'capture:extra', '2026-08-01T11:06:00.000Z', '2026-08-01T11:06:00.000Z')
    `).run(paymentId)).toThrow(/payment_transaction_conflict/);
    expect(() => db.prepare(`
      INSERT INTO payment_transactions (
        payment_id, type, amount_cents, currency, status, provider_reference,
        idempotency_key, occurred_at, created_at
      ) VALUES (?, 'refund', 1, 'USD', 'succeeded', 're_bad_currency',
        'refund:bad-currency', '2026-08-01T11:07:00.000Z', '2026-08-01T11:07:00.000Z')
    `).run(paymentId)).toThrow(/payment_transaction_conflict/);
    expect(() => db.prepare(`
      INSERT INTO payment_transactions (
        payment_id, type, amount_cents, currency, status, provider_reference,
        idempotency_key, occurred_at, created_at
      ) VALUES (?, 'refund', 2001, 'EUR', 'succeeded', 're_too_much',
        'refund:too-much', '2026-08-01T11:08:00.000Z', '2026-08-01T11:08:00.000Z')
    `).run(paymentId)).toThrow(/payment_transaction_conflict/);
  });
});
