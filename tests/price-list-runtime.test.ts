import { describe, expect, it } from 'vitest';
import { createOrderOperations } from '../src/composition/order-operations';
import { quoteCart } from '../src/lib/quote';
import { planOrderAmendment } from '../src/modules/orders';
import { planPartialRefund } from '../src/modules/payments';
import { createD1BackupReader, exportBackup } from '../src/platform/operations';
import { SqliteD1 } from './sqlite-d1';

const AT = '2026-08-14T12:00:00.000Z';
const COMPANY = 'c'.repeat(64);

function database(): SqliteD1 {
  const db = new SqliteD1();
  db.sqlite.exec(`
    INSERT INTO products (id, slug, name, price_cents, stock, category, image)
    VALUES (1, 'listed', 'Producto listado', 1000, 10, 'test', '');
    INSERT INTO product_variants (id, product_id, sku, title, price_cents, status, is_default, option_signature)
    VALUES (1, 1, 'LIST-1', '', 1000, 'active', 1, NULL);
    INSERT INTO inventory_balances (variant_id, on_hand, reserved, version) VALUES (1, 10, 0, 1);
    INSERT INTO inventory_movements (variant_id, delta, reason, balance_after, version_after,
      actor_kind, actor_id, reference_type, reference_id, idempotency_key, correlation_id, occurred_at)
    VALUES (1, 10, 'legacy_opening_balance', 10, 1, 'system', 'test', 'test', '1',
      'price-list:test:opening', 'inventory:variant:1', '${AT}');
    INSERT INTO price_lists (id, label, state, version, priority, currency,
      markets_json, channels_json, created_at, updated_at)
    VALUES ('general-b2b', 'General B2B', 'active', 1, 10, 'EUR', '["ES"]',
      '["storefront"]', '${AT}', '${AT}'),
      ('enterprise', 'Empresa concertada', 'active', 1, 100, 'EUR', '["ES"]',
      '["storefront"]', '${AT}', '${AT}');
    INSERT INTO price_list_products (price_list_id, product_id, price_cents)
    VALUES ('general-b2b', 1, 800), ('enterprise', 1, 700);
    INSERT INTO price_list_companies (price_list_id, company_key_hash)
    VALUES ('enterprise', '${COMPANY}');
    INSERT INTO automatic_discounts (id, label, public_reason, state, version, priority,
      currency, effect_type, basis_points, markets_json, channels_json,
      minimum_subtotal_cents, created_at, updated_at)
    VALUES ('auto-10', 'Auto 10', '10 % automático', 'active', 1, 10, 'EUR',
      'percentage_off', 1000, '["ES"]', '["storefront"]', 0, '${AT}', '${AT}');
    INSERT INTO automatic_discount_products (discount_id, product_id) VALUES ('auto-10', 1);
  `);
  return db;
}

async function quote(db: SqliteD1, companyKeyHash?: string) {
  return quoteCart(db.asD1(), { lines: [{ slug: 'listed', qty: 2 }] }, {
    priceListsEnabled: true, automaticDiscountsEnabled: true,
    ...(companyKeyHash === undefined ? {} : { priceListCompanyKeyHash: companyKeyHash }),
    pricingContext: { at: AT, currency: 'EUR', market: 'ES', channel: 'storefront' },
  });
}

