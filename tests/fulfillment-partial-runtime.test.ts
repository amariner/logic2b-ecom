import { describe, expect, it } from 'vitest';
import { createFulfillmentOperations } from '../src/composition/fulfillment-operations';
import { dispatchEventOutbox } from '../src/composition/outbox-dispatcher';
import {
  createEventFactory,
  type EventClock,
  type EventIdSource,
} from '../src/shared-kernel/events';
import { SqliteD1 } from './sqlite-d1';

function runtime(start = '2026-08-11T16:00:00.000Z') {
  let tick = 0;
  const clock: EventClock = { now: () => new Date(Date.parse(start) + tick * 1000) };
  const ids: EventIdSource = { next: () => `evt_ful_${++tick}` };
  return createEventFactory({ clock, ids });
}

function seedPaidOrder(db: SqliteD1): void {
  db.sqlite.exec(`
    INSERT INTO products (id, slug, name, price_cents, stock, category)
    VALUES (1, 'aove', 'AOVE', 890, 8, 'aceites'),
           (2, 'miel', 'Miel', 750, 6, 'mieles');
    INSERT INTO product_variants (
      id, product_id, sku, title, price_cents, status, is_default, option_signature
    ) VALUES (1, 1, 'AOVE-DEFAULT', '', 890, 'active', 1, NULL),
             (2, 2, 'MIEL-DEFAULT', '', 750, 'active', 1, NULL);
    INSERT INTO inventory_balances (variant_id, on_hand, reserved, version)
    VALUES (1, 8, 0, 1), (2, 6, 0, 1);
    INSERT INTO orders (
      id, order_number, email, customer_name, address_json,
      subtotal_cents, shipping_cents, total_cents, status,
      stripe_session_id, stripe_payment_intent, currency
    ) VALUES (
      7, 'BM-R212-TEST', 'clienta@example.com', 'Marta Ferrer', '{}',
      3280, 0, 3280, 'paid', 'cs_r212', 'pi_r212', 'EUR'
    );
    INSERT INTO order_items (
      id, order_id, product_id, variant_id, name_snapshot, unit_price_cents, qty
    ) VALUES (71, 7, 1, 1, 'AOVE', 890, 2),
             (72, 7, 2, 2, 'Miel', 750, 2);
    INSERT INTO payments (
      order_id, provider, provider_reference, currency, expected_amount_cents,
      status, idempotency_key, created_at, updated_at
    ) VALUES (7, 'stripe', 'pi_r212', 'EUR', 3280, 'captured',
      'r2:payment:order:7:primary', '2026-08-11T15:00:00.000Z', '2026-08-11T15:00:00.000Z');
    INSERT INTO payment_transactions (
      payment_id, type, amount_cents, currency, status, provider_reference,
      idempotency_key, occurred_at, created_at
    ) SELECT id, 'capture', 3280, 'EUR', 'succeeded', 'pi_r212',
      'r2:payment:capture:order:7', '2026-08-11T15:00:00.000Z', '2026-08-11T15:00:00.000Z'
      FROM payments WHERE order_id = 7;
  `);
}

