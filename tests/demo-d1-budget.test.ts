import { describe, expect, it } from 'vitest';
import { demoOrderFixtures } from '../seed/demo-orders';
import {
  demoOrderResetStatements,
  publicDemoSeedProducts,
  seedStatements,
} from '../seed/seed';
import { SqliteD1 } from './sqlite-d1';

const MAX_PUBLIC_DEMO_PRODUCTS = 20;
const MAX_WEEKLY_STATEMENTS = 150;
const MAX_WEEKLY_DIRECT_CHANGES = 450;

const STABLE_DEMO_TABLES = [
  'products',
  'product_variants',
  'product_media',
  'inventory_balances',
  'inventory_location_balances',
  'shipping_rates',
] as const;

describe('presupuesto D1 de la demo publica', () => {
  it('mantiene un catalogo persistente pequeno pero suficiente para los pedidos', () => {
    const products = publicDemoSeedProducts();
    const slugs = new Set(products.map((product) => product.slug));
    const orderSlugs = new Set(
      demoOrderFixtures.flatMap((order) => order.lines.map((line) => line.slug)),
    );

    expect(products).toHaveLength(MAX_PUBLIC_DEMO_PRODUCTS);
    for (const slug of orderSlugs) expect(slugs).toContain(slug);
    expect(products.some((product) => (product.variants?.length ?? 0) > 0)).toBe(true);
    expect(products.some((product) => product.stock === 0)).toBe(true);
    expect(products.some((product) => product.active === 0)).toBe(true);
  });

  it('prohibe que el refresco semanal reescriba catalogo, variantes o inventario', () => {
    const weekly = demoOrderResetStatements();

    expect(weekly.length).toBeLessThanOrEqual(MAX_WEEKLY_STATEMENTS);
    for (const table of STABLE_DEMO_TABLES) {
      expect(
        weekly.some((sql) => new RegExp(`^(?:DELETE FROM|INSERT INTO|UPDATE) ${table}\\b`, 'i').test(sql)),
        `el refresco semanal no puede escribir ${table}`,
      ).toBe(false);
    }
  });

  it('restaura pedidos de forma idempotente dentro de un presupuesto acotado', async () => {
    const db = new SqliteD1();
    await db.batch(seedStatements('public-demo').map((sql) => db.prepare(sql)));

    const stableCounts = Object.fromEntries(
      STABLE_DEMO_TABLES.map((table) => [table, db.value(`SELECT count(*) AS value FROM ${table}`)]),
    );
    const changesBefore = Number(db.value('SELECT total_changes() AS value'));

    await db.batch(demoOrderResetStatements().map((sql) => db.prepare(sql)));

    const weeklyChanges = Number(db.value('SELECT total_changes() AS value')) - changesBefore;
    expect(weeklyChanges).toBeLessThanOrEqual(MAX_WEEKLY_DIRECT_CHANGES);
    expect(db.value('SELECT count(*) AS value FROM products')).toBe(MAX_PUBLIC_DEMO_PRODUCTS);
    expect(db.value('SELECT count(*) AS value FROM orders')).toBe(demoOrderFixtures.length);
    for (const [table, count] of Object.entries(stableCounts)) {
      expect(db.value(`SELECT count(*) AS value FROM ${table}`), table).toBe(count);
    }

    await db.batch(demoOrderResetStatements().map((sql) => db.prepare(sql)));
    expect(db.value('SELECT count(*) AS value FROM orders')).toBe(demoOrderFixtures.length);
  });
});
