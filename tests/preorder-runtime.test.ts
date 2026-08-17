import { describe, expect, it } from 'vitest';
import { createOrderOperations } from '../src/composition/order-operations';
import { createPreorderOperations } from '../src/composition/preorder-operations';
import { createFulfillmentOperations } from '../src/composition/fulfillment-operations';
import { createRefundOperations } from '../src/composition/refund-operations';
import { quoteCart } from '../src/lib/quote';
import type { NewOrderLine } from '../src/modules/orders';
import { SqliteD1 } from './sqlite-d1';

const AT = '2026-08-17T12:00:00.000Z';

function database(capacity = 8): SqliteD1 {
  const db = new SqliteD1();
  db.sqlite.exec(`
    INSERT INTO products (id, slug, name, price_cents, stock, category, image)
    VALUES (1, 'future-product', 'Producto futuro', 2500, 2, 'test', '');
    INSERT INTO product_variants (
      id, product_id, sku, title, price_cents, status, is_default, option_signature
    ) VALUES (1, 1, 'FUTURE-1', '', 2500, 'active', 1, NULL);
    INSERT INTO inventory_balances (variant_id, on_hand, reserved, version, reservation_version)
    VALUES (1, 2, 0, 1, 1);
    INSERT INTO inventory_movements (
      variant_id, delta, reason, balance_after, version_after, actor_kind,
      actor_id, reference_type, reference_id, idempotency_key, correlation_id, occurred_at
    ) VALUES (1, 2, 'legacy_opening_balance', 2, 1, 'system', 'test',
      'test', 'future', 'preorder:opening', 'inventory:variant:1', '${AT}');
    INSERT INTO preorder_policies (
      id, variant_id, kind, state, label, public_message, sale_starts_at, sale_ends_at,
      availability_starts_at, availability_ends_at, max_deferred_quantity,
      committed_deferred_quantity, payment_policy, version, capacity_version, created_at, updated_at
    ) VALUES ('future-stock', 1, 'backorder', 'active', 'Disponible bajo pedido',
      'Disponibilidad prevista en septiembre', '2026-08-01T00:00:00.000Z',
      '2026-08-31T23:59:59.000Z', '2026-09-01T00:00:00.000Z',
      '2026-09-15T23:59:59.000Z', ${capacity}, 0, 'charge_now', 1, 1, '${AT}', '${AT}');
  `);
  return db;
}

async function quote(db: SqliteD1, quantity = 4) {
  return quoteCart(db.asD1(), { lines: [{ slug: 'future-product', qty: quantity }] }, {
    preordersEnabled: true,
    pricingContext: { at: AT, currency: 'EUR', market: 'ES', channel: 'storefront' },
  });
}

function service(db: SqliteD1, result: Awaited<ReturnType<typeof quote>>) {
  if (result.preorders.status !== 'applied') throw new Error('Aplicación diferida ausente.');
  return createOrderOperations(db.asD1(), undefined, undefined, {
    reservationsEnabled: true,
    reservationExpiresAt: '2026-08-17T12:31:00.000Z',
    preorderApplications: result.preorders.applications,
  });
}

function lineOf(result: Awaited<ReturnType<typeof quote>>): readonly NewOrderLine[] {
  const line = result.lines[0]!;
  return [{
    product_id: 1,
    name_snapshot: line.name,
    unit_price_cents: line.unit_price_cents,
    base_unit_price_cents: line.pricing!.base_unit_price_cents,
    pricing_snapshot_json: JSON.stringify(line.pricing),
    qty: line.qty,
  }];
}

function order(number: string, total: number) {
  return {
    order_number: number,
    email: 'future@example.test',
    customer_name: 'Cliente futuro',
    address_json: '{}',
    subtotal_cents: total,
    shipping_cents: 0,
    total_cents: total,
    stripe_session_id: `session_${number}`,
    currency: 'EUR',
  };
}

