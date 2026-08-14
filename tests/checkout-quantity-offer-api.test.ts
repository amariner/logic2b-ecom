import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../src/pages/api/checkout/session';
import { SqliteD1 } from './sqlite-d1';

function context(db: SqliteD1, waits: Promise<unknown>[]): never {
  return {
    request: new Request('http://localhost/api/checkout/session', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        lines: [{ slug: 'checkout-quantity', qty: 3 }],
        customer: { name: 'Cliente Cantidad', email: 'qty@example.test',
          street: 'Calle Uno 1', city: 'Castelló', postal_code: '12001' },
      }),
    }),
    locals: { runtime: { env: { DB: db.asD1(), DEMO_MODE: 'false' },
      ctx: { waitUntil: (promise: Promise<unknown>) => waits.push(promise) } } },
  } as never;
}

function database(): SqliteD1 {
  const db = new SqliteD1();
  db.sqlite.exec(`
    INSERT INTO products (id, slug, name, price_cents, stock, category)
    VALUES (1, 'checkout-quantity', 'Checkout cantidad', 1000, 10, 'test');
    INSERT INTO product_variants (id, product_id, sku, title, price_cents, status, is_default, option_signature)
    VALUES (1, 1, 'CHECKOUT-QTY', '', 1000, 'active', 1, NULL);
    INSERT INTO inventory_balances (variant_id, on_hand, reserved, version) VALUES (1, 10, 0, 1);
    INSERT INTO inventory_movements (
      variant_id, delta, reason, balance_after, version_after, actor_kind,
      actor_id, reference_type, reference_id, idempotency_key, correlation_id, occurred_at
    ) VALUES (1, 10, 'legacy_opening_balance', 10, 1, 'system', 'test',
      'test', '1', 'checkout:quantity:opening', 'inventory:variant:1', '2026-08-14T10:00:00.000Z');
    INSERT INTO shipping_rates (zone, label, price_cents, free_over_cents, active)
    VALUES ('peninsula', 'Estándar', 0, NULL, 1);
    INSERT INTO quantity_offers (
      id, label, public_reason, state, version, priority, currency, kind,
      buy_quantity, reward_quantity, reward_effect_type, reward_basis_points,
      markets_json, channels_json, created_at, updated_at
    ) VALUES ('checkout-3x2', 'Checkout 3x2', 'Compra 2 y consigue 1', 'active', 1, 10,
      'EUR', 'buy_x_get_y', 2, 1, 'percentage_off', 10000,
      '["ES"]', '["storefront"]', '2026-08-14T10:00:00.000Z', '2026-08-14T10:00:00.000Z');
    INSERT INTO quantity_offer_products (offer_id, role, product_id)
    VALUES ('checkout-3x2', 'buy', 1), ('checkout-3x2', 'reward', 1);
  `);
  return db;
}

describe('checkout con oferta por cantidad R4.4', () => {
  afterEach(() => vi.restoreAllMocks());

  it('revalida cantidades, prorratea y congela evidencia sin aceptar importes del cliente', async () => {
    const db = database();
    const waits: Promise<unknown>[] = [];
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await POST(context(db, waits));
    await Promise.all(waits);
    expect(response.status).toBe(200);
    expect(db.query(`SELECT oi.base_unit_price_cents, oi.unit_price_cents, oi.qty, o.subtotal_cents
      FROM order_items oi JOIN orders o ON o.id=oi.order_id`)).toEqual([
      { base_unit_price_cents: 1000, unit_price_cents: 666, qty: 3, subtotal_cents: 1998 },
    ]);
    expect(db.query(`SELECT offer_id, offer_version, discount_cents,
      json_extract(snapshot_json,'$.evidence.applications') AS applications,
      json_extract(snapshot_json,'$.refund_policy') AS refund_policy
      FROM quantity_offer_applications`)).toEqual([{
      offer_id: 'checkout-3x2', offer_version: 1, discount_cents: 1002, applications: 1,
      refund_policy: 'proportional_frozen_unit_price',
    }]);
  });
});
