import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '../src/pages/api/admin/preorders/index';
import { PATCH } from '../src/pages/api/admin/preorders/[id]';
import { POST as ALLOCATE } from '../src/pages/api/admin/preorders/allocate';
import { SqliteD1 } from './sqlite-d1';

const capability = vi.hoisted(() => ({ routes: true, sideEffects: true }));
vi.mock('../src/composition/runtime-platform', () => ({
  runtimePlatform: { hasCapabilityFlag: (_id: string, flag: keyof typeof capability) => capability[flag] },
}));

const payload = {
  variant_id: 1,
  kind: 'backorder',
  state: 'active',
  label: 'Disponible bajo pedido',
  public_message: 'Ventana de disponibilidad configurada por la tienda',
  sale_starts_at: '2026-08-01T00:00:00.000Z',
  sale_ends_at: '2026-08-31T23:59:59.000Z',
  availability_starts_at: '2026-09-01T00:00:00.000Z',
  availability_ends_at: '2026-09-15T23:59:59.000Z',
  max_deferred_quantity: 20,
  payment_policy: 'charge_now',
} as const;

function context(db: SqliteD1, method: string, body?: unknown,
  options: Readonly<{ demo?: string; id?: string; query?: string }> = {}): never {
  const url = new URL(`http://localhost/api/admin/preorders${options.query ?? ''}`);
  return {
    url,
    request: new Request(url, {
      method, headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    params: options.id === undefined ? {} : { id: options.id },
    locals: { runtime: { env: { DB: db.asD1(), DEMO_MODE: options.demo ?? 'false' } } },
  } as never;
}

describe('API admin R4.9 de preventa/backorder', () => {
  let db: SqliteD1;
  beforeEach(() => {
    capability.routes = true;
    capability.sideEffects = true;
    db = new SqliteD1();
    db.sqlite.exec(`INSERT INTO products (id, slug, name, price_cents, stock, category)
      VALUES (1, 'preorder-api', 'Preorder API', 1000, 0, 'test');
      INSERT INTO product_variants (
        id, product_id, sku, title, price_cents, status, is_default, option_signature
      ) VALUES (1, 1, 'PREORDER-API', '', 1000, 'active', 1, NULL);`);
  });

  it('crea, lista y pausa una política con versión y auditoría', async () => {
    const created = await POST(context(db, 'POST', payload));
    expect(created.status).toBe(201);
    const id = ((await created.json()) as { policy_id: string }).policy_id;
    expect(await (await GET(context(db, 'GET'))).json()).toMatchObject({
      policies: [{ id, variantId: 1, kind: 'backorder', state: 'active', version: 1 }],
      commitments: [],
    });
    expect((await PATCH(context(db, 'PATCH', {
      expected_version: 1, state: 'paused',
    }, { id }))).status).toBe(200);
    expect(db.query('SELECT state, version FROM preorder_policies'))
      .toEqual([{ state: 'paused', version: 2 }]);
    expect(db.query('SELECT action FROM audit_log ORDER BY occurred_at')).toEqual([
      { action: 'pricing.preorder_policy_created' },
      { action: 'pricing.preorder_policy_state_changed' },
    ]);
  });

  it('rechaza cobro posterior activo, duplicado, demo, filtros y capability', async () => {
    expect((await POST(context(db, 'POST', {
      ...payload, payment_policy: 'charge_on_allocation',
    }))).status).toBe(422);
    expect((await POST(context(db, 'POST', payload))).status).toBe(201);
    expect((await POST(context(db, 'POST', { ...payload, state: 'paused' }))).status).toBe(409);
    expect((await POST(context(db, 'POST', payload, { demo: 'true' }))).status).toBe(403);
    expect((await GET(context(db, 'GET', undefined, { query: '?order_id=no' }))).status).toBe(400);
    expect((await ALLOCATE(context(db, 'POST', {
      variant_id: 1, quantity: 1, idempotency_key: 'allocation-api-01',
    }, { demo: 'true' }))).status).toBe(403);
    capability.routes = false;
    expect((await GET(context(db, 'GET'))).status).toBe(403);
  });
});
