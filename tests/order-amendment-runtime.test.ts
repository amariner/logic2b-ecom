import { describe, expect, it } from 'vitest';
import { createOrderAmendmentOperations } from '../src/composition/order-amendment-operations';
import { createOrderOperations } from '../src/composition/order-operations';
import { createRefundOperations } from '../src/composition/refund-operations';
import type { PaymentRefundGateway } from '../src/modules/payments';
import {
  createEventFactory,
  createEventIdentityFactory,
  type EventClock,
  type EventIdSource,
} from '../src/shared-kernel/events';
import { SqliteD1 } from './sqlite-d1';

const START = '2026-08-12T14:00:00.000Z';

function runtime() {
  let tick = 0;
  const clock: EventClock = { now: () => new Date(Date.parse(START) + tick * 1000) };
  const ids: EventIdSource = { next: () => `evt_amendment_${++tick}` };
  return {
    emit: createEventFactory({ clock, ids }),
    reserve: createEventIdentityFactory({ clock, ids }),
  };
}

function seed(db: SqliteD1): void {
  db.sqlite.exec(`
    INSERT INTO shipping_rates (zone, label, price_cents, free_over_cents, active)
    VALUES ('peninsula', 'Península', 500, NULL, 1);
    INSERT INTO products (id, slug, name, price_cents, stock, category, active)
    VALUES
      (1, 'base', 'Base', 1000, 10, 'test', 1),
      (2, 'extra', 'Extra', 500, 5, 'test', 1);
    INSERT INTO product_variants (
      id, product_id, sku, title, price_cents, status, is_default, option_signature
    ) VALUES
      (11, 1, 'BASE-1', '', 1000, 'active', 1, NULL),
      (22, 2, 'EXTRA-1', '', 500, 'active', 1, NULL);
    INSERT INTO inventory_balances (variant_id, on_hand, reserved, version)
    VALUES (11, 10, 0, 1), (22, 5, 0, 1);
    INSERT INTO inventory_movements (
      variant_id, delta, reason, balance_after, version_after, actor_kind,
      actor_id, reference_type, reference_id, idempotency_key, correlation_id, occurred_at
    ) VALUES
      (11, 10, 'legacy_opening_balance', 10, 1, 'system', 'test',
       'test', '11', 'amendment:opening:11', 'inventory:variant:11', '${START}'),
      (22, 5, 'legacy_opening_balance', 5, 1, 'system', 'test',
       'test', '22', 'amendment:opening:22', 'inventory:variant:22', '${START}');
  `);
}

async function paidOrder(db: SqliteD1) {
  const events = runtime();
  const orders = createOrderOperations(db.asD1(), events.emit, events.reserve);
  const placed = await orders.placeOrder({
    order_number: 'R33-RUNTIME',
    email: 'private@example.test',
    customer_name: 'Persona privada',
    address_json: JSON.stringify({
      name: 'Persona privada', phone: null, street: 'Calle Uno 1', city: 'Madrid',
      postal_code: '28001', zone: 'peninsula', nif: null, company: null,
    }),
    subtotal_cents: 2000,
    shipping_cents: 500,
    total_cents: 2500,
    stripe_session_id: 'sim_session_r33',
    currency: 'EUR',
  }, [{ product_id: 1, name_snapshot: 'Base', unit_price_cents: 1000, qty: 2 }], 'simulated');
  await orders.confirmPayment({
    lookup: { by: 'id', orderId: placed!.orderId },
    paymentIntent: 'sim_pi_r33_primary',
    source: 'simulated',
  });
  return { id: placed!.orderId, events };
}

const refundGateway: PaymentRefundGateway = {
  provider: 'simulated',
  async refund(request) {
    return {
      providerReference: request.existingRefundReference ?? `sim_ref_${request.idempotencyKey}`,
      status: 'succeeded',
    };
  },
};

