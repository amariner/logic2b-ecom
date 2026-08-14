import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../src/pages/api/checkout/session';
import { SqliteD1 } from './sqlite-d1';

function database(): SqliteD1 {
  const db = new SqliteD1();
  db.sqlite.exec(`
    INSERT INTO products (id, slug, name, price_cents, stock, category) VALUES
      (1, 'bundle-component-a', 'Componente A', 300, 8, 'test'),
      (2, 'bundle-component-b', 'Componente B', 400, 5, 'test'),
      (10, 'checkout-bundle', 'Bundle checkout', 1200, 0, 'test'),
      (11, 'checkout-config-bundle', 'Bundle configurable', 1300, 0, 'test');
    INSERT INTO product_variants (id, product_id, sku, title, price_cents, status, is_default, option_signature)
    VALUES (1, 1, 'BUNDLE-A', '', 300, 'active', 1, NULL),
      (2, 2, 'BUNDLE-B', '', 400, 'active', 1, NULL),
      (10, 10, 'BUNDLE-CHECKOUT', '', 1200, 'active', 1, NULL),
      (11, 11, 'BUNDLE-CONFIG', '', 1300, 'active', 1, NULL);
    INSERT INTO inventory_balances (variant_id, on_hand, reserved, version)
    VALUES (1, 8, 0, 1), (2, 5, 0, 1), (10, 0, 0, 1), (11, 0, 0, 1);
    INSERT INTO inventory_movements (variant_id, delta, reason, balance_after, version_after,
      actor_kind, actor_id, reference_type, reference_id, idempotency_key, correlation_id, occurred_at)
    VALUES (1, 8, 'legacy_opening_balance', 8, 1, 'system', 'test', 'test', '1',
      'checkout:bundle:a', 'inventory:variant:1', '2026-08-14T10:00:00.000Z'),
      (2, 5, 'legacy_opening_balance', 5, 1, 'system', 'test', 'test', '2',
      'checkout:bundle:b', 'inventory:variant:2', '2026-08-14T10:00:00.000Z');
    INSERT INTO shipping_rates (zone, label, price_cents, free_over_cents, active)
    VALUES ('peninsula', 'Estándar', 0, NULL, 1);
    INSERT INTO bundles (id, product_id, label, kind, state, version, created_at, updated_at)
    VALUES ('checkout-bundle-fixed', 10, 'Bundle checkout', 'fixed', 'disabled', 1,
      '2026-08-14T10:00:00.000Z', '2026-08-14T10:00:00.000Z'),
      ('checkout-bundle-config', 11, 'Bundle configurable', 'configurable', 'disabled', 1,
      '2026-08-14T10:00:00.000Z', '2026-08-14T10:00:00.000Z');
    INSERT INTO bundle_components (bundle_id, group_id, product_id, quantity, is_default, sort_order)
    VALUES ('checkout-bundle-fixed', NULL, 1, 2, 1, 0),
      ('checkout-bundle-fixed', NULL, 2, 1, 1, 1);
    INSERT INTO bundle_groups (bundle_id, id, label, minimum_selections, maximum_selections)
    VALUES ('checkout-bundle-config', 'main', 'Componente principal', 1, 1);
    INSERT INTO bundle_components (bundle_id, group_id, product_id, quantity, is_default, sort_order)
    VALUES ('checkout-bundle-config', 'main', 1, 1, 1, 0),
      ('checkout-bundle-config', 'main', 2, 2, 0, 1);
    UPDATE bundles SET state='active';
  `);
  return db;
}

function context(db: SqliteD1, waits: Promise<unknown>[], lines: unknown[] = [
  { slug: 'checkout-bundle', qty: 2, unit_price_cents: 1 },
]): never {
  return {
    request: new Request('http://localhost/api/checkout/session', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        lines,
        customer: { name: 'Cliente Bundle', email: 'bundle@example.test', street: 'Calle Uno 1',
          city: 'Castelló', postal_code: '12001' },
      }),
    }),
    locals: { runtime: { env: { DB: db.asD1(), DEMO_MODE: 'false' },
      ctx: { waitUntil: (promise: Promise<unknown>) => waits.push(promise) } } },
  } as never;
}

describe('checkout R4.7 de bundles', () => {
  afterEach(() => vi.restoreAllMocks());

  it('ignora precios cliente, congela componentes y reserva su inventario', async () => {
    const db = database(); const waits: Promise<unknown>[] = [];
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await POST(context(db, waits));
    await Promise.all(waits);
    expect(response.status).toBe(200);
    expect(db.query(`SELECT oi.product_id, oi.unit_price_cents, oi.qty, o.subtotal_cents,
      json_extract(oi.pricing_snapshot_json,'$.bundle.bundle_id') AS bundle_id
      FROM order_items oi JOIN orders o ON o.id=oi.order_id`)).toEqual([{
      product_id: 10, unit_price_cents: 1200, qty: 2, subtotal_cents: 2400,
      bundle_id: 'checkout-bundle-fixed',
    }]);
    expect(db.query(`SELECT product_id, quantity_per_bundle, name_snapshot, sku_snapshot
      FROM order_bundle_components ORDER BY product_id`)).toEqual([
      { product_id: 1, quantity_per_bundle: 2, name_snapshot: 'Componente A', sku_snapshot: 'BUNDLE-A' },
      { product_id: 2, quantity_per_bundle: 1, name_snapshot: 'Componente B', sku_snapshot: 'BUNDLE-B' },
    ]);
    expect(db.query('SELECT variant_id, on_hand, reserved FROM inventory_balances ORDER BY variant_id'))
      .toEqual([{ variant_id: 1, on_hand: 4, reserved: 0 },
        { variant_id: 2, on_hand: 3, reserved: 0 }, { variant_id: 10, on_hand: 0, reserved: 0 },
        { variant_id: 11, on_hand: 0, reserved: 0 }]);
    expect(db.value('SELECT count(*) AS value FROM bundle_applications')).toBe(1);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('resuelve una opción configurable por slug servidor y persiste solo la elegida', async () => {
    const db = database(); const waits: Promise<unknown>[] = [];
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await POST(context(db, waits, [{ slug: 'checkout-config-bundle', qty: 1,
      bundle_selections: [{ group_id: 'main', product_slug: 'bundle-component-b' }] }]));
    await Promise.all(waits);
    expect(response.status).toBe(200);
    expect(db.query(`SELECT component.product_id, component.quantity_per_bundle,
      json_extract(application.snapshot_json,'$.selections[0].group_id') AS group_id
      FROM order_bundle_components component
      JOIN bundle_applications application ON application.order_item_id=component.order_item_id`))
      .toEqual([{ product_id: 2, quantity_per_bundle: 2, group_id: 'main' }]);
    expect(db.query('SELECT variant_id, on_hand FROM inventory_balances WHERE variant_id IN (1,2) ORDER BY variant_id'))
      .toEqual([{ variant_id: 1, on_hand: 8 }, { variant_id: 2, on_hand: 3 }]);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });
});