describe('runtime de preventa/backorder R4.9', () => {
  it('cotiza y congela por separado cantidad inmediata y diferida', async () => {
    const db = database();
    const result = await quote(db);
    expect(result).toMatchObject({
      purchasable: true,
      subtotal_cents: 10_000,
      lines: [{ status: 'ok', available_stock: 2, availability: {
        status: 'deferred', kind: 'backorder', immediate_quantity: 2,
        deferred_quantity: 2, message: 'Disponibilidad prevista en septiembre',
      } }],
      preorders: { status: 'applied', applications: [{
        policyId: 'future-stock', policyVersion: 1, policyCapacityVersion: 1,
        productId: 1, variantId: 1, immediateQuantity: 2, deferredQuantity: 2,
      }] },
    });
  });

  it('una preventa activa sin cupo no se salta usando el stock físico', async () => {
    const db = database(1);
    db.sqlite.exec("UPDATE preorder_policies SET kind='preorder'");
    const result = await quote(db, 2);
    expect(result).toMatchObject({
      purchasable: false,
      subtotal_cents: 0,
      lines: [{ status: 'out-of-stock', availability: null }],
      preorders: { status: 'not_applied', reason: 'no_deferred_lines' },
    });
  });

  it('reserva solo lo existente y al cobrar no crea stock negativo', async () => {
    const db = database();
    const result = await quote(db);
    const orders = service(db, result);
    const placed = await orders.placeOrder(order('PREORDER-PAID', result.subtotal_cents),
      lineOf(result), 'stripe');
    expect(placed).not.toBeNull();
    expect(db.query('SELECT on_hand, reserved FROM inventory_balances')).toEqual([
      { on_hand: 2, reserved: 2 },
    ]);
    expect(db.query(`SELECT state, immediate_quantity, deferred_quantity,
      allocated_quantity FROM preorder_commitments`)).toEqual([{
      state: 'pending_payment', immediate_quantity: 2, deferred_quantity: 2,
      allocated_quantity: 0,
    }]);
    expect(db.query(`SELECT committed_deferred_quantity, capacity_version
      FROM preorder_policies`)).toEqual([{ committed_deferred_quantity: 2, capacity_version: 2 }]);

    expect(await orders.confirmPayment({
      lookup: { by: 'id', orderId: placed!.orderId },
      paymentIntent: 'pi_preorder_paid', source: 'stripe',
    })).toBe(true);
    expect(db.query('SELECT on_hand, reserved FROM inventory_balances')).toEqual([
      { on_hand: 0, reserved: 0 },
    ]);
    expect(db.query('SELECT state, paid_at FROM preorder_commitments'))
      .toEqual([{ state: 'awaiting_stock', paid_at: expect.any(String) }]);
    expect(db.value("SELECT count(*) AS value FROM inventory_movements WHERE reason='sale'")).toBe(1);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('expirar el pago libera reserva y cupo sin inventar stock', async () => {
    const db = database();
    const result = await quote(db);
    const orders = service(db, result);
    await orders.placeOrder(order('PREORDER-EXPIRE', result.subtotal_cents), lineOf(result), 'stripe');
    expect(await orders.expirePayment({ stripeSessionId: 'session_PREORDER-EXPIRE' })).toBe(true);
    expect(db.query('SELECT on_hand, reserved FROM inventory_balances'))
      .toEqual([{ on_hand: 2, reserved: 0 }]);
    expect(db.query('SELECT state, cancelled_quantity FROM preorder_commitments'))
      .toEqual([{ state: 'cancelled', cancelled_quantity: 2 }]);
    expect(db.query('SELECT committed_deferred_quantity FROM preorder_policies'))
      .toEqual([{ committed_deferred_quantity: 0 }]);
  });

  it('dos checkouts con el mismo snapshot de cupo dejan un único compromiso', async () => {
    const db = database(2);
    const firstQuote = await quote(db);
    const secondQuote = await quote(db);
    const outcomes = await Promise.allSettled([
      service(db, firstQuote).placeOrder(order('PREORDER-RACE-A', firstQuote.subtotal_cents),
        lineOf(firstQuote), 'stripe'),
      service(db, secondQuote).placeOrder(order('PREORDER-RACE-B', secondQuote.subtotal_cents),
        lineOf(secondQuote), 'stripe'),
    ]);
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(db.value('SELECT count(*) AS value FROM orders')).toBe(1);
    expect(db.value('SELECT count(*) AS value FROM preorder_commitments')).toBe(1);
    expect(db.value('SELECT committed_deferred_quantity AS value FROM preorder_policies')).toBe(2);
  });

  it('asigna stock real por FIFO una sola vez y enlaza ambos ledgers', async () => {
    const db = database();
    const result = await quote(db);
    const orders = service(db, result);
    const placed = await orders.placeOrder(order('PREORDER-ALLOCATE', result.subtotal_cents),
      lineOf(result), 'stripe');
    await orders.confirmPayment({
      lookup: { by: 'id', orderId: placed!.orderId },
      paymentIntent: 'pi_preorder_allocate', source: 'stripe',
    });
    db.sqlite.exec(`
      UPDATE inventory_balances SET on_hand=2, version=version+1, updated_at='${AT}' WHERE variant_id=1;
      UPDATE products SET stock=2 WHERE id=1;
      INSERT INTO inventory_movements (
        variant_id, delta, reason, balance_after, version_after, actor_kind, actor_id,
        reference_type, reference_id, idempotency_key, correlation_id, occurred_at, created_at
      ) SELECT 1, 2, 'manual_adjustment', 2, version, 'admin', 'stock-test',
        'test', 'replenishment', 'preorder:replenishment', 'test:replenishment', '${AT}', '${AT}'
        FROM inventory_balances WHERE variant_id=1;
    `);
    const operations = createPreorderOperations(db.asD1());
    expect(await operations.allocate({
      variantId: 1, quantity: 2, idempotencyKey: 'allocation-test-01',
    })).toMatchObject({ outcome: 'applied', allocatedQuantity: 2, commitmentCount: 1 });
    expect(await operations.allocate({
      variantId: 1, quantity: 2, idempotencyKey: 'allocation-test-01',
    })).toMatchObject({ outcome: 'duplicate', allocatedQuantity: 0 });
    expect(db.query(`SELECT state, allocated_quantity, restored_quantity
      FROM preorder_commitments`)).toEqual([{
      state: 'allocated', allocated_quantity: 2, restored_quantity: 0,
    }]);
    expect(db.query(`SELECT allocation.quantity, movement.delta,
      location_movement.delta AS location_delta
      FROM preorder_allocations allocation
      JOIN inventory_movements movement ON movement.id=allocation.inventory_movement_id
      JOIN inventory_location_movements location_movement
        ON location_movement.id=allocation.location_movement_id`)).toEqual([{
      quantity: 2, delta: -2, location_delta: -2,
    }]);
    expect(db.query('SELECT on_hand, reserved FROM inventory_balances'))
      .toEqual([{ on_hand: 0, reserved: 0 }]);
    expect(db.value('SELECT committed_deferred_quantity AS value FROM preorder_policies')).toBe(0);
    expect(db.query('SELECT to_addr, subject, body_html FROM emails_outbox')).toEqual([
      expect.objectContaining({
        to_addr: 'future@example.test',
        subject: expect.stringContaining('Stock asignado'),
        body_html: expect.stringContaining('no equivale todavía a un envío'),
      }),
    ]);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('bloquea fulfillment diferido hasta que exista asignación física', async () => {
    const db = database();
    const result = await quote(db);
    const orders = service(db, result);
    const placed = await orders.placeOrder(order('PREORDER-FULFILL', result.subtotal_cents),
      lineOf(result), 'stripe');
    await orders.confirmPayment({
      lookup: { by: 'id', orderId: placed!.orderId },
      paymentIntent: 'pi_preorder_fulfill', source: 'stripe',
    });
    const fulfillment = createFulfillmentOperations(db.asD1());
    await expect(fulfillment.ship({
      orderId: placed!.orderId,
      tracking: { carrier: 'Test', number: 'WAITING' },
      allocations: [{ order_item_id: 1, quantity: 4 }],
      idempotencyKey: 'preorder-ship-before',
    })).rejects.toThrow(/cantidad pendiente/);

    db.sqlite.exec(`
      UPDATE inventory_balances SET on_hand=2, version=version+1, updated_at='${AT}' WHERE variant_id=1;
      UPDATE products SET stock=2 WHERE id=1;
      INSERT INTO inventory_movements (
        variant_id, delta, reason, balance_after, version_after, actor_kind, actor_id,
        reference_type, reference_id, idempotency_key, correlation_id, occurred_at, created_at
      ) SELECT 1, 2, 'manual_adjustment', 2, version, 'admin', 'stock-test',
        'test', 'replenishment', 'preorder:replenishment:fulfillment',
        'test:replenishment:fulfillment', '${AT}', '${AT}'
        FROM inventory_balances WHERE variant_id=1;
    `);
    await createPreorderOperations(db.asD1()).allocate({
      variantId: 1, quantity: 2, idempotencyKey: 'allocation-fulfillment-01',
    });
    expect(await fulfillment.ship({
      orderId: placed!.orderId,
      tracking: { carrier: 'Test', number: 'ALLOCATED' },
      allocations: [{ order_item_id: 1, quantity: 4 }],
      idempotencyKey: 'preorder-ship-after',
    })).toMatchObject({ outcome: 'applied', orderStatus: 'shipped', remainingQuantity: 0 });
  });

  it('un reembolso total repone solo unidades físicas y cancela el cupo diferido', async () => {
    const db = database();
    const result = await quote(db);
    const orders = service(db, result);
    const placed = await orders.placeOrder(order('PREORDER-REFUND', result.subtotal_cents),
      lineOf(result), 'simulated');
    await orders.confirmPayment({
      lookup: { by: 'id', orderId: placed!.orderId },
      paymentIntent: 'pi_preorder_refund', source: 'simulated',
    });
    const refunds = createRefundOperations(db.asD1(), () => ({
      provider: 'simulated',
      refund: async (request) => ({
        status: 'succeeded' as const,
        providerReference: `sim_ref_${request.idempotencyKey}`,
      }),
    }));
    expect(await refunds.refundTotal({
      orderId: placed!.orderId, reason: 'Cancelar preventa', restock: true,
    })).toMatchObject({ outcome: 'applied' });
    expect(db.query('SELECT on_hand, reserved FROM inventory_balances'))
      .toEqual([{ on_hand: 2, reserved: 0 }]);
    expect(db.query(`SELECT state, allocated_quantity, restored_quantity, cancelled_quantity
      FROM preorder_commitments`)).toEqual([{
      state: 'cancelled', allocated_quantity: 0, restored_quantity: 0, cancelled_quantity: 2,
    }]);
    expect(db.value('SELECT committed_deferred_quantity AS value FROM preorder_policies')).toBe(0);
    expect(db.query(`SELECT delta FROM inventory_movements
      WHERE reason='cancellation_restock'`)).toEqual([{ delta: 2 }]);
  });

  it('un reembolso parcial cancela primero cupo pendiente sin fabricar stock', async () => {
    const db = database();
    const result = await quote(db);
    const orders = service(db, result);
    const placed = await orders.placeOrder(order('PREORDER-PARTIAL', result.subtotal_cents),
      lineOf(result), 'simulated');
    await orders.confirmPayment({
      lookup: { by: 'id', orderId: placed!.orderId },
      paymentIntent: 'pi_preorder_partial', source: 'simulated',
    });
    const refunds = createRefundOperations(db.asD1(), () => ({
      provider: 'simulated',
      refund: async (request) => ({ status: 'succeeded' as const,
        providerReference: `sim_ref_${request.idempotencyKey}` }),
    }));
    expect(await refunds.refundPartial({
      orderId: placed!.orderId,
      reason: 'Reducir la cantidad diferida',
      restock: true,
      idempotencyKey: 'preorder-partial-refund-01',
      lines: [{ order_item_id: 1, quantity: 1 }],
    })).toMatchObject({ outcome: 'applied' });
    expect(db.query('SELECT on_hand, reserved FROM inventory_balances'))
      .toEqual([{ on_hand: 0, reserved: 0 }]);
    expect(db.query(`SELECT state, restored_quantity, cancelled_quantity
      FROM preorder_commitments`)).toEqual([{
      state: 'partially_cancelled', restored_quantity: 0, cancelled_quantity: 1,
    }]);
    expect(db.value('SELECT committed_deferred_quantity AS value FROM preorder_policies')).toBe(1);
    expect(db.value(`SELECT count(*) AS value FROM inventory_movements
      WHERE reason='cancellation_restock'`)).toBe(0);
  });
});
