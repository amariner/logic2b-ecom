import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '../src/pages/api/admin/bundles/index';
import { PATCH } from '../src/pages/api/admin/bundles/[id]';
import { SqliteD1 } from './sqlite-d1';

const capability = vi.hoisted(() => ({ routes: true, sideEffects: true }));
vi.mock('../src/composition/runtime-platform', () => ({
  runtimePlatform: { hasCapabilityFlag: (_id: string, flag: keyof typeof capability) => capability[flag] },
}));

const payload = {
  label: 'Kit de bienvenida', state: 'active', kind: 'fixed', productId: 1,
  components: [{ productId: 2, quantity: 2 }, { productId: 3, quantity: 1 }], groups: [],
} as const;

function context(db: SqliteD1, method: string, body?: unknown,
  options: Readonly<{ demo?: string; id?: string }> = {}): never {
  return {
    request: new Request('http://localhost/api/admin/bundles', {
      method, headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    params: options.id === undefined ? {} : { id: options.id },
    locals: { runtime: { env: { DB: db.asD1(), DEMO_MODE: options.demo ?? 'false' } } },
  } as never;
}

describe('API admin R4.7 de bundles', () => {
  let db: SqliteD1;
  beforeEach(() => {
    capability.routes = true;
    capability.sideEffects = true;
    db = new SqliteD1();
    db.sqlite.exec(`INSERT INTO products (id, slug, name, price_cents, stock, category) VALUES
      (1, 'kit-api', 'Kit API', 2500, 0, 'test'),
      (2, 'component-a', 'Component A', 900, 20, 'test'),
      (3, 'component-b', 'Component B', 700, 10, 'test')`);
  });

  it('crea, lista la composición y audita el estado versionado', async () => {
    const created = await POST(context(db, 'POST', payload));
    expect(created.status).toBe(201);
    const id = ((await created.json()) as { bundle_id: string }).bundle_id;
    expect(await (await GET(context(db, 'GET'))).json()).toMatchObject({
      bundles: [{ id, state: 'active', version: 1, kind: 'fixed', productId: 1,
        components: [{ productId: 2, quantity: 2 }, { productId: 3, quantity: 1 }] }],
    });
    expect((await PATCH(context(db, 'PATCH', { expectedVersion: 1, state: 'disabled' }, { id }))).status)
      .toBe(200);
    expect(db.query('SELECT state, version FROM bundles')).toEqual([{ state: 'disabled', version: 2 }]);
    expect(db.query('SELECT action FROM audit_log ORDER BY occurred_at')).toEqual([
      { action: 'pricing.bundle_created' }, { action: 'pricing.bundle_state_changed' },
    ]);
  });

  it('crea una composición configurable con defaults válidos', async () => {
    const response = await POST(context(db, 'POST', {
      label: 'Kit configurable', state: 'active', kind: 'configurable', productId: 1,
      components: [], groups: [{ id: 'color', label: 'Color', minimumSelections: 1,
        maximumSelections: 1, options: [{ productId: 2, quantity: 1, isDefault: true },
          { productId: 3, quantity: 1, isDefault: false }] }],
    }));
    expect(response.status).toBe(201);
    expect((await GET(context(db, 'GET'))).status).toBe(200);
    expect(db.query('SELECT id, minimum_selections, maximum_selections FROM bundle_groups'))
      .toEqual([{ id: 'color', minimum_selections: 1, maximum_selections: 1 }]);
  });

  it('rechaza referencias/configuración ajenas, demo, capability y versión obsoleta', async () => {
    expect((await POST(context(db, 'POST', { ...payload,
      components: [{ productId: 999, quantity: 1 }] }))).status).toBe(422);
    expect((await POST(context(db, 'POST', { ...payload,
      components: [{ productId: 2, quantity: 0 }] }))).status).toBe(400);
    expect((await POST(context(db, 'POST', payload, { demo: 'true' }))).status).toBe(403);
    const created = await POST(context(db, 'POST', payload));
    const id = ((await created.json()) as { bundle_id: string }).bundle_id;
    expect((await POST(context(db, 'POST', payload))).status).toBe(409);
    expect(db.value("SELECT count(*) AS value FROM audit_log WHERE action='pricing.bundle_created'"))
      .toBe(1);
    expect((await PATCH(context(db, 'PATCH', { expectedVersion: 99, state: 'disabled' }, { id }))).status)
      .toBe(409);
    capability.routes = false;
    expect((await GET(context(db, 'GET'))).status).toBe(403);
  });
});
