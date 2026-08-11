import { describe, expect, it } from 'vitest';
import { PATCH } from '../src/pages/api/admin/orders/[id]';
import { SqliteD1 } from './sqlite-d1';

function seedOrder(db: SqliteD1, status = 'paid'): void {
  db.sqlite.exec(`
    INSERT INTO products (id, slug, name, price_cents, stock, category)
    VALUES (1, 'aove', 'AOVE', 890, 8, 'aceites');
    INSERT INTO product_variants (
      id, product_id, sku, title, price_cents, status, is_default, option_signature
    ) VALUES (1, 1, 'AOVE-DEFAULT', '', 890, 'active', 1, NULL);
    INSERT INTO inventory_balances (variant_id, on_hand, reserved, version)
    VALUES (1, 8, 0, 1);
    INSERT INTO inventory_movements (
      variant_id, delta, reason, balance_after, version_after, actor_kind,
      actor_id, reference_type, reference_id, idempotency_key, correlation_id, occurred_at
    ) VALUES (1, 8, 'legacy_opening_balance', 8, 1, 'system', 'test',
      'test', '1', 'test:opening:1', 'inventory:variant:1', '2026-08-08T10:00:00.000Z');
    INSERT INTO orders (
      id, order_number, email, customer_name, address_json,
      subtotal_cents, shipping_cents, total_cents, status, stripe_session_id
    ) VALUES (
      7, 'BM-260806-TEST', 'clienta@example.com', 'Marta Ferrer', '{}',
      1780, 490, 2270, '${status}', 'cs_test_1'
    );
    INSERT INTO order_items (order_id, product_id, variant_id, name_snapshot, unit_price_cents, qty)
    VALUES (7, 1, 1, 'AOVE', 890, 2);
    INSERT INTO payments (
      order_id, provider, provider_reference, currency, expected_amount_cents,
      status, idempotency_key, created_at, updated_at
    ) VALUES (7, 'stripe', 'pi_test_1', 'EUR', 2270,
      '${status === 'paid' ? 'captured' : 'cancelled'}', 'r2:payment:order:7:primary',
      '2026-08-06T10:00:00.000Z', '2026-08-06T10:00:00.000Z');
    INSERT INTO payment_transactions (
      payment_id, type, amount_cents, currency, status, provider_reference,
      idempotency_key, occurred_at, created_at
    )
    SELECT id, 'capture', 2270, 'EUR', 'succeeded', 'pi_test_1',
      'r2:payment:capture:order:7', '2026-08-06T10:00:00.000Z', '2026-08-06T10:00:00.000Z'
    FROM payments WHERE order_id = 7 AND status = 'captured';
  `);
}

function makeCtx(db: SqliteD1, body: unknown, waits: Promise<unknown>[]) {
  return {
    params: { id: '7' },
    request: new Request('http://localhost/api/admin/orders/7', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    locals: {
      runtime: {
        env: { DB: db.asD1(), DEMO_MODE: 'false' },
        ctx: { waitUntil: (promise: Promise<unknown>) => waits.push(promise) },
      },
    },
  } as unknown as Parameters<typeof PATCH>[0];
}

describe('PATCH /api/admin/orders/:id con outbox transaccional', () => {
  it('paid → cancelled aplica una vez y devuelve stock', async () => {
    const db = new SqliteD1();
    seedOrder(db);
    const waits: Promise<unknown>[] = [];
    const response = await PATCH(makeCtx(db, { status: 'cancelled' }, waits));
    await Promise.all(waits);
    expect(response.status).toBe(200);
    expect(db.value('SELECT stock AS value FROM products WHERE id=1')).toBe(10);
    expect(db.value("SELECT count(*) AS value FROM event_outbox_events WHERE event_type='orders.order_cancelled'")).toBe(1);
    expect(db.value('SELECT status AS value FROM payments WHERE order_id=7')).toBe('requires_review');
    expect(db.value('SELECT count(*) AS value FROM emails_outbox')).toBe(0);
  });

  it('dos PATCH solapados: uno gana, el otro recibe 409 y no duplica restock', async () => {
    const db = new SqliteD1();
    seedOrder(db);
    const waits: Promise<unknown>[] = [];
    const responses = await Promise.all([
      PATCH(makeCtx(db, { status: 'cancelled' }, waits)),
      PATCH(makeCtx(db, { status: 'cancelled' }, waits)),
    ]);
    await Promise.all(waits);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(db.value('SELECT stock AS value FROM products WHERE id=1')).toBe(10);
    expect(db.value('SELECT count(*) AS value FROM event_outbox_events')).toBe(1);
  });

  it('pedido ya cancelado → 422 sin tocar stock', async () => {
    const db = new SqliteD1();
    seedOrder(db, 'cancelled');
    const response = await PATCH(makeCtx(db, { status: 'cancelled' }, []));
    expect(response.status).toBe(422);
    expect(db.value('SELECT stock AS value FROM products WHERE id=1')).toBe(8);
  });

  it('paid → shipped despacha un aviso y conserva el stock', async () => {
    const db = new SqliteD1();
    seedOrder(db);
    const waits: Promise<unknown>[] = [];
    const response = await PATCH(makeCtx(db, {
      status: 'shipped',
      tracking_carrier: 'SEUR',
      tracking_number: 'ES123',
    }, waits));
    await Promise.all(waits);
    expect(response.status).toBe(200);
    expect(db.value('SELECT count(*) AS value FROM emails_outbox')).toBe(1);
    expect(db.value("SELECT count(*) AS value FROM event_outbox_deliveries WHERE status='delivered'")).toBe(1);
    expect(db.value('SELECT stock AS value FROM products WHERE id=1')).toBe(8);
  });
});
