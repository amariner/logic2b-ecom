import { describe, expect, it } from 'vitest';
import { shopConfig } from '../shop.config';
import { zancadaModels, zancadaSizeSlug } from '../src/collections/zancada';
import { getDemoProduct, getDemoProductSummaries } from '../src/composition/demo-catalog';
import { buildDemoQuote } from '../src/lib/demo-commerce';
import source from '../src/components/themes/zancada/Theme.astro?raw';

const shipping = { zones: shopConfig.shipping.zones, rates: shopConfig.shipping.seedRates };

describe('Zancada integrada con el recorrido común', () => {
  it('cada artículo y talla resuelve una referencia única dentro de Zancada', () => {
    const slugs = zancadaModels.flatMap(model => model.sizes.map(size => {
      const slug = zancadaSizeSlug(model, size);
      const product = getDemoProduct('zancada', slug);
      expect(product?.name).toContain(size);
      expect(product?.price_cents).toBe(model.price_cents);
      expect(getDemoProduct('street', slug)).toBeNull();
      return slug;
    }));
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(zancadaModels).toHaveLength(13);
  });

  it('dos tallas se conservan como líneas distintas con precio del seed', () => {
    const quote = buildDemoQuote(getDemoProductSummaries('zancada'), [
      { slug: 'zan-xt-wings-2', qty: 1 },
      { slug: 'zan-xt-wings-2-t44', qty: 2 },
      { slug: 'zan-pace-black', qty: 1 },
    ], '12001', shipping);
    expect(quote.purchasable).toBe(true);
    expect(quote.lines.map(line => line.name)).toEqual([
      'SALOMON XT-WINGS 2 ADVANCED · 42',
      'SALOMON XT-WINGS 2 ADVANCED · 44',
      'ZANCADA PACE CREW · S/M',
    ]);
    expect(quote.subtotal_cents).toBe(43600);
    expect(quote.total_cents).toBe(43600);
  });

  it('rechaza una talla agotada y mantiene la demo sin comercio privado', () => {
    const quote = buildDemoQuote(getDemoProductSummaries('zancada'), [
      { slug: 'zan-xt-wings-2-t36', qty: 1 },
    ], '12001', shipping);
    expect(quote.purchasable).toBe(false);
    expect(quote.lines[0]?.status).toBe('out-of-stock');
    expect(quote.total_cents).toBeNull();
    expect(source).toContain('data-commerce-action="add-to-cart"');
    expect(source).not.toMatch(/sessionStorage|localStorage|\/api\/|fetch\(/);
  });
});
