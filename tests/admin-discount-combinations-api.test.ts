import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '../src/pages/api/admin/discount-combinations/index';
import { PATCH } from '../src/pages/api/admin/discount-combinations/[id]';
import { SqliteD1 } from './sqlite-d1';

const capability = vi.hoisted(() => ({ routes: true, sideEffects: true }));
vi.mock('../src/composition/runtime-platform', () => ({
  runtimePlatform: { hasCapabilityFlag: (_id: string, flag: keyof typeof capability) => capability[flag] },
}));

const payload = {
  label: 'Matriz principal', state: 'active', priority: 20, currency: 'eur',
  activeFrom: null, activeUntil: null, markets: ['es'], channels: ['storefront'],
  maximumDiscountBasisPoints: 6000,
  sourcePairs: [
    { left: 'promotion_code', right: 'automatic_discount' },
    { left: 'promotion_code', right: 'quantity_offer' },
  ],
  classPairs: [
    { left: 'order', right: 'product' },
    { left: 'product', right: 'product' },
  ],
} as const;

function context(db: SqliteD1, method: string, body?: unknown,
  options: Readonly<{ demo?: string; id?: string }> = {}): never {
  return {
    request: new Request('http://localhost/api/admin/discount-combinations', {
      method, headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    params: options.id === undefined ? {} : { id: options.id },
    locals: { runtime: { env: { DB: db.asD1(), DEMO_MODE: options.demo ?? 'false' } } },
  } as never;
}

describe('API admin R4.5 de combinabilidad', () => {
  let db: SqliteD1;
  beforeEach(() => {
    capability.routes = true;
    capability.sideEffects = true;
    db = new SqliteD1();
  });

  it('normaliza pares, lista el tope y audita el estado versionado', async () => {
    const created = await POST(context(db, 'POST', payload));
    expect(created.status).toBe(201);
    const id = ((await created.json()) as { policy_id: string }).policy_id;
    expect(await (await GET(context(db, 'GET'))).json()).toMatchObject({
      policies: [{ id, version: 1, maximumDiscountBasisPoints: 6000,
        sourcePairs: [
          { left: 'automatic_discount', right: 'promotion_code' },
          { left: 'promotion_code', right: 'quantity_offer' },
        ],
        classPairs: [{ left: 'order', right: 'product' }, { left: 'product', right: 'product' }],
      }],
    });
    expect((await PATCH(context(db, 'PATCH', {
      expectedVersion: 1, state: 'disabled',
    }, { id }))).status).toBe(200);
    expect(db.query('SELECT state, version FROM discount_combination_policies'))
      .toEqual([{ state: 'disabled', version: 2 }]);
    expect(db.query('SELECT action FROM audit_log ORDER BY occurred_at')).toEqual([
      { action: 'pricing.discount_combination_created' },
      { action: 'pricing.discount_combination_state_changed' },
    ]);
  });

  it('rechaza pares reflexivos/duplicados, demo, capability y versión obsoleta', async () => {
    expect((await POST(context(db, 'POST', {
      ...payload, sourcePairs: [{ left: 'promotion_code', right: 'promotion_code' }],
    }))).status).toBe(422);
    expect((await POST(context(db, 'POST', payload, { demo: 'true' }))).status).toBe(403);
    const created = await POST(context(db, 'POST', payload));
    const id = ((await created.json()) as { policy_id: string }).policy_id;
    expect((await PATCH(context(db, 'PATCH', {
      expectedVersion: 99, state: 'disabled',
    }, { id }))).status).toBe(409);
    capability.routes = false;
    expect((await GET(context(db, 'GET'))).status).toBe(403);
  });
});
