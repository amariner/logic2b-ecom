import { describe, expect, it } from 'vitest';
import { createFulfillmentOperations } from '../src/composition/fulfillment-operations';
import { createInventoryTransferOperations } from '../src/composition/inventory-transfer-operations';
import { createOrderHoldOperations } from '../src/composition/order-hold-operations';
import { createOrderOperations } from '../src/composition/order-operations';
import { createReturnOperations } from '../src/composition/return-operations';
import type { PaymentRefundGateway, RefundGatewayRequest } from '../src/modules/payments';
import { createD1BackupReader, exportBackup } from '../src/platform/operations';
import { createEventFactory, createEventIdentityFactory } from '../src/shared-kernel/events';
import { SqliteD1 } from './sqlite-d1';

const START = '2026-08-14T14:00:00.000Z';

function runtime() {
  let sequence = 0;
  const clock = { now: () => new Date(Date.parse(START) + sequence * 1000) };
  const ids = { next: () => `evt_r312_${++sequence}` };
  return {
    emit: createEventFactory({ clock, ids }),
    reserve: createEventIdentityFactory({ clock, ids }),
    now: () => new Date(Date.parse(START) + sequence * 1000).toISOString(),
    nextHoldId: () => `hold_r312_${sequence + 1}`,
  };
}

function seedInventory(db: SqliteD1): { primary: number; secondary: number } {
  db.sqlite.exec(`
    INSERT INTO products (id, slug, name, price_cents, stock, category, collection)
    VALUES (1, 'chaqueta-r312', 'Chaqueta R3.12', 1500, 8, 'ropa', 'test');
    INSERT INTO product_variants (
      id, product_id, sku, title, price_cents, status, is_default, option_signature
    ) VALUES (1, 1, 'JACKET-R312', '', 1500, 'active', 1, NULL);
    INSERT INTO inventory_balances (variant_id, on_hand, reserved, version, reservation_version)
    VALUES (1, 8, 0, 1, 1);
    INSERT INTO inventory_movements (
      variant_id, delta, reason, balance_after, version_after, actor_kind,
      actor_id, reference_type, reference_id, idempotency_key, correlation_id,
      occurred_at, created_at
    ) VALUES (1, 8, 'legacy_opening_balance', 8, 1, 'system', 'r312',
      'variant', '1', 'r312:opening', 'inventory:variant:1', '${START}', '${START}');
    INSERT INTO inventory_locations (
      code, name, kind, status, is_primary, timezone, created_at, updated_at
    ) VALUES ('norte', 'Almacén norte', 'warehouse', 'active', 0,
      'Europe/Madrid', '${START}', '${START}');
    UPDATE inventory_routing_policies SET priority=10, handling_cost_cents=25
      WHERE location_id=(SELECT id FROM inventory_locations WHERE code='norte');
  `);
  return {
    primary: Number(db.value("SELECT id AS value FROM inventory_locations WHERE code='principal'")),
    secondary: Number(db.value("SELECT id AS value FROM inventory_locations WHERE code='norte'")),
  };
}

function refundGateway(requests: RefundGatewayRequest[]): PaymentRefundGateway {
  return {
    provider: 'simulated',
    async refund(request) {
      requests.push(request);
      return { status: 'succeeded', providerReference: `sim_r312_${request.idempotencyKey}` };
    },
  };
}

