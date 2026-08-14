import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../src/pages/api/checkout/session';
import { SqliteD1 } from './sqlite-d1';

function context(db: SqliteD1, waits: Promise<unknown>[]): never {
  return {
    request: new Request('http://localhost/api/checkout/session', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        lines: [{ slug: 'checkout-list', qty: 2 }],
        customer: { name: 'Cliente Lista', email: 'list@example.test', company: 'Empresa concertada',
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
    VALUES (1, 'checkout-list', 'Checkout lista', 1000, 10, 'test');
    INSERT INTO product_variants (id, product_id, sku, title, price_cents, status, is_default, option_signature)
    VALUES (1, 1, 'CHECKOUT-LIST', '', 1000, 'active', 1, NULL);
    INSERT INTO inventory_balances (variant_id, on_hand, reserved, version) VALUES (1, 10, 0, 1);
    INSERT INTO inventory_movements (variant_id, delta, reason, balance_after, version_after,
      actor_kind, actor_id, reference_type, reference_id, idempotency_key, correlation_id, occurred_at)
    VALUES (1, 10, 'legacy_opening_balance', 10, 1, 'system', 'test', 'test', '1',
      'checkout:list:opening', 'inventory:variant:1', '2026-08-14T10:00:00.000Z');
    INSERT INTO shipping_rates (zone, label, price_cents, free_over_cents, active)
    VALUES ('peninsula', 'Estándar', 0, NULL, 1);
    INSERT INTO price_lists (id, label, state, version, priority, currency,
      markets_json, channels_json, created_at, updated_at)
    VALUES ('checkout-general', 'Lista general', 'active', 1, 10, 'EUR', '["ES"]',
      '["storefront"]', '2026-08-14T10:00:00.000Z', '2026-08-14T10:00:00.000Z'),
      ('checkout-enterprise', 'Lista empresa', 'active', 1, 1, 'EUR', '["ES"]',
      '["storefront"]', '2026-08-14T10:00:00.000Z', '2026-08-14T10:00:00.000Z');
    INSERT INTO price_list_products (price_list_id, product_id, price_cents)
    VALUES ('checkout-general', 1, 800), ('checkout-enterprise', 1, 500);
    INSERT INTO price_list_companies (price_list_id, company_key_hash)
    VALUES ('checkout-enterprise', '${'e'.repeat(64)}');
  `);
  return db;
}

describe('checkout con lista de precios R4.6', () => {
  afterEach(() => vi.restoreAllMocks());

  it('cobra y persiste la lista general sin confiar en la razón social libre', async () => {
    const db = database();
    const waits: Promise<unknown>[] = [];
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await POST(context(db, waits));
    await Promise.all(waits);
    expect(response.status).toBe(200);
    expect(db.query(`SELECT oi.base_unit_price_cents, oi.unit_price_cents, o.subtotal_cents,
      json_extract(oi.pricing_snapshot_json,'$.price_origin.price_list_id') AS price_list_id
      FROM order_items oi JOIN orders o ON o.id=oi.order_id`)).toEqual([{
      base_unit_price_cents: 800, unit_price_cents: 800, subtotal_cents: 1600,
      price_list_id: 'checkout-general',
    }]);
    expect(db.query(`SELECT price_list_id, catalog_subtotal_cents, effective_subtotal_cents,
      json_extract(snapshot_json,'$.fallback_policy') AS fallback_policy FROM price_list_applications`))
      .toEqual([{ price_list_id: 'checkout-general', catalog_subtotal_cents: 2000,
        effective_subtotal_cents: 1600,
        fallback_policy: 'company_then_general_then_catalog_per_product' }]);
  });
});