describe('R2.12 fulfillment parcial y múltiple', () => {
  it('deriva paid → shipped → delivered desde dos grupos y avisa por cada salida', async () => {
    const db = new SqliteD1();
    seedPaidOrder(db);
    const service = createFulfillmentOperations(db.asD1(), runtime());

    const first = await service.ship({
      orderId: 7,
      tracking: { carrier: 'SEUR', number: 'SEUR-1' },
      allocations: [{ order_item_id: 71, quantity: 1 }],
      idempotencyKey: 'shipment-first',
    });
    expect(first).toMatchObject({ outcome: 'applied', orderStatus: 'paid', remainingQuantity: 3 });
    expect(db.value('SELECT status AS value FROM orders WHERE id=7')).toBe('paid');
    expect(db.value('SELECT count(*) AS value FROM fulfillments WHERE order_id=7')).toBe(1);
    expect(db.value('SELECT sum(quantity) AS value FROM fulfillment_items WHERE order_id=7')).toBe(1);

    await dispatchEventOutbox(db.asD1(), {
      now: '2026-08-11T16:01:00.000Z', workerId: 'fulfillment-worker-1',
    });
    expect(db.value('SELECT count(*) AS value FROM emails_outbox')).toBe(1);
    const firstEmail = db.query<{ body_html: string }>('SELECT body_html FROM emails_outbox')[0]?.body_html ?? '';
    expect(firstEmail).toContain('AOVE × 1');
    expect(firstEmail).toContain('Quedan 3 unidades pendientes');
    expect(firstEmail).not.toContain('Miel × 2');

    const second = await service.ship({
      orderId: 7,
      tracking: { carrier: 'GLS', number: 'GLS-2' },
      allocations: [
        { order_item_id: 71, quantity: 1 },
        { order_item_id: 72, quantity: 2 },
      ],
      idempotencyKey: 'shipment-second',
    });
    expect(second).toMatchObject({ outcome: 'applied', orderStatus: 'shipped', remainingQuantity: 0 });
    expect(db.query('SELECT status, tracking_carrier, tracking_number FROM orders WHERE id=7'))
      .toEqual([{ status: 'shipped', tracking_carrier: null, tracking_number: null }]);
    expect(db.value('SELECT count(*) AS value FROM fulfillments WHERE order_id=7')).toBe(2);
    expect(db.value('SELECT sum(quantity) AS value FROM fulfillment_items WHERE order_id=7')).toBe(4);

    await dispatchEventOutbox(db.asD1(), {
      now: '2026-08-11T16:02:00.000Z', workerId: 'fulfillment-worker-2',
    });
    expect(db.value('SELECT count(*) AS value FROM emails_outbox')).toBe(2);

    const deliveredFirst = await service.deliver(first.fulfillmentId!);
    expect(deliveredFirst).toMatchObject({ outcome: 'applied', orderStatus: 'shipped' });
    expect(db.value('SELECT status AS value FROM orders WHERE id=7')).toBe('shipped');
    const deliveredSecond = await service.deliver(second.fulfillmentId!);
    expect(deliveredSecond).toMatchObject({ outcome: 'applied', orderStatus: 'delivered' });
    expect(db.value('SELECT status AS value FROM orders WHERE id=7')).toBe('delivered');
    expect(db.query('SELECT status, version FROM fulfillments ORDER BY id'))
      .toEqual([{ status: 'delivered', version: 2 }, { status: 'delivered', version: 2 }]);
    expect(db.query('SELECT from_status, to_status FROM order_events ORDER BY id'))
      .toEqual([
        { from_status: 'paid', to_status: 'shipped' },
        { from_status: 'shipped', to_status: 'delivered' },
      ]);
  });

  it('rechaza línea ajena y sobreasignación sin evidencia parcial', async () => {
    const db = new SqliteD1();
    seedPaidOrder(db);
    const service = createFulfillmentOperations(db.asD1(), runtime());
    await expect(service.ship({
      orderId: 7,
      tracking: { carrier: 'SEUR', number: 'BAD-1' },
      allocations: [{ order_item_id: 71, quantity: 3 }],
      idempotencyKey: 'shipment-too-many',
    })).rejects.toThrow(/cantidad pendiente/);
    await expect(service.ship({
      orderId: 7,
      tracking: { carrier: 'SEUR', number: 'BAD-2' },
      allocations: [{ order_item_id: 999, quantity: 1 }],
      idempotencyKey: 'shipment-wrong-line',
    })).rejects.toThrow(/no pertenece/);
    expect(db.value('SELECT count(*) AS value FROM fulfillments')).toBe(0);
    expect(db.value('SELECT count(*) AS value FROM event_outbox_events')).toBe(0);
    expect(db.value('SELECT count(*) AS value FROM audit_log')).toBe(0);
  });

  it('dos entregas concurrentes derivan el cierre global y un solo timeline', async () => {
    const db = new SqliteD1();
    seedPaidOrder(db);
    const service = createFulfillmentOperations(db.asD1(), runtime());
    const first = await service.ship({
      orderId: 7,
      tracking: { carrier: 'SEUR', number: 'DELIVERY-1' },
      allocations: [{ order_item_id: 71, quantity: 2 }],
      idempotencyKey: 'delivery-race-first',
    });
    const second = await service.ship({
      orderId: 7,
      tracking: { carrier: 'GLS', number: 'DELIVERY-2' },
      allocations: [{ order_item_id: 72, quantity: 2 }],
      idempotencyKey: 'delivery-race-second',
    });

    const delivered = await Promise.all([
      service.deliver(first.fulfillmentId!),
      service.deliver(second.fulfillmentId!),
    ]);
    expect(delivered.map((result) => result.outcome)).toEqual(['applied', 'applied']);
    expect(db.value('SELECT status AS value FROM orders WHERE id=7')).toBe('delivered');
    expect(db.value("SELECT count(*) AS value FROM order_events WHERE to_status='delivered'")).toBe(1);
    expect(db.value("SELECT count(*) AS value FROM event_outbox_events WHERE event_type='fulfillment.fulfillment_delivered'"))
      .toBe(2);
  });

  it('replay y carrera de la última cantidad nunca duplican grupo ni email', async () => {
    const db = new SqliteD1();
    seedPaidOrder(db);
    const service = createFulfillmentOperations(db.asD1(), runtime());
    const input = {
      orderId: 7,
      tracking: { carrier: 'SEUR', number: 'SAME-1' },
      allocations: [{ order_item_id: 71, quantity: 2 }, { order_item_id: 72, quantity: 2 }],
      idempotencyKey: 'shipment-same-key',
    } as const;
    const sameKey = await Promise.all([service.ship(input), service.ship(input)]);
    expect(sameKey.map((result) => result.outcome).sort()).toEqual(['applied', 'replayed']);
    expect(db.value('SELECT count(*) AS value FROM fulfillments')).toBe(1);
    expect(db.value("SELECT count(*) AS value FROM event_outbox_events WHERE event_type='fulfillment.fulfillment_shipped'")).toBe(1);
    await dispatchEventOutbox(db.asD1(), {
      now: '2026-08-11T16:03:00.000Z', workerId: 'fulfillment-worker-3',
    });
    expect(db.value('SELECT count(*) AS value FROM emails_outbox')).toBe(1);

    const secondDb = new SqliteD1();
    seedPaidOrder(secondDb);
    const secondService = createFulfillmentOperations(secondDb.asD1(), runtime());
    const races = await Promise.all([
      secondService.ship({ ...input, idempotencyKey: 'race-a' }),
      secondService.ship({ ...input, idempotencyKey: 'race-b' }),
    ]);
    expect(races.map((result) => result.outcome).sort()).toEqual(['applied', 'conflict']);
    expect(secondDb.value('SELECT count(*) AS value FROM fulfillments')).toBe(1);
    expect(secondDb.value('SELECT sum(quantity) AS value FROM fulfillment_items')).toBe(4);

    const partialDb = new SqliteD1();
    seedPaidOrder(partialDb);
    const partialService = createFulfillmentOperations(partialDb.asD1(), runtime());
    const partialRace = await Promise.all([
      partialService.ship({
        orderId: 7, tracking: { carrier: 'SEUR', number: 'PARTIAL-A' },
        allocations: [{ order_item_id: 71, quantity: 2 }], idempotencyKey: 'partial-race-a',
      }),
      partialService.ship({
        orderId: 7, tracking: { carrier: 'GLS', number: 'PARTIAL-B' },
        allocations: [{ order_item_id: 71, quantity: 2 }], idempotencyKey: 'partial-race-b',
      }),
    ]);
    expect(partialRace.map((result) => result.outcome).sort()).toEqual(['applied', 'conflict']);
    expect(partialDb.value('SELECT count(*) AS value FROM fulfillments')).toBe(1);
    expect(partialDb.value('SELECT sum(quantity) AS value FROM fulfillment_items WHERE order_item_id=71')).toBe(2);
    expect(partialDb.value('SELECT count(*) AS value FROM event_outbox_events')).toBe(1);
  });
});
