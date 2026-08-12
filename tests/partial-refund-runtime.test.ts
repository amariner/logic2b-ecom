import { describe, expect, it } from 'vitest';
import { createFulfillmentOperations } from '../src/composition/fulfillment-operations';
import { createOrderOperations } from '../src/composition/order-operations';
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

const START = '2026-08-12T08:00:00.000Z';

function eventRuntime() {
  let tick = 0;
  const clock: EventClock = { now: () => new Date(Date.parse(START) + tick * 1000) };
  const ids: EventIdSource = { next: () => `evt_partial_refund_${++tick}` };
  return {
    emit: createEventFactory({ clock, ids }),
    reserve: createEventIdentityFactory({ clock, ids }),
  };
}

function seedProduct(db: SqliteD1): void {
  db.sqlite.exec(`
    INSERT INTO products (id, slug, name, price_cents, stock, category)
    VALUES (1, 'producto', 'Producto', 1500, 10, 'test');
    INSERT INTO product_variants (
      id, product_id, sku, title, price_cents, status, is_default, option_signature
    ) VALUES (1, 1, 'PRODUCT-1', '', 1500, 'active', 1, NULL);
    INSERT INTO inventory_balances (variant_id, on_hand, reserved, version)
    VALUES (1, 10, 0, 1);
    INSERT INTO inventory_movements (
      variant_id, delta, reason, balance_after, version_after, actor_kind,
      actor_id, reference_type, reference_id, idempotency_key, correlation_id, occurred_at
    ) VALUES (1, 10, 'legacy_opening_balance', 10, 1, 'system', 'test',
      'test', '1', 'partial-refund:test:opening', 'inventory:variant:1', '${START}');
  `);
}

async function paidOrder(db: SqliteD1, number: string) {
  const events = eventRuntime();
  const orders = createOrderOperations(db.asD1(), events.emit, events.reserve);
  const placed = await orders.placeOrder({
    order_number: number,
    email: 'private@example.com',
    customer_name: 'Persona privada',
    address_json: '{}',
    subtotal_cents: 4500,
    shipping_cents: 490,
    total_cents: 4990,
    stripe_session_id: `sim_session_${number}`,
    currency: 'EUR',
  }, [{ product_id: 1, name_snapshot: 'Producto', unit_price_cents: 1500, qty: 3 }], 'simulated');
  await orders.confirmPayment({
    lookup: { by: 'id', orderId: placed!.orderId },
    paymentIntent: `sim_pi_${number}`,
    source: 'simulated',
  });
  const itemId = Number(db.value(
    'SELECT id AS value FROM order_items WHERE order_id = ?',
    placed!.orderId,
  ));
  return { id: placed!.orderId, itemId, events };
}

function gateway(
  handler: (request: RefundGatewayRequest) => Promise<RefundGatewayResult>,
): PaymentRefundGateway {
  return { provider: 'simulated', refund: handler };
}

function successGateway(requests: RefundGatewayRequest[]): PaymentRefundGateway {
  return gateway(async (request) => {
    requests.push(request);
    return {
      providerReference: `sim_ref_${request.idempotencyKey.replaceAll(':', '_')}`,
      status: 'succeeded',
    };
  });
}

