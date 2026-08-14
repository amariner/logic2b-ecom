import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST as CREATE } from '../src/pages/api/admin/inventory-counts/index';
import { POST as SUBMIT } from '../src/pages/api/admin/inventory-counts/[id]/submit';
import { POST as APPROVE } from '../src/pages/api/admin/inventory-counts/[id]/approve';
import { seedStatements } from '../seed/seed';
import { SqliteD1 } from './sqlite-d1';

const capability = vi.hoisted(() => ({ routes: true, sideEffects: true }));
vi.mock('../src/composition/runtime-platform', () => ({
  runtimePlatform: { hasCapabilityFlag: (_id: string, flag: keyof typeof capability) => capability[flag] },
}));

function context(db: SqliteD1, method: string, path: string, body?: unknown, demo = 'false', params = {}): never {
  return { params, request: new Request(`http://localhost${path}`, {
    method, headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), locals: { runtime: { env: { DB: db.asD1(), DEMO_MODE: demo } } } } as never;
}

describe('API admin R3.8 de conteos', () => {
  let db: SqliteD1;
  beforeEach(async () => {
    capability.routes = true;
    capability.sideEffects = true;
    db = new SqliteD1();
    await db.batch(seedStatements().map((sql) => db.prepare(sql)));
  });

  it('crea, somete y aprueba un conteo con doble control', async () => {
    const locationId = Number(db.value("SELECT id AS value FROM inventory_locations WHERE code='principal'"));
    const variant = db.query<{ variant_id: number; on_hand: number }>('SELECT variant_id, on_hand FROM inventory_balances ORDER BY variant_id LIMIT 1')[0]!;
    expect((await CREATE(context(db, 'POST', '/api/admin/inventory-counts', {
      location_id: locationId, reason: 'cycle_count', requires_approval: true,
      counted_by: 'contador-api', lines: [{ variant_id: variant.variant_id, counted_quantity: variant.on_hand }],
      idempotency_key: 'count:api:create:0001',
    }))).status).toBe(201);
    const countId = String(db.value("SELECT id AS value FROM inventory_counts WHERE create_idempotency_key='count:api:create:0001'"));
    expect((await SUBMIT(context(db, 'POST', `/api/admin/inventory-counts/${countId}/submit`, {
      expected_version: 1, idempotency_key: 'count:api:submit:0001',
    }, 'false', { id: countId }))).status).toBe(200);
    expect((await APPROVE(context(db, 'POST', `/api/admin/inventory-counts/${countId}/approve`, {
      expected_version: 2, reviewer_id: 'revisor-api', idempotency_key: 'count:api:approve:0001',
    }, 'false', { id: countId }))).status).toBe(200);
    expect(db.value('SELECT status AS value FROM inventory_counts WHERE id=?', countId)).toBe('applied');
  });

  it('mantiene las tres mutaciones inertes en demo y cierra lectura por capability', async () => {
    expect((await CREATE(context(db, 'POST', '/api/admin/inventory-counts', {}, 'true'))).status).toBe(403);
    expect((await SUBMIT(context(db, 'POST', '/api/admin/inventory-counts/x/submit', {}, 'true', { id: 'x' }))).status).toBe(403);
    expect((await APPROVE(context(db, 'POST', '/api/admin/inventory-counts/x/approve', {}, 'true', { id: 'x' }))).status).toBe(403);
    capability.routes = false;
    expect((await GET(context(db, 'GET', '/api/admin/inventory-counts'))).status).toBe(403);
  });
});
