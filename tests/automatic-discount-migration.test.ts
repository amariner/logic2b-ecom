import { describe, expect, it } from 'vitest';
import migration27 from '../migrations/0027_automatic_discounts.sql?raw';
import { evaluatePriceRules } from '../src/modules/pricing';
import { SqliteD1 } from './sqlite-d1';

const AT = '2026-08-14T12:00:00.000Z';

function seedOrder(db: SqliteD1, ruleId = 'automatic:auto-one'): void {
  const pricing = evaluatePriceRules({
    baseUnitPriceCents: 1000,
    quantity: 1,
    context: { at: AT, currency: 'EUR', market: 'ES', channel: 'storefront' },
    candidates: [{
      id: ruleId, version: 1, label: 'Oferta automática', priority: 10,
      activeFrom: null, activeUntil: null, markets: ['ES'], channels: ['storefront'], currency: 'EUR',
      effect: { type: 'percentage_off', basisPoints: 1000 },
    }],
  });
  db.sqlite.exec(`
    INSERT INTO products (id, slug, name, price_cents, stock, category)
    VALUES (1, 'auto-product', 'Auto product', 1000, 10, 'test');
    INSERT INTO orders (id, order_number, email, customer_name, address_json,
      subtotal_cents, shipping_cents, total_cents, status, currency)
    VALUES (1, 'AUTO-ONE', 'auto@example.test', 'Auto', '{}', 900, 0, 900, 'pending', 'EUR');
  `);
  db.sqlite.prepare(`
    INSERT INTO order_items (id, order_id, product_id, name_snapshot,
      unit_price_cents, base_unit_price_cents, pricing_snapshot_json, qty, current_qty)
    VALUES (1, 1, 1, 'Auto product', 900, 1000, ?, 1, 1)
  `).run(JSON.stringify(pricing));
}

function seedDiscount(db: SqliteD1): void {
  db.sqlite.exec(`
    INSERT INTO automatic_discounts (
      id, label, public_reason, state, version, priority, currency,
      effect_type, basis_points, markets_json, channels_json,
      minimum_subtotal_cents, created_at, updated_at
    ) VALUES ('auto-one', 'Campaña automática', 'Oferta automática', 'active', 1, 10,
      'EUR', 'percentage_off', 1000, '["ES"]', '["storefront"]', 0, '${AT}', '${AT}');
    INSERT INTO automatic_discount_products (discount_id, product_id) VALUES ('auto-one', 1);
  `);
}

function apply(db: SqliteD1, cents = 100): void {
  db.sqlite.exec(`
    INSERT INTO automatic_discount_applications (
      id, discount_id, discount_version, order_id, discount_cents,
      snapshot_json, idempotency_key, applied_at
    ) VALUES ('app-one', 'auto-one', 1, 1, ${cents}, '{}', 'automatic:order:AUTO-ONE', '${AT}')
  `);
}

describe('migración 0027 de descuentos automáticos', () => {
  it('es expand-only y no inventa campañas', () => {
    const db = new SqliteD1(true, true, true, false);
    const before = db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'").length;
    db.sqlite.exec(migration27);
    expect(db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'").length).toBe(before + 3);
    expect(db.value('SELECT count(*) AS value FROM automatic_discounts')).toBe(0);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('acepta una aplicación trazable y rechaza importe o efecto manipulados', () => {
    const db = new SqliteD1();
    seedOrder(db);
    seedDiscount(db);
    expect(() => apply(db, 99)).toThrow(/automatic_discount_application_conflict/);
    apply(db);
    expect(db.query('SELECT discount_id, discount_version, discount_cents FROM automatic_discount_applications'))
      .toEqual([{ discount_id: 'auto-one', discount_version: 1, discount_cents: 100 }]);
  });

  it('impide mezclar código y descuento automático en el mismo pedido', () => {
    const db = new SqliteD1();
    seedOrder(db);
    seedDiscount(db);
    apply(db);
    db.sqlite.exec(`
      INSERT INTO promotion_codes (
        id, code_hash, code_hint, label, state, version, priority, currency,
        effect_type, basis_points, markets_json, channels_json,
        minimum_subtotal_cents, created_at, updated_at
      ) VALUES ('promo-one', '${'a'.repeat(64)}', '••••O-10', 'Promo', 'active', 1, 10,
        'EUR', 'percentage_off', 1000, '["ES"]', '["storefront"]', 0, '${AT}', '${AT}')
    `);
    expect(() => db.sqlite.exec(`
      INSERT INTO promotion_code_usages (
        id, promotion_id, promotion_version, order_id, customer_key_hash, status,
        discount_cents, snapshot_json, idempotency_key, reserved_at, updated_at
      ) VALUES ('use-one', 'promo-one', 1, 1, '${'b'.repeat(64)}', 'reserved', 100,
        '{}', 'promotion:order:AUTO-ONE', '${AT}', '${AT}')
    `)).toThrow(/pricing_source_conflict/);
  });
});
