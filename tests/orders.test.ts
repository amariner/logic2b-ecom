import { describe, expect, it } from 'vitest';
import { shopConfig } from '../shop.config';
import { generateOrderNumber, generateSimulatedSessionToken } from '../src/lib/orders';
import { createOrderOperations } from '../src/composition/order-operations';
import { createEventFactory, type EventClock, type EventIdSource } from '../src/shared-kernel/events';

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
  it('24 caracteres alfanuméricos en minúscula: no enumerable como el nº de pedido', () => {
    const token = generateSimulatedSessionToken();
    expect(token).toMatch(/^[a-z0-9]{24}$/);
  });

  it('sin colisiones evidentes en una tanda', () => {
    const tokens = new Set(Array.from({ length: 500 }, () => generateSimulatedSessionToken()));
    expect(tokens.size).toBe(500);
  });
});

/**
 * Doble mínimo de D1: solo entiende las sentencias del caso de uso de pago.
 * Suficiente para probar la guarda de idempotencia sin levantar wrangler/D1 real.
 */
type FakeOrderRow = {
  order_number: string;
  status: string;
  email: string;
  customer_name: string;
  subtotal_cents: number;
  shipping_cents: number;
  total_cents: number;
  stripe_payment_intent: string | null;
};

class FakeD1 {
  orders: Map<number, FakeOrderRow>;
  products: Map<number, { stock: number }>;
  items: { product_id: number; name_snapshot: string; unit_price_cents: number; qty: number }[];
  events: unknown[] = [];
  emails: unknown[] = [];

