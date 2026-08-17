import { describe, expect, it } from 'vitest';
import { createOrderOperations } from '../src/composition/order-operations';
import { quoteCart } from '../src/lib/quote';
import { planOrderAmendment } from '../src/modules/orders';
import { planPartialRefund } from '../src/modules/payments';
import { promotionCodeHash, promotionCustomerHash } from '../src/modules/pricing';
import { createD1BackupReader, exportBackup } from '../src/platform/operations';
import { SqliteD1 } from './sqlite-d1';

const AT = '2026-08-14T12:00:00.000Z';

async function database(): Promise<SqliteD1> {
  const db = new SqliteD1();
  db.sqlite.exec(`
    INSERT INTO products (id, slug, name, price_cents, stock, category, image)
    VALUES (1, 'combined', 'Producto combinado', 1000, 10, 'test', '');
    INSERT INTO product_variants (id, product_id, sku, title, price_cents, status, is_default, option_signature)
    VALUES (1, 1, 'COMBO-1', '', 1000, 'active', 1, NULL);
    INSERT INTO inventory_balances (variant_id, on_hand, reserved, version) VALUES (1, 10, 0, 1);
    INSERT INTO inventory_movements (variant_id, delta, reason, balance_after, version_after,
      actor_kind, actor_id, reference_type, reference_id, idempotency_key, correlation_id, occurred_at)
    VALUES (1, 10, 'legacy_opening_balance', 10, 1, 'system', 'test', 'test', '1',
      'combination:test:opening', 'inventory:variant:1', '${AT}');
    INSERT INTO automatic_discounts (id, label, public_reason, state, version, priority,
      currency, effect_type, basis_points, markets_json, channels_json,
      minimum_subtotal_cents, created_at, updated_at)
    VALUES ('auto-20', 'Auto 20', '20 % automático', 'active', 1, 20, 'EUR',
      'percentage_off', 2000, '["ES"]', '["storefront"]', 0, '${AT}', '${AT}');
    INSERT INTO automatic_discount_products (discount_id, product_id) VALUES ('auto-20', 1);
    INSERT INTO discount_combination_policies (id, label, state, version, priority,
      currency, markets_json, channels_json, maximum_discount_basis_points, created_at, updated_at)
    VALUES ('stack-main', 'Combinación principal', 'active', 1, 10, 'EUR', '["ES"]',
      '["storefront"]', 5000, '${AT}', '${AT}');
    INSERT INTO discount_combination_source_pairs (policy_id, left_source, right_source)
    VALUES ('stack-main', 'automatic_discount', 'promotion_code');
    INSERT INTO discount_combination_class_pairs (policy_id, left_class, right_class)
    VALUES ('stack-main', 'order', 'product');
  `);
  db.sqlite.prepare(`INSERT INTO promotion_codes (id, code_hash, code_hint, label, state,
    version, priority, currency, effect_type, basis_points, markets_json, channels_json,
    minimum_subtotal_cents, created_at, updated_at)
    VALUES ('promo-10', ?, '••••O-10', 'Código 10', 'active', 1, 10, 'EUR',
      'percentage_off', 1000, '["ES"]', '["storefront"]', 0, '${AT}', '${AT}')`)
    .run(await promotionCodeHash('PROMO-10'));
  db.sqlite.exec("INSERT INTO promotion_code_products (promotion_id, product_id) VALUES ('promo-10', 1)");
  return db;
}

