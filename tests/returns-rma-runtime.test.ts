import { describe, expect, it } from 'vitest';
import { createFulfillmentOperations } from '../src/composition/fulfillment-operations';
import { createOrderOperations } from '../src/composition/order-operations';
import { createReturnOperations } from '../src/composition/return-operations';
import type { PaymentRefundGateway, RefundGatewayRequest } from '../src/modules/payments';
import { createEventFactory, createEventIdentityFactory } from '../src/shared-kernel/events';
import { SqliteD1 } from './sqlite-d1';

function runtime() {
  let tick = 0;
  const clock = { now: () => new Date(Date.parse('2026-08-14T08:00:00.000Z') + tick * 1000) };
  const ids = { next: () => `evt_rma_${++tick}` };
  return { emit: createEventFactory({ clock, ids }), reserve: createEventIdentityFactory({ clock, ids }) };
}

async function deliveredOrder(db: SqliteD1) {
  db.sqlite.exec(`
    INSERT INTO products (id, slug, name, price_cents, stock, category)
    VALUES (1, 'rma-product', 'Producto RMA', 1200, 5, 'test');
    INSERT INTO product_variants (id, product_id, sku, title, price_cents, status, is_default, option_signature)
    VALUES (1, 1, 'RMA-PRODUCT', '', 1200, 'active', 1, NULL);
    INSERT INTO inventory_balances (variant_id, on_hand, reserved, version)
    VALUES (1, 5, 0, 1);
    INSERT INTO inventory_movements (variant_id, delta, reason, balance_after, version_after,
      actor_kind, actor_id, reference_type, reference_id, idempotency_key, correlation_id, occurred_at)
    VALUES (1, 5, 'legacy_opening_balance', 5, 1, 'system', 'test', 'test', '1',
      'rma:opening', 'inventory:variant:1', '2026-08-14T07:00:00.000Z');
  `);
  const events = runtime();
  const orders = createOrderOperations(db.asD1(), events.emit, events.reserve);
  const placed = await orders.placeOrder({ order_number: 'R310-ORDER', email: 'private@example.com',
    customer_name: 'Persona privada', address_json: '{}', subtotal_cents: 2400,
    shipping_cents: 0, total_cents: 2400, stripe_session_id: 'sim_r310', currency: 'EUR' },
  [{ product_id: 1, name_snapshot: 'Producto RMA', unit_price_cents: 1200, qty: 2 }], 'simulated');
  await orders.confirmPayment({ lookup: { by: 'id', orderId: placed!.orderId },
    paymentIntent: 'sim_pi_r310', source: 'simulated' });
  const fulfillment = createFulfillmentOperations(db.asD1(), events.emit);
  const shipped = await fulfillment.ship({ orderId: placed!.orderId,
    tracking: { carrier: 'SEUR', number: 'R310' }, idempotencyKey: 'r310-ship-order' });
  await fulfillment.deliver(shipped.fulfillmentId!);
  return { orderId: placed!.orderId,
    orderItemId: Number(db.value('SELECT id AS value FROM order_items WHERE order_id=?', placed!.orderId)),
    emit: events.emit };
}

function successGateway(requests: RefundGatewayRequest[]): PaymentRefundGateway {
  return { provider: 'simulated', refund: async (request) => {
    requests.push(request);
    return { status: 'succeeded', providerReference: `return_ref_${request.idempotencyKey}` };
  } };
}

