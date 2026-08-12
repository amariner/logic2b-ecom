import { describe, expect, it } from 'vitest';
import { createOrderOperations } from '../src/composition/order-operations';
import { createFulfillmentOperations } from '../src/composition/fulfillment-operations';
import { createRefundOperations } from '../src/composition/refund-operations';
import type {
  PaymentRefundGateway,
  RefundGatewayRequest,
  RefundGatewayResult,
} from '../src/modules/payments';
import {
  createEventFactory,
  createEventIdentityFactory,
  type EventClock,
  type EventIdSource,
} from '../src/shared-kernel/events';
import { SqliteD1 } from './sqlite-d1';

const START = '2026-08-11T09:00:00.000Z';

function runtime() {
  let tick = 0;
  const clock: EventClock = { now: () => new Date(Date.parse(START) + tick * 1000) };
  const ids: EventIdSource = { next: () => `evt_refund_${++tick}` };
  return { emit: createEventFactory({ clock, ids }), reserve: createEventIdentityFactory({ clock, ids }) };
}

function seedProduct(db: SqliteD1): void {
  db.sqlite.exec(`
    INSERT INTO products (id, slug, name, price_cents, stock, category)
    VALUES (1, 'producto', 'Producto', 1500, 5, 'test');
    INSERT INTO product_variants (
      id, product_id, sku, title, price_cents, status, is_default, option_signature
    ) VALUES (1, 1, 'PRODUCT-1', '', 1500, 'active', 1, NULL);
    INSERT INTO inventory_balances (variant_id, on_hand, reserved, version)
    VALUES (1, 5, 0, 1);
    INSERT INTO inventory_movements (
      variant_id, delta, reason, balance_after, version_after, actor_kind,
      actor_id, reference_type, reference_id, idempotency_key, correlation_id, occurred_at
    ) VALUES (1, 5, 'legacy_opening_balance', 5, 1, 'system', 'test',
      'test', '1', 'refund:test:opening', 'inventory:variant:1', '${START}');
  `);
}

function newOrder(number: string) {
  return {
    order_number: number,
    email: 'private@example.com',
    customer_name: 'Persona privada',
    address_json: '{}',
    subtotal_cents: 1500,
    shipping_cents: 0,
    total_cents: 1500,
    stripe_session_id: `sim_session_${number}`,
    currency: 'EUR',
  };
}

const lines = [{ product_id: 1, name_snapshot: 'Producto', unit_price_cents: 1500, qty: 1 }] as const;

async function paidOrder(db: SqliteD1, number: string) {
  const events = runtime();
  const orders = createOrderOperations(db.asD1(), events.emit, events.reserve);
  const placed = await orders.placeOrder(newOrder(number), lines, 'simulated');
  await orders.confirmPayment({
    lookup: { by: 'id', orderId: placed!.orderId },
    paymentIntent: `sim_pi_${number}`,
    source: 'simulated',
  });
  return { id: placed!.orderId, orders, emit: events.emit };
}

function gateway(
  handler: (request: RefundGatewayRequest) => Promise<RefundGatewayResult>,
): PaymentRefundGateway {
  return { provider: 'simulated', refund: handler };
}