describe('R3.3 edición segura de pedido en runtime', () => {
  it('encadena cobro adicional, reembolso asignado y cambio neutro de dirección', async () => {
    const db = new SqliteD1();
    seed(db);
    const paid = await paidOrder(db);
    const operations = createOrderAmendmentOperations(
      db.asD1(),
      () => refundGateway,
      paid.events.emit,
    );

    const positive = await operations.begin({
      amendmentId: 'amd_11111111-1111-4111-8111-111111111111',
      orderId: paid.id,
      expectedVersion: 1,
      lines: [{ variant_id: 22, quantity: 1 }],
      reason: 'Añadir complemento',
      stripeSessionId: 'sim_amendment_positive',
      expiresAt: '2027-08-12T14:31:00.000Z',
    });
    expect(positive.outcome).toBe('pending_payment');
    expect(db.value("SELECT reserved AS value FROM inventory_balances WHERE variant_id=22")).toBe(1);

    expect(await operations.confirmAdditionalPayment(
      'sim_amendment_positive',
      'sim_pi_amendment_positive',
      'sim_event_positive',
    )).toMatchObject({ outcome: 'applied' });
    expect(db.query(`
      SELECT edit_version, subtotal_cents, shipping_cents, total_cents FROM orders
    `)).toEqual([{ edit_version: 2, subtotal_cents: 2500, shipping_cents: 500, total_cents: 3000 }]);
    expect(db.query(`
      SELECT expected_amount_cents, status, refunded_cents
      FROM (
        SELECT p.expected_amount_cents, p.status,
          (SELECT COALESCE(sum(t.amount_cents), 0) FROM payment_transactions t
           WHERE t.payment_id=p.id AND t.type='refund' AND t.status='succeeded') AS refunded_cents
        FROM payments p
      )
    `)).toEqual([{ expected_amount_cents: 3000, status: 'captured', refunded_cents: 0 }]);
    expect(db.value("SELECT on_hand AS value FROM inventory_balances WHERE variant_id=22")).toBe(4);

    const baseItemId = Number(db.value(
      "SELECT id AS value FROM order_items WHERE variant_id=11",
    ));
    const negative = await operations.begin({
      amendmentId: 'amd_22222222-2222-4222-8222-222222222222',
      orderId: paid.id,
      expectedVersion: 2,
      lines: [{ order_item_id: baseItemId, quantity: 1 }],
      reason: 'Reducir producto base',
    });
    expect(negative.outcome).toBe('pending_refund');
    expect(await operations.reconcileRefund('amd_22222222-2222-4222-8222-222222222222'))
      .toMatchObject({ outcome: 'applied' });
    expect(db.query(`
      SELECT edit_version, subtotal_cents, shipping_cents, total_cents FROM orders
    `)).toEqual([{ edit_version: 3, subtotal_cents: 1500, shipping_cents: 500, total_cents: 2000 }]);
    expect(db.value("SELECT current_qty AS value FROM order_items WHERE variant_id=11")).toBe(1);
    expect(db.value("SELECT on_hand AS value FROM inventory_balances WHERE variant_id=11")).toBe(9);
    expect(db.query(`
      SELECT a.amount_cents, a.status, t.provider_reference AS capture_reference
      FROM refund_payment_allocations a
      JOIN payment_transactions t ON t.id=a.capture_transaction_id
      JOIN refunds r ON r.id=a.refund_id
      WHERE r.operation_type='adjustment'
    `)).toEqual([
      { amount_cents: 500, status: 'succeeded', capture_reference: 'sim_pi_amendment_positive' },
      { amount_cents: 500, status: 'succeeded', capture_reference: 'sim_pi_r33_primary' },
    ]);

    expect(await operations.begin({
      amendmentId: 'amd_33333333-3333-4333-8333-333333333333',
      orderId: paid.id,
      expectedVersion: 3,
      lines: [],
      address: {
        name: 'Persona privada', phone: null, street: 'Calle Dos 2', city: 'Madrid',
        postal_code: '28002', nif: null, company: null,
      },
      reason: 'Corregir dirección',
    })).toMatchObject({ outcome: 'applied' });
    expect(db.value('SELECT edit_version AS value FROM orders')).toBe(4);
    expect(db.value("SELECT json_extract(address_json, '$.street') AS value FROM orders")).toBe('Calle Dos 2');
    expect(db.value("SELECT count(*) AS value FROM audit_log WHERE action='orders.amendment_applied'")).toBe(3);
    expect(db.value("SELECT count(*) AS value FROM event_outbox_events WHERE event_type='orders.order_amendment_applied'")).toBe(3);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('reembolsa un pedido editado contra todas sus capturas sin exceder ninguna', async () => {
    const db = new SqliteD1();
    seed(db);
    const paid = await paidOrder(db);
    const operations = createOrderAmendmentOperations(
      db.asD1(),
      () => refundGateway,
      paid.events.emit,
    );
    await operations.begin({
      amendmentId: 'amd_44444444-4444-4444-8444-444444444444',
      orderId: paid.id,
      expectedVersion: 1,
      lines: [{ variant_id: 22, quantity: 1 }],
      reason: 'Añadir complemento',
      stripeSessionId: 'sim_amendment_total',
      expiresAt: '2027-08-12T14:31:00.000Z',
    });
    await operations.confirmAdditionalPayment(
      'sim_amendment_total',
      'sim_pi_amendment_total',
      'sim_event_total',
    );
    const requests: Array<{ paymentReference: string; amountCents: number }> = [];
    const result = await createRefundOperations(
      db.asD1(),
      () => ({
        provider: 'simulated',
        async refund(request) {
          requests.push({
            paymentReference: request.paymentReference,
            amountCents: request.amountCents,
          });
          return { providerReference: `sim_ref_${request.idempotencyKey}`, status: 'succeeded' };
        },
      }),
      paid.events.emit,
    ).refundTotal({ orderId: paid.id, reason: 'Cancelar pedido editado', restock: true });
    expect(result.outcome).toBe('applied');
    expect(requests).toEqual([
      { paymentReference: 'sim_pi_amendment_total', amountCents: 500 },
      { paymentReference: 'sim_pi_r33_primary', amountCents: 2500 },
    ]);
    expect(db.query(`
      SELECT a.amount_cents, a.status, capture.provider_reference
      FROM refund_payment_allocations a
      JOIN payment_transactions capture ON capture.id=a.capture_transaction_id
      ORDER BY a.id
    `)).toEqual([
      { amount_cents: 500, status: 'succeeded', provider_reference: 'sim_pi_amendment_total' },
      { amount_cents: 2500, status: 'succeeded', provider_reference: 'sim_pi_r33_primary' },
    ]);
    expect(db.value('SELECT status AS value FROM payments')).toBe('refunded');
    expect(db.value('SELECT status AS value FROM orders')).toBe('cancelled');
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });
});
