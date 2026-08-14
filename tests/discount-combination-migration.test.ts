import { describe, expect, it } from 'vitest';
import migration29 from '../migrations/0029_discount_combinations.sql?raw';
import { evaluateCombinedPriceRules } from '../src/modules/pricing';
import { SqliteD1 } from './sqlite-d1';

const AT = '2026-08-14T12:00:00.000Z';

function base(): SqliteD1 {
  const db = new SqliteD1(true, true, true, true, true, false);
  db.sqlite.exec(migration29);
  db.sqlite.exec(`
    INSERT INTO products (id, slug, name, price_cents, stock, category)
    VALUES (1, 'combined', 'Combined', 1000, 10, 'test');
    INSERT INTO promotion_codes (id, code_hash, code_hint, label, state, version,
      priority, currency, effect_type, basis_points, markets_json, channels_json,
      minimum_subtotal_cents, created_at, updated_at)
    VALUES ('promo-one', '${'a'.repeat(64)}', '••••O-10', 'Promo 10', 'active', 1,
      10, 'EUR', 'percentage_off', 1000, '["ES"]', '["storefront"]', 0, '${AT}', '${AT}');
    INSERT INTO automatic_discounts (id, label, public_reason, state, version,
      priority, currency, effect_type, basis_points, markets_json, channels_json,
      minimum_subtotal_cents, created_at, updated_at)
    VALUES ('auto-one', 'Auto 20', 'Auto 20', 'active', 1, 20, 'EUR',
      'percentage_off', 2000, '["ES"]', '["storefront"]', 0, '${AT}', '${AT}');
    INSERT INTO discount_combination_policies (id, label, state, version, priority,
      currency, markets_json, channels_json, maximum_discount_basis_points, created_at, updated_at)
    VALUES ('policy-one', 'Política uno', 'active', 1, 10, 'EUR', '["ES"]',
      '["storefront"]', 5000, '${AT}', '${AT}');
    INSERT INTO discount_combination_source_pairs (policy_id, left_source, right_source)
    VALUES ('policy-one', 'automatic_discount', 'promotion_code');
    INSERT INTO discount_combination_class_pairs (policy_id, left_class, right_class)
    VALUES ('policy-one', 'order', 'product');
  `);
  const pricing = evaluateCombinedPriceRules({
    baseUnitPriceCents: 1000, quantity: 1,
    context: { at: AT, currency: 'EUR', market: 'ES', channel: 'storefront' },
    maximumDiscountBasisPoints: 5000,
    candidates: [
      { id: 'promotion:promo-one', version: 1, label: 'Promo 10', priority: 10,
        activeFrom: null, activeUntil: null, markets: ['ES'], channels: ['storefront'], currency: 'EUR',
        effect: { type: 'percentage_off', basisPoints: 1000 } },
      { id: 'automatic:auto-one', version: 1, label: 'Auto 20', priority: 20,
        activeFrom: null, activeUntil: null, markets: ['ES'], channels: ['storefront'], currency: 'EUR',
        effect: { type: 'percentage_off', basisPoints: 2000 } },
    ],
  });
  db.sqlite.exec(`INSERT INTO orders (id, order_number, email, customer_name, address_json,
    subtotal_cents, shipping_cents, total_cents, status, currency)
    VALUES (1, 'COMBINED-ONE', 'buyer@example.test', 'Buyer', '{}', 700, 0, 700, 'pending', 'EUR')`);
  db.sqlite.prepare(`INSERT INTO order_items (id, order_id, product_id, name_snapshot,
    unit_price_cents, base_unit_price_cents, pricing_snapshot_json, qty, current_qty)
    VALUES (1, 1, 1, 'Combined', 700, 1000, ?, 1, 1)`).run(JSON.stringify(pricing));
  return db;
}

const snapshot = (discount = 300) => JSON.stringify({
  schema: 1, policy_id: 'policy-one', version: 1, maximum_discount_basis_points: 5000,
  discount_cents: discount,
  selected_sources: [
    { source: 'promotion_code', discount_class: 'order', rule_id: 'promotion:promo-one',
      rule_version: 1, discount_cents: 100 },
    { source: 'automatic_discount', discount_class: 'product', rule_id: 'automatic:auto-one',
      rule_version: 1, discount_cents: 200 },
  ],
});

function apply(db: SqliteD1, discount = 300): void {
  db.sqlite.prepare(`INSERT INTO discount_combination_applications (id, policy_id,
    policy_version, order_id, discount_cents, snapshot_json, idempotency_key, applied_at)
    VALUES ('combo-app', 'policy-one', 1, 1, ?, ?, 'combo:order:one', ?)`)
    .run(discount, snapshot(discount), AT);
}

describe('migración 0029 de combinabilidad', () => {
  it('es expand-only, sin políticas implícitas y con FKs limpias', () => {
    const db = new SqliteD1(true, true, true, true, true, false);
    const before = db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'").length;
    db.sqlite.exec(migration29);
    expect(db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'").length).toBe(before + 4);
    expect(db.value('SELECT count(*) AS value FROM discount_combination_policies')).toBe(0);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('acepta una matriz y desglose coherentes y rechaza importe o par manipulados', () => {
    const db = base();
    expect(() => apply(db, 299)).toThrow(/discount_combination_application_conflict/);
    db.sqlite.exec("DELETE FROM discount_combination_source_pairs WHERE policy_id='policy-one'");
    expect(() => apply(db)).toThrow(/discount_combination_application_conflict/);
    db.sqlite.exec(`INSERT INTO discount_combination_source_pairs (policy_id, left_source, right_source)
      VALUES ('policy-one', 'automatic_discount', 'promotion_code')`);
    apply(db);
    expect(db.query('SELECT policy_id, policy_version, discount_cents FROM discount_combination_applications'))
      .toEqual([{ policy_id: 'policy-one', policy_version: 1, discount_cents: 300 }]);
  });

  it('reserva solo la parte del código y conserva los límites concurrentes', () => {
    const db = base();
    apply(db);
    db.sqlite.exec(`INSERT INTO promotion_code_usages (id, promotion_id, promotion_version,
      order_id, customer_key_hash, status, discount_cents, snapshot_json, idempotency_key,
      reserved_at, updated_at) VALUES ('usage-one', 'promo-one', 1, 1, '${'b'.repeat(64)}',
      'reserved', 100, '{}', 'promotion:order:combined', '${AT}', '${AT}')`);
    expect(db.query('SELECT promotion_id, discount_cents FROM promotion_code_usages'))
      .toEqual([{ promotion_id: 'promo-one', discount_cents: 100 }]);
  });
});
