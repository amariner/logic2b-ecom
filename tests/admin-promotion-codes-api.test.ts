import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '../src/pages/api/admin/promotion-codes/index';
import { PATCH } from '../src/pages/api/admin/promotion-codes/[id]';
import { SqliteD1 } from './sqlite-d1';

const capability = vi.hoisted(() => ({ routes: true, sideEffects: true }));
vi.mock('../src/composition/runtime-platform', () => ({
  runtimePlatform: { hasCapabilityFlag: (_id: string, flag: keyof typeof capability) => capability[flag] },
}));

const payload = {
  code: ' verano-10 ',
  label: 'Verano 10',
  state: 'active',
  priority: 20,
  currency: 'eur',
  effect: { type: 'percentage_off', basisPoints: 1000 },
  activeFrom: null,
  activeUntil: null,
  markets: ['es'],
  channels: ['storefront'],
  globalUsageLimit: 100,
  perCustomerUsageLimit: 1,
  minimumSubtotalCents: 2000,
  productIds: [1],
} as const;

function context(
  db: SqliteD1,
  method: string,
  body?: unknown,
  options: Readonly<{ demo?: string; id?: string }> = {},
): never {
  return {
    request: new Request('http://localhost/api/admin/promotion-codes', {
      method,
      headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    params: options.id === undefined ? {} : { id: options.id },
    locals: { runtime: { env: { DB: db.asD1(), DEMO_MODE: options.demo ?? 'false' } } },
  } as never;
}

describe('API admin R4.2 de códigos promocionales', () => {
  let db: SqliteD1;
  beforeEach(() => {
    capability.routes = true;
    capability.sideEffects = true;
    db = new SqliteD1();
    db.sqlite.exec(`
      INSERT INTO products (id, slug, name, price_cents, stock, category)
      VALUES (1, 'promo-api', 'Promo API', 1000, 10, 'test');
    `);
  });

  it('crea una vez, lista sin código/hash y audita cambios de estado', async () => {
    const created = await POST(context(db, 'POST', payload));
    expect(created.status).toBe(201);
    const creation = await created.json() as { promotion_id: string; code: string };
    expect(creation.code).toBe('VERANO-10');
    expect(db.value('SELECT length(code_hash) AS value FROM promotion_codes')).toBe(64);

    const listed = await GET(context(db, 'GET'));
    const text = await listed.text();
    expect(text).toContain('••••O-10');
    expect(text).not.toContain('VERANO-10');
    expect(text).not.toMatch(/[a-f0-9]{64}/);

    expect((await PATCH(context(db, 'PATCH', {
      expectedVersion: 1, state: 'disabled',
    }, { id: creation.promotion_id }))).status).toBe(200);
    expect(db.query('SELECT state, version FROM promotion_codes')).toEqual([
      { state: 'disabled', version: 2 },
    ]);
    expect(db.query('SELECT action FROM audit_log ORDER BY occurred_at')).toEqual([
      { action: 'pricing.promotion_created' },
      { action: 'pricing.promotion_state_changed' },
    ]);
    expect((await PATCH(context(db, 'PATCH', {
      expectedVersion: 1, state: 'active',
    }, { id: creation.promotion_id }))).status).toBe(409);
  });

  it('rechaza duplicados, productos ajenos, demo y capability apagada', async () => {
    expect((await POST(context(db, 'POST', payload))).status).toBe(201);
    expect((await POST(context(db, 'POST', payload))).status).toBe(409);
    expect((await POST(context(db, 'POST', { ...payload, code: 'OTRO-10', productIds: [999] }))).status)
      .toBe(422);
    expect((await POST(context(db, 'POST', payload, { demo: 'true' }))).status).toBe(403);
    capability.routes = false;
    expect((await GET(context(db, 'GET'))).status).toBe(403);
  });
});