describe('runtime RMA R3.10', () => {
  it('cierra solicitud, recepción, inspección, reembolso y reposición una sola vez', async () => {
    const db = new SqliteD1(); const order = await deliveredOrder(db);
    const calls: RefundGatewayRequest[] = [];
    const operations = createReturnOperations(db.asD1(), () => successGateway(calls),
      order.emit, () => '2026-08-14T10:00:00.000Z');
    const locationId = Number(db.value("SELECT id AS value FROM inventory_locations WHERE code='principal'"));
    const created = await operations.create({ orderId: order.orderId, receiveLocationId: locationId,
      reason: 'not_as_expected', requestedByKind: 'admin', requestedById: 'admin-panel',
      idempotencyKey: 'r310:return:create:one', lines: [{ orderItemId: order.orderItemId, quantity: 1 }] });
    const id = created.detail!.request.id; const lineId = created.detail!.lines[0]!.id;
    expect((await operations.authorize(id, 1, 'r310:return:authorize:one')).outcome).toBe('applied');
    expect((await operations.markInTransit(id, 2, 'r310:return:transit:one')).outcome).toBe('applied');
    expect((await operations.receive(id, 3, 'r310:return:receive:one',
      [{ returnLineId: lineId, receivedQuantity: 1 }])).outcome).toBe('applied');
    expect((await operations.inspect(id, 4, 'r310:return:inspect:one',
      [{ returnLineId: lineId, inspection: 'restock', resolution: 'refund' }])).outcome).toBe('applied');
    const stockBefore = Number(db.value('SELECT on_hand AS value FROM inventory_balances WHERE variant_id=1'));
    const resolved = await operations.resolve(id, 5, 'r310:return:resolve:one');
    expect(resolved.outcome).toBe('applied');
    expect(await operations.resolve(id, 5, 'r310:return:resolve:one')).toMatchObject({ outcome: 'idempotent' });
    expect(calls).toHaveLength(1);
    expect(db.query('SELECT operation_type, status, total_cents FROM refunds')).toEqual([
      { operation_type: 'return', status: 'succeeded', total_cents: 1200 },
    ]);
    expect(db.value('SELECT on_hand AS value FROM inventory_balances WHERE variant_id=1')).toBe(stockBefore + 1);
    expect(db.value("SELECT count(*) AS value FROM inventory_movements WHERE reason='return_restock'" )).toBe(1);
    expect(db.value("SELECT count(*) AS value FROM event_outbox_events WHERE event_type='fulfillment.return_resolved'" )).toBe(1);
    expect(db.value('SELECT count(*) AS value FROM return_inventory_movements')).toBe(1);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('materializa un cambio pendiente sin llamar al PSP', async () => {
    const db = new SqliteD1(); const order = await deliveredOrder(db);
    const operations = createReturnOperations(db.asD1(), undefined, order.emit,
      () => '2026-08-14T10:00:00.000Z');
    const locationId = Number(db.value("SELECT id AS value FROM inventory_locations WHERE code='principal'"));
    const created = await operations.create({ orderId: order.orderId, receiveLocationId: locationId,
      reason: 'wrong_item', requestedByKind: 'admin', requestedById: 'admin-panel',
      idempotencyKey: 'r310:return:create:exchange', lines: [{ orderItemId: order.orderItemId, quantity: 1 }] });
    const id = created.detail!.request.id; const lineId = created.detail!.lines[0]!.id;
    await operations.authorize(id, 1, 'r310:return:authorize:exchange');
    await operations.receive(id, 2, 'r310:return:receive:exchange', [{ returnLineId: lineId, receivedQuantity: 1 }]);
    await operations.inspect(id, 3, 'r310:return:inspect:exchange', [{ returnLineId: lineId,
      inspection: 'damaged', resolution: 'exchange', exchangeVariantId: 1 }]);
    expect((await operations.resolve(id, 4, 'r310:return:resolve:exchange')).outcome).toBe('applied');
    expect(db.query('SELECT source_variant_id, exchange_variant_id, quantity, status FROM return_exchange_lines'))
      .toEqual([{ source_variant_id: 1, exchange_variant_id: 1, quantity: 1, status: 'pending' }]);
    expect(db.value('SELECT count(*) AS value FROM refunds')).toBe(0);
  });

  it('una carrera por la última unidad elegible deja un solo expediente', async () => {
    const db = new SqliteD1(); const order = await deliveredOrder(db);
    const locationId = Number(db.value("SELECT id AS value FROM inventory_locations WHERE code='principal'"));
    const first = createReturnOperations(db.asD1(), undefined, order.emit,
      () => '2026-08-14T10:00:00.000Z');
    const second = createReturnOperations(db.asD1(), undefined, order.emit,
      () => '2026-08-14T10:00:00.000Z');
    const draft = { orderId: order.orderId, receiveLocationId: locationId,
      reason: 'other' as const, requestedByKind: 'admin' as const, requestedById: 'admin-panel',
      lines: [{ orderItemId: order.orderItemId, quantity: 2 }] };
    const results = await Promise.all([
      first.create({ ...draft, idempotencyKey: 'r310:return:race:first' }),
      second.create({ ...draft, idempotencyKey: 'r310:return:race:second' }),
    ]);
    expect(results.map((result) => result.outcome).sort()).toEqual(['applied', 'conflict']);
    expect(db.value('SELECT count(*) AS value FROM return_requests')).toBe(1);
    expect(db.value('SELECT count(*) AS value FROM return_request_lines')).toBe(1);
    expect(db.value("SELECT count(*) AS value FROM audit_log WHERE action='fulfillment.return_created'" )).toBe(1);
  });
});
