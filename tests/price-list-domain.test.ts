import { describe, expect, it } from 'vitest';
import { resolvePriceLists, type PriceList } from '../src/modules/pricing';

const context = { at: '2026-08-14T15:00:00.000Z', currency: 'EUR', market: 'ES', channel: 'b2b' } as const;
const company = 'a'.repeat(64);

function list(overrides: Partial<PriceList> = {}): PriceList {
  return {
    id: 'general', version: 1, label: 'General B2B', state: 'active', priority: 100,
    currency: 'EUR', activeFrom: null, activeUntil: null, markets: ['ES'], channels: ['b2b'],
    companyKeyHashes: [], prices: [{ productId: 1, priceCents: 900 }], ...overrides,
  };
}

describe('listas de precios contextuales R4.6', () => {
  it('elige empresa antes que general y prioridad/ID dentro del mismo nivel', () => {
    const result = resolvePriceLists({ context, companyKeyHash: company,
      lines: [{ productId: 1, catalogUnitPriceCents: 1000 }],
      lists: [
        list({ id: 'general-first', priority: 1, prices: [{ productId: 1, priceCents: 950 }] }),
        list({ id: 'company-b', priority: 20, companyKeyHashes: [company], prices: [{ productId: 1, priceCents: 800 }] }),
        list({ id: 'company-a', priority: 10, companyKeyHashes: [company], prices: [{ productId: 1, priceCents: 850 }] }),
      ] });
    expect(result.lines[0]).toMatchObject({ baseUnitPriceCents: 850, origin: {
      type: 'price_list', price_list_id: 'company-a', company_scoped: true, fallback_depth: 0,
    } });
    expect(result.evaluations).toContainEqual(expect.objectContaining({
      priceListId: 'company-b', status: 'fallback_lower_priority',
    }));
  });

  it('hace fallback por producto empresa → general → catálogo', () => {
    const result = resolvePriceLists({ context, companyKeyHash: company,
      lines: [
        { productId: 1, catalogUnitPriceCents: 1000 },
        { productId: 2, catalogUnitPriceCents: 1500 },
        { productId: 3, catalogUnitPriceCents: 700 },
      ], lists: [
        list({ id: 'company', companyKeyHashes: [company], prices: [{ productId: 1, priceCents: 800 }] }),
        list({ id: 'general', prices: [{ productId: 2, priceCents: 1200 }] }),
      ] });
    expect(result.lines.map((line) => [line.baseUnitPriceCents, line.origin.type, line.origin.fallback_depth]))
      .toEqual([[800, 'price_list', 0], [1200, 'price_list', 1], [700, 'catalog', 2]]);
  });

  it('sin identidad servidor ignora listas de empresa aunque el contexto comercial coincida', () => {
    const result = resolvePriceLists({ context, companyKeyHash: null,
      lines: [{ productId: 1, catalogUnitPriceCents: 1000 }],
      lists: [list({ id: 'company', companyKeyHashes: [company], prices: [{ productId: 1, priceCents: 500 }] })] });
    expect(result.lines[0]?.origin).toMatchObject({ type: 'catalog', unit_price_cents: 1000 });
    expect(result.evaluations).toMatchObject([{ priceListId: 'company', status: 'excluded_company' }]);
  });

  it('excluye mercado/canal/vigencia y admite un precio superior al catálogo', () => {
    const result = resolvePriceLists({ context, companyKeyHash: null,
      lines: [{ productId: 1, catalogUnitPriceCents: 1000 }], lists: [
        list({ id: 'wrong-market', markets: ['PT'], prices: [{ productId: 1, priceCents: 500 }] }),
        list({ id: 'valid', priority: 20, prices: [{ productId: 1, priceCents: 1100 }] }),
      ] });
    expect(result.lines[0]).toMatchObject({ baseUnitPriceCents: 1100,
      origin: { type: 'price_list', price_list_id: 'valid', catalog_unit_price_cents: 1000 } });
  });

  it('rechaza hashes, precios o productos duplicados', () => {
    expect(() => resolvePriceLists({ context, companyKeyHash: 'empresa', lines: [], lists: [] }))
      .toThrow(/companyKeyHash/);
    expect(() => resolvePriceLists({ context, companyKeyHash: null,
      lines: [{ productId: 1, catalogUnitPriceCents: 1000 }],
      lists: [list({ prices: [{ productId: 1, priceCents: 900 }, { productId: 1, priceCents: 800 }] })] }))
      .toThrow(/duplicados/);
  });
});
