import { describe, expect, it } from 'vitest';
import migration30 from '../migrations/0030_contextual_price_lists.sql?raw';
import { evaluatePriceRules } from '../src/modules/pricing';
import { SqliteD1 } from './sqlite-d1';

const AT = '2026-08-14T12:00:00.000Z';

function base(): SqliteD1 {
  const db = new SqliteD1(true, true, true, true, true, true, false);
  db.sqlite.exec(migration30);
  db.sqlite.exec(`
    INSERT INTO products (id, slug, name, price_cents, stock, category)
    VALUES (1, 'listed', 'Listed', 1000, 10, 'test');
    INSERT INTO price_lists (id, label, state, version, priority, currency,
      markets_json, channels_json, created_at, updated_at)
    VALUES ('general-b2b', 'General B2B', 'active', 1, 10, 'EUR', '["ES"]',
      '["storefront"]', '${AT}', '${AT}');
    INSERT INTO price_list_products (price_list_id, product_id, price_cents)
    VALUES ('general-b2b', 1, 800);
    INSERT INTO orders (id, order_number, email, customer_name, address_json,
      subtotal_cents, shipping_cents, total_cents, status, currency)
    VALUES (1, 'LIST-ONE', 'list@example.test', 'List', '{}', 800, 0, 800, 'pending', 'EUR');
  `);
  const pricing = {
    ...evaluatePriceRules({
      baseUnitPriceCents: 800, quantity: 2,
      context: { at: AT, currency: 'EUR', market: 'ES', channel: 'storefront' },
    }),
    price_origin: {
      type: 'price_list', price_list_id: 'general-b2b', version: 1, label: 'General B2B',
      priority: 10, catalog_unit_price_cents: 1000, unit_price_cents: 800,
      company_scoped: false, fallback_depth: 0,
    },
  };
  db.sqlite.prepare(`INSERT INTO order_items (id, order_id, product_id, name_snapshot,
    unit_price_cents, base_unit_price_cents, pricing_snapshot_json, qty, current_qty)
    VALUES (1, 1, 1, 'Listed', 800, 800, ?, 2, 2)`).run(JSON.stringify(pricing));
  return db;
}

function apply(db: SqliteD1, catalog = 2000): void {
  const snapshot = JSON.stringify({
    schema: 1, price_list_id: 'general-b2b', version: 1, line_count: 1,
    catalog_subtotal_cents: catalog, effective_subtotal_cents: 1600,
    delta_cents: 1600 - catalog,
  });
  db.sqlite.prepare(`INSERT INTO price_list_applications (
    id, price_list_id, price_list_version, order_id, catalog_subtotal_cents,
    effective_subtotal_cents, line_count, snapshot_json, idempotency_key, applied_at
  ) VALUES ('list-app-one', 'general-b2b', 1, 1, ?, 1600, 1, ?, 'list:order:one', ?)`)
    .run(catalog, snapshot, AT);
}

describe('migración 0030 de listas de precios', () => {
  it('es expand-only, no inventa listas y conserva FKs', () => {
    const db = new SqliteD1(true, true, true, true, true, true, false);
    const before = db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'").length;
    db.sqlite.exec(migration30);
    expect(db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'").length).toBe(before + 4);
    expect(db.value('SELECT count(*) AS value FROM price_lists')).toBe(0);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('acepta totales y origen coherentes y rechaza catálogo o precio manipulados', () => {
    const db = base();
    expect(() => apply(db, 1999)).toThrow(/price_list_application_conflict/);
    db.sqlite.exec('UPDATE price_list_products SET price_cents=799');
    expect(() => apply(db)).toThrow(/price_list_application_conflict/);
    db.sqlite.exec('UPDATE price_list_products SET price_cents=800');
    apply(db);
    expect(db.query(`SELECT price_list_id, price_list_version, catalog_subtotal_cents,
      effective_subtotal_cents, line_count FROM price_list_applications`)).toEqual([{
      price_list_id: 'general-b2b', price_list_version: 1, catalog_subtotal_cents: 2000,
      effective_subtotal_cents: 1600, line_count: 1,
    }]);
  });

  it('rechaza hashes empresariales no canónicos', () => {
    const db = base();
    expect(() => db.sqlite.exec(`INSERT INTO price_list_companies
      (price_list_id, company_key_hash) VALUES ('general-b2b', 'EMPRESA')`)).toThrow();
  });
});
