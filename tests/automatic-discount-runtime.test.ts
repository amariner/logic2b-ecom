import { describe, expect, it } from 'vitest';
import { createOrderOperations } from '../src/composition/order-operations';
import { quoteCart } from '../src/lib/quote';
import { promotionCodeHash, promotionCustomerHash } from '../src/modules/pricing';
import { createD1BackupReader, exportBackup } from '../src/platform/operations';
import { SqliteD1 } from './sqlite-d1';

const AT = '2026-08-14T12:00:00.000Z';

function seedProduct(db: SqliteD1): void {
  db.sqlite.exec(`
    INSERT INTO products (id, slug, name, price_cents, stock, category, image)
    VALUES (1, 'auto-product', 'Producto automático', 1000, 10, 'test', '');
    INSERT INTO product_variants (
      id, product_id, sku, title, price_cents, status, is_default, option_signature
    ) VALUES (1, 1, 'AUTO-1', '', 1000, 'active', 1, NULL);
    INSERT INTO inventory_balances (variant_id, on_hand, reserved, version)
    VALUES (1, 10, 0, 1);
    INSERT INTO inventory_movements (
      variant_id, delta, reason, balance_after, version_after, actor_kind,
      actor_id, reference_type, reference_id, idempotency_key, correlation_id, occurred_at
    ) VALUES (1, 10, 'legacy_opening_balance', 10, 1, 'system', 'test',
      'test', '1', 'automatic:test:opening', 'inventory:variant:1', '${AT}');
  `);
}

function seedAutomatic(db: SqliteD1): void {
  db.sqlite.exec(`
    INSERT INTO automatic_discounts (
      id, label, public_reason, state, version, priority, currency,
      effect_type, basis_points, markets_json, channels_json,
      minimum_subtotal_cents, created_at, updated_at
    ) VALUES ('auto-summer', 'Campaña verano', '15 % automático de verano', 'active', 1, 20,
      'EUR', 'percentage_off', 1500, '["ES"]', '["storefront"]', 0, '${AT}', '${AT}');
    INSERT INTO automatic_discount_products (discount_id, product_id) VALUES ('auto-summer', 1);
  `);
}

async function quote(db: SqliteD1, promotionCode?: string) {
  return quoteCart(db.asD1(), {
    lines: [{ slug: 'auto-product', qty: 2 }],
    ...(promotionCode === undefined ? {} : { promotion_code: promotionCode }),
  }, {
    promotionCodesEnabled: true,
    automaticDiscountsEnabled: true,
    ...(promotionCode === undefined
      ? {}
      : { promotionCustomerKeyHash: await promotionCustomerHash('auto@example.test') }),
    pricingContext: { at: AT, currency: 'EUR', market: 'ES', channel: 'storefront' },
  });
}

describe('recorrido de descuento automático R4.3', () => {
  it('aplica un motivo visible y congela una única aplicación en el pedido', async () => {
    const db = new SqliteD1();
    seedProduct(db);
    seedAutomatic(db);
    const priced = await quote(db);
    expect(priced).toMatchObject({
      subtotal_cents: 1700,
      automatic_discount: {
        status: 'applied', discount_id: 'auto-summer', version: 1,
        reason: '15 % automático de verano', discount_cents: 300,
      },
      promotion: { status: 'not_provided' },
    });
    const line = priced.lines[0]!;
    const orders = createOrderOperations(db.asD1(), undefined, undefined, {
      reservationsEnabled: false,
      automaticDiscountApplication: {
        discountId: 'auto-summer', discountVersion: 1, discountCents: 300,
        snapshot: { schema: 1, conflict_policy: 'promotion_code_precedence' },
      },
    });
    const placed = await orders.placeOrder({
      order_number: 'AUTO-ORDER', email: 'auto@example.test', customer_name: 'Auto',
      address_json: '{}', subtotal_cents: 1700, shipping_cents: 0, total_cents: 1700,
      stripe_session_id: 'session_AUTO_ORDER', currency: 'EUR',
    }, [{
      product_id: 1, name_snapshot: line.name, unit_price_cents: line.unit_price_cents,
      base_unit_price_cents: line.pricing!.base_unit_price_cents,
      pricing_snapshot_json: JSON.stringify(line.pricing), qty: 2,
    }], 'simulated');
    expect(placed).not.toBeNull();
    expect(db.query('SELECT discount_id, discount_version, discount_cents FROM automatic_discount_applications'))
      .toEqual([{ discount_id: 'auto-summer', discount_version: 1, discount_cents: 300 }]);
    expect(await orders.confirmPayment({
      lookup: { by: 'id', orderId: placed!.orderId },
      paymentIntent: 'sim_pi_auto_order',
      source: 'simulated',
      causationId: placed!.event.event_id,
    })).toBe(true);
    const backup = await exportBackup(createD1BackupReader(db.asD1()), new Date(AT));
    expect(backup.sql).toContain('logic2b-backup-schema: 23');
    const restored = new SqliteD1();
    restored.sqlite.exec(backup.sql);
    expect(restored.query('SELECT discount_id, discount_version, discount_cents FROM automatic_discount_applications'))
      .toEqual([{ discount_id: 'auto-summer', discount_version: 1, discount_cents: 300 }]);
    expect(restored.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('da precedencia global al código elegible y cae al automático si el código se rechaza', async () => {
    const db = new SqliteD1();
    seedProduct(db);
    seedAutomatic(db);
    db.sqlite.prepare(`
      INSERT INTO promotion_codes (
        id, code_hash, code_hint, label, state, version, priority, currency,
        effect_type, basis_points, markets_json, channels_json,
        minimum_subtotal_cents, created_at, updated_at
      ) VALUES ('promo-10', ?, '••••O-10', 'Código 10', 'active', 1, 5,
        'EUR', 'percentage_off', 1000, '["ES"]', '["storefront"]', 0, '${AT}', '${AT}')
    `).run(await promotionCodeHash('PROMO-10'));
    db.sqlite.exec("INSERT INTO promotion_code_products (promotion_id, product_id) VALUES ('promo-10', 1)");

    expect(await quote(db, 'PROMO-10')).toMatchObject({
      subtotal_cents: 1800,
      promotion: { status: 'applied', promotion_id: 'promo-10', discount_cents: 200 },
      automatic_discount: { status: 'not_applied', reason: 'promotion_code_precedence' },
    });
    expect(await quote(db, 'NO-EXISTE')).toMatchObject({
      subtotal_cents: 1700,
      promotion: { status: 'rejected' },
      automatic_discount: { status: 'applied', discount_id: 'auto-summer', discount_cents: 300 },
    });
    db.sqlite.exec("UPDATE promotion_codes SET markets_json='[\"PT\"]' WHERE id='promo-10'");
    expect(await quote(db, 'PROMO-10')).toMatchObject({
      subtotal_cents: 1700,
      promotion: { status: 'rejected' },
      automatic_discount: { status: 'applied', discount_id: 'auto-summer', discount_cents: 300 },
    });
  });

  it('rechaza construir una orden con ambas fuentes aunque el caller se equivoque', () => {
    const db = new SqliteD1();
    expect(() => createOrderOperations(db.asD1(), undefined, undefined, {
      promotionReservation: {
        promotionId: 'promo', promotionVersion: 1, customerKeyHash: 'a'.repeat(64),
        discountCents: 100, snapshot: {},
      },
      automaticDiscountApplication: {
        discountId: 'auto', discountVersion: 1, discountCents: 100, snapshot: {},
      },
    })).toThrow(/no puede combinar/);
  });
});
