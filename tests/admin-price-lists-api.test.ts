import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '../src/pages/api/admin/price-lists/index';
import { PATCH } from '../src/pages/api/admin/price-lists/[id]';
import { SqliteD1 } from './sqlite-d1';

const capability = vi.hoisted(() => ({ routes: true, sideEffects: true }));
vi.mock('../src/composition/runtime-platform', () => ({
  runtimePlatform: { hasCapabilityFlag: (_id: string, flag: keyof typeof capability) => capability[flag] },
}));

const payload = {
  label: 'Tarifa distribuidores', state: 'active', priority: 20, currency: 'eur',
  activeFrom: null, activeUntil: null, markets: ['es'], channels: ['storefront'],
  companyKeyHashes: ['a'.repeat(64)], prices: [{ productId: 1, priceCents: 850 }],
} as const;

function context(db: SqliteD1, method: string, body?: unknown,
  options: Readonly<{ demo?: string; id?: string }> = {}): never {
  return {
    request: new Request('http://localhost/api/admin/price-lists', {
      method, headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    params: options.id === undefined ? {} : { id: options.id },
    locals: { runtime: { env: { DB: db.asD1(), DEMO_MODE: options.demo ?? 'false' } } },
  } as never;
}

describe('API admin R4.6 de listas de precios', () => {
  let db: SqliteD1;
  beforeEach(() => {
    capability.routes = true;
    capability.sideEffects = true;
    db = new SqliteD1();
    db.sqlite.exec(`INSERT INTO products (id, slug, name, price_cents, stock, category)
      VALUES (1, 'listed-api', 'Listed API', 1000, 10, 'test')`);
  });

  it('crea, lista precios/scope y audita el estado versionado', async () => {
    const created = await POST(context(db, 'POST', payload));
    expect(created.status).toBe(201);
    const id = ((await created.json()) as { price_list_id: string }).price_list_id;
    expect(await (await GET(context(db, 'GET'))).json()).toMatchObject({
      price_lists: [{ id, state: 'active', version: 1, currency: 'EUR',
        markets: ['ES'], channels: ['storefront'], companyKeyHashes: ['a'.repeat(64)],
        prices: [{ productId: 1, priceCents: 850 }] }],
    });
    expect((await PATCH(context(db, 'PATCH', { expectedVersion: 1, state: 'disabled' }, { id }))).status)
      .toBe(200);
    expect(db.query('SELECT state, version FROM price_lists')).toEqual([{ state: 'disabled', version: 2 }]);
    expect(db.query('SELECT action FROM audit_log ORDER BY occurred_at')).toEqual([
      { action: 'pricing.price_list_created' },
      { action: 'pricing.price_list_state_changed' },
    ]);
  });

  it('rechaza productos/hash ajenos, demo, capability y versión obsoleta', async () => {
    expect((await POST(context(db, 'POST', { ...payload, prices: [{ productId: 999, priceCents: 850 }] }))).status)
      .toBe(422);
    expect((await POST(context(db, 'POST', { ...payload, companyKeyHashes: ['empresa'] }))).status).toBe(400);
    expect((await POST(context(db, 'POST', payload, { demo: 'true' }))).status).toBe(403);
    const created = await POST(context(db, 'POST', payload));
    const id = ((await created.json()) as { price_list_id: string }).price_list_id;
    expect((await PATCH(context(db, 'PATCH', { expectedVersion: 99, state: 'disabled' }, { id }))).status)
      .toBe(409);
    capability.routes = false;
    expect((await GET(context(db, 'GET'))).status).toBe(403);
  });
});
