import { describe, expect, it } from 'vitest';
import { createFulfillmentOperations } from '../src/composition/fulfillment-operations';
import { createOrderOperations } from '../src/composition/order-operations';
import { createCustomerReturnRequestService } from '../src/composition/customer-return-request-service';
import { createD1CustomerReturnRequestRepository } from '../src/modules/customers';
import type { CustomerReturnRequestRepository } from '../src/modules/customers';
import { createEventFactory, createEventIdentityFactory } from '../src/shared-kernel/events';
import { SqliteD1 } from './sqlite-d1';

const AT = '2026-08-24T10:00:00.000Z';

async function fixture(quantity = 2) {
  const db = new SqliteD1();
  db.sqlite.exec(`
    INSERT INTO customer_profiles (id, primary_email, email_identity_hash, status,
      version, created_at, updated_at)
    VALUES ('customer_profile:owner', 'owner@example.test', '${'a'.repeat(64)}',
      'active', 1, '${AT}', '${AT}'),
      ('customer_profile:other', 'other@example.test', '${'b'.repeat(64)}',
      'active', 1, '${AT}', '${AT}');
    INSERT INTO products (id, slug, name, price_cents, stock, category)
    VALUES (1, 'customer-return', 'Producto', 1200, 5, 'test');
    INSERT INTO product_variants (id, product_id, sku, title, price_cents, status,
      is_default, option_signature)
    VALUES (1, 1, 'CUSTOMER-RETURN', '', 1200, 'active', 1, NULL);
    INSERT INTO inventory_balances (variant_id, on_hand, reserved, version)
    VALUES (1, 5, 0, 1);
    INSERT INTO inventory_movements (variant_id, delta, reason, balance_after,
      version_after, actor_kind, actor_id, reference_type, reference_id,
      idempotency_key, correlation_id, occurred_at)
    VALUES (1, 5, 'legacy_opening_balance', 5, 1, 'system', 'test', 'test', '1',
      'customer-return:opening', 'inventory:variant:1', '${AT}');
  `);
  let tick = 0;
  const clock = { now: () => new Date(Date.parse(AT) + tick * 1000) };
  const ids = { next: () => `evt_customer_return_${++tick}` };
  const emit = createEventFactory({ clock, ids });
  const reserve = createEventIdentityFactory({ clock, ids });
  const orders = createOrderOperations(db.asD1(), emit, reserve);
  const placed = await orders.placeOrder({
    order_number: 'CUSTOMER-RETURN-ORDER', email: 'private@example.test',
    customer_name: 'Private', address_json: '{}', subtotal_cents: 1200 * quantity,
    shipping_cents: 0, total_cents: 1200 * quantity,
    stripe_session_id: 'sim_customer_return', currency: 'EUR',
  }, [{ product_id: 1, name_snapshot: 'Producto', unit_price_cents: 1200, qty: quantity }], 'simulated');
  if (placed === null) throw new Error('pedido fixture ausente');
  await orders.confirmPayment({ lookup: { by: 'id', orderId: placed.orderId },
    paymentIntent: 'sim_pi_customer_return', source: 'simulated' });
  const fulfillment = createFulfillmentOperations(db.asD1(), emit);
  const shipped = await fulfillment.ship({ orderId: placed.orderId,
    tracking: { carrier: 'SEUR', number: 'CUSTOMER' }, idempotencyKey: 'customer-return:ship' });
  await fulfillment.deliver(shipped.fulfillmentId!);
  db.sqlite.prepare(`UPDATE orders SET customer_profile_id='customer_profile:owner'
    WHERE id=?`).run(placed.orderId);
  const access = db.query<{ public_ref: string; ownership_version: number }>(`
    SELECT public_ref, ownership_version FROM customer_order_access_refs WHERE order_id=?
  `, placed.orderId)[0]!;
  const orderItemId = Number(db.value('SELECT id AS value FROM order_items WHERE order_id=?', placed.orderId));
  let sequence = 0;
  const service = createCustomerReturnRequestService(
    createD1CustomerReturnRequestRepository(db.asD1()),
    () => `00000000-0000-0000-0000-${String(++sequence).padStart(12, '0')}`,
  );
  return { db, service, orderItemId, access };
}