describe('R2.13 cancelación y reembolso parcial', () => {
  it('cancela solo unidades no enviadas y cierra dinero, stock, evento, auditoría y aviso', async () => {
    const db = new SqliteD1();
    seedProduct(db);
    const paid = await paidOrder(db, 'R213-PARTIAL');
    await createFulfillmentOperations(db.asD1(), paid.events.emit).ship({
      orderId: paid.id,
      tracking: { carrier: 'SEUR', number: 'R213-1' },
      allocations: [{ order_item_id: paid.itemId, quantity: 1 }],
      idempotencyKey: 'r213-shipment-one',
    });
    const requests: RefundGatewayRequest[] = [];
    const refunds = createRefundOperations(
      db.asD1(), () => successGateway(requests), paid.events.emit, 'merchandise-only',
    );

    expect(await refunds.refundPartial({
      orderId: paid.id,
      reason: 'Una unidad ya no está disponible',
      restock: true,
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
      lines: [{ order_item_id: paid.itemId, quantity: 1 }],
    })).toMatchObject({ outcome: 'applied', queuedMessages: 1 });

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ amountCents: 1500, currency: 'EUR' });
    expect(db.query(`
      SELECT operation_type, status, subtotal_cents, shipping_cents, total_cents
      FROM refunds
    `)).toEqual([{
      operation_type: 'partial_cancellation',
      status: 'succeeded', subtotal_cents: 1500, shipping_cents: 0, total_cents: 1500,
    }]);
    expect(db.value('SELECT status AS value FROM payments')).toBe('partially_refunded');
    expect(db.value('SELECT status AS value FROM orders')).toBe('paid');
    expect(db.value('SELECT stock AS value FROM products')).toBe(8);
    expect(db.value("SELECT count(*) AS value FROM inventory_movements WHERE reason='cancellation_restock'")).toBe(1);
    expect(db.value("SELECT count(*) AS value FROM audit_log WHERE action='payments.partially_refunded'")).toBe(1);
    expect(db.value("SELECT count(*) AS value FROM event_outbox_events WHERE event_type='orders.order_partially_refunded'")).toBe(1);
    expect(db.value(`
      SELECT count(*) AS value FROM event_outbox_deliveries d
      JOIN event_outbox_events e ON e.event_id=d.event_id
      WHERE e.event_type='orders.order_partially_refunded'
        AND d.consumer_id='notifications' AND d.status='pending'
    `)).toBe(1);
    expect(await (await import('../src/modules/fulfillment')).createD1FulfillmentLedger(
      db.asD1(),
    ).lineBalances(paid.id)).toEqual([{
      order_item_id: paid.itemId,
      ordered_quantity: 3,
      cancelled_quantity: 1,
      fulfilled_quantity: 1,
    }]);
  });

  it('proyecta shipped al cancelar todo lo pendiente tras una salida', async () => {
    const db = new SqliteD1();
    seedProduct(db);
    const paid = await paidOrder(db, 'R213-SHIPPED');
    await createFulfillmentOperations(db.asD1(), paid.events.emit).ship({
      orderId: paid.id,
      tracking: { carrier: 'GLS', number: 'R213-SHIPPED' },
      allocations: [{ order_item_id: paid.itemId, quantity: 1 }],
      idempotencyKey: 'r213-shipped-one',
    });
    const refunds = createRefundOperations(
      db.asD1(), () => successGateway([]), paid.events.emit, 'merchandise-only',
    );
    expect(await refunds.refundPartial({
      orderId: paid.id,
      reason: 'Cancelar el resto',
      restock: true,
      idempotencyKey: '22222222-2222-4222-8222-222222222222',
      lines: [{ order_item_id: paid.itemId, quantity: 2 }],
    })).toMatchObject({ outcome: 'applied' });
    expect(db.value('SELECT status AS value FROM orders')).toBe('shipped');
    expect(db.value('SELECT status AS value FROM payments')).toBe('partially_refunded');
    expect(db.value('SELECT shipping_cents AS value FROM refunds')).toBe(0);
  });

  it('mantiene la política A configurable y cancela el pedido aunque conserve el envío', async () => {
    const db = new SqliteD1();
    seedProduct(db);
    const paid = await paidOrder(db, 'R213-POLICY-A');
    const refunds = createRefundOperations(
      db.asD1(), () => successGateway([]), paid.events.emit, 'merchandise-only',
    );
    expect(await refunds.refundPartial({
      orderId: paid.id,
      reason: 'Cancelar mercancía',
      restock: true,
      idempotencyKey: '33333333-3333-4333-8333-333333333333',
      lines: [{ order_item_id: paid.itemId, quantity: 3 }],
    })).toMatchObject({ outcome: 'applied' });
    expect(db.value('SELECT status AS value FROM orders')).toBe('cancelled');
    expect(db.value('SELECT status AS value FROM payments')).toBe('partially_refunded');
    expect(db.query('SELECT subtotal_cents, shipping_cents, total_cents FROM refunds')).toEqual([
      { subtotal_cents: 4500, shipping_cents: 0, total_cents: 4500 },
    ]);
  });

  it('permite al propietario devolver el envío completo solo en la cancelación final sin salida', async () => {
    const db = new SqliteD1();
    seedProduct(db);
    const paid = await paidOrder(db, 'R213-POLICY-B');
    const requests: RefundGatewayRequest[] = [];
    const refunds = createRefundOperations(
      db.asD1(), () => successGateway(requests), paid.events.emit,
      'full-on-final-cancellation',
    );
    expect(await refunds.refundPartial({
      orderId: paid.id,
      reason: 'Cancelar todo',
      restock: false,
      idempotencyKey: '44444444-4444-4444-8444-444444444444',
      lines: [{ order_item_id: paid.itemId, quantity: 3 }],
    })).toMatchObject({ outcome: 'applied' });
    expect(requests[0]?.amountCents).toBe(4990);
    expect(db.value('SELECT shipping_cents AS value FROM refunds')).toBe(490);
    expect(db.value('SELECT status AS value FROM payments')).toBe('refunded');
    expect(db.value('SELECT status AS value FROM orders')).toBe('cancelled');
  });

  it('dos claves que compiten por la misma unidad llaman al PSP una sola vez', async () => {
    const db = new SqliteD1();
    seedProduct(db);
    const paid = await paidOrder(db, 'R213-QUANTITY-RACE');
    const requests: RefundGatewayRequest[] = [];
    const refunds = createRefundOperations(
      db.asD1(), () => successGateway(requests), paid.events.emit, 'merchandise-only',
    );
    const base = {
      orderId: paid.id,
      reason: 'Carrera',
      restock: true,
      lines: [{ order_item_id: paid.itemId, quantity: 3 }],
    } as const;
    const outcomes = await Promise.all([
      refunds.refundPartial({ ...base, idempotencyKey: '55555555-5555-4555-8555-555555555555' }),
      refunds.refundPartial({ ...base, idempotencyKey: '66666666-6666-4666-8666-666666666666' }),
    ]);
    expect(outcomes.map((result) => result.outcome).toSorted()).toEqual(['applied', 'conflict']);
    expect(requests).toHaveLength(1);
    expect(db.value("SELECT count(*) AS value FROM refunds WHERE status='succeeded'")).toBe(1);
    expect(db.value("SELECT count(*) AS value FROM payment_transactions WHERE type='refund'")).toBe(1);
  });

  it('replay concurrente comparte clave PSP y materializa un solo asiento/movimiento', async () => {
    const db = new SqliteD1();
    seedProduct(db);
    const paid = await paidOrder(db, 'R213-IDEMPOTENCY');
    const requests: RefundGatewayRequest[] = [];
    let release: (() => void) | undefined;
    const both = new Promise<void>((resolve) => { release = resolve; });
    const refundGateway = gateway(async (request) => {
      requests.push(request);
      if (requests.length === 2) release?.();
      await both;
      return { providerReference: 'sim_partial_same', status: 'succeeded' };
    });
    const refunds = createRefundOperations(
      db.asD1(), () => refundGateway, paid.events.emit, 'merchandise-only',
    );
    const input = {
      orderId: paid.id,
      reason: 'Replay',
      restock: true,
      idempotencyKey: '77777777-7777-4777-8777-777777777777',
      lines: [{ order_item_id: paid.itemId, quantity: 1 }],
    } as const;
    const outcomes = await Promise.all([refunds.refundPartial(input), refunds.refundPartial(input)]);
    expect(outcomes.map((result) => result.outcome).toSorted()).toEqual(['already_applied', 'applied']);
    expect(requests).toHaveLength(2);
    expect(requests[0]?.idempotencyKey).toBe(requests[1]?.idempotencyKey);
    expect(db.value("SELECT count(*) AS value FROM payment_transactions WHERE type='refund'")).toBe(1);
    expect(db.value("SELECT count(*) AS value FROM inventory_movements WHERE reason='cancellation_restock'")).toBe(1);
  });

  it('la carrera fulfillment/reembolso nunca compromete la misma unidad dos veces', async () => {
    const db = new SqliteD1();
    seedProduct(db);
    const paid = await paidOrder(db, 'R213-FULFILLMENT-RACE');
    const requests: RefundGatewayRequest[] = [];
    const refunds = createRefundOperations(
      db.asD1(), () => successGateway(requests), paid.events.emit, 'merchandise-only',
    );
    const fulfillment = createFulfillmentOperations(db.asD1(), paid.events.emit);
    const [refundOutcome, fulfillmentOutcome] = await Promise.all([
      refunds.refundPartial({
        orderId: paid.id,
        reason: 'Carrera con almacén',
        restock: true,
        idempotencyKey: '88888888-8888-4888-8888-888888888888',
        lines: [{ order_item_id: paid.itemId, quantity: 3 }],
      }),
      fulfillment.ship({
        orderId: paid.id,
        tracking: { carrier: 'SEUR', number: 'RACE-R213' },
        allocations: [{ order_item_id: paid.itemId, quantity: 3 }],
        idempotencyKey: 'r213-race-fulfillment',
      }),
    ]);
    expect([refundOutcome.outcome, fulfillmentOutcome.outcome].filter(
      (outcome) => outcome === 'applied',
    )).toHaveLength(1);
    const committed = Number(db.value(`
      SELECT
        COALESCE((SELECT sum(quantity) FROM refund_items ri JOIN refunds r ON r.id=ri.refund_id
                  WHERE r.status <> 'cancelled'), 0)
        + COALESCE((SELECT sum(quantity) FROM fulfillment_items), 0) AS value
    `));
    expect(committed).toBe(3);
    expect(requests.length).toBeLessThanOrEqual(1);
  });
});
