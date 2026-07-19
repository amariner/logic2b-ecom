import { describe, expect, it } from 'vitest';
import { aggregateLineQuantities, quoteCart } from '../src/lib/quote';

type FakeProduct = { slug: string; name: string; image: string; price_cents: number; stock: number; active: number };
type FakeRate = { zone: string; label: string; price_cents: number; free_over_cents: number | null; active: number };

/**
 * Doble mínimo de D1: solo entiende las dos consultas que hace quoteCart
 * (productos por slug, tarifa activa por zona). Suficiente para probar sus
 * ramas sin levantar wrangler/D1 real.
 */
class FakeD1 {
  constructor(
    private products: FakeProduct[],
    private rates: FakeRate[] = [],
  ) {}

  prepare(sql: string) {
    return this.makeStatement(sql, []);
  }

  private makeStatement(sql: string, params: unknown[]): D1PreparedStatement {
    return {
      bind: (...args: unknown[]) => this.makeStatement(sql, args),
      all: async () => {
        if (sql.startsWith('SELECT * FROM products WHERE slug IN')) {
          const slugs = params as string[];
          const results = this.products.filter((p) => slugs.includes(p.slug) && p.active === 1);
          return { success: true, results, meta: {} } as unknown as D1Result;
        }
        throw new Error(`FakeD1: SQL no soportado: ${sql}`);
      },
      first: async () => {
        if (sql.startsWith('SELECT * FROM shipping_rates')) {
          const [zone] = params as [string];
          return this.rates.find((r) => r.zone === zone && r.active === 1) ?? null;
        }
        throw new Error(`FakeD1: SQL no soportado: ${sql}`);
      },
      run: async () => ({ success: true, meta: { changes: 0 } }) as unknown as D1Result,
      raw: async () => [],
    } as unknown as D1PreparedStatement;
  }
}

describe('aggregateLineQuantities', () => {
  it('suma qty de líneas repetidas del mismo slug', () => {
    const map = aggregateLineQuantities([
      { slug: 'aove-picual', qty: 2 },
      { slug: 'fuet', qty: 1 },
      { slug: 'aove-picual', qty: 3 },
    ]);
    expect(map.get('aove-picual')).toBe(5);
    expect(map.get('fuet')).toBe(1);
  });

  it('topa la suma a 99 aunque cada línea individual cumpla el máximo del schema (99)', () => {
    // Petición fabricada a mano: dos líneas del mismo slug, cada una válida por
    // separado (≤99), que sin este tope acumularían 198 unidades de un producto.
    const map = aggregateLineQuantities([
      { slug: 'aove-picual', qty: 99 },
      { slug: 'aove-picual', qty: 99 },
    ]);
    expect(map.get('aove-picual')).toBe(99);
  });
});

describe('quoteCart', () => {
  const product = (overrides: Partial<FakeProduct> = {}): FakeProduct => ({
    slug: 'aove-picual',
    name: 'AOVE Picual 500 ml',
    image: '/images/products/aceites.webp',
    price_cents: 890,
    stock: 10,
    active: 1,
    ...overrides,
  });

  it('slug inexistente → not-found, excluido del subtotal', async () => {
    const db = new FakeD1([]) as unknown as D1Database;
    const result = await quoteCart(db, { lines: [{ slug: 'no-existe', qty: 1 }] });
    expect(result.lines[0]!.status).toBe('not-found');
    expect(result.lines[0]!.line_total_cents).toBe(0);
    expect(result.subtotal_cents).toBe(0);
    expect(result.purchasable).toBe(false);
  });

  it('stock 0 → out-of-stock', async () => {
    const db = new FakeD1([product({ stock: 0 })]) as unknown as D1Database;
    const result = await quoteCart(db, { lines: [{ slug: 'aove-picual', qty: 1 }] });
    expect(result.lines[0]!.status).toBe('out-of-stock');
    expect(result.purchasable).toBe(false);
  });

  it('0 < stock < qty pedida → insufficient-stock', async () => {
    const db = new FakeD1([product({ stock: 2 })]) as unknown as D1Database;
    const result = await quoteCart(db, { lines: [{ slug: 'aove-picual', qty: 5 }] });
    expect(result.lines[0]!.status).toBe('insufficient-stock');
    expect(result.lines[0]!.available_stock).toBe(2);
    expect(result.purchasable).toBe(false);
  });

  it('stock === qty pedida (límite exacto) → ok, servible', async () => {
    const db = new FakeD1([product({ stock: 3 })]) as unknown as D1Database;
    const result = await quoteCart(db, { lines: [{ slug: 'aove-picual', qty: 3 }] });
    expect(result.lines[0]!.status).toBe('ok');
    expect(result.subtotal_cents).toBe(890 * 3);
    expect(result.purchasable).toBe(true);
  });

  it('CP con zona válida pero sin tarifa activa → envío y total quedan null aunque el pedido sea servible', async () => {
    const db = new FakeD1([product({ stock: 3 })], []) as unknown as D1Database;
    const result = await quoteCart(db, { lines: [{ slug: 'aove-picual', qty: 1 }], postal_code: '12001' });
    expect(result.purchasable).toBe(true);
    expect(result.shipping_cents).toBeNull();
    expect(result.total_cents).toBeNull();
    expect(result.shipping).toBeNull();
  });

  it('CP con zona y tarifa activa → envío y total calculados', async () => {
    const db = new FakeD1(
      [product({ stock: 3 })],
      [{ zone: 'peninsula', label: 'Estándar 24/48h', price_cents: 490, free_over_cents: 5000, active: 1 }],
    ) as unknown as D1Database;
    const result = await quoteCart(db, { lines: [{ slug: 'aove-picual', qty: 1 }], postal_code: '12001' });
    expect(result.shipping_cents).toBe(490);
    expect(result.total_cents).toBe(890 + 490);
    expect(result.shipping?.zone).toBe('peninsula');
  });
});
