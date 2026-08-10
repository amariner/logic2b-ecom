import { describe, expect, it } from 'vitest';
import { createOrderOperations } from '../src/composition/order-operations';
import { dispatchEventOutbox } from '../src/composition/outbox-dispatcher';
import { createD1EventOutboxRepository } from '../src/platform/events';
import type { PlatformObservability } from '../src/platform/operations';
import {
  createEventFactory,
  createEventIdentityFactory,
  type EventClock,
  type EventIdSource,
} from '../src/shared-kernel/events';
import { SqliteD1 } from './sqlite-d1';

function eventRuntime(start = '2026-08-06T10:00:00.000Z') {
  let tick = 0;
  const clock: EventClock = { now: () => new Date(Date.parse(start) + tick * 1000) };
  const ids: EventIdSource = { next: () => `evt_${++tick}` };
  return { emit: createEventFactory({ clock, ids }), reserve: createEventIdentityFactory({ clock, ids }) };
}

function seedPendingOrder(db: SqliteD1): void {
  db.sqlite.exec(`
    INSERT INTO products (id, slug, name, price_cents, stock, category)
    VALUES (1, 'aove', 'AOVE', 890, 10, 'aceites');
    INSERT INTO product_variants (
      id, product_id, sku, title, price_cents, status, is_default, option_signature
    ) VALUES (1, 1, 'AOVE-DEFAULT', '', 890, 'active', 1, NULL);
    INSERT INTO inventory_balances (variant_id, on_hand, reserved, version)
    VALUES (1, 10, 0, 1);
    INSERT INTO inventory_movements (
      variant_id, delta, reason, balance_after, version_after, actor_kind,
      actor_id, reference_type, reference_id, idempotency_key, correlation_id, occurred_at
    ) VALUES (1, 10, 'legacy_opening_balance', 10, 1, 'system', 'test',
      'test', '1', 'test:opening:1', 'inventory:variant:1', '2026-08-08T10:00:00.000Z');
    INSERT INTO orders (
      id, order_number, email, customer_name, address_json,
      subtotal_cents, shipping_cents, total_cents, status, stripe_session_id
    ) VALUES (
      7, 'BM-260806-TEST', 'clienta@example.com', 'Marta Ferrer', '{}',
      1780, 490, 2270, 'pending', 'cs_test_1'
    );
    INSERT INTO order_items (order_id, product_id, variant_id, name_snapshot, unit_price_cents, qty)
    VALUES (7, 1, 1, 'AOVE', 890, 2);
  `);
}

function operations(db: SqliteD1) {
  const runtime = eventRuntime();
  return createOrderOperations(db.asD1(), runtime.emit, runtime.reserve);
}

