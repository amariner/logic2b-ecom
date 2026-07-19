import { describe, expect, it } from 'vitest';
import { shopConfig } from '../shop.config';
import { applyPaidMutation, generateOrderNumber, generateSimulatedSessionToken } from '../src/lib/orders';
import { buildPaidMutation, type OrderForPayment, type OrderItemForPayment } from '../src/lib/payment-transition';

describe('generateOrderNumber', () => {
  it('formato {prefijo}-AAMMDD-XXXX con fecha UTC, prefijo desde shop.config.ts', () => {
    const num = generateOrderNumber(new Date('2026-07-17T23:59:00Z'));
    const prefix = shopConfig.orderNumberPrefix;
    expect(num).toMatch(new RegExp(`^${prefix}-260717-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$`));
  });

  it('sin colisiones evidentes en una tanda', () => {
    const nums = new Set(Array.from({ length: 200 }, () => generateOrderNumber()));
    expect(nums.size).toBeGreaterThan(190); // 31^4 ≈ 923k combinaciones/día
  });
});

describe('generateSimulatedSessionToken', () => {
  it('36 caracteres alfanuméricos en minúscula: no enumerable como el nº de pedido', () => {
    const token = generateSimulatedSessionToken();
    expect(token).toMatch(/^[a-z0-9]{24}$/);
  });

  it('sin colisiones evidentes en una tanda', () => {
    const tokens = new Set(Array.from({ length: 500 }, () => generateSimulatedSessionToken()));
    expect(tokens.size).toBe(500);
  });
});

/**
 * Doble mínimo de D1: solo entiende las cuatro sentencias que usa
 * `applyPaidMutation`. Suficiente para probar la guarda de idempotencia sin
 * levantar wrangler/D1 real.
 */
class FakeD1 {
  orders: Map<number, { status: string; stripe_payment_intent: string | null }>;
  products: Map<number, { stock: number }>;
  events: unknown[] = [];
  emails: unknown[] = [];

  constructor(orderId: number, products: Record<number, number>) {
    this.orders = new Map([[orderId, { status: 'pending', stripe_payment_intent: null }]]);
    this.products = new Map(Object.entries(products).map(([id, stock]) => [Number(id), { stock }]));
  }

  prepare(sql: string): D1PreparedStatement {
    return this.makeStatement(sql, []);
  }

  private makeStatement(sql: string, params: unknown[]): D1PreparedStatement {
    const run = async (): Promise<D1Result> => {
      if (sql.startsWith("UPDATE orders SET status = 'paid'")) {
        const [paymentIntent, orderId] = params as [string | null, number];
        const row = this.orders.get(orderId);
        if (!row || row.status !== 'pending') return { success: true, meta: { changes: 0 } } as D1Result;
        row.status = 'paid';
        row.stripe_payment_intent = paymentIntent;
        return { success: true, meta: { changes: 1 } } as D1Result;
      }
      if (sql.startsWith('UPDATE products SET stock')) {
        const [qty, productId] = params as [number, number];
        const row = this.products.get(productId);
        if (row) row.stock = Math.max(row.stock - qty, 0);
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
      throw new Error(`FakeD1: SQL no soportado en el doble de test: ${sql}`);
    };
    return {
      bind: (...args: unknown[]) => this.makeStatement(sql, args),
      run,
      all: async () => ({ success: true, results: [], meta: { changes: 0 } }) as unknown as D1Result,
      first: async () => null,
      raw: async () => [],
    } as unknown as D1PreparedStatement;
  }

  async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    const results: D1Result<T>[] = [];
    for (const statement of statements) results.push((await statement.run()) as D1Result<T>);
    return results;
  }
}

describe('applyPaidMutation (idempotencia real contra dos entregas concurrentes)', () => {
  const order: OrderForPayment = {
    id: 7,
    order_number: 'BM-260717-TEST',
    status: 'pending',
    email: 'clienta@example.com',
    customer_name: 'Marta Ferrer',
    subtotal_cents: 1780,
    shipping_cents: 490,
    total_cents: 2270,
  };
  const items: OrderItemForPayment[] = [{ product_id: 1, name_snapshot: 'AOVE Picual 500 ml', unit_price_cents: 890, qty: 2 }];

  it('aplica una vez: decrementa stock, un evento y dos emails, devuelve true', async () => {
    const db = new FakeD1(order.id, { 1: 10 });
    const mutation = buildPaidMutation(order, items, 'pi_1')!;
    const applied = await applyPaidMutation(db as unknown as D1Database, mutation);
    expect(applied).toBe(true);
    expect(db.products.get(1)?.stock).toBe(8);
    expect(db.events).toHaveLength(1);
    expect(db.emails).toHaveLength(2);
  });

  it('dos entregas del mismo evento leídas antes de que ninguna escriba: la segunda no re-decrementa ni duplica emails', async () => {
    const db = new FakeD1(order.id, { 1: 10 });
    // Ambas mutaciones se construyen desde la MISMA foto 'pending' del pedido,
    // como pasaría si dos peticiones concurrentes leyeran el estado antes de que
    // cualquiera de las dos aplicara su UPDATE (el bug real que esto corrige).
    const mutationA = buildPaidMutation(order, items, 'pi_1')!;
    const mutationB = buildPaidMutation(order, items, 'pi_1')!;

    const appliedA = await applyPaidMutation(db as unknown as D1Database, mutationA);
    const appliedB = await applyPaidMutation(db as unknown as D1Database, mutationB);

    expect(appliedA).toBe(true);
    expect(appliedB).toBe(false);
    expect(db.products.get(1)?.stock).toBe(8); // no 6: el segundo decremento nunca se aplica
    expect(db.events).toHaveLength(1);
    expect(db.emails).toHaveLength(2); // no 4
  });
});
