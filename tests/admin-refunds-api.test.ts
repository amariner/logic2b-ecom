import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../src/pages/api/admin/refunds/[id]';
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
    ) VALUES (7, 'BM-R213-API', 'clienta@example.com', 'Marta Ferrer', '{}',
      1780, 490, 2270, 'paid', 'sim_r213_api');
    INSERT INTO order_items (
      id, order_id, product_id, variant_id, name_snapshot, unit_price_cents, qty
    ) VALUES (71, 7, 1, 1, 'AOVE', 890, 2);
    INSERT INTO payments (
      order_id, provider, provider_reference, currency, expected_amount_cents,
      status, idempotency_key, created_at, updated_at
    ) VALUES (7, 'simulated', 'sim_r213_api', 'EUR', 2270, 'captured',
      'r2:payment:order:7:primary', '2026-08-12T09:00:00.000Z', '2026-08-12T09:00:00.000Z');
    INSERT INTO payment_transactions (
      payment_id, type, amount_cents, currency, status, provider_reference,
      idempotency_key, occurred_at, created_at
    ) SELECT id, 'capture', 2270, 'EUR', 'succeeded', 'sim_r213_api',
      'r2:payment:order:7:capture', '2026-08-12T09:00:00.000Z', '2026-08-12T09:00:00.000Z'
      FROM payments WHERE order_id = 7;
  `);
}

function context(
  db: SqliteD1,
  body: unknown,
  waits: Promise<unknown>[] = [],
  demoMode = 'false',
): Parameters<typeof POST>[0] {
  return {
    params: { id: '7' },
    request: new Request('http://localhost/api/admin/refunds/7', {
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

const partialBody = {
  mode: 'partial',
  reason: 'Una unidad no está disponible',
  restock: true,
  idempotency_key: '11111111-1111-4111-8111-111111111111',
  lines: [{ order_item_id: 71, quantity: 1 }],
} as const;

describe('API admin de reembolsos R2.13', () => {
  beforeEach(() => {
    capability.enabled = true;
  });

  it('aplica una cancelación parcial con importe calculado en servidor', async () => {
    const db = new SqliteD1();
    seedPaidOrder(db);
    const waits: Promise<unknown>[] = [];

    const response = await POST(context(db, partialBody, waits));
    const responseBody = await response.json();
    expect(responseBody).toEqual({ ok: true, status: 'succeeded' });
    expect(response.status).toBe(200);
    expect(db.query(`
      SELECT operation_type, subtotal_cents, shipping_cents, total_cents, status
      FROM refunds
    `)).toEqual([{
      operation_type: 'partial_cancellation',
      subtotal_cents: 890,
      shipping_cents: 0,
      total_cents: 890,
      status: 'succeeded',
    }]);
    expect(db.value('SELECT quantity AS value FROM refund_items')).toBe(1);
    await Promise.all(waits);
  });

  it('rechaza cantidades manipuladas sin crear intención ni llamar a efectos', async () => {
    const db = new SqliteD1();
    seedPaidOrder(db);
    const response = await POST(context(db, {
      ...partialBody,
      idempotency_key: '22222222-2222-4222-8222-222222222222',
      lines: [{ order_item_id: 71, quantity: 3 }],
    }));
    expect(response.status).toBe(422);
    expect(db.value('SELECT count(*) AS value FROM refunds')).toBe(0);
    expect(db.value('SELECT count(*) AS value FROM event_outbox_events')).toBe(0);
  });

  it('corta demo y capacidad desactivada antes de escribir D1', async () => {
    const demoDb = new SqliteD1();
    seedPaidOrder(demoDb);
    expect((await POST(context(demoDb, partialBody, [], 'true'))).status).toBe(403);
    expect(demoDb.value('SELECT count(*) AS value FROM refunds')).toBe(0);

    const disabledDb = new SqliteD1();
    seedPaidOrder(disabledDb);
    capability.enabled = false;
    expect((await POST(context(disabledDb, partialBody))).status).toBe(403);
    expect(disabledDb.value('SELECT count(*) AS value FROM refunds')).toBe(0);
  });

  it('mantiene compatible el contrato de reembolso total sin mode', async () => {
    const db = new SqliteD1();
    seedPaidOrder(db);
    const response = await POST(context(db, {
      reason: 'Cancelación completa',
      restock: false,
    }));
    expect(response.status).toBe(200);
    expect(db.query('SELECT operation_type, total_cents FROM refunds')).toEqual([
      { operation_type: 'total_cancellation', total_cents: 2270 },
    ]);
  });
});
