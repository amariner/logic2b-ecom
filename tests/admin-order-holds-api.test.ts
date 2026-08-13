import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as createHold } from '../src/pages/api/admin/order-holds/index';
import { PATCH as mutateHold } from '../src/pages/api/admin/order-holds/[id]';
import { SqliteD1 } from './sqlite-d1';

const capability = vi.hoisted(() => ({ enabled: true }));

vi.mock('../src/composition/runtime-platform', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/composition/runtime-platform')>();
  return {
    runtimePlatform: {
      ...actual.runtimePlatform,
      hasCapabilityFlag: () => capability.enabled,
    },
  };
});

function database(): SqliteD1 {
  const db = new SqliteD1();
  db.sqlite.exec(`INSERT INTO orders (
    id, order_number, email, customer_name, address_json,
    subtotal_cents, shipping_cents, total_cents, status
  ) VALUES (7, 'HOLD-API-7', 'qa@example.test', 'QA', '{}', 1000, 0, 1000, 'paid')`);
  return db;
}

function createContext(db: SqliteD1, body: unknown, demoMode = 'false') {
  return {
    request: new Request('http://localhost/api/admin/order-holds', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }),
    locals: { runtime: { env: { DB: db.asD1(), DEMO_MODE: demoMode } } },
  } as unknown as Parameters<typeof createHold>[0];
}

function mutateContext(db: SqliteD1, holdId: string, body: unknown, demoMode = 'false') {
  return {
    params: { id: holdId },
    request: new Request(`http://localhost/api/admin/order-holds/${holdId}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }),
    locals: { runtime: { env: { DB: db.asD1(), DEMO_MODE: demoMode } } },
  } as unknown as Parameters<typeof mutateHold>[0];
}

const body = {
  order_id: 7,
  reason_code: 'address_issue',
  owner_id: 'operations',
  owner_label: 'Operaciones',
  due_at: '2099-08-13T12:00:00.000Z',
  idempotency_key: 'hold-api-address-7',
} as const;

describe('API admin R3.4 de holds e incidencias', () => {
  beforeEach(() => { capability.enabled = true; });

  it('crea, reintenta, reasigna y resuelve una incidencia', async () => {
    const db = database();
    const created = await createHold(createContext(db, body));
    expect(created.status).toBe(201);
    const createdJson = await created.json() as { hold: { id: string; version: number } };
    const replay = await createHold(createContext(db, body));
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ replayed: true });

    const assigned = await mutateHold(mutateContext(db, createdJson.hold.id, {
      action: 'assign', expected_version: 1,
      owner_id: 'warehouse', owner_label: 'Almacén',
    }));
    expect(assigned.status).toBe(200);
    const resolved = await mutateHold(mutateContext(db, createdJson.hold.id, {
      action: 'resolve', expected_version: 2, resolution_code: 'cleared',
    }));
    expect(resolved.status).toBe(200);
    expect(db.query('SELECT status, owner_id, version FROM order_holds')).toEqual([
      { status: 'resolved', owner_id: 'warehouse', version: 3 },
    ]);
    expect(db.value('SELECT count(*) AS value FROM order_hold_events')).toBe(3);
  });

  it('rechaza payload hostil, versión obsoleta, demo y capability apagada', async () => {
    const db = database();
    expect((await createHold(createContext(db, { ...body, price_cents: 1 }))).status).toBe(400);
    const created = await createHold(createContext(db, body));
    const holdId = (await created.json() as { hold: { id: string } }).hold.id;
    expect((await mutateHold(mutateContext(db, holdId, {
      action: 'resolve', expected_version: 9, resolution_code: 'cleared',
    }))).status).toBe(409);
    expect((await createHold(createContext(db, body, 'true'))).status).toBe(403);
    capability.enabled = false;
    expect((await mutateHold(mutateContext(db, holdId, {
      action: 'resolve', expected_version: 1, resolution_code: 'cleared',
    }))).status).toBe(403);
  });
});
