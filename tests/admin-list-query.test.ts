import { beforeAll, describe, expect, it } from 'vitest';
import { seedStatements } from '../seed/seed';
import { createProductAdmin } from '../src/modules/catalog';
import { createOrderReader } from '../src/modules/orders';
import { SqliteD1 } from './sqlite-d1';

function seedCursorOrders(db: SqliteD1, count = 115): void {
  const insert = db.sqlite.prepare(`
    INSERT INTO orders (
      order_number, email, customer_name, address_json,
      subtotal_cents, shipping_cents, total_cents, status, created_at, updated_at
    ) VALUES (?, ?, ?, '{}', ?, 0, ?, ?, ?, ?)
  `);
  for (let index = 0; index < count; index += 1) {
    const createdAt = index < 70 ? '2026-08-01 10:00:00' : `2026-08-${String(2 + (index % 8)).padStart(2, '0')} 10:00:00`;
    const total = 1_000 + (index % 12) * 125;
    const status = index % 2 === 0 ? 'paid' : 'shipped';
    insert.run(
      `CURSOR-${String(index).padStart(4, '0')}`,
      `cursor+${index}@qa.example`,
      `Cliente Cursor ${index}`,
      total,
      total,
      status,
      createdAt,
      createdAt,
    );
  }
}

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

  it('trata metacaracteres de búsqueda como entrada literal segura', async () => {
    const catalog = createProductAdmin(db.asD1());
    const orders = createOrderReader(db.asD1());

    expect((await catalog.search({ search: '%', limit: 24 })).total).toBe(0);
    expect((await orders.list({ search: '_', limit: 25 })).total).toBe(0);
    await expect(orders.list({ search: '" OR *', limit: 25 })).resolves.toMatchObject({ total: 0 });
  });

  it('recorre más de cien pedidos con cursor estable sin omitir ni duplicar empates', async () => {
    const cursorDb = new SqliteD1();
    seedCursorOrders(cursorDb);
    const reader = createOrderReader(cursorDb.asD1());
    const expected = cursorDb.query<{ id: number }>(
      "SELECT id FROM orders WHERE email LIKE '%@qa.example' ORDER BY created_at DESC, id DESC",
    ).map(({ id }) => id);
    const visited: number[] = [];
    let cursor: string | undefined;

    do {
      const page = await reader.list({ search: '@qa.example', sort: 'created-desc', limit: 13, cursor });
      visited.push(...page.orders.map(({ id }) => id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    expect(visited).toEqual(expected);
    expect(new Set(visited).size).toBe(expected.length);
  });

  it('navega hacia atrás y ata el cursor a filtros y orden', async () => {
    const cursorDb = new SqliteD1();
    seedCursorOrders(cursorDb, 40);
    const reader = createOrderReader(cursorDb.asD1());
    const first = await reader.list({ search: '@qa.example', limit: 9 });
    const second = await reader.list({ search: '@qa.example', limit: 9, cursor: first.nextCursor! });
    const back = await reader.list({ search: '@qa.example', limit: 9, cursor: second.previousCursor! });
    const changedScope = await reader.list({ search: 'Cliente Cursor', limit: 9, cursor: first.nextCursor! });

    expect(second.previousCursor).not.toBeNull();
    expect(back.orders.map(({ id }) => id)).toEqual(first.orders.map(({ id }) => id));
    expect(changedScope.invalidCursor).toBe(true);
    expect(changedScope.previousCursor).toBeNull();
  });

  it('combina estado, fechas e importes y aplica orden total estable', async () => {
    const cursorDb = new SqliteD1();
    seedCursorOrders(cursorDb, 80);
    const result = await createOrderReader(cursorDb.asD1()).list({
      search: '@qa.example',
      status: 'paid',
      createdFrom: '2026-08-01',
      createdBefore: '2026-08-02',
      minTotalCents: 1_250,
      maxTotalCents: 2_000,
      sort: 'total-asc',
      limit: 100,
    });

    expect(result.orders.length).toBeGreaterThan(0);
    expect(result.orders.every((order) =>
      order.status === 'paid' &&
      order.created_at.startsWith('2026-08-01') &&
      order.total_cents >= 1_250 &&
      order.total_cents <= 2_000
    )).toBe(true);
    expect(result.orders).toEqual([...result.orders].sort((left, right) =>
      left.total_cents - right.total_cents || left.id - right.id
    ));
  });

  it('limita cada página en servidor y usa los índices de fecha e importe', async () => {
    const cursorDb = new SqliteD1();
    seedCursorOrders(cursorDb);
    const page = await createOrderReader(cursorDb.asD1()).list({ search: '@qa.example', limit: 10_000 });
    const datePlan = cursorDb.query<{ detail: string }>(
      "EXPLAIN QUERY PLAN SELECT id FROM orders WHERE status = 'paid' AND created_at >= '2026-08-01' ORDER BY created_at DESC, id DESC LIMIT 25",
    );
    const totalPlan = cursorDb.query<{ detail: string }>(
      "EXPLAIN QUERY PLAN SELECT id FROM orders WHERE status = 'paid' ORDER BY total_cents DESC, id DESC LIMIT 25",
    );

    expect(page.limit).toBe(100);
    expect(page.orders).toHaveLength(100);
    expect(datePlan.some(({ detail }) => detail.includes('idx_orders_status_created_id'))).toBe(true);
    expect(totalPlan.some(({ detail }) => detail.includes('idx_orders_status_total_id'))).toBe(true);
  });
});
