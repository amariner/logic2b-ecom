import { describe, expect, it } from 'vitest';
import { createOrderOperations } from '../src/composition/order-operations';
import { quoteCart } from '../src/lib/quote';
import { planOrderAmendment } from '../src/modules/orders';
import { planPartialRefund } from '../src/modules/payments';
import { promotionCodeHash, promotionCustomerHash } from '../src/modules/pricing';
import { createD1BackupReader, exportBackup } from '../src/platform/operations';
import { SqliteD1 } from './sqlite-d1';

const AT = '2026-08-14T12:00:00.000Z';

function seed(db: SqliteD1): void {
  db.sqlite.exec(`
    INSERT INTO products (id, slug, name, price_cents, stock, category, image)
    VALUES (1, 'three-pack', 'Producto 3x2', 1000, 20, 'test', '');
    INSERT INTO product_variants (
      id, product_id, sku, title, price_cents, status, is_default, option_signature
    ) VALUES (1, 1, 'THREE-1', '', 1000, 'active', 1, NULL);
    INSERT INTO inventory_balances (variant_id, on_hand, reserved, version)
    VALUES (1, 20, 0, 1);
    INSERT INTO inventory_movements (
      variant_id, delta, reason, balance_after, version_after, actor_kind,
      actor_id, reference_type, reference_id, idempotency_key, correlation_id, occurred_at
    ) VALUES (1, 20, 'legacy_opening_balance', 20, 1, 'system', 'test',
      'test', '1', 'quantity:test:opening', 'inventory:variant:1', '${AT}');
    INSERT INTO quantity_offers (
      id, label, public_reason, state, version, priority, currency, kind,
      buy_quantity, reward_quantity, reward_effect_type, reward_basis_points,
      markets_json, channels_json, created_at, updated_at
    ) VALUES ('three-for-two', 'Tres por dos', 'Compra 2 y consigue 1', 'active', 1, 10,
      'EUR', 'buy_x_get_y', 2, 1, 'percentage_off', 10000,
      '["ES"]', '["storefront"]', '${AT}', '${AT}');
    INSERT INTO quantity_offer_products (offer_id, role, product_id)
    VALUES ('three-for-two', 'buy', 1), ('three-for-two', 'reward', 1);
  `);
}