  constructor(
    orderId: number,
    products: Record<number, number>,
    items: { product_id: number; name_snapshot: string; unit_price_cents: number; qty: number }[] = [],
  ) {
    this.orders = new Map([
      [
        orderId,
        {
          order_number: 'BM-260717-TEST',
          status: 'pending',
          email: 'clienta@example.com',
          customer_name: 'Marta Ferrer',
          subtotal_cents: 1780,
          shipping_cents: 490,
          total_cents: 2270,
          stripe_payment_intent: null,
        },
      ],
    ]);
    this.products = new Map(Object.entries(products).map(([id, stock]) => [Number(id), { stock }]));
    this.items = items;
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
      if (sql.startsWith("UPDATE orders SET status = 'cancelled'")) {
        const [orderId] = params as [number];
        const row = this.orders.get(orderId);
        if (!row || row.status !== 'pending') return { success: true, meta: { changes: 0 } } as D1Result;
        row.status = 'cancelled';
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
      all: async () => {
        if (sql.startsWith('SELECT product_id, name_snapshot')) {
          return { success: true, results: this.items } as unknown as D1Result;
        }
        throw new Error(`FakeD1: SQL no soportado en all(): ${sql}`);
      },
      first: async () => {
        if (sql.startsWith('SELECT id, order_number, status')) {
          const orderId = sql.includes('stripe_session_id') ? 7 : (params[0] as number);
          const row = this.orders.get(orderId);
          return row ? { id: orderId, ...row } : null;
        }
        throw new Error(`FakeD1: SQL no soportado en first(): ${sql}`);
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

function operationsFor(db: FakeD1) {
  let tick = 0;
  const clock: EventClock = { now: () => new Date(Date.parse('2026-08-06T10:00:00.000Z') + tick * 1000) };
  const ids: EventIdSource = {
    next: () => {
      tick += 1;
      return `evt_${tick}`;
    },
  };
  return createOrderOperations(db as unknown as D1Database, createEventFactory({ clock, ids }));
}

const line = { product_id: 1, name_snapshot: 'AOVE Picual 500 ml', unit_price_cents: 890, qty: 2 };

describe('confirmPayment (idempotencia real contra dos entregas concurrentes)', () => {
  it('aplica una vez: decrementa stock, un evento y dos emails, devuelve true', async () => {
    const db = new FakeD1(7, { 1: 10 }, [line]);
    const applied = await operationsFor(db).confirmPayment({
      lookup: { by: 'session', stripeSessionId: 'cs_test_1' },
      paymentIntent: 'pi_1',
      source: 'stripe',
    });
    expect(applied).toBe(true);
    expect(db.products.get(1)?.stock).toBe(8);
    expect(db.events).toHaveLength(1);
    expect(db.emails).toHaveLength(2);
  });

  it('el evento del timeline lleva la nota de siempre', async () => {
    const db = new FakeD1(7, { 1: 10 }, [line]);
    await operationsFor(db).confirmPayment({
      lookup: { by: 'id', orderId: 7 },
      paymentIntent: 'sim_pi_1',
      source: 'simulated',
    });
    expect(db.events[0]).toEqual([7, 'pending', 'paid', 'Pago confirmado (simulado)']);
  });

  it('dos entregas del mismo evento leídas antes de que ninguna escriba: la segunda no re-decrementa ni duplica emails', async () => {
    const db = new FakeD1(7, { 1: 10 }, [line]);
    const operations = operationsFor(db);
    // Ambas llamadas leen la MISMA foto 'pending' del pedido, como pasaría si dos
    // entregas concurrentes del webhook consultaran antes de que ninguna aplicara
    // su UPDATE (el bug real que esto corrige).
    const [appliedA, appliedB] = await Promise.all([
      operations.confirmPayment({ lookup: { by: 'session', stripeSessionId: 'cs_test_1' }, paymentIntent: 'pi_1', source: 'stripe' }),
      operations.confirmPayment({ lookup: { by: 'session', stripeSessionId: 'cs_test_1' }, paymentIntent: 'pi_1', source: 'stripe' }),
    ]);

    expect([appliedA, appliedB].toSorted()).toEqual([false, true]);
    expect(db.products.get(1)?.stock).toBe(8); // no 6: el segundo decremento nunca se aplica
    expect(db.events).toHaveLength(1);
    expect(db.emails).toHaveLength(2); // no 4
  });

  it('pedido ya pagado (reintento tardío de Stripe) → false, sin efectos', async () => {
    const db = new FakeD1(7, { 1: 10 }, [line]);
    const operations = operationsFor(db);
    await operations.confirmPayment({ lookup: { by: 'id', orderId: 7 }, paymentIntent: 'pi_1', source: 'stripe' });
    const again = await operations.confirmPayment({ lookup: { by: 'id', orderId: 7 }, paymentIntent: 'pi_1', source: 'stripe' });
    expect(again).toBe(false);
    expect(db.events).toHaveLength(1);
    expect(db.emails).toHaveLength(2);
  });
});

describe('expirePayment (idempotencia de checkout.session.expired)', () => {
  it('pedido pending → cancelled y un evento, sin tocar stock ni emails', async () => {
    const db = new FakeD1(7, { 1: 10 }, [line]);
    const expired = await operationsFor(db).expirePayment({ stripeSessionId: 'cs_test_1' });
    expect(expired).toBe(true);
    expect(db.orders.get(7)?.status).toBe('cancelled');
    expect(db.events).toEqual([[7, 'pending', 'cancelled', 'Sesión de pago caducada']]);
    expect(db.products.get(1)?.stock).toBe(10);
    expect(db.emails).toHaveLength(0);
  });

  it('dos entregas del mismo evento expired solapadas: solo la primera cancela e inserta evento', async () => {
    const db = new FakeD1(7, {}, []);
    const operations = operationsFor(db);
    const [a, b] = await Promise.all([
      operations.expirePayment({ stripeSessionId: 'cs_test_1' }),
      operations.expirePayment({ stripeSessionId: 'cs_test_1' }),
    ]);
    expect([a, b].toSorted()).toEqual([false, true]);
    expect(db.events).toHaveLength(1); // no 2
  });

  it('pedido que ya no está pending (p. ej. pagado antes de caducar la sesión) → false, sin evento', async () => {
    const db = new FakeD1(7, { 1: 10 }, [line]);
    const operations = operationsFor(db);
    await operations.confirmPayment({ lookup: { by: 'id', orderId: 7 }, paymentIntent: 'pi_1', source: 'stripe' });
    db.events.length = 0;
    expect(await operations.expirePayment({ stripeSessionId: 'cs_test_1' })).toBe(false);
    expect(db.events).toHaveLength(0);
  });
});
