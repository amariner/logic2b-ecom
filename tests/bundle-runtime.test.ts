import { describe, expect, it } from 'vitest';
import { createOrderOperations } from '../src/composition/order-operations';
import { createRefundOperations } from '../src/composition/refund-operations';
import { createFulfillmentOperations } from '../src/composition/fulfillment-operations';
import { createReturnOperations } from '../src/composition/return-operations';
import { quoteCart } from '../src/lib/quote';
import { SqliteD1 } from './sqlite-d1';

const AT = '2026-08-14T15:00:00.000Z';

function database(): SqliteD1 {
  const db = new SqliteD1();
  db.sqlite.exec(`
    INSERT INTO products (id, slug, name, price_cents, stock, category, image)
    VALUES (1, 'component-a', 'Componente A', 300, 6, 'test', ''),
      (2, 'component-b', 'Componente B', 400, 4, 'test', ''),
      (10, 'fixed-kit', 'Kit fijo', 900, 0, 'test', ''),
      (11, 'config-kit', 'Kit configurable', 1000, 0, 'test', '');
    INSERT INTO product_variants (id, product_id, sku, title, price_cents, status, is_default, option_signature)
    VALUES (1, 1, 'COMP-A', '', 300, 'active', 1, NULL),
      (2, 2, 'COMP-B', '', 400, 'active', 1, NULL),
      (10, 10, 'KIT-FIXED', '', 900, 'active', 1, NULL),
      (11, 11, 'KIT-CONFIG', '', 1000, 'active', 1, NULL);
    INSERT INTO inventory_balances (variant_id, on_hand, reserved, version)
    VALUES (1, 6, 0, 1), (2, 4, 0, 1);
    INSERT INTO inventory_movements (variant_id, delta, reason, balance_after, version_after,
      actor_kind, actor_id, reference_type, reference_id, idempotency_key, correlation_id, occurred_at)
    VALUES (1, 6, 'legacy_opening_balance', 6, 1, 'system', 'test', 'test', '1',
      'bundle:a:opening', 'inventory:variant:1', '${AT}'),
      (2, 4, 'legacy_opening_balance', 4, 1, 'system', 'test', 'test', '2',
      'bundle:b:opening', 'inventory:variant:2', '${AT}');
    INSERT INTO bundles (id, product_id, label, kind, state, version, created_at, updated_at)
    VALUES ('fixed-kit', 10, 'Kit fijo', 'fixed', 'disabled', 1, '${AT}', '${AT}'),
      ('config-kit', 11, 'Kit configurable', 'configurable', 'disabled', 1, '${AT}', '${AT}');
    INSERT INTO bundle_components (bundle_id, group_id, product_id, quantity, is_default, sort_order)
    VALUES ('fixed-kit', NULL, 1, 2, 1, 0), ('fixed-kit', NULL, 2, 1, 1, 1);
    INSERT INTO bundle_groups (bundle_id, id, label, minimum_selections, maximum_selections)
    VALUES ('config-kit', 'main', 'Componente principal', 1, 1);
    INSERT INTO bundle_components (bundle_id, group_id, product_id, quantity, is_default, sort_order)
    VALUES ('config-kit', 'main', 1, 1, 1, 0), ('config-kit', 'main', 2, 2, 0, 1);
    UPDATE bundles SET state='active' WHERE id IN ('fixed-kit','config-kit');
  `);
  return db;
}

