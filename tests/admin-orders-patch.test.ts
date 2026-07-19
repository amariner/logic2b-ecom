import { describe, expect, it } from 'vitest';
import { PATCH } from '../src/pages/api/admin/orders/[id]';

type OrderRow = {
  order_number: string;
  email: string;
  customer_name: string;
  status: string;
  subtotal_cents: number;
  shipping_cents: number;
  total_cents: number;
};

/**
 * Doble mínimo de D1 para `PATCH /api/admin/orders/:id`. Reproduce en memoria
 * el mismo patrón de guarda de idempotencia que `applyPaidMutation`
 * (tests/orders.test.ts): el UPDATE va acotado por el estado leído, y solo si
 * de verdad afectó una fila se aplican el resto de efectos (restock, evento).
 */
class FakeD1 {
  orders: Map<number, OrderRow>;
  products: Map<number, { stock: number }>;
  orderItems: Map<number, { product_id: number; qty: number; name_snapshot: string; unit_price_cents: number }[]>;
  events: unknown[] = [];
  emails: unknown[] = [];

  constructor(
    orders: Record<number, OrderRow>,
    products: Record<number, number> = {},
    orderItems: Record<number, { product_id: number; qty: number; name_snapshot: string; unit_price_cents: number }[]> = {},
  ) {
    this.orders = new Map(Object.entries(orders).map(([id, row]) => [Number(id), row]));
    this.products = new Map(Object.entries(products).map(([id, stock]) => [Number(id), { stock }]));
    this.orderItems = new Map(Object.entries(orderItems).map(([id, items]) => [Number(id), items]));
  }

  prepare(sql: string) {
    return this.makeStatement(sql, []);
  }

  private makeStatement(sql: string, params: unknown[]): D1PreparedStatement {
    return {
      bind: (...args: unknown[]) => this.makeStatement(sql, args),
      first: async () => {
        if (sql.startsWith('SELECT id, order_number, email, customer_name, status')) {
          const [id] = params as [number];
          const row = this.orders.get(id);
          return row ? { id, ...row } : null;
        }
        throw new Error(`FakeD1: SQL no soportado en first(): ${sql}`);
      },
      all: async () => {
        if (sql.startsWith('SELECT product_id, qty FROM order_items') || sql.startsWith('SELECT name_snapshot, unit_price_cents, qty FROM order_items')) {
          const [orderId] = params as [number];
          return { success: true, results: this.orderItems.get(orderId) ?? [] } as unknown as D1Result;
        }
        throw new Error(`FakeD1: SQL no soportado en all(): ${sql}`);
      },
      run: async () => {
        if (sql.startsWith('UPDATE orders SET status')) {
          const isShipped = sql.includes('tracking_carrier');
          const [status, id, expectedStatus] = isShipped
            ? [params[0], params[3], params[4]]
            : [params[0], params[1], params[2]];
          const row = this.orders.get(id as number);
          if (!row || row.status !== expectedStatus) return { success: true, meta: { changes: 0 } } as D1Result;
          row.status = status as string;
          return { success: true, meta: { changes: 1 } } as D1Result;
        }
        if (sql.startsWith('UPDATE products SET stock = stock + ?')) {
          const [qty, productId] = params as [number, number];
          const row = this.products.get(productId);
          if (row) row.stock += qty;
          return { success: true, meta: { changes: row ? 1 : 0 } } as D1Result;
        }
        if (sql.startsWith('INSERT INTO order_events')) {
          this.events.push(params);
          return { success: true, meta: { changes: 1 } } as D1Result;
        }
        if (sql.startsWith('INSERT INTO emails_outbox')) {
          this.emails.push(params);
          return { success: true, meta: { changes: 1 } } as D1Result;
        }
        throw new Error(`FakeD1: SQL no soportado en run(): ${sql}`);
      },
      raw: async () => [],
    } as unknown as D1PreparedStatement;
  }

  async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    const results: D1Result<T>[] = [];
    for (const statement of statements) results.push((await statement.run()) as D1Result<T>);
    return results;
  }
}

function makeCtx(db: FakeD1, id: number, body: unknown) {
  return {
    params: { id: String(id) },
    request: new Request(`http://localhost/api/admin/orders/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    locals: {
      runtime: {
        env: { DB: db as unknown as D1Database },
        ctx: { waitUntil: (_p: Promise<unknown>) => {} },
      },
    },
    // Campos de AstroGlobal no usados por PATCH.
  } as unknown as Parameters<typeof PATCH>[0];
}

const baseOrder: OrderRow = {
  order_number: 'BM-260717-TEST',
  email: 'clienta@example.com',
  customer_name: 'Marta Ferrer',
  status: 'paid',
  subtotal_cents: 1780,
  shipping_cents: 490,
  total_cents: 2270,
};

describe('PATCH /api/admin/orders/:id (idempotencia real contra dos peticiones concurrentes)', () => {
  it('paid → cancelled aplica una vez, devuelve stock y responde 200', async () => {
    const db = new FakeD1({ 7: { ...baseOrder } }, { 1: 8 }, { 7: [{ product_id: 1, qty: 2, name_snapshot: 'AOVE', unit_price_cents: 890 }] });
    const res = await PATCH(makeCtx(db, 7, { status: 'cancelled' }));
    expect(res.status).toBe(200);
    expect(db.orders.get(7)?.status).toBe('cancelled');
    expect(db.products.get(1)?.stock).toBe(10); // 8 + 2 devueltas
  });

  it('dos PATCH concurrentes sobre el mismo pedido pagado: solo uno gana, el otro recibe 409 y no duplica el restock', async () => {
    const db = new FakeD1({ 7: { ...baseOrder } }, { 1: 8 }, { 7: [{ product_id: 1, qty: 2, name_snapshot: 'AOVE', unit_price_cents: 890 }] });
    const [resA, resB] = await Promise.all([
      PATCH(makeCtx(db, 7, { status: 'cancelled' })),
      PATCH(makeCtx(db, 7, { status: 'cancelled' })),
    ]);
    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([200, 409]);
    expect(db.orders.get(7)?.status).toBe('cancelled');
    expect(db.products.get(1)?.stock).toBe(10); // no 12: el restock nunca se aplica dos veces
  });

  it('pedido ya no-paid al llegar la petición (p. ej. ya cancelado) → 422 de decideTransition, sin tocar stock', async () => {
    const db = new FakeD1({ 7: { ...baseOrder, status: 'cancelled' } }, { 1: 8 });
    const res = await PATCH(makeCtx(db, 7, { status: 'cancelled' }));
    expect(res.status).toBe(422);
    expect(db.products.get(1)?.stock).toBe(8);
  });
});
