import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import migration1 from '../migrations/0001_init.sql?raw';
import migration2 from '../migrations/0002_collections_and_product_capabilities.sql?raw';
import migration3 from '../migrations/0003_contact_requests.sql?raw';
import migration4 from '../migrations/0004_event_outbox.sql?raw';
import migration5 from '../migrations/0005_audit_log.sql?raw';
import migration6 from '../migrations/0006_platform_job_runs.sql?raw';
import migration7 from '../migrations/0007_product_variants.sql?raw';
import { seedStatements } from '../seed/seed';
import { SqliteD1 } from './sqlite-d1';

const legacyMigrations = [migration1, migration2, migration3, migration4, migration5, migration6];

function legacyDatabase(): DatabaseSync {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys = ON;');
  for (const migration of legacyMigrations) database.exec(migration);
  return database;
}

function scalar(database: DatabaseSync, sql: string): number {
  return Number(database.prepare(sql).get()?.value ?? 0);
}

function seedLegacyRows(database: DatabaseSync): void {
  database.exec(`
    INSERT INTO products (
      id, slug, name, description, price_cents, stock, image, category, active,
      created_at, collection, compare_at_price_cents
    ) VALUES
      (1, 'active-product', 'Producto activo', '', 1299, 8, '', 'test', 1,
       '2026-08-01 10:00:00', 'demo', 1599),
      (2, 'archived-product', 'Producto archivado', '', 2500, 0, '', 'test', 0,
       '2026-08-02 10:00:00', 'demo', NULL);
    INSERT INTO orders (
      id, order_number, email, customer_name, address_json,
      subtotal_cents, shipping_cents, total_cents, status, stripe_session_id
    ) VALUES (
      1, 'LE-0001', 'cliente@example.test', 'Cliente', '{}',
      1299, 0, 1299, 'paid', 'cs_test_1'
    );
    INSERT INTO order_items (
      id, order_id, product_id, name_snapshot, unit_price_cents, qty
    ) VALUES (1, 1, 1, 'Nombre historico', 1299, 1);
  `);
}

