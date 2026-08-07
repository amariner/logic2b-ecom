import { describe, expect, it } from 'vitest';
import { shopConfig } from '../shop.config';
import { getDemoProduct, getDemoProducts, getDemoProductSummaries } from '../src/composition/demo-catalog';
import { buildDemoQuote } from '../src/lib/demo-commerce';

const shipping = {
  zones: shopConfig.shipping.zones,
  rates: shopConfig.shipping.seedRates,
};

describe('catálogo inmutable de las demos', () => {
  it('ARCE se resuelve sin D1 con sus ocho productos', () => {
    const products = getDemoProducts('arce');
    expect(products).toHaveLength(8);
    expect(products[0]?.collection).toBe('arce');
    expect(getDemoProduct('arce', 'arc-silla-alba')?.price_cents).toBe(68000);
    expect(getDemoProduct('forma', 'arc-silla-alba')).toBeNull();
  });

  it('filtra, busca y ordena sobre datos locales', () => {
    expect(getDemoProducts('arce', { category: 'arc-mesas' })).toHaveLength(3);
    expect(getDemoProducts('arce', { search: 'Vela' }).map((product) => product.slug)).toEqual([
      'arc-lampara-vela',
    ]);
    expect(getDemoProducts('arce', { sort: 'price-asc' })[0]?.slug).toBe('arc-lampara-vela');
  });
});

describe('simulación local de carrito', () => {
  const products = getDemoProductSummaries('arce');

  it('calcula subtotal y envío sin red', () => {
    const quote = buildDemoQuote(products, [{ slug: 'arc-silla-alba', qty: 2 }], '12001', shipping);
    expect(quote.purchasable).toBe(true);
    expect(quote.subtotal_cents).toBe(136000);
    expect(quote.shipping_cents).toBe(0);
    expect(quote.total_cents).toBe(136000);
  });

  it('mantiene el checkout bloqueado sin CP o con stock insuficiente', () => {
    expect(
      buildDemoQuote(products, [{ slug: 'arc-silla-alba', qty: 1 }], '', shipping).total_cents,
    ).toBeNull();
    const excessive = buildDemoQuote(
      products,
      [{ slug: 'arc-silla-alba', qty: 9 }],
      '12001',
      shipping,
    );
    expect(excessive.purchasable).toBe(false);
    expect(excessive.lines[0]?.status).toBe('insufficient-stock');
  });
});
