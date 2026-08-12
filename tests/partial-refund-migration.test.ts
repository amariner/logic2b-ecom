import { describe, expect, it } from 'vitest';
import migration from '../migrations/0013_partial_refund_guards.sql?raw';
import { SqliteD1 } from './sqlite-d1';

const NOW = '2026-08-11T18:00:00.000Z';

function database(): SqliteD1 {
  const db = new SqliteD1(false);
  db.sqlite.exec(`
    INSERT INTO products (id, slug, name, price_cents, stock, category)
    VALUES (1, 'producto', 'Producto', 1000, 10, 'test');
    INSERT INTO product_variants (
      id, product_id, sku, title, price_cents, status, is_default, option_signature
    ) VALUES (1, 1, 'PRODUCTO-1', '', 1000, 'active', 1, NULL);
    INSERT INTO orders (
      id, order_number, email, customer_name, address_json,
      subtotal_cents, shipping_cents, total_cents, status, stripe_session_id, currency
    ) VALUES
      (1, 'R213-ONE', 'one@example.com', 'One', '{}', 3000, 0, 3000, 'paid', 'sim_one', 'EUR'),
      (2, 'R213-TWO', 'two@example.com', 'Two', '{}', 1000, 0, 1000, 'paid', 'sim_two', 'EUR');
    INSERT INTO order_items (
      id, order_id, product_id, variant_id, name_snapshot, unit_price_cents, qty
    ) VALUES
      (11, 1, 1, 1, 'Producto', 1000, 3),
      (21, 2, 1, 1, 'Producto', 1000, 1);
    INSERT INTO payments (
      id, order_id, provider, provider_reference, currency, expected_amount_cents,
      status, idempotency_key, created_at, updated_at
    ) VALUES
      (1, 1, 'simulated', 'sim_pi_one', 'EUR', 3000, 'captured', 'payment:one', '${NOW}', '${NOW}'),
      (2, 2, 'simulated', 'sim_pi_two', 'EUR', 1000, 'captured', 'payment:two', '${NOW}', '${NOW}');
    INSERT INTO refunds (
      id, order_id, payment_id, status, reason, subtotal_cents, shipping_cents,
      total_cents, idempotency_key, version, created_at, updated_at
    ) VALUES (
      99, 1, 1, 'succeeded', 'Historico', 3000, 0, 3000,
      'refund:one:legacy', 1, '${NOW}', '${NOW}'
    );
  `);
  db.sqlite.exec(migration);
  db.sqlite.exec(`
    INSERT INTO refunds (
      id, order_id, payment_id, status, reason, subtotal_cents, shipping_cents,
      total_cents, idempotency_key, version, created_at, updated_at, operation_type
    ) VALUES
      (101, 1, 1, 'pending', 'Primera', 2000, 0, 2000, 'refund:one:a', 1, '${NOW}', '${NOW}', 'partial_cancellation'),
      (102, 1, 1, 'pending', 'Segunda', 2000, 0, 2000, 'refund:one:b', 1, '${NOW}', '${NOW}', 'partial_cancellation'),
      (201, 2, 2, 'pending', 'Ajena', 1000, 0, 1000, 'refund:two:a', 1, '${NOW}', '${NOW}', 'partial_cancellation');
    INSERT INTO fulfillments (
      id, order_id, status, carrier, tracking_number, idempotency_key,
      shipped_at, created_at, updated_at
    ) VALUES (1, 1, 'shipped', 'SEUR', 'R213-SHIPPED', 'fulfillment:one', '${NOW}', '${NOW}', '${NOW}');
    INSERT INTO fulfillment_items (fulfillment_id, order_id, order_item_id, quantity, created_at)
    VALUES (1, 1, 11, 1, '${NOW}');
  `);
  return db;
}

describe('migracion R2.13 de guardas para reembolso parcial', () => {
  it('es aditiva y conserva total_cancellation para filas R2.10', () => {
    const db = database();
    const column = db.query<{ name: string; dflt_value: string }>(
      "PRAGMA table_info('refunds')",
    ).find((candidate) => candidate.name === 'operation_type');
    expect(column?.dflt_value).toBe("'total_cancellation'");
    expect(db.value(
      "SELECT count(*) AS value FROM refunds WHERE id=99 AND operation_type='total_cancellation'",
    )).toBe(1);
    expect(db.value(
      "SELECT count(*) AS value FROM sqlite_schema WHERE type='trigger' AND name='refund_item_partial_guard'",
    )).toBe(1);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('rechaza una línea de otro pedido aunque exista', () => {
    const db = database();
    expect(() => db.sqlite.exec(`
      INSERT INTO refund_items (refund_id, order_item_id, quantity, amount_cents, restock_decision)
      VALUES (201, 11, 1, 1000, 'restock');
    `)).toThrow(/refund_item_order_conflict/);
    expect(db.value('SELECT count(*) AS value FROM refund_items')).toBe(0);
  });

  it('reserva intención más fulfillment bajo concurrencia y solo cancelled libera', () => {
    const db = database();
    db.sqlite.exec(`
      INSERT INTO refund_items (refund_id, order_item_id, quantity, amount_cents, restock_decision)
      VALUES (101, 11, 2, 2000, 'restock');
    `);
    expect(() => db.sqlite.exec(`
      INSERT INTO refund_items (refund_id, order_item_id, quantity, amount_cents, restock_decision)
      VALUES (102, 11, 1, 1000, 'restock');
    `)).toThrow(/refund_item_quantity_conflict/);
    db.sqlite.exec("UPDATE refunds SET status='cancelled' WHERE id=101;");
    db.sqlite.exec(`
      INSERT INTO refund_items (refund_id, order_item_id, quantity, amount_cents, restock_decision)
      VALUES (102, 11, 2, 2000, 'restock');
    `);
    expect(db.query('SELECT refund_id, quantity FROM refund_items ORDER BY refund_id')).toEqual([
      { refund_id: 101, quantity: 2 },
      { refund_id: 102, quantity: 2 },
    ]);
  });
});