describe('R2.2 producto-variante', () => {
  it('backfillea una variante default por producto sin alterar datos legacy', () => {
    const database = legacyDatabase();
    seedLegacyRows(database);
    const productsBefore = JSON.stringify(database.prepare('SELECT * FROM products ORDER BY id').all());
    const itemsBefore = JSON.stringify(database.prepare(`
      SELECT id, order_id, product_id, name_snapshot, unit_price_cents, qty
      FROM order_items ORDER BY id
    `).all());

    database.exec(migration7);

    expect(database.prepare(`
      SELECT product_id, sku, title, price_cents, compare_at_price_cents,
             status, is_default, option_signature, created_at, updated_at
      FROM product_variants ORDER BY product_id
    `).all()).toEqual([
      {
        product_id: 1,
        sku: 'LEGACY-1',
        title: '',
        price_cents: 1299,
        compare_at_price_cents: 1599,
        status: 'active',
        is_default: 1,
        option_signature: null,
        created_at: '2026-08-01 10:00:00',
        updated_at: '2026-08-01 10:00:00',
      },
      {
        product_id: 2,
        sku: 'LEGACY-2',
        title: '',
        price_cents: 2500,
        compare_at_price_cents: null,
        status: 'archived',
        is_default: 1,
        option_signature: null,
        created_at: '2026-08-02 10:00:00',
        updated_at: '2026-08-02 10:00:00',
      },
    ]);
    expect(database.prepare(`
      SELECT variant_id, sku_snapshot, product_name_snapshot, variant_name_snapshot
      FROM order_items WHERE id = 1
    `).get()).toEqual({
      variant_id: 1,
      sku_snapshot: 'LEGACY-1',
      product_name_snapshot: 'Nombre historico',
      variant_name_snapshot: null,
    });
    expect(JSON.stringify(database.prepare('SELECT * FROM products ORDER BY id').all())).toBe(productsBefore);
    expect(JSON.stringify(database.prepare(`
      SELECT id, order_id, product_id, name_snapshot, unit_price_cents, qty
      FROM order_items ORDER BY id
    `).all())).toBe(itemsBefore);
    expect(scalar(database, 'SELECT count(*) AS value FROM product_options')).toBe(0);
    expect(scalar(database, 'SELECT count(*) AS value FROM product_option_values')).toBe(0);
    expect(scalar(database, 'SELECT count(*) AS value FROM product_variant_option_values')).toBe(0);
    expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(database.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });
  });

  it('fija unicidad, dinero, default y firma de combinacion en el esquema', () => {
    const database = legacyDatabase();
    seedLegacyRows(database);
    database.exec(migration7);

    expect(() => database.prepare(`
      INSERT INTO product_variants (
        product_id, sku, title, price_cents, status, is_default, option_signature
      ) VALUES (2, 'legacy-1', '', 2500, 'draft', 0, '[10]')
    `).run()).toThrow(/UNIQUE/);

    expect(() => database.prepare(`
      INSERT INTO product_variants (
        product_id, sku, title, price_cents, compare_at_price_cents,
        status, is_default, option_signature
      ) VALUES (1, 'BAD-PRICE', '', 1299, 1299, 'draft', 0, '[11]')
    `).run()).toThrow(/CHECK/);

    expect(() => database.prepare(`
      INSERT INTO product_variants (
        product_id, sku, title, price_cents, status, is_default, option_signature
      ) VALUES (1, 'SECOND-DEFAULT', '', 1299, 'active', 1, '[12]')
    `).run()).toThrow(/UNIQUE/);

    database.prepare(`
      INSERT INTO product_variants (
        product_id, sku, title, price_cents, status, is_default, option_signature
      ) VALUES (1, 'SIZE-M', 'M', 1299, 'active', 0, '[13]')
    `).run();
    expect(() => database.prepare(`
      INSERT INTO product_variants (
        product_id, sku, title, price_cents, status, is_default, option_signature
      ) VALUES (1, 'SIZE-M-DUP', 'M duplicada', 1299, 'draft', 0, '[13]')
    `).run()).toThrow(/UNIQUE/);
  });

  it('impide mezclar opciones y valores de productos distintos', () => {
    const database = legacyDatabase();
    seedLegacyRows(database);
    database.exec(migration7);
    database.exec(`
      INSERT INTO product_options (id, product_id, name, position)
      VALUES (10, 1, 'Talla', 0), (20, 2, 'Color', 0);
      INSERT INTO product_option_values (id, option_id, value, position)
      VALUES (11, 10, 'M', 0), (21, 20, 'Negro', 0);
      INSERT INTO product_variants (
        id, product_id, sku, title, price_cents, status, is_default, option_signature
      ) VALUES (10, 1, 'ACTIVE-M', 'M', 1299, 'active', 0, '[11]');
    `);

    database.prepare(`
      INSERT INTO product_variant_option_values (
        variant_id, product_id, option_id, option_value_id
      ) VALUES (10, 1, 10, 11)
    `).run();
    expect(() => database.prepare(`
      INSERT INTO product_variant_option_values (
        variant_id, product_id, option_id, option_value_id
      ) VALUES (10, 1, 20, 21)
    `).run()).toThrow(/FOREIGN KEY/);
    expect(() => database.prepare(`
      INSERT INTO product_option_values (option_id, value, position)
      VALUES (10, 'm', 1)
    `).run()).toThrow(/UNIQUE/);
    expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  it('el reset v1 reconstruye variantes y snapshots de forma idempotente', async () => {
    const database = new SqliteD1();
    const reset = async () => database.batch(seedStatements().map((sql) => database.prepare(sql)));

    await reset();
    const products = Number(database.value('SELECT count(*) AS value FROM products'));
    expect(Number(database.value('SELECT count(*) AS value FROM product_variants'))).toBe(products);
    expect(Number(database.value(`
      SELECT count(*) AS value
      FROM products p
      LEFT JOIN product_variants pv
        ON pv.product_id = p.id AND pv.is_default = 1
      WHERE pv.id IS NULL
        OR pv.price_cents <> p.price_cents
        OR pv.status <> CASE p.active WHEN 1 THEN 'active' ELSE 'archived' END
    `))).toBe(0);
    expect(Number(database.value(`
      SELECT count(*) AS value FROM order_items
      WHERE variant_id IS NULL OR sku_snapshot IS NULL OR product_name_snapshot IS NULL
    `))).toBe(0);

    await reset();
    expect(Number(database.value('SELECT count(*) AS value FROM product_variants'))).toBe(products);
    expect(database.query('PRAGMA foreign_key_check')).toEqual([]);
  });
});
