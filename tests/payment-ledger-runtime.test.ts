import { describe, expect, it } from 'vitest';
import { createOrderOperations } from '../src/composition/order-operations';
import {
  createEventFactory,
  createEventIdentityFactory,
  type EventClock,
  type EventIdSource,
} from '../src/shared-kernel/events';
import { SqliteD1 } from './sqlite-d1';

const START = '2026-08-11T08:00:00.000Z';

function runtime() {
  let tick = 0;
  const clock: EventClock = { now: () => new Date(Date.parse(START) + tick * 1000) };
  const ids: EventIdSource = { next: () => `evt_payment_${++tick}` };
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
      'test', '1', 'payment:test:opening', 'inventory:variant:1', '${START}');
  `);
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

const lines = [{ product_id: 1, name_snapshot: 'Producto', unit_price_cents: 1500, qty: 1 }] as const;

function service(db: SqliteD1) {
  const events = runtime();
  return createOrderOperations(db.asD1(), events.emit, events.reserve);
}

describe('ledger de pagos R2.9 en el flujo transaccional', () => {
  it('crea intención y confirma una única captura junto al espejo legacy', async () => {
    const db = new SqliteD1();
    seedProduct(db);
    const orders = service(db);
    const placed = await orders.placeOrder(order('R29-SIM', 'sim_sess_r29'), lines, 'simulated');
    expect(placed).not.toBeNull();
    expect(db.query(`
      SELECT provider, provider_reference, currency, expected_amount_cents, status, version
      FROM payments
    `)).toEqual([{
      provider: 'simulated', provider_reference: 'sim_sess_r29', currency: 'EUR',
      expected_amount_cents: 1500, status: 'pending', version: 1,
    }]);

    const input = {
      lookup: { by: 'id' as const, orderId: placed!.orderId },
      paymentIntent: 'sim_pi_r29',
      source: 'simulated' as const,
      causationId: placed!.event.event_id,
    };
    expect(await orders.confirmPayment(input)).toBe(true);
    expect(await orders.confirmPayment(input)).toBe(false);
    expect(db.query(`
      SELECT provider_reference, status, version FROM payments
    `)).toEqual([{ provider_reference: 'sim_pi_r29', status: 'captured', version: 2 }]);
    expect(db.query(`
      SELECT type, amount_cents, currency, status, provider_reference
      FROM payment_transactions
    `)).toEqual([{
      type: 'capture', amount_cents: 1500, currency: 'EUR', status: 'succeeded',
      provider_reference: 'sim_pi_r29',
    }]);
    expect(db.value('SELECT stripe_payment_intent AS value FROM orders')).toBe('sim_pi_r29');
    expect(db.value('SELECT stock AS value FROM products')).toBe(4);
  });

  it('un proveedor divergente aborta sin pedido pagado, asiento ni stock', async () => {
    const db = new SqliteD1();
    seedProduct(db);
    const orders = service(db);
    const placed = await orders.placeOrder(order('R29-MISMATCH', 'cs_r29'), lines, 'stripe');
    await expect(orders.confirmPayment({
      lookup: { by: 'id', orderId: placed!.orderId },
      paymentIntent: 'sim_pi_wrong',
      source: 'simulated',
    })).rejects.toThrow(/proveedor no coincide/);
    expect(db.value('SELECT status AS value FROM orders')).toBe('pending');
    expect(db.value('SELECT status AS value FROM payments')).toBe('pending');
    expect(db.value('SELECT count(*) AS value FROM payment_transactions')).toBe(0);
    expect(db.value('SELECT stock AS value FROM products')).toBe(5);
  });

  it('la expiración cancela intención y pedido sin asiento financiero', async () => {
    const db = new SqliteD1();
    seedProduct(db);
    const orders = service(db);
    await orders.placeOrder(order('R29-EXPIRED', 'cs_expired_r29'), lines, 'stripe');
    expect(await orders.expirePayment({ stripeSessionId: 'cs_expired_r29' })).toBe(true);
    expect(await orders.expirePayment({ stripeSessionId: 'cs_expired_r29' })).toBe(false);
    expect(db.value('SELECT status AS value FROM orders')).toBe('cancelled');
    expect(db.value('SELECT status AS value FROM payments')).toBe('cancelled');
    expect(db.value('SELECT count(*) AS value FROM payment_transactions')).toBe(0);
    expect(db.value('SELECT stock AS value FROM products')).toBe(5);
  });
});