describe('recorrido R4.4 de cantidad y X/Y', () => {
  it('cotiza, congela, restaura y conserva devolución/edición proporcionales', async () => {
    const db = new SqliteD1();
    seed(db);
    const quote = await quoteCart(db.asD1(), {
      lines: [{ slug: 'three-pack', qty: 3 }],
    }, {
      quantityOffersEnabled: true,
      pricingContext: { at: AT, currency: 'EUR', market: 'ES', channel: 'storefront' },
    });
    expect(quote).toMatchObject({
      subtotal_cents: 1998,
      quantity_offer: {
        status: 'applied', offer_id: 'three-for-two', version: 1, kind: 'buy_x_get_y',
        discount_cents: 1002,
        evidence: { applications: 1, theoretical_discount_cents: 1000, proportional_basis_points: 3340 },
      },
    });
    const line = quote.lines[0]!;
    expect(line).toMatchObject({ unit_price_cents: 666, line_total_cents: 1998 });
    const applied = quote.quantity_offer;
    if (applied.status !== 'applied') throw new Error('Oferta no aplicada.');
    const applicationSnapshot = {
      schema: 1, offer_id: applied.offer_id, version: applied.version, kind: applied.kind,
      reason: applied.reason, discount_cents: applied.discount_cents, evidence: applied.evidence,
      conflict_policy: 'promotion_code_then_campaign_priority',
      amendment_policy: 'frozen_unit_price', refund_policy: 'proportional_frozen_unit_price',
    };
    const orders = createOrderOperations(db.asD1(), undefined, undefined, {
      reservationsEnabled: false,
      quantityOfferApplication: {
        offerId: applied.offer_id, offerVersion: applied.version,
        discountCents: applied.discount_cents, snapshot: applicationSnapshot,
      },
    });
    const placed = await orders.placeOrder({
      order_number: 'QTY-ORDER', email: 'qty@example.test', customer_name: 'Qty',
      address_json: '{}', subtotal_cents: 1998, shipping_cents: 0, total_cents: 1998,
      stripe_session_id: 'session_QTY_ORDER', currency: 'EUR',
    }, [{
      product_id: 1, name_snapshot: line.name, unit_price_cents: line.unit_price_cents,
      base_unit_price_cents: line.pricing!.base_unit_price_cents,
      pricing_snapshot_json: JSON.stringify(line.pricing), qty: 3,
    }], 'simulated');
    expect(placed).not.toBeNull();
    expect(db.query('SELECT offer_id, offer_version, discount_cents FROM quantity_offer_applications'))
      .toEqual([{ offer_id: 'three-for-two', offer_version: 1, discount_cents: 1002 }]);

    const partial = planPartialRefund(
      { id: 1, order_id: placed!.orderId, provider: 'simulated', provider_reference: 'pi',
        currency: 'EUR', expected_amount_cents: 1998, status: 'captured', version: 1, refunded_cents: 0 },
      { subtotal_cents: 1998, shipping_cents: 0, total_cents: 1998 },
      [{ order_item_id: 1, unit_price_cents: 666, ordered_quantity: 3,
        fulfilled_quantity: 0, cancelled_quantity: 0 }],
      [{ order_item_id: 1, quantity: 1 }], 'none', 'merchandise-only',
    );
    expect(partial).toMatchObject({ subtotal_cents: 666, total_cents: 666, remaining_quantity: 2 });

    const amendment = planOrderAmendment({
      order: { id: placed!.orderId, order_number: 'QTY-ORDER', email: 'qty@example.test', status: 'paid',
        edit_version: 1, address_json: '{}', subtotal_cents: 1998, shipping_cents: 0,
        total_cents: 1998, currency: 'EUR' },
      lines: [{ order_item_id: 1, product_id: 1, variant_id: 1, name_snapshot: 'Producto 3x2',
        sku_snapshot: 'THREE-1', variant_name_snapshot: null, unit_price_cents: 666,
        current_quantity: 3, fulfilled_quantity: 0, cancelled_quantity: 0 }],
      variants: [{ product_id: 1, variant_id: 1, name: 'Producto 3x2', sku: 'THREE-1',
        variant_name: null, unit_price_cents: 1000, available_quantity: 17, active: true }],
      requestedLines: [{ order_item_id: 1, quantity: 2 }], addressAfterJson: '{}',
      shippingAfterCents: 0, hasActiveFulfillment: false, hasActiveAmendment: false,
    });
    expect(amendment).toMatchObject({ subtotal_after_cents: 1332, delta_cents: -666, status: 'pending_refund' });

    const backup = await exportBackup(createD1BackupReader(db.asD1()), new Date(AT));
    expect(backup.sql).toContain('logic2b-backup-schema: 28');
    const restored = new SqliteD1();
    restored.sqlite.exec(backup.sql);
    expect(restored.query('SELECT offer_id, offer_version, discount_cents FROM quantity_offer_applications'))
      .toEqual([{ offer_id: 'three-for-two', offer_version: 1, discount_cents: 1002 }]);
    expect(restored.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('impide combinar la aplicación con otra fuente desde composition root', () => {
    const db = new SqliteD1();
    expect(() => createOrderOperations(db.asD1(), undefined, undefined, {
      automaticDiscountApplication: { discountId: 'auto', discountVersion: 1, discountCents: 1, snapshot: {} },
      quantityOfferApplication: { offerId: 'qty', offerVersion: 1, discountCents: 1, snapshot: {} },
    })).toThrow(/no puede combinar/);
  });

  it('compite con automático por prioridad y cede siempre ante un código elegible', async () => {
    const db = new SqliteD1();
    seed(db);
    db.sqlite.exec(`INSERT INTO automatic_discounts (
      id, label, public_reason, state, version, priority, currency,
      effect_type, basis_points, markets_json, channels_json,
      minimum_subtotal_cents, created_at, updated_at
    ) VALUES ('auto-priority', 'Auto prioridad', '20 % automático', 'active', 1, 5,
      'EUR', 'percentage_off', 2000, '["ES"]', '["storefront"]', 0, '${AT}', '${AT}');
      INSERT INTO automatic_discount_products (discount_id, product_id) VALUES ('auto-priority', 1)`);
    const options = {
      automaticDiscountsEnabled: true, quantityOffersEnabled: true,
      pricingContext: { at: AT, currency: 'EUR', market: 'ES', channel: 'storefront' },
    } as const;
    expect(await quoteCart(db.asD1(), { lines: [{ slug: 'three-pack', qty: 3 }] }, options))
      .toMatchObject({
        subtotal_cents: 2400,
        automatic_discount: { status: 'applied', discount_id: 'auto-priority' },
        quantity_offer: { status: 'not_applied', reason: 'higher_priority_campaign' },
      });

    db.sqlite.exec("UPDATE automatic_discounts SET state='disabled', version=2");
    db.sqlite.prepare(`INSERT INTO promotion_codes (
      id, code_hash, code_hint, label, state, version, priority, currency,
      effect_type, basis_points, markets_json, channels_json,
      minimum_subtotal_cents, created_at, updated_at
    ) VALUES ('promo-priority', ?, '••••O-10', 'Código 10', 'active', 1, 1,
      'EUR', 'percentage_off', 1000, '["ES"]', '["storefront"]', 0, '${AT}', '${AT}')`)
      .run(await promotionCodeHash('PROMO-10'));
    db.sqlite.exec("INSERT INTO promotion_code_products (promotion_id, product_id) VALUES ('promo-priority', 1)");
    expect(await quoteCart(db.asD1(), {
      lines: [{ slug: 'three-pack', qty: 3 }], promotion_code: 'PROMO-10',
    }, {
      ...options, promotionCodesEnabled: true,
      promotionCustomerKeyHash: await promotionCustomerHash('qty@example.test'),
    })).toMatchObject({
      subtotal_cents: 2700,
      promotion: { status: 'applied', promotion_id: 'promo-priority' },
      quantity_offer: { status: 'not_applied', reason: 'promotion_code_precedence' },
    });
  });
});
