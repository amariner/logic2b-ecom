import { describe, expect, it } from 'vitest';
import { createOrderOperations } from '../src/composition/order-operations';
import { createRefundOperations } from '../src/composition/refund-operations';
import {
  createD1StoredValue,
  generateGiftCardCode,
  giftCardCodeHash,
} from '../src/modules/payments';
import { SqliteD1 } from './sqlite-d1';

const AT = '2026-08-14T12:00:00.000Z';

async function database() {
  const db = new SqliteD1();
  db.sqlite.exec(`INSERT INTO products (id,slug,name,price_cents,stock,category,image)
    VALUES (1,'stored-product','Producto',1000,10,'test','');
    INSERT INTO product_variants (id,product_id,sku,title,price_cents,status,is_default,option_signature)
    VALUES (1,1,'STORED-1','',1000,'active',1,NULL);
    INSERT INTO inventory_balances (variant_id,on_hand,reserved,version) VALUES (1,10,0,1);
    INSERT INTO inventory_movements (variant_id,delta,reason,balance_after,version_after,actor_kind,
      actor_id,reference_type,reference_id,idempotency_key,correlation_id,occurred_at)
    VALUES (1,10,'legacy_opening_balance',10,1,'system','test','test','1','stored:opening',
      'inventory:variant:1','${AT}');`);
  const code = generateGiftCardCode();
  const stored = createD1StoredValue(db.asD1());
  await db.batch([...stored.issueStatements({
    id: 'gift_runtime', kind: 'gift_card', label: 'Tarjeta de prueba', currency: 'EUR',
    amountCents: 2500, codeHash: await giftCardCodeHash(code), expiresAt: null,
    policy: { schema: 1, legal_review_reference: 'test-only', expiry: 'none',
      transferability: 'not_enabled', cash_out: 'not_enabled' },
    idempotencyKey: 'stored:test:issue', occurredAt: AT,
  })]);
  return { db, code, stored };
}

describe('recorrido R4.8 de valor almacenado', () => {
  it('reserva, cobra parcialmente y congela la aplicación junto al pago externo', async () => {
    const { db, code, stored } = await database();
    const authorization = await stored.authorizeGiftCard({ code, requestedCents: 400,
      orderTotalCents: 1000, currency: 'EUR', at: AT });
    expect(authorization?.amountCents).toBe(400);
    const orders = createOrderOperations(db.asD1(), undefined, undefined, {
      reservationsEnabled: false, storedValueAuthorization: authorization!,
    });
    const placed = await orders.placeOrder({
      order_number: 'SV-MIXED', email: 'stored@example.test', customer_name: 'Stored',
      address_json: '{}', subtotal_cents: 1000, shipping_cents: 0, total_cents: 1000,
      stripe_session_id: 'sim_sv_mixed', currency: 'EUR',
    }, [{ product_id: 1, name_snapshot: 'Producto', unit_price_cents: 1000,
      base_unit_price_cents: 1000, pricing_snapshot_json: '{}', qty: 1 }], 'simulated');
    expect(placed).not.toBeNull();
    expect(db.query(`SELECT expected_amount_cents,stored_value_expected_cents,status FROM payments`))
      .toEqual([{ expected_amount_cents: 600, stored_value_expected_cents: 400, status: 'pending' }]);
    expect(await stored.findById('gift_runtime')).toMatchObject({
      balance_cents: 2500, reserved_cents: 400, version: 3,
    });

    expect(await orders.confirmPayment({ lookup: { by: 'id', orderId: placed!.orderId },
      paymentIntent: 'sim_pi_sv_mixed', source: 'simulated', causationId: placed!.event.event_id }))
      .toBe(true);
    expect(await stored.findById('gift_runtime')).toMatchObject({
      balance_cents: 2100, reserved_cents: 0, version: 4,
    });
    expect(db.query(`SELECT type,balance_delta_cents,reserved_delta_cents
      FROM stored_value_ledger_entries ORDER BY version_after`)).toEqual([
      { type: 'issuance', balance_delta_cents: 2500, reserved_delta_cents: 0 },
      { type: 'reservation', balance_delta_cents: 0, reserved_delta_cents: 400 },
      { type: 'capture', balance_delta_cents: -400, reserved_delta_cents: -400 },
    ]);
    expect(db.query(`SELECT amount_cents FROM payment_transactions WHERE type='capture'`))
      .toEqual([{ amount_cents: 600 }]);
    expect(db.query(`SELECT amount_cents FROM stored_value_applications`)).toEqual([{ amount_cents: 400 }]);
    const gatewayAmounts: number[] = [];
    const refunds = createRefundOperations(db.asD1(), () => ({
      provider: 'simulated',
      refund: async (request) => {
        gatewayAmounts.push(request.amountCents);
        return { status: 'succeeded' as const, providerReference: `sim_ref_${request.idempotencyKey}` };
      },
    }));
    expect(await refunds.refundTotal({ orderId: placed!.orderId, reason: 'Reembolso mixto', restock: false }))
      .toMatchObject({ outcome: 'applied' });
    expect(gatewayAmounts).toEqual([600]);
    expect(await stored.findById('gift_runtime')).toMatchObject({
      balance_cents: 2500, reserved_cents: 0, version: 5,
    });
    expect(db.query(`SELECT amount_cents,status FROM stored_value_refund_allocations`))
      .toEqual([{ amount_cents: 400, status: 'succeeded' }]);
    expect(db.query(`SELECT type,amount_cents FROM payment_transactions ORDER BY id`))
      .toEqual([{ type: 'capture', amount_cents: 600 }, { type: 'refund', amount_cents: 600 }]);
    expect(db.query(`SELECT status FROM payments`)).toEqual([{ status: 'refunded' }]);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('libera la reserva si caduca la sesión externa', async () => {
    const { db, code, stored } = await database();
    const authorization = await stored.authorizeGiftCard({ code, requestedCents: 700,
      orderTotalCents: 1000, currency: 'EUR', at: AT });
    const orders = createOrderOperations(db.asD1(), undefined, undefined, {
      reservationsEnabled: false, storedValueAuthorization: authorization!,
    });
    await orders.placeOrder({ order_number: 'SV-EXPIRE', email: 'expire@example.test',
      customer_name: 'Expire', address_json: '{}', subtotal_cents: 1000, shipping_cents: 0,
      total_cents: 1000, stripe_session_id: 'stripe_expire_sv', currency: 'EUR' },
    [{ product_id: 1, name_snapshot: 'Producto', unit_price_cents: 1000,
      base_unit_price_cents: 1000, pricing_snapshot_json: '{}', qty: 1 }], 'stripe');
    expect((await stored.findById('gift_runtime'))?.reserved_cents).toBe(700);
    expect(await orders.expirePayment({ stripeSessionId: 'stripe_expire_sv' })).toBe(true);
    expect(await stored.findById('gift_runtime')).toMatchObject({ balance_cents: 2500, reserved_cents: 0 });
    expect(db.query(`SELECT type FROM stored_value_ledger_entries ORDER BY version_after`))
      .toEqual([{ type: 'issuance' }, { type: 'reservation' }, { type: 'release' }]);
  });
});
