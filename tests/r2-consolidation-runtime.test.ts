import { describe, expect, it } from 'vitest';
import { createFulfillmentOperations } from '../src/composition/fulfillment-operations';
import { createOrderOperations } from '../src/composition/order-operations';
import { dispatchEventOutbox } from '../src/composition/outbox-dispatcher';
import { createRefundOperations } from '../src/composition/refund-operations';
import type { PaymentRefundGateway, RefundGatewayRequest } from '../src/modules/payments';
import { createD1BackupReader, exportBackup } from '../src/platform/operations';
import {
  createEventFactory,
  createEventIdentityFactory,
  type EventClock,
  type EventIdSource,
} from '../src/shared-kernel/events';
import { SqliteD1 } from './sqlite-d1';

const START = '2026-08-12T12:00:00.000Z';

function runtime(prefix: string) {
  let tick = 0;
  const clock: EventClock = { now: () => new Date(Date.parse(START) + tick * 1000) };
  const ids: EventIdSource = { next: () => `evt_${prefix}_${++tick}` };
  return {
    emit: createEventFactory({ clock, ids }),
    reserve: createEventIdentityFactory({ clock, ids }),
  };
}

function seedVariantProduct(db: SqliteD1, stock = 8): void {
  db.sqlite.exec(`
    INSERT INTO products (id, slug, name, price_cents, stock, category, collection)
    VALUES (1, 'chaqueta', 'Chaqueta', 1500, ${stock}, 'ropa', 'test');
    INSERT INTO product_options (id, product_id, name, position)
    VALUES (10, 1, 'Talla', 0);
    INSERT INTO product_option_values (id, option_id, value, position)
    VALUES (11, 10, 'M', 0), (12, 10, 'L', 1);
    INSERT INTO product_variants (
      id, product_id, sku, title, price_cents, status, is_default, option_signature
    ) VALUES
      (1, 1, 'JACKET-M', 'M', 1500, 'active', 1, '[11]'),
      (2, 1, 'JACKET-L', 'L', 1700, 'active', 0, '[12]');
    INSERT INTO product_variant_option_values (variant_id, product_id, option_id, option_value_id)
    VALUES (1, 1, 10, 11), (2, 1, 10, 12);
    INSERT INTO inventory_balances (variant_id, on_hand, reserved, version, reservation_version)
    VALUES (1, ${stock}, 0, 1, 1), (2, 5, 0, 1, 1);
    INSERT INTO inventory_movements (
      variant_id, delta, reason, balance_after, version_after, actor_kind,
      actor_id, reference_type, reference_id, idempotency_key, correlation_id, occurred_at
    ) VALUES
      (1, ${stock}, 'legacy_opening_balance', ${stock}, 1, 'system', 'r214',
       'variant', '1', 'r214:opening:1', 'inventory:variant:1', '${START}'),
      (2, 5, 'legacy_opening_balance', 5, 1, 'system', 'r214',
       'variant', '2', 'r214:opening:2', 'inventory:variant:2', '${START}');
  `);
}

function refundGateway(requests: RefundGatewayRequest[]): PaymentRefundGateway {
  return {
    provider: 'simulated',
    async refund(request) {
      requests.push(request);
      return {
        providerReference: `sim_ref_${request.idempotencyKey.replaceAll(':', '_')}`,
        status: 'succeeded',
      };
    },
  };
}

