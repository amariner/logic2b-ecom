import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../src/pages/api/checkout/session';
import { SqliteD1 } from './sqlite-d1';

function context(db: SqliteD1, waits: Promise<unknown>[]): never {
  return {
    request: new Request('http://localhost/api/checkout/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        lines: [{ slug: 'checkout-auto', qty: 2 }],
        customer: {
          name: 'Cliente Auto', email: 'auto@example.test', street: 'Calle Uno 1',
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

function database(): SqliteD1 {
  const db = new SqliteD1();
  db.sqlite.exec(`
    INSERT INTO products (id, slug, name, price_cents, stock, category)
    VALUES (1, 'checkout-auto', 'Checkout auto', 1000, 10, 'test');
    INSERT INTO product_variants (id, product_id, sku, title, price_cents, status, is_default, option_signature)
    VALUES (1, 1, 'CHECKOUT-AUTO', '', 1000, 'active', 1, NULL);
    INSERT INTO inventory_balances (variant_id, on_hand, reserved, version)
    VALUES (1, 10, 0, 1);
    INSERT INTO inventory_movements (
      variant_id, delta, reason, balance_after, version_after, actor_kind,
      actor_id, reference_type, reference_id, idempotency_key, correlation_id, occurred_at
    ) VALUES (1, 10, 'legacy_opening_balance', 10, 1, 'system', 'test',
      'test', '1', 'checkout:automatic:opening', 'inventory:variant:1', '2026-08-14T10:00:00.000Z');
    INSERT INTO shipping_rates (zone, label, price_cents, free_over_cents, active)
    VALUES ('peninsula', 'Estándar', 0, NULL, 1);
    INSERT INTO automatic_discounts (
      id, label, public_reason, state, version, priority, currency,
      effect_type, basis_points, markets_json, channels_json,
      minimum_subtotal_cents, created_at, updated_at
    ) VALUES ('checkout-auto-20', 'Checkout auto 20', '20 % automático', 'active', 1, 10,
      'EUR', 'percentage_off', 2000, '["ES"]', '["storefront"]', 0,
      '2026-08-14T10:00:00.000Z', '2026-08-14T10:00:00.000Z');
    INSERT INTO automatic_discount_products (discount_id, product_id) VALUES ('checkout-auto-20', 1);
  `);
  return db;
}

describe('checkout con descuento automático R4.3', () => {
  afterEach(() => vi.restoreAllMocks());

  it('revalida, aplica y congela el motivo sin input monetario del cliente', async () => {
    const db = database();
    const waits: Promise<unknown>[] = [];
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await POST(context(db, waits));
    await Promise.all(waits);
    expect(response.status).toBe(200);
    expect(db.query(`
      SELECT oi.base_unit_price_cents, oi.unit_price_cents, o.subtotal_cents
      FROM order_items oi JOIN orders o ON o.id=oi.order_id
    `)).toEqual([{ base_unit_price_cents: 1000, unit_price_cents: 800, subtotal_cents: 1600 }]);
    expect(db.query(`
      SELECT discount_id, discount_version, discount_cents,
        json_extract(snapshot_json,'$.reason') AS reason
      FROM automatic_discount_applications
    `)).toEqual([{
      discount_id: 'checkout-auto-20', discount_version: 1, discount_cents: 400,
      reason: '20 % automático',
    }]);
  });
});
