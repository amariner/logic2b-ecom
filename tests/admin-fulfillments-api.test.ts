import { describe, expect, it, vi } from 'vitest';
import { PATCH } from '../src/pages/api/admin/fulfillments/[id]';
import { POST } from '../src/pages/api/admin/fulfillments/index';
import { SqliteD1 } from './sqlite-d1';

vi.mock('../src/composition/runtime-platform', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/composition/runtime-platform')>();
  return {
    runtimePlatform: {
      ...actual.runtimePlatform,
      hasCapabilityFlag: () => true,
    },
  };
});

function seedPaidOrder(db: SqliteD1): void {
  db.sqlite.exec(`
    INSERT INTO products (id, slug, name, price_cents, stock, category)
    VALUES (1, 'aove', 'AOVE', 890, 8, 'aceites');
    INSERT INTO product_variants (
      id, product_id, sku, title, price_cents, status, is_default, option_signature
    ) VALUES (1, 1, 'AOVE-DEFAULT', '', 890, 'active', 1, NULL);
    INSERT INTO inventory_balances (variant_id, on_hand, reserved, version)
    VALUES (1, 8, 0, 1);
    INSERT INTO orders (
      id, order_number, email, customer_name, address_json,
      subtotal_cents, shipping_cents, total_cents, status, stripe_session_id
    ) VALUES (7, 'BM-R212-API', 'clienta@example.com', 'Marta Ferrer', '{}',
      1780, 0, 1780, 'paid', 'cs_r212_api');
    INSERT INTO order_items (
      id, order_id, product_id, variant_id, name_snapshot, unit_price_cents, qty
    ) VALUES (71, 7, 1, 1, 'AOVE', 890, 2);
    INSERT INTO payments (
      order_id, provider, provider_reference, currency, expected_amount_cents,
      status, idempotency_key, created_at, updated_at
    ) VALUES (7, 'stripe', 'pi_r212_api', 'EUR', 1780, 'captured',
      'r2:payment:order:7:primary', '2026-08-11T16:00:00.000Z', '2026-08-11T16:00:00.000Z');
  `);
}

function createContext(
  db: SqliteD1,
  body: unknown,
  waits: Promise<unknown>[],
  demoMode = 'false',
): Parameters<typeof POST>[0] {
  return {
    request: new Request('http://localhost/api/admin/fulfillments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    locals: {
      runtime: {
        env: { DB: db.asD1(), DEMO_MODE: demoMode },
        ctx: { waitUntil: (promise: Promise<unknown>) => waits.push(promise) },
      },
    },
  } as unknown as Parameters<typeof POST>[0];
}

function deliverContext(
  db: SqliteD1,
  fulfillmentId: number,
  demoMode = 'false',
): Parameters<typeof PATCH>[0] {
  return {
    params: { id: String(fulfillmentId) },
    request: new Request(`http://localhost/api/admin/fulfillments/${fulfillmentId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'delivered' }),
    }),
    locals: { runtime: { env: { DB: db.asD1(), DEMO_MODE: demoMode } } },
  } as unknown as Parameters<typeof PATCH>[0];
}

const partialBody = {
  order_id: 7,
  tracking_carrier: 'SEUR',
  tracking_number: 'API-1',
  idempotency_key: 'admin-api-first',
  lines: [{ order_item_id: 71, quantity: 1 }],
} as const;

describe('API admin de fulfillments R2.12', () => {
  it('crea un envío parcial, reintenta por clave y entrega el grupo', async () => {
    const db = new SqliteD1();
    seedPaidOrder(db);
    const waits: Promise<unknown>[] = [];

    const created = await POST(createContext(db, partialBody, waits));
    const createdBody = await created.json() as { fulfillmentId: number; remainingQuantity: number };
    expect(created.status).toBe(200);
    expect(createdBody).toMatchObject({ remainingQuantity: 1 });
    expect(db.value('SELECT status AS value FROM orders WHERE id = 7')).toBe('paid');

    const replay = await POST(createContext(db, partialBody, waits));
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ replayed: true, fulfillmentId: createdBody.fulfillmentId });
    expect(db.value('SELECT count(*) AS value FROM fulfillments')).toBe(1);
    expect(db.value('SELECT count(*) AS value FROM fulfillment_items')).toBe(1);

    const delivered = await PATCH(deliverContext(db, createdBody.fulfillmentId));
    expect(delivered.status).toBe(200);
    expect(await delivered.json()).toMatchObject({ orderStatus: 'paid' });
    expect(db.value('SELECT status AS value FROM fulfillments')).toBe('delivered');
    await Promise.all(waits);
  });

  it('devuelve 422 al sobreasignar y no deja evidencia', async () => {
    const db = new SqliteD1();
    seedPaidOrder(db);
    const response = await POST(createContext(db, {
      ...partialBody,
      idempotency_key: 'admin-api-invalid',
      lines: [{ order_item_id: 71, quantity: 3 }],
    }, []));
    expect(response.status).toBe(422);
    expect(db.value('SELECT count(*) AS value FROM fulfillments')).toBe(0);
    expect(db.value('SELECT count(*) AS value FROM event_outbox_events')).toBe(0);
  });

  it('corta las dos mutaciones de la demo antes de tocar D1', async () => {
    const db = new SqliteD1();
    seedPaidOrder(db);
    const created = await POST(createContext(db, partialBody, [], 'true'));
    const delivered = await PATCH(deliverContext(db, 1, 'true'));
    expect(created.status).toBe(403);
    expect(delivered.status).toBe(403);
    expect(db.value('SELECT count(*) AS value FROM fulfillments')).toBe(0);
    expect(db.value('SELECT count(*) AS value FROM event_outbox_events')).toBe(0);
  });
});
