import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '../src/pages/api/admin/subscriptions/index';
import { POST as CREATE_PLAN } from '../src/pages/api/admin/subscriptions/plans';
import { PATCH } from '../src/pages/api/admin/subscriptions/[id]';
import { POST as PORTAL } from '../src/pages/api/admin/subscriptions/[id]/portal';
import { SqliteD1 } from './sqlite-d1';

const capability = vi.hoisted(() => ({ routes: true, sideEffects: true }));
vi.mock('../src/composition/runtime-platform', () => ({
  runtimePlatform: { hasCapabilityFlag: (_id: string, flag: keyof typeof capability) => capability[flag] },
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

describe('API admin R4.10 de suscripciones', () => {
  let db: SqliteD1;
  beforeEach(() => {
    capability.routes = true;
    capability.sideEffects = true;
    db = new SqliteD1();
    db.sqlite.exec(`
      INSERT INTO products (id, slug, name, price_cents, stock, category)
      VALUES (1, 'subscription-api', 'Subscription API', 1500, 10, 'test');
      INSERT INTO product_variants (id, product_id, sku, title, price_cents, status, is_default, option_signature)
      VALUES (1, 1, 'SUB-API', '', 1500, 'active', 1, NULL);
    `);
  });

  it('crea plan, alta, transición y portal sin persistir la URL', async () => {
    const planResponse = await CREATE_PLAN(context(db, '/api/admin/subscriptions/plans', 'POST', {
      variant_id: 1, state: 'active', label: 'Configured plan', amount_cents: 1500,
      currency: 'EUR', interval_unit: 'month', interval_count: 1,
      provider_adapter: 'simulated-subscriptions', provider_plan_reference: null,
    }));
    expect(planResponse.status).toBe(201);
    const planId = ((await planResponse.json()) as { plan_id: string }).plan_id;
    const created = await POST(context(db, '/api/admin/subscriptions', 'POST', {
      plan_id: planId, contact_email: 'api@example.test', quantity: 1,
      idempotency_key: 'subscription-api-create-01',
    }));
    expect(created.status).toBe(201);
    const subscriptionId = ((await created.json()) as { subscription_id: string }).subscription_id;
    expect((await GET(context(db, '/api/admin/subscriptions', 'GET'))).status).toBe(200);
    expect((await PATCH(context(db, `/api/admin/subscriptions/${subscriptionId}`, 'PATCH', {
      expected_version: 1, action: 'activate', idempotency_key: 'subscription-api-activate-01',
      period_starts_at: '2026-08-17T00:00:00.000Z',
      period_ends_at: '2026-09-17T00:00:00.000Z',
    }, { id: subscriptionId }))).status).toBe(200);
    const portal = await PORTAL(context(db, `/api/admin/subscriptions/${subscriptionId}/portal`, 'POST', {
      return_url: 'http://localhost/account',
    }, { id: subscriptionId }));
    expect(portal.status).toBe(200);
    expect(await portal.json()).toMatchObject({
      url: expect.stringMatching(/^https:\/\/subscriptions\.invalid/),
      expires_at: expect.any(String),
    });
    expect((await PORTAL(context(db, `/api/admin/subscriptions/${subscriptionId}/portal`, 'POST', {
      return_url: 'https://foreign.example/account',
    }, { id: subscriptionId }))).status).toBe(422);
  });

  it('mantiene demo read-only y respeta flags de capacidad', async () => {
    const payload = {
      variant_id: 1, state: 'active', label: 'Configured plan', amount_cents: 1500,
      currency: 'EUR', interval_unit: 'month', interval_count: 1,
      provider_adapter: 'simulated-subscriptions', provider_plan_reference: null,
    };
    expect((await CREATE_PLAN(context(db, '/api/admin/subscriptions/plans', 'POST', payload,
      { demo: 'true' }))).status).toBe(403);
    expect((await POST(context(db, '/api/admin/subscriptions', 'POST', {},
      { demo: 'true' }))).status).toBe(403);
    capability.routes = false;
    expect((await GET(context(db, '/api/admin/subscriptions', 'GET'))).status).toBe(403);
    capability.sideEffects = false;
    expect((await CREATE_PLAN(context(db, '/api/admin/subscriptions/plans', 'POST', payload))).status).toBe(403);
  });
});