async function paidOrder(db: SqliteD1, prefix: string, quantity: number) {
  const events = runtime(prefix);
  const orders = createOrderOperations(db.asD1(), events.emit, events.reserve, {
    reservationsEnabled: true,
    reservationTtlSeconds: 31 * 60,
  });
  const orderNumber = `R214-${prefix}`;
  const subtotal = 1500 * quantity;
  const placed = await orders.placeOrder({
    order_number: orderNumber,
    email: 'private@example.com',
    customer_name: 'Persona privada',
    address_json: '{}',
    subtotal_cents: subtotal,
    shipping_cents: 490,
    total_cents: subtotal + 490,
    stripe_session_id: `sim_session_${prefix}`,
    currency: 'EUR',
  }, [{ product_id: 1, name_snapshot: 'Chaqueta · M', unit_price_cents: 1500, qty: quantity }], 'simulated');
  if (!placed) throw new Error('No se pudo crear el pedido de consolidación.');
  const paid = await orders.confirmPayment({
    lookup: { by: 'id', orderId: placed.orderId },
    paymentIntent: `sim_pi_${prefix}`,
    source: 'simulated',
  });
  if (!paid) throw new Error('No se pudo confirmar el pedido de consolidación.');
  const itemId = Number(db.value('SELECT id AS value FROM order_items WHERE order_id = ?', placed.orderId));
  return { orderId: placed.orderId, itemId, events };
}

