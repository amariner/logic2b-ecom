import { describe, expect, it } from 'vitest';
import migration28 from '../migrations/0028_quantity_offers.sql?raw';
import { evaluatePriceRules } from '../src/modules/pricing';
import { SqliteD1 } from './sqlite-d1';

const AT = '2026-08-14T12:00:00.000Z';

function seedOrder(db: SqliteD1, ruleId = 'quantity:volume-one'): void {
  const pricing = evaluatePriceRules({
    baseUnitPriceCents: 1000, quantity: 3,
    context: { at: AT, currency: 'EUR', market: 'ES', channel: 'storefront' },
    candidates: [{ id: ruleId, version: 1, label: 'Ahorro por volumen', priority: 10,
      activeFrom: null, activeUntil: null, markets: ['ES'], channels: ['storefront'], currency: 'EUR',
      effect: { type: 'percentage_off', basisPoints: 1000 } }],
  });
  db.sqlite.exec(`
    INSERT INTO products (id, slug, name, price_cents, stock, category)
    VALUES (1, 'volume-product', 'Volume product', 1000, 10, 'test');
    INSERT INTO orders (id, order_number, email, customer_name, address_json,
      subtotal_cents, shipping_cents, total_cents, status, currency)
    VALUES (1, 'VOLUME-ONE', 'volume@example.test', 'Volume', '{}', 2700, 0, 2700, 'pending', 'EUR');
  `);
  db.sqlite.prepare(`INSERT INTO order_items (id, order_id, product_id, name_snapshot,
    unit_price_cents, base_unit_price_cents, pricing_snapshot_json, qty, current_qty)
    VALUES (1, 1, 1, 'Volume product', 900, 1000, ?, 3, 3)`).run(JSON.stringify(pricing));
}

function seedOffer(db: SqliteD1): void {
  db.sqlite.exec(`
    INSERT INTO quantity_offers (
      id, label, public_reason, state, version, priority, currency, kind, tier_basis,
      markets_json, channels_json, created_at, updated_at
    ) VALUES ('volume-one', 'Oferta por volumen', 'Ahorro por volumen', 'active', 1, 10,
      'EUR', 'quantity_tier', 'quantity', '["ES"]', '["storefront"]', '${AT}', '${AT}');
    INSERT INTO quantity_offer_tiers (offer_id, threshold, effect_type, basis_points)
    VALUES ('volume-one', 3, 'percentage_off', 1000);
    INSERT INTO quantity_offer_products (offer_id, role, product_id)
    VALUES ('volume-one', 'eligible', 1);
  `);
}

function apply(db: SqliteD1, cents = 300): void {
  db.sqlite.exec(`INSERT INTO quantity_offer_applications (
    id, offer_id, offer_version, order_id, discount_cents, snapshot_json,
    idempotency_key, applied_at
  ) VALUES ('qty-app-one', 'volume-one', 1, 1, ${cents},
    '{"schema":1,"offer_id":"volume-one","version":1,"kind":"quantity_tier","discount_cents":${cents},"evidence":{"kind":"quantity_tier","tier_basis":"quantity","measured_value":3,"threshold":3}}',
    'quantity:order:VOLUME-ONE', '${AT}')`);
}

describe('migración 0028 de ofertas por cantidad', () => {
  it('es expand-only y no inventa ofertas', () => {
    const db = new SqliteD1(true, true, true, true, false);
    const before = db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'").length;
    db.sqlite.exec(migration28);
    expect(db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'").length).toBe(before + 4);
    expect(db.value('SELECT count(*) AS value FROM quantity_offers')).toBe(0);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('acepta evidencia coherente y rechaza importe o snapshot manipulados', () => {
    const db = new SqliteD1();
    seedOrder(db);
    seedOffer(db);
    expect(() => apply(db, 299)).toThrow(/quantity_offer_application_conflict/);
    apply(db);
    expect(db.query('SELECT offer_id, offer_version, discount_cents FROM quantity_offer_applications'))
      .toEqual([{ offer_id: 'volume-one', offer_version: 1, discount_cents: 300 }]);
  });

  it('impide mezclar la oferta con códigos o descuentos automáticos', () => {
    const db = new SqliteD1();
    seedOrder(db);
    seedOffer(db);
    apply(db);
    db.sqlite.exec(`INSERT INTO promotion_codes (
      id, code_hash, code_hint, label, state, version, priority, currency,
      effect_type, basis_points, markets_json, channels_json,
      minimum_subtotal_cents, created_at, updated_at
    ) VALUES ('promo-one', '${'a'.repeat(64)}', '••••O-10', 'Promo', 'active', 1, 10,
      'EUR', 'percentage_off', 1000, '["ES"]', '["storefront"]', 0, '${AT}', '${AT}')`);
    expect(() => db.sqlite.exec(`INSERT INTO promotion_code_usages (
      id, promotion_id, promotion_version, order_id, customer_key_hash, status,
      discount_cents, snapshot_json, idempotency_key, reserved_at, updated_at
    ) VALUES ('use-one', 'promo-one', 1, 1, '${'b'.repeat(64)}', 'reserved', 300,
      '{}', 'promotion:order:VOLUME-ONE', '${AT}', '${AT}')`)).toThrow(/pricing_source_conflict/);
  });
});