describe('recorrido R4.6 de listas de precios', () => {
  it('aplica lista antes de promociones, persiste evidencia y congela edición/devolución', async () => {
    const db = database();
    const priced = await quote(db);
    expect(priced).toMatchObject({
      subtotal_cents: 1440,
      automatic_discount: { status: 'applied', discount_cents: 160 },
      price_lists: { status: 'applied', applications: [{
        price_list_id: 'general-b2b', version: 1, line_count: 1,
        catalog_subtotal_cents: 2000, effective_subtotal_cents: 1600, delta_cents: -400,
      }] },
      lines: [{ unit_price_cents: 720, pricing: {
        base_unit_price_cents: 800,
        price_origin: { type: 'price_list', price_list_id: 'general-b2b', catalog_unit_price_cents: 1000 },
      } }],
    });
    if (priced.price_lists.status !== 'applied' || priced.automatic_discount.status !== 'applied') {
      throw new Error('Aplicaciones de pricing ausentes.');
    }
    const application = priced.price_lists.applications[0]!;
    const line = priced.lines[0]!;
    const orders = createOrderOperations(db.asD1(), undefined, undefined, {
      reservationsEnabled: false,
      priceListApplications: [{
        priceListId: application.price_list_id, priceListVersion: application.version,
        catalogSubtotalCents: application.catalog_subtotal_cents,
        effectiveSubtotalCents: application.effective_subtotal_cents, lineCount: application.line_count,
        snapshot: { schema: 1, price_list_id: application.price_list_id, version: application.version,
          line_count: application.line_count, catalog_subtotal_cents: application.catalog_subtotal_cents,
          effective_subtotal_cents: application.effective_subtotal_cents, delta_cents: application.delta_cents },
      }],
      automaticDiscountApplication: {
        discountId: 'auto-10', discountVersion: 1, discountCents: 160,
        snapshot: { schema: 1, discount_id: 'auto-10', version: 1, discount_cents: 160 },
      },
    });
    const placed = await orders.placeOrder({
      order_number: 'LIST-ORDER', email: 'list@example.test', customer_name: 'List', address_json: '{}',
      subtotal_cents: 1440, shipping_cents: 0, total_cents: 1440,
      stripe_session_id: 'session_LIST_ORDER', currency: 'EUR',
    }, [{ product_id: 1, name_snapshot: line.name, unit_price_cents: line.unit_price_cents,
      base_unit_price_cents: line.pricing!.base_unit_price_cents,
      pricing_snapshot_json: JSON.stringify(line.pricing), qty: 2 }], 'simulated');
    expect(placed).not.toBeNull();
    expect(db.query(`SELECT price_list_id, price_list_version, catalog_subtotal_cents,
      effective_subtotal_cents FROM price_list_applications`)).toEqual([{
      price_list_id: 'general-b2b', price_list_version: 1,
      catalog_subtotal_cents: 2000, effective_subtotal_cents: 1600,
    }]);

    const refund = planPartialRefund(
      { id: 1, order_id: placed!.orderId, provider: 'simulated', provider_reference: 'pi',
        currency: 'EUR', expected_amount_cents: 1440, status: 'captured', version: 1, refunded_cents: 0 },
      { subtotal_cents: 1440, shipping_cents: 0, total_cents: 1440 },
      [{ order_item_id: 1, unit_price_cents: 720, ordered_quantity: 2,
        fulfilled_quantity: 0, cancelled_quantity: 0 }],
      [{ order_item_id: 1, quantity: 1 }], 'none', 'merchandise-only');
    expect(refund).toMatchObject({ subtotal_cents: 720, total_cents: 720 });
    const amendment = planOrderAmendment({
      order: { id: placed!.orderId, order_number: 'LIST-ORDER', email: 'list@example.test',
        status: 'paid', edit_version: 1, address_json: '{}', subtotal_cents: 1440,
        shipping_cents: 0, total_cents: 1440, currency: 'EUR' },
      lines: [{ order_item_id: 1, product_id: 1, variant_id: 1, name_snapshot: 'Producto listado',
        sku_snapshot: 'LIST-1', variant_name_snapshot: null, unit_price_cents: 720,
        current_quantity: 2, fulfilled_quantity: 0, cancelled_quantity: 0 }],
      variants: [{ product_id: 1, variant_id: 1, name: 'Producto listado', sku: 'LIST-1',
        variant_name: null, unit_price_cents: 1000, available_quantity: 8, active: true }],
      requestedLines: [{ order_item_id: 1, quantity: 1 }], addressAfterJson: '{}', shippingAfterCents: 0,
      hasActiveFulfillment: false, hasActiveAmendment: false,
    });
    expect(amendment).toMatchObject({ subtotal_after_cents: 720, delta_cents: -720 });

    expect(await orders.confirmPayment({ lookup: { by: 'id', orderId: placed!.orderId },
      paymentIntent: 'sim_pi_list', source: 'simulated', causationId: placed!.event.event_id })).toBe(true);
    db.sqlite.exec(`UPDATE price_lists SET state='disabled', version=2,
      updated_at='2099-08-14T13:00:00.000Z' WHERE id='general-b2b'`);
    const backup = await exportBackup(createD1BackupReader(db.asD1()), new Date(AT));
    expect(backup.sql).toContain('logic2b-backup-schema: 24');
    const restored = new SqliteD1();
    restored.sqlite.exec(backup.sql);
    expect(restored.query('SELECT price_list_id, effective_subtotal_cents FROM price_list_applications'))
      .toEqual([{ price_list_id: 'general-b2b', effective_subtotal_cents: 1600 }]);
    expect(restored.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('solo una identidad empresarial confiable activa la lista concertada', async () => {
    const db = database();
    expect(await quote(db)).toMatchObject({
      lines: [{ pricing: { base_unit_price_cents: 800,
        price_origin: { price_list_id: 'general-b2b', company_scoped: false } } }],
    });
    expect(await quote(db, COMPANY)).toMatchObject({
      lines: [{ unit_price_cents: 630, pricing: { base_unit_price_cents: 700,
        price_origin: { price_list_id: 'enterprise', company_scoped: true } } }],
    });
  });
});