describe('R2.14 consolidación del núcleo transaccional', () => {
  it('recorre variante → reserva → pago → dos envíos → reembolso parcial → entrega', async () => {
    const db = new SqliteD1();
    seedVariantProduct(db);
    const paid = await paidOrder(db, 'JOURNEY', 4);

    expect(db.query('SELECT status FROM inventory_reservations')).toEqual([{ status: 'consumed' }]);
    expect(db.query('SELECT variant_id, on_hand, reserved FROM inventory_balances ORDER BY variant_id')).toEqual([
      { variant_id: 1, on_hand: 4, reserved: 0 },
      { variant_id: 2, on_hand: 5, reserved: 0 },
    ]);
    expect(db.query('SELECT variant_id, sku_snapshot, variant_name_snapshot FROM order_items')).toEqual([
      { variant_id: 1, sku_snapshot: 'JACKET-M', variant_name_snapshot: 'M' },
    ]);

    const fulfillment = createFulfillmentOperations(db.asD1(), paid.events.emit);
    const first = await fulfillment.ship({
      orderId: paid.orderId,
      tracking: { carrier: 'SEUR', number: 'R214-ONE' },
      allocations: [{ order_item_id: paid.itemId, quantity: 1 }],
      idempotencyKey: 'r214-first-shipment',
    });
    const second = await fulfillment.ship({
      orderId: paid.orderId,
      tracking: { carrier: 'GLS', number: 'R214-TWO' },
      allocations: [{ order_item_id: paid.itemId, quantity: 1 }],
      idempotencyKey: 'r214-second-shipment',
    });
    expect([first, second]).toEqual([
      expect.objectContaining({ outcome: 'applied', remainingQuantity: 3 }),
      expect.objectContaining({ outcome: 'applied', remainingQuantity: 2 }),
    ]);

    const gatewayRequests: RefundGatewayRequest[] = [];
    const refunds = createRefundOperations(
      db.asD1(), () => refundGateway(gatewayRequests), paid.events.emit, 'merchandise-only',
    );
    expect(await refunds.refundPartial({
      orderId: paid.orderId,
      reason: 'Cancelar las unidades pendientes',
      restock: true,
      idempotencyKey: '14141414-1414-4414-8414-141414141414',
      lines: [{ order_item_id: paid.itemId, quantity: 2 }],
    })).toMatchObject({ outcome: 'applied' });
    expect(gatewayRequests).toEqual([
      expect.objectContaining({ amountCents: 3000, currency: 'EUR' }),
    ]);
    expect(db.value('SELECT status AS value FROM orders WHERE id = ?', paid.orderId)).toBe('shipped');
    expect(db.value('SELECT status AS value FROM payments WHERE order_id = ?', paid.orderId)).toBe('partially_refunded');

    expect(await fulfillment.deliver(first.fulfillmentId!)).toMatchObject({ outcome: 'applied', orderStatus: 'shipped' });
    expect(await fulfillment.deliver(second.fulfillmentId!)).toMatchObject({ outcome: 'applied', orderStatus: 'delivered' });
    expect(db.query('SELECT status FROM fulfillments ORDER BY id')).toEqual([
      { status: 'delivered' }, { status: 'delivered' },
    ]);
    expect(db.query('SELECT on_hand, reserved FROM inventory_balances WHERE variant_id = 1')).toEqual([
      { on_hand: 6, reserved: 0 },
    ]);
    expect(db.value('SELECT stock AS value FROM products WHERE id = 1')).toBe(6);
    expect(db.value('SELECT count(*) AS value FROM payment_transactions')).toBe(2);
    expect(db.value('SELECT quantity AS value FROM refund_items')).toBe(2);
    expect(db.value('SELECT count(*) AS value FROM fulfillments')).toBe(2);
    expect(db.value('SELECT sum(quantity) AS value FROM fulfillment_items')).toBe(2);

    const dispatched = await dispatchEventOutbox(db.asD1(), {
      now: '2026-08-12T13:00:00.000Z',
      workerId: 'r214-consolidation-worker',
    });
    expect(dispatched).toMatchObject({ failed: 0 });
    expect(db.value('SELECT count(*) AS value FROM emails_outbox')).toBe(5);
    expect(db.value('SELECT count(*) AS value FROM audit_log')).toBe(7);
    expect(db.value('SELECT count(*) AS value FROM event_outbox_events')).toBe(7);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);

    const backup = await exportBackup(createD1BackupReader(db.asD1()), new Date('2026-08-12T13:05:00.000Z'));
    const restored = new SqliteD1();
    restored.sqlite.exec(backup.sql);
    expect(restored.query('SELECT status FROM orders')).toEqual([{ status: 'delivered' }]);
    expect(restored.value('SELECT count(*) AS value FROM fulfillments')).toBe(2);
    expect(restored.value('SELECT quantity AS value FROM refund_items')).toBe(2);
    expect(restored.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('repite carga concurrente refund/fulfillment sin sobrecomprometer unidades', async () => {
    const rounds = 16;
    const results = await Promise.all(Array.from({ length: rounds }, async (_, index) => {
      const db = new SqliteD1();
      seedVariantProduct(db, 1);
      const paid = await paidOrder(db, `RACE-${index}`, 1);
      const gatewayRequests: RefundGatewayRequest[] = [];
      const refunds = createRefundOperations(
        db.asD1(), () => refundGateway(gatewayRequests), paid.events.emit, 'merchandise-only',
      );
      const fulfillment = createFulfillmentOperations(db.asD1(), paid.events.emit);
      const [refund, shipment] = await Promise.all([
        refunds.refundPartial({
          orderId: paid.orderId,
          reason: 'Carga concurrente',
          restock: false,
          idempotencyKey: `${String(index + 1).padStart(8, '0')}-1414-4414-8414-141414141414`,
          lines: [{ order_item_id: paid.itemId, quantity: 1 }],
        }),
        fulfillment.ship({
          orderId: paid.orderId,
          tracking: { carrier: 'SEUR', number: `R214-RACE-${index}` },
          allocations: [{ order_item_id: paid.itemId, quantity: 1 }],
          idempotencyKey: `r214-race-${index}`,
        }),
      ]);
      const committed = Number(db.value(`
        SELECT
          COALESCE((SELECT sum(ri.quantity) FROM refund_items ri
                    JOIN refunds r ON r.id = ri.refund_id WHERE r.status <> 'cancelled'), 0)
          + COALESCE((SELECT sum(quantity) FROM fulfillment_items), 0) AS value
      `));
      return {
        winners: [refund.outcome, shipment.outcome].filter((outcome) => outcome === 'applied').length,
        committed,
        gatewayCalls: gatewayRequests.length,
        foreignKeys: db.query('PRAGMA foreign_key_check').length,
      };
    }));

    expect(results).toHaveLength(rounds);
    expect(results.every((result) => result.winners === 1)).toBe(true);
    expect(results.every((result) => result.committed === 1)).toBe(true);
    expect(results.every((result) => result.gatewayCalls <= 1)).toBe(true);
    expect(results.every((result) => result.foreignKeys === 0)).toBe(true);
  }, 20_000);
});