describe('reembolso total R2.10', () => {
  it('cierra dinero, pedido, stock, evento, auditoría y notificación una sola vez', async () => {
    const db = new SqliteD1();
    seedProduct(db);
    const paid = await paidOrder(db, 'R210-OK');
    let calls = 0;
    const refundGateway = gateway(async (request) => {
      calls += 1;
      return { providerReference: `sim_ref_${request.idempotencyKey}`, status: 'succeeded' };
    });
    const refunds = createRefundOperations(db.asD1(), () => refundGateway, paid.emit);

    expect(await refunds.refundTotal({
      orderId: paid.id,
      reason: 'Cancelación solicitada por el cliente',
      restock: true,
    })).toMatchObject({ outcome: 'applied', queuedMessages: 1 });
    expect(await refunds.refundTotal({
      orderId: paid.id,
      reason: 'replay',
      restock: true,
    })).toMatchObject({ outcome: 'already_applied' });

    expect(calls).toBe(1);
    expect(db.value('SELECT status AS value FROM orders')).toBe('cancelled');
    expect(db.value('SELECT status AS value FROM payments')).toBe('refunded');
    expect(db.query('SELECT status, total_cents FROM refunds')).toEqual([
      { status: 'succeeded', total_cents: 1500 },
    ]);
    expect(db.query('SELECT type, amount_cents, status FROM payment_transactions ORDER BY id')).toEqual([
      { type: 'capture', amount_cents: 1500, status: 'succeeded' },
      { type: 'refund', amount_cents: 1500, status: 'succeeded' },
    ]);
    expect(db.value('SELECT stock AS value FROM products')).toBe(5);
    expect(db.value("SELECT count(*) AS value FROM inventory_movements WHERE reason='cancellation_restock'")).toBe(1);
    expect(db.value("SELECT count(*) AS value FROM audit_log WHERE action='payments.refunded'")).toBe(1);
    expect(db.value("SELECT count(*) AS value FROM event_outbox_events WHERE event_type='orders.order_refunded'")).toBe(1);
    expect(db.value(`
      SELECT count(*) AS value
      FROM event_outbox_deliveries d
      JOIN event_outbox_events e ON e.event_id = d.event_id
      WHERE d.consumer_id = 'notifications' AND d.status = 'pending'
        AND e.event_type = 'orders.order_refunded'
    `)).toBe(1);
  });

  it('un fallo transitorio conserva la intención y reintenta con la misma clave sin duplicar', async () => {
    const db = new SqliteD1();
    seedProduct(db);
    const paid = await paidOrder(db, 'R210-RETRY');
    const requests: RefundGatewayRequest[] = [];
    const refundGateway = gateway(async (request) => {
      requests.push(request);
      if (requests.length === 1) throw new Error('provider unavailable');
      return { providerReference: 'sim_ref_retry', status: 'succeeded' };
    });
    const refunds = createRefundOperations(db.asD1(), () => refundGateway, paid.emit);
    const input = { orderId: paid.id, reason: 'Cliente', restock: true } as const;

    await expect(refunds.refundTotal(input)).rejects.toThrow('provider unavailable');
    expect(db.query('SELECT status, provider_reference FROM refunds')).toEqual([
      { status: 'pending', provider_reference: null },
    ]);
    expect(db.value('SELECT status AS value FROM orders')).toBe('paid');
    expect(await refunds.refundTotal(input)).toMatchObject({ outcome: 'applied' });
    expect(requests).toHaveLength(2);
    expect(requests[1]?.idempotencyKey).toBe(requests[0]?.idempotencyKey);
    expect(db.value("SELECT count(*) AS value FROM payment_transactions WHERE type='refund'")).toBe(1);
  });

  it('processing queda visible y bloquea el envío hasta reconciliar la referencia', async () => {
    const db = new SqliteD1();
    seedProduct(db);
    const paid = await paidOrder(db, 'R210-PROCESSING');
    let call = 0;
    const refundGateway = gateway(async (request) => {
      call += 1;
      return call === 1
        ? { providerReference: 'sim_ref_processing', status: 'processing' }
        : { providerReference: request.existingRefundReference!, status: 'succeeded' };
    });
    const refunds = createRefundOperations(db.asD1(), () => refundGateway, paid.emit);
    const input = { orderId: paid.id, reason: 'Cliente', restock: false } as const;

    expect(await refunds.refundTotal(input)).toMatchObject({ outcome: 'processing' });
    expect((await createFulfillmentOperations(db.asD1(), paid.emit).ship({
      orderId: paid.id,
      tracking: { carrier: 'SEUR', number: 'X' },
      idempotencyKey: 'refund-processing-blocks-shipment',
    })).outcome).toBe('conflict');
    expect(db.value("SELECT count(*) AS value FROM event_outbox_events WHERE event_type='fulfillment.fulfillment_shipped'")).toBe(0);

    expect(await refunds.refundTotal(input)).toMatchObject({ outcome: 'applied' });
    expect(db.value('SELECT stock AS value FROM products')).toBe(4);
    expect(db.value('SELECT restock_decision AS value FROM refund_items')).toBe('none');
  });

  it('dos solicitudes concurrentes comparten clave PSP y solo una finaliza efectos', async () => {
    const db = new SqliteD1();
    seedProduct(db);
    const paid = await paidOrder(db, 'R210-RACE');
    const requests: RefundGatewayRequest[] = [];
    let release: (() => void) | undefined;
    const bothArrived = new Promise<void>((resolve) => { release = resolve; });
    const refundGateway = gateway(async (request) => {
      requests.push(request);
      if (requests.length === 2) release?.();
      await bothArrived;
      return { providerReference: 'sim_ref_race', status: 'succeeded' };
    });
    const refunds = createRefundOperations(db.asD1(), () => refundGateway, paid.emit);
    const input = { orderId: paid.id, reason: 'Cliente', restock: true } as const;

    const outcomes = await Promise.all([refunds.refundTotal(input), refunds.refundTotal(input)]);
    expect(outcomes.map((result) => result.outcome).toSorted()).toEqual(['already_applied', 'applied']);
    expect(requests).toHaveLength(2);
    expect(requests[0]?.idempotencyKey).toBe(requests[1]?.idempotencyKey);
    expect(db.value("SELECT count(*) AS value FROM payment_transactions WHERE type='refund'")).toBe(1);
    expect(db.value("SELECT count(*) AS value FROM inventory_movements WHERE reason='cancellation_restock'")).toBe(1);
    expect(db.value("SELECT count(*) AS value FROM audit_log WHERE action='payments.refunded'")).toBe(1);
  });

  it('bloquea el reembolso total antes de llamar al PSP si alguna unidad ya salió', async () => {
    const db = new SqliteD1();
    seedProduct(db);
    const paid = await paidOrder(db, 'R212-SHIPPED');
    const itemId = Number(db.value('SELECT id AS value FROM order_items WHERE order_id = ?', paid.id));
    db.sqlite.exec(`
      INSERT INTO fulfillments (
        order_id, status, carrier, tracking_number, idempotency_key,
        version, shipped_at, created_at, updated_at
      ) VALUES (${paid.id}, 'shipped', 'SEUR', 'R212-1',
        'r2:test:fulfillment:${paid.id}', 1, '${START}', '${START}', '${START}');
      INSERT INTO fulfillment_items (fulfillment_id, order_id, order_item_id, quantity, created_at)
      SELECT id, order_id, ${itemId}, 1, '${START}' FROM fulfillments WHERE order_id = ${paid.id};
    `);
    let calls = 0;
    const refunds = createRefundOperations(db.asD1(), () => gateway(async () => {
      calls += 1;
      return { providerReference: 'must-not-run', status: 'succeeded' };
    }), paid.emit);

    expect(await refunds.refundTotal({
      orderId: paid.id,
      reason: 'No debe reponer una unidad enviada',
      restock: true,
    })).toEqual({ outcome: 'invalid_state', queuedMessages: 0 });
    expect(calls).toBe(0);
    expect(db.value('SELECT count(*) AS value FROM refunds')).toBe(0);
    expect(db.value('SELECT status AS value FROM orders WHERE id = ?', paid.id)).toBe('paid');
  });
});