describe('outbox transaccional R1.7 sobre SQL real', () => {
  it('crea pedido, líneas, timeline y hecho placed en una sola batch', async () => {
    const db = new SqliteD1();
    db.sqlite.exec(`
      INSERT INTO products (id, slug, name, price_cents, stock, category)
      VALUES (1, 'aove', 'AOVE', 890, 10, 'aceites');
      INSERT INTO product_variants (
        id, product_id, sku, title, price_cents, status, is_default, option_signature
      ) VALUES (1, 1, 'AOVE-DEFAULT', '', 890, 'active', 1, NULL);
      INSERT INTO inventory_balances (variant_id, on_hand, reserved, version)
      VALUES (1, 10, 0, 1);
      INSERT INTO inventory_movements (
        variant_id, delta, reason, balance_after, version_after, actor_kind,
        actor_id, reference_type, reference_id, idempotency_key, correlation_id, occurred_at
      ) VALUES (1, 10, 'legacy_opening_balance', 10, 1, 'system', 'test',
        'test', '1', 'test:opening:1', 'inventory:variant:1', '2026-08-08T10:00:00.000Z');
    `);
    const runtime = eventRuntime();
    const placed = await createOrderOperations(db.asD1(), runtime.emit, runtime.reserve).placeOrder(
      {
        order_number: 'BM-260806-PLACED',
        email: 'clienta@example.com',
        customer_name: 'Marta Ferrer',
        address_json: '{}',
        subtotal_cents: 890,
        shipping_cents: 0,
        total_cents: 890,
        stripe_session_id: 'cs_placed',
      },
      [{ product_id: 1, name_snapshot: 'AOVE', unit_price_cents: 890, qty: 1 }],
    );
    expect(placed?.orderId).toBe(1);
    expect(placed?.event.entity.id).toBe('1');
    expect(placed?.event.payload.order_id).toBe(1);
    expect(db.value('SELECT count(*) AS value FROM order_items')).toBe(1);
    expect(db.value('SELECT count(*) AS value FROM order_events')).toBe(1);
    expect(db.value("SELECT count(*) AS value FROM audit_log WHERE action='orders.created'")).toBe(1);
    const stored = db.query<{ entity_id: string; payload_json: string }>(
      'SELECT entity_id, payload_json FROM event_outbox_events',
    )[0];
    expect(stored?.entity_id).toBe('1');
    expect(JSON.parse(stored?.payload_json ?? '{}')).toMatchObject({ order_id: 1, to_status: 'pending' });
  });

  it('confirma negocio + evento + entrega en una batch y despacha una sola vez', async () => {
    const db = new SqliteD1();
    seedPendingOrder(db);
    const confirmed = await operations(db).confirmPayment({
      lookup: { by: 'session', stripeSessionId: 'cs_test_1' },
      paymentIntent: 'pi_1',
      source: 'stripe',
    });
    expect(confirmed).toBe(true);
    expect(db.value('SELECT stock AS value FROM products WHERE id=1')).toBe(8);
    expect(db.value('SELECT count(*) AS value FROM event_outbox_events')).toBe(1);
    const audit = db.query<{ action: string; diff_json: string; source_event_id: string }>(
      'SELECT action, diff_json, source_event_id FROM audit_log',
    )[0];
    expect(audit?.action).toBe('payments.confirmed');
    expect(audit?.source_event_id).toBeTruthy();
    expect(audit?.diff_json).toContain('[REDACTED]');
    expect(audit?.diff_json).not.toContain('pi_1');
    expect(db.value("SELECT count(*) AS value FROM event_outbox_deliveries WHERE status='pending'")).toBe(1);
    expect(db.value('SELECT count(*) AS value FROM emails_outbox')).toBe(0);

    const first = await dispatchEventOutbox(db.asD1(), {
      now: '2026-08-06T10:01:00.000Z',
      workerId: 'worker-a',
    });
    const second = await dispatchEventOutbox(db.asD1(), {
      now: '2026-08-06T10:02:00.000Z',
      workerId: 'worker-b',
    });
    expect(first).toEqual({ claimed: 1, delivered: 1, failed: 0 });
    expect(second).toEqual({ claimed: 0, delivered: 0, failed: 0 });
    expect(db.value('SELECT count(*) AS value FROM emails_outbox')).toBe(2);
    expect(db.value("SELECT count(*) AS value FROM event_outbox_deliveries WHERE status='delivered'")).toBe(1);
  });

  it('dos cobros solapados dejan un solo descuento, hecho y entrega', async () => {
    const db = new SqliteD1();
    seedPendingOrder(db);
    const service = operations(db);
    const input = { lookup: { by: 'session' as const, stripeSessionId: 'cs_test_1' }, paymentIntent: 'pi_1', source: 'stripe' as const };
    const results = await Promise.all([service.confirmPayment(input), service.confirmPayment(input)]);
    expect(results.toSorted()).toEqual([false, true]);
    expect(db.value('SELECT stock AS value FROM products WHERE id=1')).toBe(8);
    expect(db.value('SELECT count(*) AS value FROM event_outbox_events')).toBe(1);
    expect(db.value('SELECT count(*) AS value FROM event_outbox_deliveries')).toBe(1);
    expect(db.value('SELECT count(*) AS value FROM audit_log')).toBe(1);
  });

  it('stock insuficiente aborta cobro, pedido, evento y movimiento', async () => {
    const db = new SqliteD1();
    seedPendingOrder(db);
    db.sqlite.exec(`
      UPDATE products SET stock = 1 WHERE id = 1;
      UPDATE inventory_balances SET on_hand = 1 WHERE variant_id = 1;
      UPDATE inventory_movements
      SET delta = 1, balance_after = 1
      WHERE variant_id = 1 AND reason = 'legacy_opening_balance';
    `);
    await expect(operations(db).confirmPayment({
      lookup: { by: 'session', stripeSessionId: 'cs_test_1' },
      paymentIntent: 'pi_insufficient',
      source: 'stripe',
    })).rejects.toThrow(/disponibilidad negativa/);
    expect(db.value('SELECT status AS value FROM orders WHERE id = 7')).toBe('pending');
    expect(db.value('SELECT stock AS value FROM products WHERE id = 1')).toBe(1);
    expect(db.value('SELECT count(*) AS value FROM event_outbox_events')).toBe(0);
    expect(db.value("SELECT count(*) AS value FROM inventory_movements WHERE reason = 'sale'")).toBe(0);
  });

  it('dos expiraciones solapadas cancelan una vez y no crean entregas sin suscriptor', async () => {
    const db = new SqliteD1();
    seedPendingOrder(db);
    const service = operations(db);
    const results = await Promise.all([
      service.expirePayment({ stripeSessionId: 'cs_test_1', causationId: 'stripe-expired-1' }),
      service.expirePayment({ stripeSessionId: 'cs_test_1', causationId: 'stripe-expired-1' }),
    ]);
    expect(results.toSorted()).toEqual([false, true]);
    expect(db.value("SELECT count(*) AS value FROM orders WHERE status='cancelled'")).toBe(1);
    expect(db.value("SELECT count(*) AS value FROM event_outbox_events WHERE event_type='orders.order_cancelled'")).toBe(1);
    expect(db.value('SELECT count(*) AS value FROM event_outbox_deliveries')).toBe(0);
    expect(db.value('SELECT count(*) AS value FROM audit_log')).toBe(1);
    expect(db.value('SELECT stock AS value FROM products WHERE id=1')).toBe(10);
  });

  it('un fallo posterior revierte pedido, líneas, timeline y evento del alta', async () => {
    const db = new SqliteD1();
    const runtime = eventRuntime();
    await expect(createOrderOperations(db.asD1(), runtime.emit, runtime.reserve).placeOrder(
      {
        order_number: 'BM-260806-ROLLBACK',
        email: 'clienta@example.com',
        customer_name: 'Marta Ferrer',
        address_json: '{}',
        subtotal_cents: 890,
        shipping_cents: 0,
        total_cents: 890,
        stripe_session_id: 'cs_rollback',
      },
      [{ product_id: 999, name_snapshot: 'Inexistente', unit_price_cents: 890, qty: 1 }],
    )).rejects.toThrow(/constraint failed/i);
    expect(db.value('SELECT count(*) AS value FROM orders')).toBe(0);
    expect(db.value('SELECT count(*) AS value FROM order_events')).toBe(0);
    expect(db.value('SELECT count(*) AS value FROM event_outbox_events')).toBe(0);
    expect(db.value('SELECT count(*) AS value FROM audit_log')).toBe(0);
  });

  it('un consumidor desconocido reintenta con error redacted y muere en el octavo fallo', async () => {
    const db = new SqliteD1();
    seedPendingOrder(db);
    db.sqlite.exec(`
      INSERT INTO event_outbox_events (
        event_id, event_type, event_version, occurred_at,
        actor_kind, actor_id, entity_type, entity_id,
        correlation_id, causation_id, idempotency_key, payload_json, created_at
      ) VALUES (
        'evt_unknown', 'orders.order_paid', 1, '2026-08-06T10:00:00.000Z',
        'system', 'test', 'order', '7',
        'order:BM-260806-TEST', NULL, 'unknown:1', '{}', '2026-08-06T10:00:00.000Z'
      );
      INSERT INTO event_outbox_deliveries (
        event_id, consumer_id, status, attempt_count, available_at, created_at, updated_at
      ) VALUES (
        'evt_unknown', 'integrations', 'pending', 7,
        '2026-08-06T10:00:00.000Z', '2026-08-06T10:00:00.000Z', '2026-08-06T10:00:00.000Z'
      );
    `);
    const failures: Array<{ code: string; context: Record<string, unknown> }> = [];
    const observability: PlatformObservability = {
      metric: () => undefined,
      failure: (error, context) => failures.push({ code: error.code, context }),
    };
    const result = await dispatchEventOutbox(db.asD1(), {
      now: '2026-08-06T10:01:00.000Z',
      workerId: 'worker-dead',
      operationId: 'op_outbox_test',
      observability,
    });
    expect(result).toEqual({ claimed: 1, delivered: 0, failed: 1 });
    const delivery = db.query<{ status: string; attempt_count: number; last_error_message: string }>(
      'SELECT status, attempt_count, last_error_message FROM event_outbox_deliveries',
    )[0];
    expect(delivery).toMatchObject({ status: 'dead', attempt_count: 8 });
    expect(delivery?.last_error_message).not.toContain('clienta@example.com');
    expect(failures).toEqual([{
      code: 'outbox.unknown_consumer',
      context: {
        operation: 'outbox',
        operationId: 'op_outbox_test',
        correlationId: 'order:BM-260806-TEST',
        causationId: 'evt_unknown',
      },
    }]);

    const deliveryId = Number(db.value('SELECT id AS value FROM event_outbox_deliveries'));
    expect(await createD1EventOutboxRepository(db.asD1()).replayDead(
      deliveryId,
      '2026-08-06T11:00:00.000Z',
    )).toBe(true);
    expect(db.query<{ status: string; attempt_count: number; dead_at: string | null }>(
      'SELECT status, attempt_count, dead_at FROM event_outbox_deliveries',
    )[0]).toMatchObject({ status: 'pending', attempt_count: 0, dead_at: null });
  });

  it('recupera una lease vencida sin perder la fila', async () => {
    const db = new SqliteD1();
    seedPendingOrder(db);
    db.sqlite.exec(`
      INSERT INTO event_outbox_events (
        event_id, event_type, event_version, occurred_at,
        actor_kind, actor_id, entity_type, entity_id,
        correlation_id, causation_id, idempotency_key, payload_json, created_at
      ) VALUES (
        'evt_lease', 'orders.order_paid', 1, '2026-08-06T10:00:00.000Z',
        'system', 'test', 'order', '7',
        'order:BM-260806-TEST', NULL, 'lease:1', '{}', '2026-08-06T10:00:00.000Z'
      );
      INSERT INTO event_outbox_deliveries (
        event_id, consumer_id, status, attempt_count, available_at,
        claimed_at, claim_expires_at, claimed_by, created_at, updated_at
      ) VALUES (
        'evt_lease', 'notifications', 'processing', 1,
        '2026-08-06T10:00:00.000Z', '2026-08-06T10:00:00.000Z',
        '2026-08-06T10:01:00.000Z', 'worker-lost',
        '2026-08-06T10:00:00.000Z', '2026-08-06T10:00:00.000Z'
      );
    `);
    const result = await dispatchEventOutbox(db.asD1(), {
      now: '2026-08-06T10:02:00.000Z',
      workerId: 'worker-recovery',
    });
    expect(result).toEqual({ claimed: 1, delivered: 1, failed: 0 });
    expect(db.query<{ status: string; attempt_count: number }>(
      'SELECT status, attempt_count FROM event_outbox_deliveries',
    )[0]).toMatchObject({ status: 'delivered', attempt_count: 2 });
  });
});
