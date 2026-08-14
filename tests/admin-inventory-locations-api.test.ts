import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '../src/pages/api/admin/inventory-locations/index';
import { PATCH } from '../src/pages/api/admin/inventory-locations/[id]';
import { seedStatements } from '../seed/seed';
import { SqliteD1 } from './sqlite-d1';

const capability = vi.hoisted(() => ({ routes: true, sideEffects: true }));
vi.mock('../src/composition/runtime-platform', () => ({ runtimePlatform: { hasCapabilityFlag: (_id: string, flag: keyof typeof capability) => capability[flag] } }));

function context(db: SqliteD1, method: string, body?: unknown, demo = 'false', params = {}): never {
  return { params, request: new Request('http://localhost/api/admin/inventory-locations', {
    method, headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), locals: { runtime: { env: { DB: db.asD1(), DEMO_MODE: demo } } } } as never;
}

describe('API admin R3.6 de ubicaciones', () => {
  let db: SqliteD1;
  beforeEach(async () => { capability.routes = true; capability.sideEffects = true; db = new SqliteD1(); await db.batch(seedStatements().map((sql) => db.prepare(sql))); });

  it('lista, crea y actualiza con versión optimista', async () => {
    expect((await GET(context(db, 'GET'))).status).toBe(200);
    expect((await POST(context(db, 'POST', { code: 'norte', name: 'Almacén Norte', kind: 'warehouse', timezone: 'Europe/Madrid' }))).status).toBe(201);
    const id = Number(db.value("SELECT id AS value FROM inventory_locations WHERE code='norte'"));
    expect((await PATCH(context(db, 'PATCH', { expected_version: 1, status: 'inactive' }, 'false', { id: String(id) }))).status).toBe(200);
    expect((await PATCH(context(db, 'PATCH', { expected_version: 1, name: 'Obsoleto' }, 'false', { id: String(id) }))).status).toBe(409);
  });

  it('mantiene la demo sin efectos y cierra por capability', async () => {
    expect((await POST(context(db, 'POST', { code: 'norte', name: 'Norte', kind: 'store', timezone: 'Europe/Madrid' }, 'true'))).status).toBe(403);
    capability.routes = false;
    expect((await GET(context(db, 'GET'))).status).toBe(403);
    expect(db.value('SELECT count(*) AS value FROM inventory_locations')).toBe(2);
  });
});
