import { describe, expect, it } from 'vitest';
import { createOrderOperations } from '../src/composition/order-operations';
import { createPlatform } from '../src/composition/create-platform';
import { runScheduledPlatformJobs, type ScheduledJobEnv } from '../src/composition/job-runner';
import { createD1InventoryReservations } from '../src/modules/inventory';
import { createPresetManifest } from '../src/platform/configuration';
import {
  createEventFactory,
  createEventIdentityFactory,
  type EventClock,
  type EventIdSource,
} from '../src/shared-kernel/events';
import { SqliteD1 } from './sqlite-d1';

const START = '2026-08-10T10:00:00.000Z';

function eventRuntime() {
  let tick = 0;
  const clock: EventClock = { now: () => new Date(Date.parse(START) + tick * 1000) };
  const ids: EventIdSource = { next: () => `evt_reservation_${++tick}` };
  return { emit: createEventFactory({ clock, ids }), reserve: createEventIdentityFactory({ clock, ids }) };
}

function seedUnit(db: SqliteD1, stock = 1): void {
  db.sqlite.exec(`
    INSERT INTO products (id, slug, name, price_cents, stock, category)
    VALUES (1, 'ultima-unidad', 'Última unidad', 1500, ${stock}, 'test');
    INSERT INTO product_variants (
      id, product_id, sku, title, price_cents, status, is_default, option_signature
    ) VALUES (1, 1, 'LAST-1', '', 1500, 'active', 1, NULL);
    INSERT INTO inventory_balances (variant_id, on_hand, reserved, version, reservation_version)
    VALUES (1, ${stock}, 0, 1, 1);
    INSERT INTO inventory_movements (
      variant_id, delta, reason, balance_after, version_after, actor_kind,
      actor_id, reference_type, reference_id, idempotency_key, correlation_id, occurred_at
    ) VALUES (1, ${stock}, 'legacy_opening_balance', ${stock}, 1, 'system', 'test',
      'test', '1', 'reservation:test:opening', 'inventory:variant:1', '${START}');
  `);
}

function service(db: SqliteD1) {
  const runtime = eventRuntime();
  return createOrderOperations(db.asD1(), runtime.emit, runtime.reserve, {
    reservationsEnabled: true,
    reservationTtlSeconds: 31 * 60,
  });
}

function order(number: string, session: string) {
  return {
    order_number: number,
    email: 'private@example.com',
    customer_name: 'Persona privada',
    address_json: '{}',
    subtotal_cents: 1500,
    shipping_cents: 0,
    total_cents: 1500,
    stripe_session_id: session,
    currency: 'EUR',
  };
}

const line = [{ product_id: 1, name_snapshot: 'Última unidad', unit_price_cents: 1500, qty: 1 }] as const;

