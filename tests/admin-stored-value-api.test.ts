import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '../src/pages/api/admin/stored-value/index';
import { PATCH } from '../src/pages/api/admin/stored-value/[id]';
import { SqliteD1 } from './sqlite-d1';

const capability = vi.hoisted(() => ({ routes: true, sideEffects: true }));
vi.mock('../src/composition/runtime-platform', () => ({
  runtimePlatform: { hasCapabilityFlag: (_id: string, flag: keyof typeof capability) => capability[flag] },
}));

const payload = {
  kind: 'gift_card', label: 'Regalo API', currency: 'EUR', amountCents: 5000,
  expiresAt: null,
  policy: { legalReviewReference: 'legal-review-test', funding: 'purchased', expiry: 'none',
    transferability: 'not_enabled', cashOut: 'not_enabled' },
  idempotencyKey: 'stored_api_issue_001',
} as const;

function context(db: SqliteD1, method: string, body?: unknown,
  options: Readonly<{ demo?: string; id?: string }> = {}): never {
  return {
    request: new Request('http://localhost/api/admin/stored-value', {
      method, headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    params: options.id === undefined ? {} : { id: options.id },
    locals: { runtime: { env: { DB: db.asD1(), DEMO_MODE: options.demo ?? 'false' } } },
  } as never;
}

describe('API admin R4.8 de valor almacenado', () => {
  let db: SqliteD1;
  beforeEach(() => {
    capability.routes = true;
    capability.sideEffects = true;
    db = new SqliteD1();
  });

  it('emite una tarjeta una sola vez, devuelve el secreto solo al crear y audita', async () => {
    const created = await POST(context(db, 'POST', payload));
    expect(created.status).toBe(201);
    const body = await created.json() as { account_id: string; gift_card_code: string };
    expect(body.gift_card_code).toMatch(/^L2B-/);
    expect(db.value('SELECT code_hash AS value FROM stored_value_accounts'))
      .not.toBe(body.gift_card_code);
    expect(await (await GET(context(db, 'GET'))).json()).toMatchObject({
      accounts: [{ id: body.account_id, kind: 'gift_card', balance_cents: 5000,
        available_cents: 5000, state: 'active', version: 2 }],
    });
    expect((await POST(context(db, 'POST', payload))).status).toBe(409);
    expect(db.value("SELECT count(*) AS value FROM audit_log WHERE action='payments.stored_value_issued'"))
      .toBe(1);
  });

  it('aplica transición versionada y bloquea demo, capability y versión obsoleta', async () => {
    const created = await POST(context(db, 'POST', payload));
    const id = ((await created.json()) as { account_id: string }).account_id;
    expect((await PATCH(context(db, 'PATCH', { expectedVersion: 2, state: 'disabled' }, { id }))).status)
      .toBe(200);
    expect((await PATCH(context(db, 'PATCH', { expectedVersion: 2, state: 'active' }, { id }))).status)
      .toBe(409);
    expect((await POST(context(db, 'POST', payload, { demo: 'true' }))).status).toBe(403);
    capability.routes = false;
    expect((await GET(context(db, 'GET'))).status).toBe(403);
  });
});
