import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../src/pages/api/checkout/session';
import { promotionCodeHash } from '../src/modules/pricing';
import { SqliteD1 } from './sqlite-d1';

function context(db: SqliteD1, promotionCode: string, waits: Promise<unknown>[]): never {
  return {
    request: new Request('http://localhost/api/checkout/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        lines: [{ slug: 'checkout-promo', qty: 1 }],
        promotion_code: promotionCode,
        customer: {
          name: 'Cliente Promo', email: 'promo@example.test', street: 'Calle Uno 1',
          city: 'Castelló', postal_code: '12001',
        },
      }),
    }),
    locals: {
      runtime: {
        env: { DB: db.asD1(), DEMO_MODE: 'false' },
        ctx: { waitUntil: (promise: Promise<unknown>) => waits.push(promise) },
      },
    },
  } as never;
}

async function database(): Promise<SqliteD1> {
  const db = new SqliteD1();
  db.sqlite.exec(`
    INSERT INTO products (id, slug, name, price_cents, stock, category)
    VALUES (1, 'checkout-promo', 'Checkout promo', 1000, 10, 'test');
    INSERT INTO product_variants (id, product_id, sku, title, price_cents, status, is_default, option_signature)
    VALUES (1, 1, 'CHECKOUT-PROMO', '', 1000, 'active', 1, NULL);
    INSERT INTO inventory_balances (variant_id, on_hand, reserved, version)
    VALUES (1, 10, 0, 1);
    INSERT INTO inventory_movements (
      variant_id, delta, reason, balance_after, version_after, actor_kind,
      actor_id, reference_type, reference_id, idempotency_key, correlation_id, occurred_at
    ) VALUES (1, 10, 'legacy_opening_balance', 10, 1, 'system', 'test',
      'test', '1', 'checkout:promotion:opening', 'inventory:variant:1', '2026-08-14T10:00:00.000Z');
    INSERT INTO shipping_rates (zone, label, price_cents, free_over_cents, active)
    VALUES ('peninsula', 'Estándar', 0, NULL, 1);
  `);
  db.sqlite.prepare(`
    INSERT INTO promotion_codes (
      id, code_hash, code_hint, label, state, version, priority, currency,
      effect_type, basis_points, markets_json, channels_json, global_usage_limit,
      per_customer_usage_limit, minimum_subtotal_cents, created_at, updated_at
    ) VALUES ('checkout-10', ?, '••••T-10', 'Checkout 10', 'active', 1, 10,
      'EUR', 'percentage_off', 1000, '["ES"]', '["storefront"]', 10, 1, 0,
      '2026-08-14T10:00:00.000Z', '2026-08-14T10:00:00.000Z')
  `).run(await promotionCodeHash('CHECKOUT-10'));
  db.sqlite.exec("INSERT INTO promotion_code_products (promotion_id, product_id) VALUES ('checkout-10', 1)");
  return db;
}

describe('checkout con código promocional R4.2', () => {
  afterEach(() => vi.restoreAllMocks());
  it('revalida, reserva y consume sin exponer el código', async () => {
    const db = await database();
    const waits: Promise<unknown>[] = [];
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await POST(context(db, ' checkout-10 ', waits));
    await Promise.all(waits);
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain('CHECKOUT-10');
    expect(db.query(`
      SELECT oi.base_unit_price_cents, oi.unit_price_cents, o.subtotal_cents
      FROM order_items oi JOIN orders o ON o.id=oi.order_id
    `)).toEqual([{ base_unit_price_cents: 1000, unit_price_cents: 900, subtotal_cents: 900 }]);
    expect(db.query('SELECT status, discount_cents, length(customer_key_hash) AS hash_length FROM promotion_code_usages'))
      .toEqual([{ status: 'consumed', discount_cents: 100, hash_length: 64 }]);
  });

  it('rechaza con respuesta genérica y sin crear pedido', async () => {
    const db = await database();
    const response = await POST(context(db, 'NO-EXISTE', []));
    expect(response.status).toBe(422);
    expect(await response.text()).toBe('{"error":"El código promocional no está disponible para este pedido."}');
    expect(db.value('SELECT count(*) AS value FROM orders')).toBe(0);
  });
});
