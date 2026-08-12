import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as CREATE } from '../src/pages/api/admin/order-amendments/index';
import { POST as PREVIEW } from '../src/pages/api/admin/order-amendments/preview';
import { SqliteD1 } from './sqlite-d1';

const capability = vi.hoisted(() => ({ enabled: true }));

vi.mock('../src/composition/runtime-platform', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/composition/runtime-platform')>();
  return {
    runtimePlatform: {
      ...actual.runtimePlatform,
      hasCapabilityFlag: () => capability.enabled,
    },
  };
});

function seed(db: SqliteD1): void {
  db.sqlite.exec(`
    INSERT INTO shipping_rates (zone, label, price_cents, free_over_cents, active)
    VALUES ('peninsula', 'Península', 500, NULL, 1);
    INSERT INTO products (id, slug, name, price_cents, stock, category, active)
    VALUES (1, 'base', 'Base', 1000, 10, 'test', 1), (2, 'extra', 'Extra', 500, 5, 'test', 1);
    INSERT INTO product_variants (
      id, product_id, sku, title, price_cents, status, is_default, option_signature
    ) VALUES
      (11, 1, 'BASE-1', '', 1000, 'active', 1, NULL),
      (22, 2, 'EXTRA-1', '', 500, 'active', 1, NULL);
    INSERT INTO inventory_balances (variant_id, on_hand, reserved, version)
    VALUES (11, 8, 0, 2), (22, 5, 0, 1);
    INSERT INTO orders (
      id, order_number, email, customer_name, address_json, subtotal_cents,
      shipping_cents, total_cents, status, stripe_session_id, currency
    ) VALUES (7, 'R33-API', 'private@example.test', 'Persona',
      '{"name":"Persona","phone":null,"street":"Calle Uno 1","city":"Madrid","postal_code":"28001","zone":"peninsula","nif":null,"company":null}',
      2000, 500, 2500, 'paid', 'sim_r33_api', 'EUR');
    INSERT INTO order_items (
      id, order_id, product_id, variant_id, name_snapshot, sku_snapshot,
      unit_price_cents, qty, current_qty
    ) VALUES (71, 7, 1, 11, 'Base', 'BASE-1', 1000, 2, 2);
    INSERT INTO payments (
      id, order_id, provider, provider_reference, currency, expected_amount_cents,
      status, idempotency_key, created_at, updated_at
    ) VALUES (1, 7, 'simulated', 'sim_pi_r33_api', 'EUR', 2500, 'captured',
      'r2:payment:order:7:primary', '2026-08-12T09:00:00.000Z', '2026-08-12T09:00:00.000Z');
    INSERT INTO payment_transactions (
      payment_id, type, amount_cents, currency, status, provider_reference,
      idempotency_key, occurred_at, created_at
    ) VALUES (1, 'capture', 2500, 'EUR', 'succeeded', 'sim_pi_r33_api',
      'r2:payment:order:7:capture', '2026-08-12T09:00:00.000Z', '2026-08-12T09:00:00.000Z');
  `);
}

function context(route: 'preview' | 'create', db: SqliteD1, body: unknown, demoMode = 'false') {
  return {
    request: new Request(`http://localhost/api/admin/order-amendments${route === 'preview' ? '/preview' : ''}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    locals: { runtime: { env: { DB: db.asD1(), DEMO_MODE: demoMode }, ctx: { waitUntil() {} } } },
  } as unknown as Parameters<typeof CREATE>[0];
}

const body = {
  order_id: 7,
  expected_version: 1,
  lines: [{ variant_id: 22, quantity: 1 }],
} as const;

describe('API admin de edición segura R3.3', () => {
  beforeEach(() => { capability.enabled = true; });

  it('previsualiza y aplica en modo simulado sin aceptar importes del cliente', async () => {
    const db = new SqliteD1();
    seed(db);
    const preview = await PREVIEW(context('preview', db, body) as Parameters<typeof PREVIEW>[0]);
    expect(preview.status).toBe(200);
    expect(await preview.json()).toMatchObject({
      ok: true,
      preview: { delta_cents: 500, total_after_cents: 3000, status: 'pending_payment' },
    });
    const created = await CREATE(context('create', db, {
      ...body,
      reason: 'Añadir complemento',
      idempotency_key: '11111111-1111-4111-8111-111111111111',
      total_after_cents: 1,
    }));
    expect(created.status).toBe(400);
    const applied = await CREATE(context('create', db, {
      ...body,
      reason: 'Añadir complemento',
      idempotency_key: '11111111-1111-4111-8111-111111111111',
    }));
    expect(applied.status).toBe(200);
    expect(await applied.json()).toMatchObject({ ok: true, status: 'applied' });
    expect(db.query('SELECT edit_version, total_cents FROM orders')).toEqual([
      { edit_version: 2, total_cents: 3000 },
    ]);
    expect(db.value("SELECT on_hand AS value FROM inventory_balances WHERE variant_id=22")).toBe(4);
  });

  it('corta demo y capability antes de escribir', async () => {
    const demo = new SqliteD1();
    seed(demo);
    expect((await CREATE(context('create', demo, {}, 'true'))).status).toBe(403);
    capability.enabled = false;
    expect((await PREVIEW(context('preview', demo, {}) as Parameters<typeof PREVIEW>[0])).status).toBe(403);
    expect(demo.value('SELECT count(*) AS value FROM order_amendments')).toBe(0);
  });
});
