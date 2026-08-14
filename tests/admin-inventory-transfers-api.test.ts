import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST as CREATE } from '../src/pages/api/admin/inventory-transfers/index';
import { POST as SHIP } from '../src/pages/api/admin/inventory-transfers/[id]/ship';
import { POST as RECEIVE } from '../src/pages/api/admin/inventory-transfers/[id]/receive';
import { seedStatements } from '../seed/seed';
import { SqliteD1 } from './sqlite-d1';

const capability = vi.hoisted(() => ({ routes: true, sideEffects: true }));
vi.mock('../src/composition/runtime-platform', () => ({
  runtimePlatform: { hasCapabilityFlag: (_id: string, flag: keyof typeof capability) => capability[flag] },
}));

function context(db: SqliteD1, method: string, path: string, body?: unknown, demo = 'false', params = {}): never {
  return {
    params,
    request: new Request(`http://localhost${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    locals: { runtime: { env: { DB: db.asD1(), DEMO_MODE: demo } } },
  } as never;
}

describe('API admin R3.7 de transferencias', () => {
  let db: SqliteD1;
  beforeEach(async () => {
    capability.routes = true;
    capability.sideEffects = true;
    db = new SqliteD1();
    await db.batch(seedStatements().map((sql) => db.prepare(sql)));
  });

  it('crea, envía y recibe una transferencia completa', async () => {
    const source = Number(db.value("SELECT id AS value FROM inventory_locations WHERE code='principal'"));
    const destination = Number(db.value("SELECT id AS value FROM inventory_locations WHERE code='tienda-demo'"));
    const variant = Number(db.value('SELECT variant_id AS value FROM inventory_balances WHERE on_hand >= 2 ORDER BY variant_id LIMIT 1'));
    const created = await CREATE(context(db, 'POST', '/api/admin/inventory-transfers', {
      source_location_id: source,
      destination_location_id: destination,
      lines: [{ variant_id: variant, quantity: 2 }],
      idempotency_key: 'transfer:api:create:0001',
    }));
    expect(created.status).toBe(201);
    const transferId = String(db.value("SELECT id AS value FROM inventory_transfers WHERE create_idempotency_key='transfer:api:create:0001'"));
    expect((await SHIP(context(db, 'POST', `/api/admin/inventory-transfers/${transferId}/ship`, {
      expected_version: 1,
      idempotency_key: 'transfer:api:ship:0001',
    }, 'false', { id: transferId }))).status).toBe(200);
    const lineId = String(db.value('SELECT id AS value FROM inventory_transfer_lines WHERE transfer_id=?', transferId));
    expect((await RECEIVE(context(db, 'POST', `/api/admin/inventory-transfers/${transferId}/receive`, {
      expected_version: 2,
      idempotency_key: 'transfer:api:receive:0001',
      lines: [{ transfer_line_id: lineId, received_quantity: 2, discrepancy_quantity: 0 }],
    }, 'false', { id: transferId }))).status).toBe(200);
    expect(db.value('SELECT status AS value FROM inventory_transfers WHERE id=?', transferId)).toBe('received');
  });

  it('mantiene la demo inerte y cierra lectura por capability', async () => {
    expect((await CREATE(context(db, 'POST', '/api/admin/inventory-transfers', {}, 'true'))).status).toBe(403);
    expect((await SHIP(context(db, 'POST', '/api/admin/inventory-transfers/x/ship', {}, 'true', { id: 'x' }))).status).toBe(403);
    expect((await RECEIVE(context(db, 'POST', '/api/admin/inventory-transfers/x/receive', {}, 'true', { id: 'x' }))).status).toBe(403);
    capability.routes = false;
    expect((await GET(context(db, 'GET', '/api/admin/inventory-transfers'))).status).toBe(403);
    expect(db.value('SELECT count(*) AS value FROM inventory_transfer_movements')).toBe(0);
  });
});
