import { beforeAll, describe, expect, it } from 'vitest';
import { seedStatements } from '../seed/seed';
import { createProductAdmin } from '../src/modules/catalog';
import { createOrderReader } from '../src/modules/orders';
import { SqliteD1 } from './sqlite-d1';

describe('consultas escalables del panel V2', () => {
  const db = new SqliteD1();

  beforeAll(async () => {
    await db.batch(seedStatements().map((sql) => db.prepare(sql)));
  });

  it('pagina y combina búsqueda, categoría y estado de producto', async () => {
    const catalog = createProductAdmin(db.asD1());
    const page = await catalog.search({ limit: 1 });
    const first = await catalog.search({ search: 'SUM-SHELL', limit: 1 });

    expect(page.total).toBeGreaterThan(1);
    expect(page.products).toHaveLength(1);
    expect(first.total).toBe(1);
    expect(first.products).toHaveLength(1);
    expect(first.products[0]?.default_sku).toContain('SUM-SHELL');
    expect(first.categories.length).toBeGreaterThan(1);

    const filtered = await catalog.search({
      category: first.products[0]!.category,
      status: 'active',
      limit: 24,
    });
    expect(filtered.products.length).toBeGreaterThan(0);
    expect(filtered.products.every((product) =>
      product.category === first.products[0]!.category && product.active === 1
    )).toBe(true);
  });

  it('busca pedidos por número, cliente o email y conserva recuentos globales', async () => {
    const orders = createOrderReader(db.asD1());
    const baseline = await orders.list({ limit: 2 });
    const target = baseline.orders[0]!;
    const byNumber = await orders.list({ search: target.order_number, limit: 25 });
    const byEmail = await orders.list({ search: target.email, status: target.status, limit: 25 });

    expect(baseline.orders).toHaveLength(2);
    expect(baseline.total).toBeGreaterThan(2);
    expect(byNumber.orders.map((order) => order.id)).toContain(target.id);
    expect(byEmail.orders.map((order) => order.id)).toContain(target.id);
    expect(byEmail.counts.reduce((sum, count) => sum + count.n, 0)).toBe(baseline.total);
  });

  it('trata los comodines LIKE del usuario como texto literal', async () => {
    const catalog = createProductAdmin(db.asD1());
    const orders = createOrderReader(db.asD1());

    expect((await catalog.search({ search: '%', limit: 24 })).total).toBe(0);
    expect((await orders.list({ search: '_', limit: 25 })).total).toBe(0);
  });
});