describe('R3.12 consolidación operativa', () => {
  it('recorre transferencia → hold → asignación → entrega → RMA → restore', async () => {
    const db = new SqliteD1();
    const events = runtime();
    const locations = seedInventory(db);

    const transfers = createInventoryTransferOperations(db.asD1(), events.now);
    const transfer = await transfers.create({
      sourceLocationId: locations.primary,
      destinationLocationId: locations.secondary,
      lines: [{ variantId: 1, quantity: 3 }],
      idempotencyKey: 'r312:transfer:create',
    });
    expect(transfer.outcome).toBe('applied');
    const shippedTransfer = await transfers.ship(
      transfer.detail!.transfer.id, 1, 'r312:transfer:ship',
    );
    const transferLine = shippedTransfer.detail!.lines[0]!;
    expect((await transfers.receive(transfer.detail!.transfer.id, {
      expectedVersion: 2,
      lines: [{ transferLineId: transferLine.id, receivedQuantity: 3, discrepancyQuantity: 0 }],
      idempotencyKey: 'r312:transfer:receive',
    })).outcome).toBe('applied');
    expect(db.value(`SELECT on_hand AS value FROM inventory_location_balances
      WHERE location_id=? AND variant_id=1`, locations.secondary)).toBe(3);

    const orders = createOrderOperations(db.asD1(), events.emit, events.reserve, {
      reservationsEnabled: true,
      reservationTtlSeconds: 31 * 60,
    });
    const placed = await orders.placeOrder({
      order_number: 'R312-JOURNEY', email: 'private@example.com',
      customer_name: 'Persona privada', address_json: '{"country":"ES"}',
      subtotal_cents: 1500, shipping_cents: 0, total_cents: 1500,
      stripe_session_id: 'sim_r312_session', currency: 'EUR',
    }, [{ product_id: 1, name_snapshot: 'Chaqueta R3.12', unit_price_cents: 1500, qty: 1 }], 'simulated');
    expect(placed).not.toBeNull();
    await orders.confirmPayment({
      lookup: { by: 'id', orderId: placed!.orderId },
      paymentIntent: 'sim_r312_payment', source: 'simulated',
    });
    const orderItemId = Number(db.value(
      'SELECT id AS value FROM order_items WHERE order_id=?', placed!.orderId,
    ));

    const holds = createOrderHoldOperations(db.asD1(), events);
    const hold = await holds.create({
      orderId: placed!.orderId, source: 'automatic', reasonCode: 'inventory_issue',
      owner: { kind: 'system', id: 'routing-policy', label: 'Política de asignación' },
      dueAt: '2026-08-14T16:00:00.000Z', idempotencyKey: 'r312:hold:create',
    });
    const fulfillments = createFulfillmentOperations(db.asD1(), events.emit, { routingEnabled: true });
    expect(await fulfillments.ship({
      orderId: placed!.orderId,
      tracking: { carrier: 'GLS', number: 'R312-BLOCKED' },
      idempotencyKey: 'r312:fulfillment:blocked',
    })).toMatchObject({ outcome: 'conflict' });
    await holds.resolve({
      holdId: hold.hold!.id, expectedVersion: 1, resolutionCode: 'cleared',
    });

    const fulfillment = await fulfillments.ship({
      orderId: placed!.orderId,
      tracking: { carrier: 'GLS', number: 'R312-NORTH' },
      idempotencyKey: 'r312:fulfillment:ship',
    });
    expect(fulfillment).toMatchObject({ outcome: 'applied', orderStatus: 'shipped' });
    expect(db.query(`SELECT l.code, d.policy_version FROM inventory_allocation_decisions d
      JOIN inventory_locations l ON l.id=d.location_id`)).toEqual([
      { code: 'norte', policy_version: 1 },
    ]);
    expect(await fulfillments.deliver(fulfillment.fulfillmentId!)).toMatchObject({
      outcome: 'applied', orderStatus: 'delivered',
    });

    const gatewayRequests: RefundGatewayRequest[] = [];
    const returns = createReturnOperations(
      db.asD1(), () => refundGateway(gatewayRequests), events.emit, events.now,
    );
    const createdReturn = await returns.create({
      orderId: placed!.orderId, receiveLocationId: locations.secondary,
      reason: 'not_as_expected', requestedByKind: 'admin', requestedById: 'operations',
      idempotencyKey: 'r312:return:create',
      lines: [{ orderItemId, quantity: 1 }],
    });
    const returnId = createdReturn.detail!.request.id;
    const returnLineId = createdReturn.detail!.lines[0]!.id;
    await returns.authorize(returnId, 1, 'r312:return:authorize');
    await returns.markInTransit(returnId, 2, 'r312:return:transit');
    await returns.receive(returnId, 3, 'r312:return:receive', [
      { returnLineId, receivedQuantity: 1 },
    ]);
    await returns.inspect(returnId, 4, 'r312:return:inspect', [
      { returnLineId, inspection: 'restock', resolution: 'refund' },
    ]);
    expect(await returns.resolve(returnId, 5, 'r312:return:resolve')).toMatchObject({
      outcome: 'applied', detail: { request: { status: 'resolved' } },
    });
    expect(gatewayRequests).toEqual([
      expect.objectContaining({ amountCents: 1500, currency: 'EUR' }),
    ]);
    expect(db.query(`SELECT l.code, b.on_hand FROM inventory_location_balances b
      JOIN inventory_locations l ON l.id=b.location_id WHERE b.variant_id=1 ORDER BY l.id`))
      .toEqual([{ code: 'principal', on_hand: 5 }, { code: 'norte', on_hand: 3 }]);
    expect(db.value('SELECT count(*) AS value FROM return_inventory_movements')).toBe(1);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);

    const backup = await exportBackup(
      createD1BackupReader(db.asD1()), new Date('2026-08-14T17:00:00.000Z'),
    );
    expect(backup.sql).toContain('logic2b-backup-schema: 18');
    const restored = new SqliteD1();
    restored.sqlite.exec(backup.sql);
    expect(restored.query('SELECT status FROM orders')).toEqual([{ status: 'delivered' }]);
    expect(restored.query('SELECT status FROM return_requests')).toEqual([{ status: 'resolved' }]);
    expect(restored.value('SELECT count(*) AS value FROM inventory_allocation_decisions')).toBe(1);
    expect(restored.value('SELECT count(*) AS value FROM inventory_transfer_receipts')).toBe(1);
    expect(restored.query('PRAGMA foreign_key_check')).toEqual([]);
  });
});
