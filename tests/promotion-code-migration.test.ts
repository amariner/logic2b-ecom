import { describe, expect, it } from 'vitest';
import migration26 from '../migrations/0026_promotion_codes.sql?raw';
import { SqliteD1 } from './sqlite-d1';

const HASH = 'a'.repeat(64);
const CUSTOMER = 'b'.repeat(64);
const AT = '2026-08-14T12:00:00.000Z';

function seedOrders(db: SqliteD1): void {
  const snapshot = (discount: number) => JSON.stringify({
    schema: 1,
    context: { at: AT, currency: 'EUR', market: 'ES', channel: 'storefront' },
    currency: 'EUR',
    base_unit_price_cents: 1000,
    unit_price_cents: 1000 - discount,
    quantity: 1,
    base_subtotal_cents: 1000,
    discount_cents: discount,
    subtotal_cents: 1000 - discount,
    applied_rule: { id: 'promotion:promo-one', version: 1 },
    evaluations: [],
  }).replaceAll("'", "''");
  db.sqlite.exec(`
    INSERT INTO products (id, slug, name, price_cents, stock, category)
    VALUES (1, 'promo-product', 'Promo product', 1000, 10, 'test');
    INSERT INTO product_variants (id, product_id, sku, title, price_cents, status, is_default, option_signature)
    VALUES (1, 1, 'PROMO-1', '', 1000, 'active', 1, NULL);
    INSERT INTO orders (id, order_number, email, customer_name, address_json,
      subtotal_cents, shipping_cents, total_cents, status, currency)
    VALUES
      (1, 'PROMO-ONE', 'one@example.test', 'One', '{}', 900, 0, 900, 'pending', 'EUR'),
      (2, 'PROMO-TWO', 'two@example.test', 'Two', '{}', 900, 0, 900, 'pending', 'EUR');
    INSERT INTO order_items (id, order_id, product_id, variant_id, name_snapshot,
      unit_price_cents, base_unit_price_cents, pricing_snapshot_json, qty, current_qty)
    VALUES
      (11, 1, 1, 1, 'Promo product', 900, 1000, '${snapshot(100)}', 1, 1),
      (12, 2, 1, 1, 'Promo product', 900, 1000, '${snapshot(100)}', 1, 1);
  `);
}

function insertPromotion(db: SqliteD1): void {
  db.sqlite.exec(`
    INSERT INTO promotion_codes (
      id, code_hash, code_hint, label, state, version, priority, currency,
      effect_type, basis_points, active_from, active_until, markets_json,
      channels_json, global_usage_limit, per_customer_usage_limit,
      minimum_subtotal_cents, created_at, updated_at
    ) VALUES ('promo-one', '${HASH}', '••••O-10', 'Promo one', 'active', 1, 10,
      'EUR', 'percentage_off', 1000, '2026-08-01T00:00:00.000Z',
      '2026-09-01T00:00:00.000Z', '["ES"]', '["storefront"]', 1, 1, 0, '${AT}', '${AT}');
    INSERT INTO promotion_code_products (promotion_id, product_id) VALUES ('promo-one', 1);
  `);
}

function usage(db: SqliteD1, id: string, orderId: number, customer = CUSTOMER): void {
  db.sqlite.prepare(`
    INSERT INTO promotion_code_usages (
      id, promotion_id, promotion_version, order_id, customer_key_hash, status,
      discount_cents, snapshot_json, idempotency_key, reserved_at, updated_at
    ) VALUES (?, 'promo-one', 1, ?, ?, 'reserved', 100, '{}', ?, ?, ?)
  `).run(id, orderId, customer, `promotion:order:${orderId}`, AT, AT);
}

describe('migración 0026 de códigos promocionales', () => {
  it('es expand-only y crea el contrato de lookup, scope y uso', () => {
    const db = new SqliteD1(true, true, false);
    const before = db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'").length;
    db.sqlite.exec(migration26);
    const tables = db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'").map((row) => row.name);
    expect(tables).toEqual(expect.arrayContaining([
      'promotion_codes', 'promotion_code_products', 'promotion_code_usages',
    ]));
    expect(tables.length).toBe(before + 3);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('serializa el límite global y permite reutilizar una reserva liberada', () => {
    const db = new SqliteD1();
    seedOrders(db);
    insertPromotion(db);
    usage(db, 'use-one', 1);
    expect(() => usage(db, 'use-two-conflict', 2, 'c'.repeat(64)))
      .toThrow(/promotion_code_usage_conflict/);
    db.sqlite.exec(`UPDATE promotion_code_usages
      SET status='released', released_at='${AT}', updated_at='${AT}' WHERE id='use-one'`);
    usage(db, 'use-two', 2, 'c'.repeat(64));
    expect(db.value("SELECT count(*) AS value FROM promotion_code_usages WHERE status='reserved'"))
      .toBe(1);
  });

  it('rechaza importes que no coinciden con snapshots de línea', () => {
    const db = new SqliteD1();
    seedOrders(db);
    insertPromotion(db);
    expect(() => db.sqlite.exec(`
      INSERT INTO promotion_code_usages (
        id, promotion_id, promotion_version, order_id, customer_key_hash, status,
        discount_cents, snapshot_json, idempotency_key, reserved_at, updated_at
      ) VALUES ('bad-use', 'promo-one', 1, 1, '${CUSTOMER}', 'reserved', 99,
        '{}', 'promotion:bad-use', '${AT}', '${AT}')
    `)).toThrow(/promotion_code_usage_conflict/);
  });
});