describe('recorrido R4.5 de combinabilidad', () => {
  it('cotiza, explica, persiste una sola aplicación canónica y conserva precio congelado', async () => {
    const db = await database();
    const customerKey = await promotionCustomerHash('combo@example.test');
    const quote = await quoteCart(db.asD1(), {
      lines: [{ slug: 'combined', qty: 2 }], promotion_code: 'PROMO-10',
    }, {
      promotionCodesEnabled: true, automaticDiscountsEnabled: true,
      discountCombinationsEnabled: true, promotionCustomerKeyHash: customerKey,
      pricingContext: { at: AT, currency: 'EUR', market: 'ES', channel: 'storefront' },
    });
    expect(quote).toMatchObject({
      subtotal_cents: 1400,
      promotion: { status: 'applied', discount_cents: 200 },
      automatic_discount: { status: 'applied', discount_cents: 400 },
      discount_combination: {
        status: 'applied', policy_id: 'stack-main', maximum_discount_basis_points: 5000,
        discount_cents: 600,
        selected_sources: [
          { source: 'promotion_code', discount_class: 'order', discount_cents: 200 },
          { source: 'automatic_discount', discount_class: 'product', discount_cents: 400 },
        ],
      },
      lines: [{ unit_price_cents: 700, pricing: { schema: 2, discount_cents: 600 } }],
    });
    const combined = quote.discount_combination;
    if (combined.status !== 'applied' || quote.promotion.status !== 'applied') throw new Error('Combinación ausente.');
    const line = quote.lines[0]!;
    const orders = createOrderOperations(db.asD1(), undefined, undefined, {
      reservationsEnabled: false,
      promotionReservation: {
        promotionId: quote.promotion.promotion_id, promotionVersion: quote.promotion.version,
        customerKeyHash: customerKey, discountCents: quote.promotion.discount_cents,
        snapshot: { schema: 1, promotion_id: quote.promotion.promotion_id },
      },
      discountCombinationApplication: {
        policyId: combined.policy_id, policyVersion: combined.version,
        discountCents: combined.discount_cents,
        snapshot: {
          schema: 1, policy_id: combined.policy_id, version: combined.version,
          maximum_discount_basis_points: combined.maximum_discount_basis_points,
          discount_cents: combined.discount_cents, selected_sources: combined.selected_sources,
        },
      },
    });
    const placed = await orders.placeOrder({
      order_number: 'COMBO-ORDER', email: 'combo@example.test', customer_name: 'Combo',
      address_json: '{}', subtotal_cents: 1400, shipping_cents: 0, total_cents: 1400,
      stripe_session_id: 'session_COMBO_ORDER', currency: 'EUR',
    }, [{ product_id: 1, name_snapshot: line.name, unit_price_cents: line.unit_price_cents,
      base_unit_price_cents: line.pricing!.base_unit_price_cents,
      pricing_snapshot_json: JSON.stringify(line.pricing), qty: 2 }], 'simulated');
    expect(placed).not.toBeNull();
    expect(db.query('SELECT policy_id, policy_version, discount_cents FROM discount_combination_applications'))
      .toEqual([{ policy_id: 'stack-main', policy_version: 1, discount_cents: 600 }]);
    expect(db.value('SELECT count(*) AS value FROM automatic_discount_applications')).toBe(0);
    expect(db.query('SELECT promotion_id, discount_cents FROM promotion_code_usages'))
      .toEqual([{ promotion_id: 'promo-10', discount_cents: 200 }]);

    const refund = planPartialRefund(
      { id: 1, order_id: placed!.orderId, provider: 'simulated', provider_reference: 'pi',
        currency: 'EUR', expected_amount_cents: 1400, status: 'captured', version: 1, refunded_cents: 0 },
      { subtotal_cents: 1400, shipping_cents: 0, total_cents: 1400 },
      [{ order_item_id: 1, unit_price_cents: 700, ordered_quantity: 2,
        fulfilled_quantity: 0, cancelled_quantity: 0 }],
      [{ order_item_id: 1, quantity: 1 }], 'none', 'merchandise-only');
    expect(refund).toMatchObject({ subtotal_cents: 700, total_cents: 700 });
    const amendment = planOrderAmendment({
      order: { id: placed!.orderId, order_number: 'COMBO-ORDER', email: 'combo@example.test',
        status: 'paid', edit_version: 1, address_json: '{}', subtotal_cents: 1400,
        shipping_cents: 0, total_cents: 1400, currency: 'EUR' },
      lines: [{ order_item_id: 1, product_id: 1, variant_id: 1, name_snapshot: 'Producto combinado',
        sku_snapshot: 'COMBO-1', variant_name_snapshot: null, unit_price_cents: 700,
        current_quantity: 2, fulfilled_quantity: 0, cancelled_quantity: 0 }],
      variants: [{ product_id: 1, variant_id: 1, name: 'Producto combinado', sku: 'COMBO-1',
        variant_name: null, unit_price_cents: 1000, available_quantity: 8, active: true }],
      requestedLines: [{ order_item_id: 1, quantity: 1 }], addressAfterJson: '{}',
      shippingAfterCents: 0, hasActiveFulfillment: false, hasActiveAmendment: false,
    });
    expect(amendment).toMatchObject({ subtotal_after_cents: 700, delta_cents: -700 });

    db.sqlite.exec(`UPDATE discount_combination_policies SET state='disabled', version=2,
      updated_at='2099-08-14T13:00:00.000Z' WHERE id='stack-main'`);
    const backup = await exportBackup(createD1BackupReader(db.asD1()), new Date(AT));
    expect(backup.sql).toContain('logic2b-backup-schema: 28');
    const restored = new SqliteD1();
    restored.sqlite.exec(backup.sql);
    expect(restored.query('SELECT policy_id, discount_cents FROM discount_combination_applications'))
      .toEqual([{ policy_id: 'stack-main', discount_cents: 600 }]);
    expect(restored.query('SELECT state, version FROM discount_combination_policies'))
      .toEqual([{ state: 'disabled', version: 2 }]);
    expect(restored.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('sin política activa conserva la precedencia exclusiva anterior', async () => {
    const db = await database();
    db.sqlite.exec("UPDATE discount_combination_policies SET state='disabled'");
    const quote = await quoteCart(db.asD1(), {
      lines: [{ slug: 'combined', qty: 1 }], promotion_code: 'PROMO-10',
    }, {
      promotionCodesEnabled: true, automaticDiscountsEnabled: true,
      discountCombinationsEnabled: true,
      promotionCustomerKeyHash: await promotionCustomerHash('combo@example.test'),
      pricingContext: { at: AT, currency: 'EUR', market: 'ES', channel: 'storefront' },
    });
    expect(quote).toMatchObject({
      subtotal_cents: 900, promotion: { status: 'applied' },
      automatic_discount: { status: 'not_applied', reason: 'promotion_code_precedence' },
      discount_combination: { status: 'not_applied', reason: 'no_active_policy' },
      lines: [{ pricing: { schema: 1 } }],
    });
  });
});
