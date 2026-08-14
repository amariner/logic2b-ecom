import { describe, expect, it } from 'vitest';
import migration31 from '../migrations/0031_bundles.sql?raw';
import { evaluatePriceRules } from '../src/modules/pricing';
import { SqliteD1 } from './sqlite-d1';

const AT = '2026-08-14T15:00:00.000Z';

function base(): SqliteD1 {
  const db = new SqliteD1();
  db.sqlite.exec(`
    INSERT INTO products (id, slug, name, price_cents, stock, category)
    VALUES (1, 'component-a', 'Component A', 300, 20, 'test'),
      (2, 'component-b', 'Component B', 400, 20, 'test'),
      (10, 'fixed-kit', 'Fixed kit', 900, 0, 'test');
    INSERT INTO product_variants (id, product_id, sku, title, price_cents, status, is_default, option_signature)
    VALUES (1, 1, 'COMP-A', '', 300, 'active', 1, NULL),
      (2, 2, 'COMP-B', '', 400, 'active', 1, NULL),
      (10, 10, 'KIT-10', '', 900, 'active', 1, NULL);
    INSERT INTO bundles (id, product_id, label, kind, state, version, created_at, updated_at)
    VALUES ('fixed-kit', 10, 'Kit fijo', 'fixed', 'disabled', 1, '${AT}', '${AT}');
    INSERT INTO bundle_components (bundle_id, group_id, product_id, quantity, is_default, sort_order)
    VALUES ('fixed-kit', NULL, 1, 2, 1, 0), ('fixed-kit', NULL, 2, 1, 1, 1);
    UPDATE bundles SET state='active' WHERE id='fixed-kit';
  `);
  const bundle = { schema: 1, bundle_id: 'fixed-kit', version: 1, kind: 'fixed', label: 'Kit fijo',
    selections: [], components: [
      { product_id: 1, quantity_per_bundle: 2 }, { product_id: 2, quantity_per_bundle: 1 },
    ], stock_policy: 'minimum_component_availability', amendment_policy: 'composition_frozen',
    return_policy: 'restock_components' } as const;
  const pricing = { ...evaluatePriceRules({ baseUnitPriceCents: 900, quantity: 2,
    context: { at: AT, currency: 'EUR', market: 'ES', channel: 'storefront' } }), bundle };
  db.sqlite.exec(`INSERT INTO orders (id, order_number, email, customer_name, address_json,
    subtotal_cents, shipping_cents, total_cents, status, currency)
    VALUES (1, 'BUNDLE-ONE', 'bundle@example.test', 'Bundle', '{}', 1800, 0, 1800, 'pending', 'EUR')`);
  db.sqlite.prepare(`INSERT INTO order_items (id, order_id, product_id, variant_id, name_snapshot,
    unit_price_cents, base_unit_price_cents, pricing_snapshot_json, qty, current_qty)
    VALUES (1, 1, 10, 10, 'Fixed kit', 900, 900, ?, 2, 2)`).run(JSON.stringify(pricing));
  db.sqlite.exec(`
    INSERT INTO order_bundle_components (order_item_id, bundle_id, bundle_version, product_id,
      variant_id, quantity_per_bundle, name_snapshot, sku_snapshot)
    VALUES (1, 'fixed-kit', 1, 1, 1, 2, 'Component A', 'COMP-A'),
      (1, 'fixed-kit', 1, 2, 2, 1, 'Component B', 'COMP-B');
  `);
  return db;
}

describe('migración 0031 de bundles', () => {
  it('es expand-only y no inventa bundles', () => {
    const db = new SqliteD1(true, true, true, true, true, true, true, false);
    const before = db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'").length;
    db.sqlite.exec(migration31);
    expect(db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'").length).toBe(before + 6);
    expect(db.value('SELECT count(*) AS value FROM bundles')).toBe(0);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('acepta composición/aplicación coherentes y rechaza snapshots manipulados', () => {
    const db = base();
    const snapshot = JSON.stringify({ schema: 1, bundle_id: 'fixed-kit', version: 1, kind: 'fixed',
      label: 'Kit fijo', selections: [], components: [
        { product_id: 1, quantity_per_bundle: 2 }, { product_id: 2, quantity_per_bundle: 1 },
      ], stock_policy: 'minimum_component_availability', amendment_policy: 'composition_frozen',
      return_policy: 'restock_components' });
    expect(() => db.sqlite.prepare(`INSERT INTO bundle_applications (id, bundle_id, bundle_version,
      order_id, order_item_id, unit_price_cents, quantity, snapshot_json, idempotency_key, applied_at)
      VALUES ('bad-app', 'fixed-kit', 1, 1, 1, 899, 2, ?, 'bundle:bad', ?)`)
      .run(snapshot, AT)).toThrow(/bundle_application_conflict/);
    db.sqlite.prepare(`INSERT INTO bundle_applications (id, bundle_id, bundle_version,
      order_id, order_item_id, unit_price_cents, quantity, snapshot_json, idempotency_key, applied_at)
      VALUES ('bundle-app', 'fixed-kit', 1, 1, 1, 900, 2, ?, 'bundle:one', ?)`)
      .run(snapshot, AT);
    expect(db.query('SELECT bundle_id, bundle_version, unit_price_cents, quantity FROM bundle_applications'))
      .toEqual([{ bundle_id: 'fixed-kit', bundle_version: 1, unit_price_cents: 900, quantity: 2 }]);
  });

  it('bloquea auto-componentes y configurables con defaults inválidos', () => {
    const db = base();
    expect(() => db.sqlite.exec(`INSERT INTO bundle_components
      (bundle_id, group_id, product_id, quantity, is_default)
      VALUES ('fixed-kit', NULL, 10, 1, 1)`)).toThrow(/bundle_component_conflict/);
    db.sqlite.exec(`INSERT INTO products (id, slug, name, price_cents, stock, category)
      VALUES (11, 'config-kit', 'Config kit', 1000, 0, 'test');
      INSERT INTO bundles (id, product_id, label, kind, state, version, created_at, updated_at)
      VALUES ('config-kit', 11, 'Config kit', 'configurable', 'disabled', 1, '${AT}', '${AT}');
      INSERT INTO bundle_groups (bundle_id, id, label, minimum_selections, maximum_selections)
      VALUES ('config-kit', 'seat', 'Asiento', 1, 1);
      INSERT INTO bundle_components (bundle_id, group_id, product_id, quantity, is_default)
      VALUES ('config-kit', 'seat', 1, 1, 0)`);
    expect(() => db.sqlite.exec("UPDATE bundles SET state='active' WHERE id='config-kit'"))
      .toThrow(/bundle_activation_conflict/);
  });
});
