import { describe, expect, it } from 'vitest';
import migration13 from '../migrations/0013_partial_refund_guards.sql?raw';
import migration14 from '../migrations/0014_order_list_indexes.sql?raw';
import migration15 from '../migrations/0015_order_collaboration.sql?raw';
import migration16 from '../migrations/0016_order_amendments.sql?raw';
import { SqliteD1 } from './sqlite-d1';

const NOW = '2026-08-12T10:00:00.000Z';

function databaseWithHistory(): SqliteD1 {
  const db = new SqliteD1(false);
  db.sqlite.exec(`${migration13}\n${migration14}\n${migration15}`);
  db.sqlite.exec(`
    INSERT INTO products (id, slug, name, price_cents, stock, category)
    VALUES (1, 'producto', 'Producto', 1000, 10, 'test');
    INSERT INTO product_variants (
      id, product_id, sku, title, price_cents, status, is_default, option_signature
    ) VALUES (1, 1, 'PRODUCTO-1', '', 1000, 'active', 1, NULL);
    INSERT INTO orders (
      id, order_number, email, customer_name, address_json,
      subtotal_cents, shipping_cents, total_cents, status, currency
    ) VALUES (1, 'R33-ONE', 'qa@example.test', 'QA', '{}', 2000, 0, 2000, 'paid', 'EUR');
    INSERT INTO order_items (
      id, order_id, product_id, variant_id, name_snapshot, sku_snapshot,
      unit_price_cents, qty
    ) VALUES (11, 1, 1, 1, 'Producto', 'PRODUCTO-1', 1000, 2);
    INSERT INTO payments (
      id, order_id, provider, provider_reference, currency,
      expected_amount_cents, status, idempotency_key, created_at, updated_at
    ) VALUES (1, 1, 'simulated', 'sim_pi_one', 'EUR', 2000, 'partially_refunded',
      'payment:one', '${NOW}', '${NOW}');
    INSERT INTO payment_transactions (
      id, payment_id, type, amount_cents, currency, status,
      provider_reference, idempotency_key, occurred_at, created_at
    ) VALUES
      (21, 1, 'capture', 2000, 'EUR', 'succeeded', 'sim_pi_one',
        'capture:one', '${NOW}', '${NOW}'),
      (22, 1, 'refund', 1000, 'EUR', 'succeeded', 'sim_re_one',
        'refund-transaction:one', '${NOW}', '${NOW}');
    INSERT INTO refunds (
      id, order_id, payment_id, status, reason, subtotal_cents,
      shipping_cents, total_cents, provider_reference, idempotency_key,
      version, created_at, updated_at, operation_type
    ) VALUES (31, 1, 1, 'succeeded', 'Histórico', 1000, 0, 1000,
      'sim_re_one', 'refund:one', 1, '${NOW}', '${NOW}', 'partial_cancellation');
    INSERT INTO refund_items (
      refund_id, order_item_id, quantity, amount_cents, restock_decision
    ) VALUES (31, 11, 1, 1000, 'restock');
  `);
  db.sqlite.exec(migration16);
  return db;
}

