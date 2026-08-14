import { describe, expect, it } from 'vitest';
import { SqliteD1 } from './sqlite-d1';

describe('migración R3.10 de devoluciones', () => {
  it('instala cabecera, líneas, eventos, movimientos y cambios con FKs limpias', () => {
    const db = new SqliteD1();
    expect(db.query<{ name: string }>(`SELECT name FROM sqlite_schema
      WHERE type='table' AND name LIKE 'return_%' ORDER BY name`).map((row) => row.name)).toEqual([
      'return_events', 'return_exchange_lines', 'return_inventory_movements',
      'return_request_lines', 'return_requests',
    ]);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
    expect(db.value("SELECT count(*) AS value FROM sqlite_schema WHERE type='trigger' AND name='return_request_line_quantity_guard'" )).toBe(1);
  });

  it('demuestra que línea y cabecera pertenecen al mismo pedido', () => {
    const db = new SqliteD1();
    db.sqlite.exec(`
      INSERT INTO products (id, slug, name, price_cents, stock, category)
      VALUES (1, 'rma', 'RMA', 1000, 1, 'test');
      INSERT INTO product_variants (id, product_id, sku, title, price_cents, status, is_default, option_signature)
      VALUES (1, 1, 'RMA-1', '', 1000, 'active', 1, NULL);
      INSERT INTO orders (id, order_number, email, customer_name, address_json,
        subtotal_cents, shipping_cents, total_cents, status, currency)
      VALUES (1, 'RMA-1', 'one@example.com', 'One', '{}', 1000, 0, 1000, 'delivered', 'EUR'),
             (2, 'RMA-2', 'two@example.com', 'Two', '{}', 1000, 0, 1000, 'delivered', 'EUR');
      INSERT INTO order_items (id, order_id, product_id, variant_id, name_snapshot, unit_price_cents, qty)
      VALUES (11, 1, 1, 1, 'RMA', 1000, 1);
      INSERT INTO return_requests (id, return_number, order_id, status, reason_code,
        requested_by_kind, requested_by_id, create_idempotency_key, requested_at, created_at, updated_at)
      VALUES ('rma_header_2', 'RMA-HEADER-2', 2, 'requested', 'other', 'admin', 'admin-panel',
        'rma:create:header:2', '2026-08-14T10:00:00.000Z', '2026-08-14T10:00:00.000Z', '2026-08-14T10:00:00.000Z');
    `);
    expect(() => db.sqlite.exec(`INSERT INTO return_request_lines (
      id, return_id, order_id, order_item_id, variant_id, requested_quantity,
      eligible_quantity, unit_amount_cents, created_at, updated_at
    ) VALUES ('rml_foreign_1', 'rma_header_2', 2, 11, 1, 1, 1, 1000,
      '2026-08-14T10:00:00.000Z', '2026-08-14T10:00:00.000Z')`)).toThrow(/return_line_order_conflict/);
  });
});
