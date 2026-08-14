import { describe, expect, it } from 'vitest';
import migration25 from '../migrations/0025_price_rule_snapshots.sql?raw';
import { SqliteD1 } from './sqlite-d1';

function insertLegacyOrder(db: SqliteD1, number: string): void {
  db.sqlite.exec(`
    INSERT INTO products (id, slug, name, price_cents, stock, category)
    VALUES (1, 'producto-regla', 'Producto regla', 1299, 10, 'test');
    INSERT INTO product_variants (
      id, product_id, sku, title, price_cents, status, is_default, option_signature
    ) VALUES (1, 1, 'REGLA-1', '', 1299, 'active', 1, NULL);
    INSERT INTO orders (
      id, order_number, email, customer_name, address_json,
      subtotal_cents, shipping_cents, total_cents, status, currency
    ) VALUES (1, '${number}', 'qa@example.test', 'QA', '{}', 2598, 0, 2598, 'paid', 'EUR');
    INSERT INTO order_items (
      id, order_id, product_id, variant_id, name_snapshot, unit_price_cents, qty, current_qty
    ) VALUES (11, 1, 1, 1, 'Producto regla', 1299, 2, 2);
  `);
}

describe('migración 0025 de snapshots de precio', () => {
  it('backfillea líneas existentes sin cambiar el importe cobrado', () => {
    const db = new SqliteD1(true, false);
    insertLegacyOrder(db, 'R41-BACKFILL');

    db.sqlite.exec(migration25);

    const [line] = db.query<{
      unit_price_cents: number;
      base_unit_price_cents: number;
      pricing_snapshot_json: string;
    }>('SELECT unit_price_cents, base_unit_price_cents, pricing_snapshot_json FROM order_items');
    expect(line?.base_unit_price_cents).toBe(line?.unit_price_cents);
    expect(JSON.parse(line!.pricing_snapshot_json)).toEqual(expect.objectContaining({
      schema: 1,
      currency: 'EUR',
      base_unit_price_cents: 1299,
      unit_price_cents: 1299,
      quantity: 2,
      discount_cents: 0,
      subtotal_cents: 2598,
      applied_rule: null,
      evaluations: [],
      source: 'r4.1-backfill',
    }));
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('mantiene compatibles los writers anteriores mediante snapshot explícito de fallback', () => {
    const db = new SqliteD1();
    insertLegacyOrder(db, 'R41-LEGACY-WRITER');

    const [line] = db.query<{ base_unit_price_cents: number; pricing_snapshot_json: string }>(
      'SELECT base_unit_price_cents, pricing_snapshot_json FROM order_items',
    );
    expect(line?.base_unit_price_cents).toBe(1299);
    expect(JSON.parse(line!.pricing_snapshot_json)).toEqual(expect.objectContaining({
      source: 'legacy-writer',
      unit_price_cents: 1299,
      base_unit_price_cents: 1299,
      quantity: 2,
    }));
  });
});
