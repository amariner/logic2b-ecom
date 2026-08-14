import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '../src/pages/api/admin/quantity-offers/index';
import { PATCH } from '../src/pages/api/admin/quantity-offers/[id]';
import { SqliteD1 } from './sqlite-d1';

const capability = vi.hoisted(() => ({ routes: true, sideEffects: true }));
vi.mock('../src/composition/runtime-platform', () => ({
  runtimePlatform: { hasCapabilityFlag: (_id: string, flag: keyof typeof capability) => capability[flag] },
}));

const payload = {
  label: 'Escala por volumen', publicReason: 'Ahorro desde tres unidades', state: 'active',
  priority: 20, currency: 'eur', activeFrom: null, activeUntil: null,
  markets: ['ES'], channels: ['storefront'], kind: 'quantity_tier', tierBasis: 'quantity',
  tiers: [{ threshold: 3, effect: { type: 'percentage_off', basisPoints: 1000 } }],
  productIds: [1],
} as const;

function context(db: SqliteD1, method: string, body?: unknown,
  options: Readonly<{ demo?: string; id?: string }> = {}): never {
  return {
    request: new Request('http://localhost/api/admin/quantity-offers', {
      method, headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    params: options.id === undefined ? {} : { id: options.id },
    locals: { runtime: { env: { DB: db.asD1(), DEMO_MODE: options.demo ?? 'false' } } },
  } as never;
}

describe('API admin R4.4 de cantidad y X/Y', () => {
  let db: SqliteD1;
  beforeEach(() => {
    capability.routes = true;
    capability.sideEffects = true;
    db = new SqliteD1();
    db.sqlite.exec(`INSERT INTO products (id, slug, name, price_cents, stock, category)
      VALUES (1, 'qty-api', 'Qty API', 1000, 10, 'test')`);
  });

  it('crea, lista tramos y audita el estado versionado', async () => {
    const created = await POST(context(db, 'POST', payload));
    expect(created.status).toBe(201);
    const id = ((await created.json()) as { offer_id: string }).offer_id;
    expect(await (await GET(context(db, 'GET'))).json()).toMatchObject({
      offers: [{ id, kind: 'quantity_tier', tierBasis: 'quantity', productIds: [1],
        tiers: [{ threshold: 3, effect: { basisPoints: 1000 } }], version: 1 }],
    });
    expect((await PATCH(context(db, 'PATCH', { expectedVersion: 1, state: 'disabled' }, { id }))).status)
      .toBe(200);
    expect(db.query('SELECT state, version FROM quantity_offers')).toEqual([{ state: 'disabled', version: 2 }]);
    expect(db.query('SELECT action FROM audit_log ORDER BY occurred_at')).toEqual([
      { action: 'pricing.quantity_offer_created' },
      { action: 'pricing.quantity_offer_state_changed' },
    ]);
  });

  it('crea X/Y y rechaza scopes ambiguos, productos ajenos, demo y capability', async () => {
    const xy = {
      ...payload, kind: 'buy_x_get_y', buyQuantity: 2, rewardQuantity: 1,
      rewardEffect: { type: 'percentage_off', basisPoints: 10000 }, maxApplications: 2,
      buyProductIds: [1], rewardProductIds: [1],
    };
    const { tierBasis: _basis, tiers: _tiers, productIds: _products, ...xyPayload } = xy;
    expect((await POST(context(db, 'POST', xyPayload))).status).toBe(201);
    expect((await POST(context(db, 'POST', { ...xyPayload, rewardProductIds: [999] }))).status).toBe(422);
    expect((await POST(context(db, 'POST', payload, { demo: 'true' }))).status).toBe(403);
    capability.routes = false;
    expect((await GET(context(db, 'GET'))).status).toBe(403);
  });
});
