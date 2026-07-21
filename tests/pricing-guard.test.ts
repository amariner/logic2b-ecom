/**
 * GUARDARRAÍL DE DINERO — `compare_at_price_cents` no entra en ninguna cuenta.
 * ============================================================================
 *
 * La migración 0002 añadió `compare_at_price_cents` para que el tema Natural
 * pueda pintar el precio anterior tachado. Es EXCLUSIVAMENTE presentación: el
 * precio que se cobra es `price_cents` y solo él.
 *
 * Es el tipo de columna que, seis meses después, alguien cablea "solo para
 * mostrar el ahorro en el checkout" y acaba cobrando de menos o regalando el
 * envío. Estos tests existen para que eso rompa el build, no la caja.
 *
 * Cuatro capas, de la más concreta a la que sobrevive a un refactor:
 *   1. el subtotal ignora el campo aunque venga en la línea;
 *   2. el umbral de envío gratis se evalúa contra el precio REAL;
 *   3. el presupuesto de carrito no expone el campo hacia el cliente;
 *   4. guardia estática: la cadena no aparece en la ruta de cobro.
 */
import { describe, expect, it } from 'vitest';
// `?raw` de Vite: el fuente como texto, sin `node:fs` (no hay @types/node en el
// proyecto). Mismo idiom que tests/theme-inline-script.test.ts.
import cartQuoteApiSource from '../src/pages/api/cart/quote.ts?raw';
import checkoutSessionSource from '../src/pages/api/checkout/session.ts?raw';
import stripeWebhookSource from '../src/pages/api/webhooks/stripe.ts?raw';
import pricingSource from '../src/lib/pricing.ts?raw';
import quoteSource from '../src/lib/quote.ts?raw';
import shippingSource from '../src/lib/shipping.ts?raw';
import { computeShippingCents, computeSubtotalCents } from '../src/lib/pricing';
import { quoteCart } from '../src/lib/quote';

/** Línea con el campo de oferta colado dentro, como llegaría de una fila de D1. */
const lineWithCompareAt = { unit_price_cents: 1000, qty: 2, compare_at_price_cents: 2000 };

describe('compare_at_price_cents es SOLO presentación', () => {
  it('el subtotal usa price_cents aunque la línea traiga el precio anterior', () => {
    // 1000 × 2 = 2000. Si se colara el tachado (2000 × 2) darían 4000.
    expect(computeSubtotalCents([lineWithCompareAt])).toBe(2000);
  });

  it('el umbral de envío gratis se evalúa contra el precio real, no contra el tachado', () => {
    // Subtotal real 2000, umbral 3000 → se cobra porte.
    // Con el precio tachado (4000) el pedido superaría el umbral y saldría gratis:
    // ese es exactamente el bug de dinero que este test cierra.
    const rate = { price_cents: 490, free_over_cents: 3000 };
    expect(computeShippingCents(computeSubtotalCents([lineWithCompareAt]), rate)).toBe(490);
  });
});

/** D1 mínimo: devuelve filas fijas para las dos consultas que hace `quoteCart`. */
function fakeDb(product: Record<string, unknown>, rate: Record<string, unknown>): D1Database {
  return {
    prepare(sql: string) {
      const stmt = {
        bind: () => stmt,
        all: async () => ({ results: sql.includes('products') ? [product] : [rate] }),
        first: async () => (sql.includes('shipping_rates') ? rate : product),
      };
      return stmt;
    },
  } as unknown as D1Database;
}

describe('quoteCart no propaga el precio de oferta', () => {
  const product = {
    id: 1,
    slug: 'crema-facial',
    name: 'Crema facial',
    description: '',
    price_cents: 1000,
    stock: 50,
    image: '',
    category: 'rostro',
    active: 1,
    created_at: '2026-07-21 10:00:00',
    collection: 'natural',
    subtitle: null,
    compare_at_price_cents: 2500, // ← oferta visible en la tienda
    specs_json: null,
  };
  const rate = { id: 1, zone: 'peninsula', label: 'Estándar', price_cents: 490, free_over_cents: 3000, active: 1 };

  it('cotiza al precio real y cobra el porte que toca', async () => {
    const quote = await quoteCart(fakeDb(product, rate), {
      lines: [{ slug: 'crema-facial', qty: 2 }],
      postal_code: '12001',
    });

    expect(quote.lines[0]!.unit_price_cents).toBe(1000);
    expect(quote.subtotal_cents).toBe(2000);
    // 2000 < 3000 → porte cobrado. Con el tachado (5000) habría salido gratis.
    expect(quote.shipping_cents).toBe(490);
    expect(quote.total_cents).toBe(2490);
  });

  it('la línea del presupuesto no expone el campo al cliente', async () => {
    const quote = await quoteCart(fakeDb(product, rate), {
      lines: [{ slug: 'crema-facial', qty: 1 }],
    });
    expect(quote.lines[0]).not.toHaveProperty('compare_at_price_cents');
  });
});

/**
 * La capa que de verdad aguanta el paso del tiempo: si alguien importa el campo
 * en la ruta de cobro, este test falla aunque su cálculo "parezca" correcto.
 * Mismo idiom que `tests/theme-inline-script.test.ts`.
 */
describe('guardia estática de la ruta de cobro', () => {
  const MODULES: readonly (readonly [string, string])[] = [
    ['src/lib/pricing.ts', pricingSource],
    ['src/lib/shipping.ts', shippingSource],
    ['src/lib/quote.ts', quoteSource],
    ['src/pages/api/checkout/session.ts', checkoutSessionSource],
    ['src/pages/api/cart/quote.ts', cartQuoteApiSource],
    ['src/pages/api/webhooks/stripe.ts', stripeWebhookSource],
  ];

  for (const [relPath, source] of MODULES) {
    it(`${relPath} no menciona compare_at_price`, () => {
      expect(
        source.includes('compare_at_price'),
        `${relPath} menciona compare_at_price. Es SOLO presentación: no puede entrar ` +
          `en el subtotal, el envío ni los line_items de Stripe. Ver migrations/0002.`,
      ).toBe(false);
    });
  }
});
