import { describe, expect, it } from 'vitest';
import { createOrderOperations } from '../src/composition/order-operations';
import { createD1BackupReader, exportBackup } from '../src/platform/operations';
import { quoteCart } from '../src/lib/quote';
import { planPartialRefund } from '../src/modules/payments';
import { promotionCodeHash, promotionCustomerHash } from '../src/modules/pricing';
import { SqliteD1 } from './sqlite-d1';

const CODE = 'VERANO10';

function seedProduct(db: SqliteD1): void {
  db.sqlite.exec(`
    INSERT INTO products (id, slug, name, price_cents, stock, category, image)
    VALUES (1, 'producto-promo', 'Producto promo', 1000, 10, 'test', '');
    INSERT INTO product_variants (
      id, product_id, sku, title, price_cents, status, is_default, option_signature
    ) VALUES (1, 1, 'PROMO-1', '', 1000, 'active', 1, NULL);
    INSERT INTO inventory_balances (variant_id, on_hand, reserved, version)
    VALUES (1, 10, 0, 1);
    INSERT INTO inventory_movements (
      variant_id, delta, reason, balance_after, version_after, actor_kind,
      actor_id, reference_type, reference_id, idempotency_key, correlation_id, occurred_at
    ) VALUES (1, 10, 'legacy_opening_balance', 10, 1, 'system', 'test',
      'test', '1', 'promotion:test:opening', 'inventory:variant:1', '2026-08-14T10:00:00.000Z');
  `);
}

async function seedPromotion(db: SqliteD1, globalLimit = 10): Promise<void> {
  const hash = await promotionCodeHash(CODE);
  db.sqlite.prepare(`
    INSERT INTO promotion_codes (
      id, code_hash, code_hint, label, state, version, priority, currency,
      effect_type, basis_points, markets_json, channels_json,
      global_usage_limit, per_customer_usage_limit, minimum_subtotal_cents,
      created_at, updated_at
    ) VALUES ('summer-10', ?, '••••O10', 'Verano 10', 'active', 1, 10, 'EUR',
      'percentage_off', 1000, '["ES"]', '["storefront"]', ?, 1, 0,
      '2026-08-14T10:00:00.000Z', '2026-08-14T10:00:00.000Z')
  `).run(hash, globalLimit);
  db.sqlite.exec("INSERT INTO promotion_code_products (promotion_id, product_id) VALUES ('summer-10', 1)");
}

async function promotionalQuote(db: SqliteD1, email: string) {
  return quoteCart(db.asD1(), {
    lines: [{ slug: 'producto-promo', qty: 2 }],
    promotion_code: CODE,
  }, {
    promotionCodesEnabled: true,
    promotionCustomerKeyHash: await promotionCustomerHash(email),
    pricingContext: {
      at: '2026-08-14T12:00:00.000Z', currency: 'EUR', market: 'ES', channel: 'storefront',
    },
  });
}

async function placePromotionalOrder(db: SqliteD1, number: string, email: string) {
  const quote = await promotionalQuote(db, email);
  if (quote.promotion.status !== 'applied') throw new Error('fixture promocional no aplicado');
  const line = quote.lines[0]!;
  const orders = createOrderOperations(db.asD1(), undefined, undefined, {
    reservationsEnabled: false,
    promotionReservation: {
      promotionId: quote.promotion.promotion_id,
      promotionVersion: quote.promotion.version,
      customerKeyHash: await promotionCustomerHash(email),
      discountCents: quote.promotion.discount_cents,
      snapshot: { schema: 1, promotion_id: quote.promotion.promotion_id },
    },
  });
  const placed = await orders.placeOrder({
    order_number: number,
    email,
    customer_name: 'Cliente promo',
    address_json: '{}',
    subtotal_cents: quote.subtotal_cents,
    shipping_cents: 0,
    total_cents: quote.subtotal_cents,
    stripe_session_id: `session_${number}`,
    currency: 'EUR',
  }, [{
    product_id: 1,
    name_snapshot: line.name,
    unit_price_cents: line.unit_price_cents,
    base_unit_price_cents: line.pricing!.base_unit_price_cents,
    pricing_snapshot_json: JSON.stringify(line.pricing),
    qty: line.qty,
  }], 'simulated');
  return { orders, placed: placed!, quote };
}

describe('recorrido de código promocional R4.2', () => {
  it('reserva al crear, consume al pagar y reembolsa el precio efectivo por unidad', async () => {
    const db = new SqliteD1();
    seedProduct(db);
    await seedPromotion(db);
    const { orders, placed, quote } = await placePromotionalOrder(db, 'PROMO-PAID', 'paid@example.test');

    expect(quote).toMatchObject({
      subtotal_cents: 1800,
      promotion: { status: 'applied', promotion_id: 'summer-10', discount_cents: 200 },
    });
    expect(db.query('SELECT status, discount_cents FROM promotion_code_usages')).toEqual([
      { status: 'reserved', discount_cents: 200 },
    ]);
    expect(await orders.confirmPayment({
      lookup: { by: 'id', orderId: placed.orderId },
      paymentIntent: 'sim_pi_promo_paid',
      source: 'simulated',
      causationId: placed.event.event_id,
    })).toBe(true);
    expect(db.value("SELECT status AS value FROM promotion_code_usages")).toBe('consumed');

    const itemId = Number(db.value('SELECT id AS value FROM order_items WHERE order_id=?', placed.orderId));
    const plan = planPartialRefund(
      {
        id: 1, order_id: placed.orderId, provider: 'simulated', provider_reference: 'sim_pi_promo_paid',
        currency: 'EUR', expected_amount_cents: 1800, status: 'captured', refunded_cents: 0,
        adjustment_refunded_cents: 0, version: 1,
      },
      { subtotal_cents: 1800, shipping_cents: 0, total_cents: 1800 },
      [{ order_item_id: itemId, unit_price_cents: 900, ordered_quantity: 2,
        fulfilled_quantity: 0, cancelled_quantity: 0 }],
      [{ order_item_id: itemId, quantity: 1 }],
      'none',
      'merchandise-only',
    );
    expect(plan).toMatchObject({ subtotal_cents: 900, total_cents: 900 });

    const backup = await exportBackup(createD1BackupReader(db.asD1()), new Date('2026-08-14T13:00:00.000Z'));
    expect(backup.sql).not.toContain(CODE);
    const restored = new SqliteD1();
    restored.sqlite.exec(backup.sql);
    expect(restored.query('SELECT state, version FROM promotion_codes')).toEqual([
      { state: 'active', version: 1 },
    ]);
    expect(restored.query('SELECT status, discount_cents FROM promotion_code_usages')).toEqual([
      { status: 'consumed', discount_cents: 200 },
    ]);
  });

  it('libera una reserva al caducar y recupera el cupo global', async () => {
    const db = new SqliteD1();
    seedProduct(db);
    await seedPromotion(db, 1);
    const first = await placePromotionalOrder(db, 'PROMO-EXPIRE', 'first@example.test');
    expect((await promotionalQuote(db, 'second@example.test')).promotion.status).toBe('rejected');

    expect(await first.orders.expirePayment({
      stripeSessionId: 'session_PROMO-EXPIRE',
      causationId: first.placed.event.event_id,
    })).toBe(true);
    expect(db.value("SELECT status AS value FROM promotion_code_usages")).toBe('released');
    expect((await promotionalQuote(db, 'second@example.test')).promotion.status).toBe('applied');
  });
});
