import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../src/pages/api/checkout/session';
import { promotionCodeHash } from '../src/modules/pricing';
import { SqliteD1 } from './sqlite-d1';

function context(db: SqliteD1, waits: Promise<unknown>[]): never {
  return {
    request: new Request('http://localhost/api/checkout/session', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        lines: [{ slug: 'checkout-combined', qty: 2 }], promotion_code: 'STACK-10',
        customer: { name: 'Cliente Combinado', email: 'stack@example.test',
          street: 'Calle Uno 1', city: 'Castelló', postal_code: '12001' },
      }),
    }),
    locals: { runtime: { env: { DB: db.asD1(), DEMO_MODE: 'false' },
      ctx: { waitUntil: (promise: Promise<unknown>) => waits.push(promise) } } },
  } as never;
}

async function database(): Promise<SqliteD1> {
  const db = new SqliteD1();
  db.sqlite.exec(`
    INSERT INTO products (id, slug, name, price_cents, stock, category)
    VALUES (1, 'checkout-combined', 'Checkout combinado', 1000, 10, 'test');
    INSERT INTO product_variants (id, product_id, sku, title, price_cents, status, is_default, option_signature)
    VALUES (1, 1, 'CHECKOUT-COMBO', '', 1000, 'active', 1, NULL);
    INSERT INTO inventory_balances (variant_id, on_hand, reserved, version) VALUES (1, 10, 0, 1);
    INSERT INTO inventory_movements (variant_id, delta, reason, balance_after, version_after,
      actor_kind, actor_id, reference_type, reference_id, idempotency_key, correlation_id, occurred_at)
    VALUES (1, 10, 'legacy_opening_balance', 10, 1, 'system', 'test', 'test', '1',
      'checkout:combination:opening', 'inventory:variant:1', '2026-08-14T10:00:00.000Z');
    INSERT INTO shipping_rates (zone, label, price_cents, free_over_cents, active)
    VALUES ('peninsula', 'Estándar', 0, NULL, 1);
    INSERT INTO automatic_discounts (id, label, public_reason, state, version, priority,
      currency, effect_type, basis_points, markets_json, channels_json,
      minimum_subtotal_cents, created_at, updated_at)
    VALUES ('checkout-auto-20', 'Auto 20', '20 % automático', 'active', 1, 20, 'EUR',
      'percentage_off', 2000, '["ES"]', '["storefront"]', 0,
      '2026-08-14T10:00:00.000Z', '2026-08-14T10:00:00.000Z');
    INSERT INTO automatic_discount_products (discount_id, product_id) VALUES ('checkout-auto-20', 1);
    INSERT INTO discount_combination_policies (id, label, state, version, priority,
      currency, markets_json, channels_json, maximum_discount_basis_points, created_at, updated_at)
    VALUES ('checkout-stack', 'Checkout stack', 'active', 1, 10, 'EUR', '["ES"]',
      '["storefront"]', 5000, '2026-08-14T10:00:00.000Z', '2026-08-14T10:00:00.000Z');
    INSERT INTO discount_combination_source_pairs (policy_id, left_source, right_source)
    VALUES ('checkout-stack', 'automatic_discount', 'promotion_code');
    INSERT INTO discount_combination_class_pairs (policy_id, left_class, right_class)
    VALUES ('checkout-stack', 'order', 'product');
  `);
  db.sqlite.prepare(`INSERT INTO promotion_codes (id, code_hash, code_hint, label, state,
    version, priority, currency, effect_type, basis_points, markets_json, channels_json,
    minimum_subtotal_cents, created_at, updated_at)
    VALUES ('checkout-promo-10', ?, '••••K-10', 'Código 10', 'active', 1, 10, 'EUR',
      'percentage_off', 1000, '["ES"]', '["storefront"]', 0,
      '2026-08-14T10:00:00.000Z', '2026-08-14T10:00:00.000Z')`)
    .run(await promotionCodeHash('STACK-10'));
  db.sqlite.exec("INSERT INTO promotion_code_products (promotion_id, product_id) VALUES ('checkout-promo-10', 1)");
  return db;
}

describe('checkout con combinabilidad R4.5', () => {
  afterEach(() => vi.restoreAllMocks());

  it('revalida y persiste la misma matriz y desglose que cobra', async () => {
    const db = await database();
    const waits: Promise<unknown>[] = [];
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await POST(context(db, waits));
    await Promise.all(waits);
    expect(response.status).toBe(200);
    expect(db.query(`SELECT oi.base_unit_price_cents, oi.unit_price_cents, oi.qty,
      json_extract(oi.pricing_snapshot_json,'$.schema') AS pricing_schema, o.subtotal_cents
      FROM order_items oi JOIN orders o ON o.id=oi.order_id`)).toEqual([{
      base_unit_price_cents: 1000, unit_price_cents: 700, qty: 2,
      pricing_schema: 2, subtotal_cents: 1400,
    }]);
    expect(db.query(`SELECT policy_id, policy_version, discount_cents,
      json_extract(snapshot_json,'$.evaluation_policy') AS evaluation_policy
      FROM discount_combination_applications`)).toEqual([{
      policy_id: 'checkout-stack', policy_version: 1, discount_cents: 600,
      evaluation_policy: 'additive_on_base_priority_cap',
    }]);
    expect(db.query('SELECT promotion_id, discount_cents, status FROM promotion_code_usages'))
      .toEqual([{ promotion_id: 'checkout-promo-10', discount_cents: 200, status: 'consumed' }]);
    expect(db.value('SELECT count(*) AS value FROM automatic_discount_applications')).toBe(0);
  });
});
