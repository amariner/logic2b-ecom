import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, PATCH } from '../src/pages/api/admin/inventory-routing/index';
import { seedStatements } from '../seed/seed';
import { SqliteD1 } from './sqlite-d1';

const capability = vi.hoisted(() => ({ routes: true, sideEffects: true }));
vi.mock('../src/composition/runtime-platform', () => ({
  runtimePlatform: { hasCapabilityFlag: (_id: string, flag: keyof typeof capability) => capability[flag] },
}));

function context(db: SqliteD1, method: string, body?: unknown, demo = 'false'): never {
  return {
    request: new Request('http://localhost/api/admin/inventory-routing', {
      method, headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    locals: { runtime: { env: { DB: db.asD1(), DEMO_MODE: demo } } },
  } as never;
}

describe('API admin R3.9 de asignación', () => {
  let db: SqliteD1;
  beforeEach(async () => {
    capability.routes = true;
    capability.sideEffects = true;
    db = new SqliteD1();
    await db.batch(seedStatements().map((sql) => db.prepare(sql)));
  });

  it('lee decisiones y actualiza una política con versión y auditoría', async () => {
    const get = await GET(context(db, 'GET'));
    const payload = await get.json() as { policies: unknown[]; decisions: unknown[] };
    expect(payload.policies).toHaveLength(2);
    expect(payload.decisions).toHaveLength(1);
    const locationId = Number(db.value("SELECT id AS value FROM inventory_locations WHERE code='tienda-demo'"));
    expect((await PATCH(context(db, 'PATCH', {
      location_id: locationId, expected_version: 1, priority: 25,
      handling_cost_cents: 175, markets: ['es', 'PT'], channels: ['Storefront'], enabled: true,
    }))).status).toBe(200);
    expect(db.query(`SELECT priority, handling_cost_cents, markets_json, channels_json, version
      FROM inventory_routing_policies WHERE location_id=?`, locationId)).toEqual([{
      priority: 25, handling_cost_cents: 175, markets_json: '["ES","PT"]',
      channels_json: '["storefront"]', version: 2,
    }]);
    expect(db.value("SELECT count(*) AS value FROM audit_log WHERE action='inventory.routing_policy_updated'"))
      .toBe(1);
    expect((await PATCH(context(db, 'PATCH', {
      location_id: locationId, expected_version: 1, priority: 20,
      handling_cost_cents: 0, markets: ['*'], channels: ['*'], enabled: true,
    }))).status).toBe(409);
  });

  it('mantiene PATCH inerte en demo y cierra GET por capability', async () => {
    expect((await PATCH(context(db, 'PATCH', {}, 'true'))).status).toBe(403);
    capability.routes = false;
    expect((await GET(context(db, 'GET'))).status).toBe(403);
  });
});
