import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '../src/pages/api/admin/automatic-discounts/index';
import { PATCH } from '../src/pages/api/admin/automatic-discounts/[id]';
import { SqliteD1 } from './sqlite-d1';

const capability = vi.hoisted(() => ({ routes: true, sideEffects: true }));
vi.mock('../src/composition/runtime-platform', () => ({
  runtimePlatform: { hasCapabilityFlag: (_id: string, flag: keyof typeof capability) => capability[flag] },
}));

const payload = {
  label: 'Campaña de verano',
  publicReason: 'Oferta automática de verano',
  state: 'active',
  priority: 20,
  currency: 'eur',
  effect: { type: 'percentage_off', basisPoints: 1500 },
  activeFrom: null,
  activeUntil: null,
  markets: ['es'],
  channels: ['storefront'],
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
    request: new Request('http://localhost/api/admin/automatic-discounts', {
      method,
      headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    params: options.id === undefined ? {} : { id: options.id },
    locals: { runtime: { env: { DB: db.asD1(), DEMO_MODE: options.demo ?? 'false' } } },
  } as never;
}

describe('API admin R4.3 de descuentos automáticos', () => {
  let db: SqliteD1;
  beforeEach(() => {
    capability.routes = true;
    capability.sideEffects = true;
    db = new SqliteD1();
    db.sqlite.exec(`
      INSERT INTO products (id, slug, name, price_cents, stock, category)
      VALUES (1, 'auto-api', 'Auto API', 1000, 10, 'test');
    `);
  });

  it('crea, lista motivo/scope y audita el estado versionado', async () => {
    const created = await POST(context(db, 'POST', payload));
    expect(created.status).toBe(201);
    const creation = await created.json() as { discount_id: string };

    const listed = await GET(context(db, 'GET'));
    expect(await listed.json()).toMatchObject({
      discounts: [{
        id: creation.discount_id,
        publicReason: 'Oferta automática de verano',
        productIds: [1],
        state: 'active',
        version: 1,
      }],
    });
    expect((await PATCH(context(db, 'PATCH', {
      expectedVersion: 1, state: 'disabled',
    }, { id: creation.discount_id }))).status).toBe(200);
    expect(db.query('SELECT state, version FROM automatic_discounts')).toEqual([
      { state: 'disabled', version: 2 },
    ]);
    expect(db.query('SELECT action FROM audit_log ORDER BY occurred_at')).toEqual([
      { action: 'pricing.automatic_discount_created' },
      { action: 'pricing.automatic_discount_state_changed' },
    ]);
  });

  it('rechaza productos ajenos, demo, capability y versión obsoleta', async () => {
    expect((await POST(context(db, 'POST', { ...payload, productIds: [999] }))).status).toBe(422);
    expect((await POST(context(db, 'POST', payload, { demo: 'true' }))).status).toBe(403);
    const created = await POST(context(db, 'POST', payload));
    const id = ((await created.json()) as { discount_id: string }).discount_id;
    expect((await PATCH(context(db, 'PATCH', { expectedVersion: 99, state: 'disabled' }, { id }))).status)
      .toBe(409);
    capability.routes = false;
    expect((await GET(context(db, 'GET'))).status).toBe(403);
  });
});