describe('reservas de inventario R2.8', () => {
  it('reserva al crear pedido y consume hold + on_hand en una sola confirmación', async () => {
    const db = new SqliteD1();
    seedUnit(db, 2);
    const orders = service(db);
    const placed = await orders.placeOrder(order('R2-8-CONSUME', 'cs_consume'), line, 'stripe');
    expect(placed).not.toBeNull();
    expect(db.query('SELECT on_hand, reserved, version, reservation_version FROM inventory_balances')).toEqual([
      { on_hand: 2, reserved: 1, version: 1, reservation_version: 2 },
    ]);
    expect(db.value('SELECT stock AS value FROM products WHERE id = 1')).toBe(2);
    expect(db.value("SELECT count(*) AS value FROM inventory_reservations WHERE status='active'")).toBe(1);

    expect(await orders.confirmPayment({
      lookup: { by: 'session', stripeSessionId: 'cs_consume' },
      paymentIntent: 'pi_consume',
      source: 'stripe',
    })).toBe(true);
    expect(db.query('SELECT on_hand, reserved, version, reservation_version FROM inventory_balances')).toEqual([
      { on_hand: 1, reserved: 0, version: 2, reservation_version: 3 },
    ]);
    expect(db.value('SELECT stock AS value FROM products WHERE id = 1')).toBe(1);
    expect(db.value("SELECT count(*) AS value FROM inventory_reservations WHERE status='consumed'")).toBe(1);
    expect(db.value("SELECT count(*) AS value FROM inventory_movements WHERE reason='sale'")).toBe(1);

    expect(await orders.confirmPayment({
      lookup: { by: 'session', stripeSessionId: 'cs_consume' },
      paymentIntent: 'pi_consume',
      source: 'stripe',
    })).toBe(false);
    expect(db.value("SELECT count(*) AS value FROM inventory_movements WHERE reason='sale'")).toBe(1);
  });

  it('la carrera por la última unidad deja un pedido y una reserva, nunca sobreventa', async () => {
    const db = new SqliteD1();
    seedUnit(db);
    const orders = service(db);
    const results = await Promise.allSettled([
      orders.placeOrder(order('R2-8-RACE-A', 'cs_race_a'), line, 'stripe'),
      orders.placeOrder(order('R2-8-RACE-B', 'cs_race_b'), line, 'stripe'),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(db.value('SELECT count(*) AS value FROM orders')).toBe(1);
    expect(db.value("SELECT count(*) AS value FROM inventory_reservations WHERE status='active'")).toBe(1);
    expect(db.value('SELECT reserved AS value FROM inventory_balances')).toBe(1);
    expect(db.value('SELECT on_hand AS value FROM inventory_balances')).toBe(1);
    expect(db.value('SELECT count(*) AS value FROM inventory_reservation_balance_events')).toBe(1);
  });

  it('el job expira por TTL una vez y libera reserved sin tocar on_hand', async () => {
    const db = new SqliteD1();
    seedUnit(db);
    await service(db).placeOrder(order('R2-8-EXPIRE', 'cs_expire'), line, 'stripe');
    const reservations = createD1InventoryReservations(db.asD1());
    expect(await reservations.expireDue('2026-08-10T10:30:59.000Z')).toBe(0);
    expect(await reservations.expireDue('2026-08-10T10:32:00.000Z')).toBe(1);
    expect(await reservations.expireDue('2026-08-10T10:33:00.000Z')).toBe(0);
    expect(db.query('SELECT on_hand, reserved, version, reservation_version FROM inventory_balances')).toEqual([
      { on_hand: 1, reserved: 0, version: 1, reservation_version: 3 },
    ]);
    expect(db.value("SELECT count(*) AS value FROM inventory_reservations WHERE status='expired'")).toBe(1);
    expect(db.value("SELECT count(*) AS value FROM inventory_reservation_events WHERE transition='expired'")).toBe(1);
    expect(db.value("SELECT count(*) AS value FROM inventory_movements WHERE reason='sale'")).toBe(0);
  });

  it('no persiste PII en cabeceras, líneas ni eventos de reserva', async () => {
    const db = new SqliteD1();
    seedUnit(db);
    await service(db).placeOrder(order('R2-8-NO-PII', 'cs_no_pii'), line, 'stripe');
    const serialized = JSON.stringify({
      reservations: db.query('SELECT * FROM inventory_reservations'),
      lines: db.query('SELECT * FROM inventory_reservation_lines'),
      events: db.query('SELECT * FROM inventory_reservation_balance_events'),
    });
    expect(serialized).not.toContain('private@example.com');
    expect(serialized).not.toContain('Persona privada');
  });

  it('el cron durable ejecuta expiración solo con INV-004 activa', async () => {
    const db = new SqliteD1();
    seedUnit(db);
    await service(db).placeOrder(order('R2-8-CRON', 'cs_cron'), line, 'stripe');
    const base = createPresetManifest('standard', {
      id: 'reservation-cron-test', mode: 'client', environment: 'development',
    });
    const platform = createPlatform({
      ...base,
      deployment: { ...base.deployment, profile: 'custom' },
      capabilities: {
        ...base.capabilities,
        'INV-004': {
          state: 'active',
          flags: { routes: false, navigation: false, jobs: true, sideEffects: true },
        },
      },
    });
    const results = await runScheduledPlatformJobs(
      '*/1 * * * *',
      Date.parse('2026-08-10T10:32:00.000Z'),
      { DB: db.asD1(), DEMO_MODE: 'false' } as ScheduledJobEnv,
      platform,
    );
    expect(results).toEqual([expect.objectContaining({ status: 'succeeded' })]);
    expect(db.value("SELECT count(*) AS value FROM inventory_reservations WHERE status='expired'")).toBe(1);
    expect(db.value("SELECT count(*) AS value FROM platform_job_runs WHERE status='succeeded'")).toBe(1);
  });
});