describe('persistencia owner-only de devoluciones R5.5g', () => {
  it('crea referencia opaca, snapshot, evento y auditoria sin copiar PII', async () => {
    const { db, service, orderItemId, access } = await fixture();
    const command = {
      orderPublicRef: access.public_ref, ownerProfileId: 'customer_profile:owner',
      expectedOwnershipVersion: access.ownership_version, reason: 'not_as_expected' as const,
      lines: [{ orderItemId, quantity: 1 }], idempotencyKey: 'customer-return:create:one',
      occurredAt: '2026-08-24T10:05:00.000Z',
    };
    const created = await service.createOwned(command);
    expect(created).toMatchObject({ outcome: 'applied', request: {
      orderPublicRef: access.public_ref, status: 'requested', reason: 'not_as_expected', version: 1,
      lines: [{ orderItemId, requestedQuantity: 1 }],
    } });
    expect(created.request?.publicRef).toMatch(/^ret_[0-9a-f]{32}$/u);
    expect(db.query(`SELECT requested_by_kind, requested_by_id,
      customer_ownership_version, length(customer_payload_fingerprint) AS fingerprint_length,
      customer_contract_version, note FROM return_requests`)).toEqual([{
      requested_by_kind: 'customer', requested_by_id: 'customer_profile:owner',
      customer_ownership_version: access.ownership_version, fingerprint_length: 64,
      customer_contract_version: 1, note: null,
    }]);
    expect(db.value("SELECT count(*) AS value FROM return_events WHERE transition='created'")).toBe(1);
    expect(db.value("SELECT count(*) AS value FROM audit_log WHERE action='customer.return_requested'")).toBe(1);
    expect(JSON.stringify(created)).not.toContain('private@example.test');
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('reproduce payload identico y rechaza reutilizacion, owner ajeno y CAS obsoleto', async () => {
    const { db, service, orderItemId, access } = await fixture();
    const command = { orderPublicRef: access.public_ref,
      ownerProfileId: 'customer_profile:owner', expectedOwnershipVersion: access.ownership_version,
      reason: 'other' as const, lines: [{ orderItemId, quantity: 1 }],
      idempotencyKey: 'customer-return:create:replay', occurredAt: '2026-08-24T10:05:00.000Z' };
    const first = await service.createOwned(command);
    await expect(service.createOwned(command)).resolves.toEqual({ outcome: 'replayed', request: first.request });
    await expect(service.createOwned({ ...command, reason: 'damaged' })).resolves
      .toEqual({ outcome: 'conflict', request: null });
    await expect(service.createOwned({ ...command, ownerProfileId: 'customer_profile:other',
      idempotencyKey: 'customer-return:create:foreign' })).rejects.toThrow(/elegibles/u);
    db.sqlite.prepare(`UPDATE orders SET customer_profile_id='customer_profile:other'
      WHERE order_number='CUSTOMER-RETURN-ORDER'`).run();
    await expect(service.createOwned({ ...command, idempotencyKey: 'customer-return:create:stale' }))
      .rejects.toThrow(/elegibles/u);
    expect(db.value('SELECT count(*) AS value FROM return_requests')).toBe(1);
  });

  it('serializa carreras por cantidad y cierra perfiles fusionados', async () => {
    const { db, service, orderItemId, access } = await fixture(1);
    const base = { orderPublicRef: access.public_ref, ownerProfileId: 'customer_profile:owner',
      expectedOwnershipVersion: access.ownership_version, reason: 'other' as const,
      lines: [{ orderItemId, quantity: 1 }], occurredAt: '2026-08-24T10:05:00.000Z' };
    const outcomes = await Promise.all([
      service.createOwned({ ...base, idempotencyKey: 'customer-return:race:left' }),
      service.createOwned({ ...base, idempotencyKey: 'customer-return:race:right' }),
    ]);
    expect(outcomes.map((outcome) => outcome.outcome).toSorted()).toEqual(['applied', 'conflict']);
    expect(db.value('SELECT count(*) AS value FROM return_requests')).toBe(1);
    await expect(service.listOwned('customer_profile:owner')).resolves.toHaveLength(1);
    db.sqlite.exec(`UPDATE customer_profiles SET status='merged',
      merged_into_profile_id='customer_profile:other', version=2 WHERE id='customer_profile:owner'`);
    await expect(service.listOwned('customer_profile:owner')).resolves.toEqual([]);
    await expect(service.createOwned({ ...base, idempotencyKey: 'customer-return:merged' }))
      .rejects.toThrow(/elegibles/u);
  });

  it('revalida la ventana dentro del batch aunque la lectura previa quede obsoleta', async () => {
    const { db, orderItemId, access } = await fixture();
    const base = createD1CustomerReturnRequestRepository(db.asD1());
    const repository: CustomerReturnRequestRepository = Object.freeze({
      eligibilityOwned: base.eligibilityOwned,
      listOwned: base.listOwned,
      readOwned: base.readOwned,
      listEligibilityOwned: base.listEligibilityOwned,
      async createOwned(input: Parameters<CustomerReturnRequestRepository['createOwned']>[0]) {
        db.sqlite.exec("UPDATE fulfillments SET delivered_at='2026-06-01T10:00:00.000Z'");
        return base.createOwned(input);
      },
    });
    const service = createCustomerReturnRequestService(repository,
      () => '00000000-0000-0000-0000-000000000099');
    await expect(service.createOwned({
      orderPublicRef: access.public_ref, ownerProfileId: 'customer_profile:owner',
      expectedOwnershipVersion: access.ownership_version, reason: 'other',
      lines: [{ orderItemId, quantity: 1 }], idempotencyKey: 'customer-return:stale-window',
      occurredAt: '2026-08-24T10:05:00.000Z',
    })).resolves.toEqual({ outcome: 'conflict', request: null });
    expect(db.value('SELECT count(*) AS value FROM return_requests')).toBe(0);
    expect(db.value("SELECT count(*) AS value FROM audit_log WHERE action='customer.return_requested'"))
      .toBe(0);
  });

  it('no disfraza fallos de infraestructura como conflictos de negocio', async () => {
    const { db, orderItemId, access } = await fixture();
    const healthy = db.asD1();
    const failing = Object.freeze({
      prepare: healthy.prepare.bind(healthy),
      batch: async () => { throw new Error('database offline'); },
    }) as unknown as D1Database;
    const service = createCustomerReturnRequestService(
      createD1CustomerReturnRequestRepository(failing),
      () => '00000000-0000-0000-0000-000000000100',
    );
    await expect(service.createOwned({
      orderPublicRef: access.public_ref, ownerProfileId: 'customer_profile:owner',
      expectedOwnershipVersion: access.ownership_version, reason: 'other',
      lines: [{ orderItemId, quantity: 1 }], idempotencyKey: 'customer-return:infra-failure',
      occurredAt: '2026-08-24T10:05:00.000Z',
    })).rejects.toThrow('database offline');
  });

  it('canoniza el orden de líneas antes de calcular la huella idempotente', async () => {
    const calls: Parameters<CustomerReturnRequestRepository['createOwned']>[0][] = [];
    const createOwned: CustomerReturnRequestRepository['createOwned'] = async (input) => {
      calls.push(input);
      return { outcome: 'conflict', request: null };
    };
    const repository: CustomerReturnRequestRepository = Object.freeze({
      eligibilityOwned: async () => Object.freeze([
        Object.freeze({ orderItemId: 9, variantId: 9, unitAmountCents: 900,
          deliveredQuantity: 1, claimedQuantity: 0, lastDeliveredAt: AT }),
        Object.freeze({ orderItemId: 3, variantId: 3, unitAmountCents: 300,
          deliveredQuantity: 1, claimedQuantity: 0, lastDeliveredAt: AT }),
      ]),
      listOwned: async () => [], readOwned: async () => null,
      listEligibilityOwned: async () => [], createOwned,
    });
    let sequence = 0;
    const service = createCustomerReturnRequestService(repository,
      () => `00000000-0000-0000-0000-${String(++sequence).padStart(12, '0')}`);
    const base = { orderPublicRef: `ord_${'a'.repeat(32)}`,
      ownerProfileId: 'customer_profile:one', expectedOwnershipVersion: 1,
      reason: 'other' as const, occurredAt: '2026-08-24T10:05:00.000Z' };
    await service.createOwned({ ...base, idempotencyKey: 'return-order:left',
      lines: [{ orderItemId: 9, quantity: 1 }, { orderItemId: 3, quantity: 1 }] });
    await service.createOwned({ ...base, idempotencyKey: 'return-order:right',
      lines: [{ orderItemId: 3, quantity: 1 }, { orderItemId: 9, quantity: 1 }] });
    expect(calls[0]!.payloadFingerprint).toBe(calls[1]!.payloadFingerprint);
    expect(calls[0]!.plannedLines.map((line) => line.orderItemId))
      .toEqual([3, 9]);
  });
});
