import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as LIST, POST as CREATE } from '../src/pages/api/admin/preliminary-orders/index';
import { GET as DETAIL, PATCH as TRANSITION } from '../src/pages/api/admin/preliminary-orders/[id]';
import { POST as CREATE_LINK } from '../src/pages/api/admin/preliminary-order-payment-links/index';
import { PATCH as CONFIRM_LINK } from '../src/pages/api/admin/preliminary-order-payment-links/[id]';
import { SqliteD1 } from './sqlite-d1';

const capability = vi.hoisted(() => ({ routes: true, sideEffects: true }));
vi.mock('../src/composition/runtime-platform', () => ({
  runtimePlatform: { modules: [],
    hasCapabilityFlag: (_id: string, flag: keyof typeof capability) => capability[flag],
  },
}));

function context(db: SqliteD1, path: string, method: string, body?: unknown,
  options: Readonly<{ demo?: string; id?: string }> = {}): never {
  const url = new URL(`http://localhost${path}`);
  return {
    url,
    request: new Request(url, { method, headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) }),
    params: options.id === undefined ? {} : { id: options.id },
    locals: { runtime: { env: { DB: db.asD1(), DEMO_MODE: options.demo ?? 'false' } } },
  } as never;
}

function seed(db: SqliteD1): void {
  db.sqlite.exec(`
    INSERT INTO products (id, slug, name, price_cents, stock, category, active)
    VALUES (1, 'quote-api', 'Quote API', 1200, 3, 'test', 1);
    INSERT INTO product_variants (
      id, product_id, sku, title, price_cents, status, is_default, option_signature
    ) VALUES (1, 1, 'QUOTE-API', '', 1200, 'active', 1, NULL);
    INSERT INTO inventory_balances (
      variant_id, on_hand, reserved, version, reservation_version
    ) VALUES (1, 3, 0, 1, 1);
    INSERT INTO inventory_movements (
      variant_id, delta, reason, balance_after, version_after, actor_kind,
      actor_id, reference_type, reference_id, idempotency_key, correlation_id, occurred_at
    ) VALUES (1, 3, 'legacy_opening_balance', 3, 1, 'system', 'test', 'test', '1',
      'preliminary:api:opening', 'inventory:variant:1', '2026-08-18T00:00:00.000Z');
  `);
}

const createPayload = {
  email: 'api@example.com',
  customer_name: 'Cliente API',
  address: { country: 'ES', city: 'Barcelona' },
  currency: 'EUR',
  shipping_cents: 0,
  deposit_cents: 1200,
  conversion_gate: 'deposit',
  expires_at: '2026-09-01T00:00:00.000Z',
  lines: [{ variant_id: 1, quantity: 2 }],
  idempotency_key: 'preliminary:api:create',
} as const;

describe('API admin R4.11 de presupuestos y depósitos', () => {
  let db: SqliteD1;
  beforeEach(() => {
    capability.routes = true;
    capability.sideEffects = true;
    db = new SqliteD1();
    seed(db);
  });

  it('completa presupuesto, depósito y conversión sin exponer dirección en el listado', async () => {
    const created = await CREATE(context(db, '/api/admin/preliminary-orders', 'POST', createPayload));
    expect(created.status).toBe(201);
    const id = ((await created.json()) as { preliminary_order_id: string }).preliminary_order_id;
    expect((await CREATE(context(db, '/api/admin/preliminary-orders', 'POST', createPayload))).status).toBe(200);

    const listed = (await (await LIST(context(db, '/api/admin/preliminary-orders', 'GET'))).json()) as {
      orders: Record<string, unknown>[];
    };
    expect(listed.orders).toHaveLength(1);
    expect(listed.orders[0]).not.toHaveProperty('address_json');
    expect((await DETAIL(context(db, `/api/admin/preliminary-orders/${id}`, 'GET', undefined,
      { id }))).status).toBe(200);

    expect((await TRANSITION(context(db, `/api/admin/preliminary-orders/${id}`, 'PATCH', {
      action: 'issue', expected_version: 1, idempotency_key: 'preliminary:api:issue',
      at: '2026-08-18T09:00:00.000Z',
    }, { id }))).status).toBe(200);
    expect((await TRANSITION(context(db, `/api/admin/preliminary-orders/${id}`, 'PATCH', {
      action: 'approve', expected_version: 2, idempotency_key: 'preliminary:api:approve',
      at: '2026-08-18T09:01:00.000Z',
    }, { id }))).status).toBe(200);

    const linkResponse = await CREATE_LINK(context(db,
      '/api/admin/preliminary-order-payment-links', 'POST', {
        preliminary_order_id: id, idempotency_key: 'preliminary:api:deposit-link',
        created_at: '2026-08-18T09:02:00.000Z', expires_at: '2026-08-18T10:00:00.000Z',
      }));
    expect(linkResponse.status).toBe(201);
    const linkBody = await linkResponse.json() as { payment_link: { id: string }; url: string };
    expect(linkBody.url).toMatch(/^https:\/\/payments\.example\.test\//);
    expect((await CONFIRM_LINK(context(db,
      `/api/admin/preliminary-order-payment-links/${linkBody.payment_link.id}`, 'PATCH', {
        action: 'confirm_simulated', occurred_at: '2026-08-18T09:03:00.000Z',
      }, { id: linkBody.payment_link.id }))).status).toBe(200);

    expect((await TRANSITION(context(db, `/api/admin/preliminary-orders/${id}`, 'PATCH', {
      action: 'convert', expected_version: 4, idempotency_key: 'preliminary:api:convert',
      at: '2026-08-18T09:04:00.000Z',
      reservation_expires_at: '2026-08-19T09:04:00.000Z',
    }, { id }))).status).toBe(200);
    expect(db.query('SELECT status FROM orders')).toEqual([{ status: 'pending' }]);
    expect(db.value('SELECT reserved AS value FROM inventory_balances')).toBe(2);
  });

  it('bloquea demo y capacidades y traduce validación/conflicto', async () => {
    expect((await CREATE(context(db, '/api/admin/preliminary-orders', 'POST', createPayload,
      { demo: 'true' }))).status).toBe(403);
    expect((await CREATE_LINK(context(db, '/api/admin/preliminary-order-payment-links', 'POST', {},
      { demo: 'true' }))).status).toBe(403);
    expect((await CREATE(context(db, '/api/admin/preliminary-orders', 'POST', {
      ...createPayload, lines: [],
    }))).status).toBe(400);
    capability.routes = false;
    expect((await LIST(context(db, '/api/admin/preliminary-orders', 'GET'))).status).toBe(403);
    capability.routes = true;
    capability.sideEffects = false;
    expect((await CREATE(context(db, '/api/admin/preliminary-orders', 'POST', createPayload))).status).toBe(403);
    expect((await CREATE_LINK(context(db, '/api/admin/preliminary-order-payment-links', 'POST', {}))).status).toBe(403);
  });
});