describe('migración R3.3 de edición segura de pedidos', () => {
  it('hace backfill de versión, cantidad vigente y asignación financiera', () => {
    const db = databaseWithHistory();
    expect(db.query('SELECT edit_version FROM orders')).toEqual([{ edit_version: 1 }]);
    expect(db.query('SELECT qty, current_qty FROM order_items')).toEqual([{ qty: 2, current_qty: 2 }]);
    expect(db.query(`
      SELECT refund_id, capture_transaction_id, amount_cents, status,
             provider_reference
      FROM refund_payment_allocations
    `)).toEqual([{
      refund_id: 31,
      capture_transaction_id: 21,
      amount_cents: 1000,
      status: 'succeeded',
      provider_reference: 'sim_re_one',
    }]);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('reserva saldo por captura y solo cancelled lo libera', () => {
    const db = databaseWithHistory();
    db.sqlite.exec(`
      INSERT INTO refunds (
        id, order_id, payment_id, status, reason, subtotal_cents,
        shipping_cents, total_cents, idempotency_key, created_at, updated_at,
        operation_type
      ) VALUES (32, 1, 1, 'pending', 'Ajuste', 1000, 0, 1000,
        'refund:two', '${NOW}', '${NOW}', 'adjustment');
    `);
    expect(() => db.sqlite.exec(`
      INSERT INTO refund_payment_allocations (
        refund_id, payment_id, capture_transaction_id, amount_cents,
        idempotency_key, created_at, updated_at
      ) VALUES (32, 1, 21, 1001, 'allocation:too-much', '${NOW}', '${NOW}');
    `)).toThrow(/refund_payment_allocation_conflict/);
    db.sqlite.exec(`
      INSERT INTO refund_payment_allocations (
        refund_id, payment_id, capture_transaction_id, amount_cents,
        idempotency_key, created_at, updated_at
      ) VALUES (32, 1, 21, 1000, 'allocation:remaining', '${NOW}', '${NOW}');
    `);
    expect(() => db.sqlite.exec(`
      INSERT INTO refunds (
        id, order_id, payment_id, status, reason, subtotal_cents,
        shipping_cents, total_cents, idempotency_key, created_at, updated_at,
        operation_type
      ) VALUES (33, 1, 1, 'pending', 'Otro', 1, 0, 1,
        'refund:three', '${NOW}', '${NOW}', 'adjustment');
      INSERT INTO refund_payment_allocations (
        refund_id, payment_id, capture_transaction_id, amount_cents,
        idempotency_key, created_at, updated_at
      ) VALUES (33, 1, 21, 1, 'allocation:none', '${NOW}', '${NOW}');
    `)).toThrow(/refund_payment_allocation_conflict/);
    db.sqlite.exec("UPDATE refund_payment_allocations SET status='cancelled' WHERE refund_id=32");
    db.sqlite.exec(`
      INSERT INTO refunds (
        id, order_id, payment_id, status, reason, subtotal_cents,
        shipping_cents, total_cents, idempotency_key, created_at, updated_at,
        operation_type
      ) VALUES (34, 1, 1, 'pending', 'Liberado', 1000, 0, 1000,
        'refund:four', '${NOW}', '${NOW}', 'adjustment');
      INSERT INTO refund_payment_allocations (
        refund_id, payment_id, capture_transaction_id, amount_cents,
        idempotency_key, created_at, updated_at
      ) VALUES (34, 1, 21, 1000, 'allocation:reused', '${NOW}', '${NOW}');
    `);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('impide dos ediciones activas y líneas de otro pedido', () => {
    const db = databaseWithHistory();
    const header = (id: string) => `
      INSERT INTO order_amendments (
        id, order_id, status, expected_order_version, reason, currency,
        address_before_json, address_after_json,
        subtotal_before_cents, shipping_before_cents, total_before_cents,
        subtotal_after_cents, shipping_after_cents, total_after_cents,
        delta_cents, created_at, updated_at
      ) VALUES ('${id}', 1, 'ready', 1, 'Dirección', 'EUR', '{}', '{}',
        2000, 0, 2000, 2000, 0, 2000, 0, '${NOW}', '${NOW}');
    `;
    db.sqlite.exec(header('amendment-one'));
    expect(() => db.sqlite.exec(header('amendment-two'))).toThrow(/UNIQUE/);
    expect(() => db.sqlite.exec(`
      INSERT INTO order_amendment_lines (
        amendment_id, order_id, order_item_id, product_id, variant_id,
        name_snapshot, sku_snapshot, unit_price_cents,
        quantity_before, quantity_after, quantity_delta, amount_delta_cents,
        created_at
      ) VALUES ('amendment-one', 2, 11, 1, 1, 'Producto', 'PRODUCTO-1',
        1000, 2, 1, -1, -1000, '${NOW}');
    `)).toThrow();
  });
});