describe('recorrido R4.7 de bundles', () => {
  it('cotiza por stock limitante, persiste composición y descuenta componentes al cobrar', async () => {
    const db = database();
    const quote = await quoteCart(db.asD1(), { lines: [{ slug: 'fixed-kit', qty: 2 }] }, {
      bundlesEnabled: true,
      pricingContext: { at: AT, currency: 'EUR', market: 'ES', channel: 'storefront' },
    });
    expect(quote).toMatchObject({ purchasable: true, subtotal_cents: 1800,
      bundles: { status: 'applied', applications: [{ bundle_id: 'fixed-kit', version: 1,
        product_id: 10, quantity: 2, unit_price_cents: 900,
        components: [{ productId: 1, quantityPerBundle: 2 }, { productId: 2, quantityPerBundle: 1 }] }] },
      lines: [{ available_stock: 3, unit_price_cents: 900,
        pricing: { bundle: { bundle_id: 'fixed-kit', kind: 'fixed' } } }] });
    if (quote.bundles.status !== 'applied') throw new Error('Bundle ausente.');
    const line = quote.lines[0]!;
    const orders = createOrderOperations(db.asD1(), undefined, undefined, {
      reservationsEnabled: false,
      bundleApplications: quote.bundles.applications.map((application) => ({
        bundleId: application.bundle_id, bundleVersion: application.version,
        bundleProductId: application.product_id, unitPriceCents: application.unit_price_cents,
        quantity: application.quantity, snapshot: application.snapshot,
        components: application.components,
      })),
    });
    const placed = await orders.placeOrder({
      order_number: 'BUNDLE-ORDER', email: 'bundle@example.test', customer_name: 'Bundle',
      address_json: '{}', subtotal_cents: 1800, shipping_cents: 0, total_cents: 1800,
      stripe_session_id: 'session_BUNDLE_ORDER', currency: 'EUR',
    }, [{ product_id: 10, name_snapshot: line.name, unit_price_cents: line.unit_price_cents,
      base_unit_price_cents: line.pricing!.base_unit_price_cents,
      pricing_snapshot_json: JSON.stringify(line.pricing), qty: 2 }], 'simulated');
    expect(placed).not.toBeNull();
    expect(db.query(`SELECT product_id, quantity_per_bundle FROM order_bundle_components
      ORDER BY product_id`)).toEqual([
      { product_id: 1, quantity_per_bundle: 2 }, { product_id: 2, quantity_per_bundle: 1 },
    ]);
    expect(await orders.confirmPayment({ lookup: { by: 'id', orderId: placed!.orderId },
      paymentIntent: 'sim_pi_bundle', source: 'simulated', causationId: placed!.event.event_id })).toBe(true);
    expect(db.query('SELECT variant_id, on_hand FROM inventory_balances ORDER BY variant_id'))
      .toEqual([{ variant_id: 1, on_hand: 2 }, { variant_id: 2, on_hand: 2 }]);
    expect(db.query('SELECT stock FROM products WHERE id IN (1,2,10) ORDER BY id'))
      .toEqual([{ stock: 2 }, { stock: 2 }, { stock: 0 }]);
    const refunds = createRefundOperations(db.asD1(), () => ({ provider: 'simulated',
      refund: async (request) => ({ status: 'succeeded' as const,
        providerReference: `sim_ref_${request.idempotencyKey}` }) }));
    expect(await refunds.refundTotal({ orderId: placed!.orderId, reason: 'Cancelar kit', restock: true }))
      .toMatchObject({ outcome: 'applied' });
    expect(db.query('SELECT variant_id, on_hand FROM inventory_balances ORDER BY variant_id'))
      .toEqual([{ variant_id: 1, on_hand: 6 }, { variant_id: 2, on_hand: 4 }]);
    expect(db.query(`SELECT variant_id, delta FROM inventory_movements
      WHERE reason='cancellation_restock' ORDER BY variant_id`))
      .toEqual([{ variant_id: 1, delta: 4 }, { variant_id: 2, delta: 2 }]);
    expect(db.query('SELECT stock FROM products WHERE id IN (1,2,10) ORDER BY id'))
      .toEqual([{ stock: 6 }, { stock: 4 }, { stock: 0 }]);
  });

  it('un configurable usa defaults y valida opciones por slug servidor', async () => {
    const db = database();
    expect(await quoteCart(db.asD1(), { lines: [{ slug: 'config-kit', qty: 1 }] }, {
      bundlesEnabled: true,
    })).toMatchObject({ lines: [{ available_stock: 6,
      pricing: { bundle: { selections: [{ group_id: 'main', product_id: 1 }] } } }] });
    expect(await quoteCart(db.asD1(), { lines: [{ slug: 'config-kit', qty: 1,
      bundle_selections: [{ group_id: 'main', product_slug: 'component-b' }] }] }, {
      bundlesEnabled: true,
    })).toMatchObject({ lines: [{ available_stock: 2,
      pricing: { bundle: { selections: [{ group_id: 'main', product_id: 2 }],
        components: [{ product_id: 2, quantity_per_bundle: 2 }] } } }] });
    await expect(quoteCart(db.asD1(), { lines: [{ slug: 'config-kit', qty: 1,
      bundle_selections: [{ group_id: 'main', product_slug: 'no-existe' }] }] }, {
      bundlesEnabled: true,
    })).rejects.toThrow(/no disponible/);
  });

  it('envía unidades comerciales y un RMA repone cada componente congelado', async () => {
    const db = database();
    const quote = await quoteCart(db.asD1(), { lines: [{ slug: 'fixed-kit', qty: 2 }] }, {
      bundlesEnabled: true,
    });
    if (quote.bundles.status !== 'applied') throw new Error('Bundle ausente.');
    const line = quote.lines[0]!;
    const orders = createOrderOperations(db.asD1(), undefined, undefined, {
      reservationsEnabled: false,
      bundleApplications: quote.bundles.applications.map((application) => ({
        bundleId: application.bundle_id, bundleVersion: application.version,
        bundleProductId: application.product_id, unitPriceCents: application.unit_price_cents,
        quantity: application.quantity, snapshot: application.snapshot, components: application.components,
      })),
    });
    const placed = await orders.placeOrder({
      order_number: 'BUNDLE-RMA', email: 'bundle-rma@example.test', customer_name: 'Bundle RMA',
      address_json: '{}', subtotal_cents: 1800, shipping_cents: 0, total_cents: 1800,
      stripe_session_id: 'session_BUNDLE_RMA', currency: 'EUR',
    }, [{ product_id: 10, name_snapshot: line.name, unit_price_cents: line.unit_price_cents,
      base_unit_price_cents: line.pricing!.base_unit_price_cents,
      pricing_snapshot_json: JSON.stringify(line.pricing), qty: 2 }], 'simulated');
    await orders.confirmPayment({ lookup: { by: 'id', orderId: placed!.orderId },
      paymentIntent: 'sim_pi_bundle_rma', source: 'simulated' });
    const fulfillment = createFulfillmentOperations(db.asD1());
    const shipped = await fulfillment.ship({ orderId: placed!.orderId,
      tracking: { carrier: 'SEUR', number: 'BUNDLE-RMA' }, idempotencyKey: 'bundle-rma-ship' });
    expect(shipped.outcome).toBe('applied');
    expect((await fulfillment.deliver(shipped.fulfillmentId!)).outcome).toBe('applied');
    expect(db.query('SELECT quantity FROM fulfillment_items')).toEqual([{ quantity: 2 }]);
    expect(db.value('SELECT count(*) AS value FROM order_bundle_components')).toBe(2);

    const deliveredAt = String(db.value(`SELECT max(delivered_at) AS value FROM fulfillments`));
    const returns = createReturnOperations(db.asD1(), () => ({ provider: 'simulated',
      refund: async (request) => ({ status: 'succeeded' as const,
        providerReference: `sim_return_${request.idempotencyKey}` }) }), undefined,
    () => deliveredAt);
    const locationId = Number(db.value("SELECT id AS value FROM inventory_locations WHERE code='principal'"));
    const orderItemId = Number(db.value('SELECT id AS value FROM order_items WHERE order_id=?', placed!.orderId));
    const created = await returns.create({ orderId: placed!.orderId, receiveLocationId: locationId,
      reason: 'not_as_expected', requestedByKind: 'admin', requestedById: 'admin-panel',
      idempotencyKey: 'bundle-rma-create', lines: [{ orderItemId, quantity: 1 }] });
    const returnId = created.detail!.request.id;
    const returnLineId = created.detail!.lines[0]!.id;
    await returns.authorize(returnId, 1, 'bundle-rma-authorize');
    await returns.markInTransit(returnId, 2, 'bundle-rma-transit');
    await returns.receive(returnId, 3, 'bundle-rma-receive',
      [{ returnLineId, receivedQuantity: 1 }]);
    await returns.inspect(returnId, 4, 'bundle-rma-inspect',
      [{ returnLineId, inspection: 'restock', resolution: 'refund' }]);
    expect((await returns.resolve(returnId, 5, 'bundle-rma-resolve')).outcome).toBe('applied');
    expect(db.query('SELECT variant_id, on_hand FROM inventory_balances ORDER BY variant_id'))
      .toEqual([{ variant_id: 1, on_hand: 4 }, { variant_id: 2, on_hand: 3 }]);
    expect(db.query(`SELECT component_variant_id, quantity
      FROM bundle_return_inventory_movements ORDER BY component_variant_id`))
      .toEqual([{ component_variant_id: 1, quantity: 2 }, { component_variant_id: 2, quantity: 1 }]);
    expect(db.value('SELECT count(*) AS value FROM return_inventory_movements')).toBe(0);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });
});
