import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MarketPricingContextContractError, resolveMarketPricingContext,
} from '../src/composition/market-pricing-context';
import { MarketContextContractError } from '../src/modules/markets';
import { evaluatePriceRules, resolvePriceLists, type PriceList } from '../src/modules/pricing';

const AT = '2026-10-03T12:00:00.000Z';

function market(id = 'ES', countryCode = 'ES', currency = 'EUR', hostname = 'es.example.test') {
  return { id, countryCodes: [countryCode], defaultLocale: 'es-ES', currency, domains: [hostname] };
}
function catalog() {
  return { schemaVersion: 1 as const, id: 'qa-markets', version: 1,
    markets: [market(), market('PT', 'PT', 'EUR', 'pt.example.test'), market('US', 'US', 'USD', 'us.example.test')],
    fallback: { strategy: 'market' as const, marketId: 'ES' } };
}
function input(overrides: Record<string, unknown> = {}) {
  return { catalog: catalog(), selector: { by: 'id', marketId: 'ES' },
    baseCurrency: 'EUR', at: AT, channel: 'storefront', ...overrides };
}
function list(overrides: Partial<PriceList> = {}): PriceList {
  return { id: 'general-es', version: 1, label: 'General ES', state: 'active', priority: 100,
    currency: 'EUR', activeFrom: null, activeUntil: null, markets: ['ES'], channels: ['storefront'],
    companyKeyHashes: [], prices: [{ productId: 1, priceCents: 800 }], ...overrides };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('composición pura de mercado y contexto de precios R5.7b', () => {
  it('conserva ES/EUR y aplica las listas existentes antes de las reglas de precio', () => {
    const result = resolveMarketPricingContext(input());
    expect(result).toMatchObject({ status: 'resolved', baseCurrency: 'EUR', resolution: {
      outcome: 'matched', catalogId: 'qa-markets', catalogVersion: 1,
      matchedBy: 'id', selector: { by: 'id', marketId: 'ES' },
    }, context: { at: AT, currency: 'EUR', market: 'ES', channel: 'storefront' } });
    if (result.status !== 'resolved') throw new Error('Expected a pricing context');
    const lists = resolvePriceLists({ context: result.context, companyKeyHash: null,
      lines: [{ productId: 1, catalogUnitPriceCents: 1000 }],
      lists: [list(), list({ id: 'general-pt', markets: ['PT'], prices: [{ productId: 1, priceCents: 500 }] })] });
    expect(lists.lines[0]).toMatchObject({ baseUnitPriceCents: 800,
      origin: { type: 'price_list', price_list_id: 'general-es' } });
    const priced = evaluatePriceRules({ context: result.context,
      baseUnitPriceCents: lists.lines[0]!.baseUnitPriceCents, quantity: 2,
      candidates: [{ id: 'es-discount', version: 1, label: 'Descuento ES', priority: 1,
        activeFrom: null, activeUntil: null, markets: ['ES'], channels: ['storefront'], currency: 'EUR',
        effect: { type: 'percentage_off', basisPoints: 1000 } }] });
    expect(priced).toMatchObject({ context: result.context, unit_price_cents: 720, subtotal_cents: 1440 });
  });

  it('conserva IDs comerciales distintos para el mismo país y no los sustituye por ES', () => {
    const scoped = { ...catalog(), markets: [market('ES-RETAIL'), market('ES-B2B', 'ES', 'EUR', 'b2b.example.test')],
      fallback: { strategy: 'market', marketId: 'ES-RETAIL' } };
    const result = resolveMarketPricingContext(input({ catalog: scoped, selector: { by: 'id', marketId: 'ES-B2B' } }));
    if (result.status !== 'resolved') throw new Error('Expected a pricing context');
    expect(result.context.market).toBe('ES-B2B');
    const prices = resolvePriceLists({ context: result.context, companyKeyHash: null,
      lines: [{ productId: 1, catalogUnitPriceCents: 1000 }], lists: [
        list({ id: 'country-code', priority: 0, prices: [{ productId: 1, priceCents: 100 }] }),
        list({ id: 'retail', priority: 1, markets: ['ES-RETAIL'], prices: [{ productId: 1, priceCents: 200 }] }),
        list({ id: 'business', markets: ['ES-B2B'], prices: [{ productId: 1, priceCents: 900 }] }),
      ] });
    expect(prices.lines[0]).toMatchObject({ baseUnitPriceCents: 900, origin: { price_list_id: 'business' } });
    const ambiguous = resolveMarketPricingContext(input({ catalog: scoped, selector: { by: 'country', countryCode: 'ES' } }));
    expect(ambiguous).toMatchObject({ status: 'blocked', reason: 'market_unresolved', context: null,
      resolution: { outcome: 'unresolved', reason: 'ambiguous_country', selector: { by: 'country', countryCode: 'ES' } } });
  });

  it('usa país o dominio solo para seleccionar, preservando procedencia sin fabricar contexto de envío', () => {
    for (const selector of [{ by: 'country', countryCode: 'PT' }, { by: 'domain', hostname: 'pt.example.test' }]) {
      const result = resolveMarketPricingContext(input({ selector }));
      expect(result).toMatchObject({ status: 'resolved', context: { market: 'PT', currency: 'EUR' },
        resolution: { outcome: 'matched', matchedBy: selector.by, selector } });
      expect(Object.keys(result.context!).sort()).toEqual(['at', 'channel', 'currency', 'market']);
      expect(result).not.toHaveProperty('country');
      expect(result).not.toHaveProperty('shippingCountry');
    }
  });

  it.each([
    [{ by: 'none' }, 'no_context'],
    [{ by: 'country', countryCode: 'FR' }, 'country_not_matched'],
    [{ by: 'domain', hostname: 'unknown.example.test' }, 'domain_not_matched'],
  ])('conserva la resolución fallback explícita de %o', (selector, reason) => {
    const result = resolveMarketPricingContext(input({ selector }));
    expect(result).toMatchObject({ status: 'resolved', context: { market: 'ES', currency: 'EUR' },
      resolution: { outcome: 'fallback', reason, catalogId: 'qa-markets', catalogVersion: 1, selector } });
  });

  it('bloquea ausencia de fallback e ID desconocido sin elegir el primer mercado', () => {
    const missing = resolveMarketPricingContext(input({ catalog: { ...catalog(), fallback: { strategy: 'none' } },
      selector: { by: 'none' } }));
    expect(missing).toMatchObject({ status: 'blocked', reason: 'market_unresolved', context: null,
      resolution: { outcome: 'unresolved', reason: 'fallback_disabled' } });
    const wrongId = resolveMarketPricingContext(input({ selector: { by: 'id', marketId: 'FR' } }));
    expect(wrongId).toMatchObject({ status: 'blocked', context: null,
      resolution: { outcome: 'unresolved', reason: 'unknown_market_id' } });
  });

  it('bloquea moneda diferente tanto en coincidencia como en fallback sin reconvertir al mercado base', () => {
    const direct = resolveMarketPricingContext(input({ selector: { by: 'id', marketId: 'US' } }));
    expect(direct).toMatchObject({ status: 'blocked', reason: 'currency_mismatch', baseCurrency: 'EUR', context: null,
      resolution: { outcome: 'matched', market: { id: 'US', currency: 'USD' } } });
    const fallback = resolveMarketPricingContext(input({
      catalog: { ...catalog(), fallback: { strategy: 'market', marketId: 'US' } }, selector: { by: 'none' },
    }));
    expect(fallback).toMatchObject({ status: 'blocked', reason: 'currency_mismatch', context: null,
      resolution: { outcome: 'fallback', reason: 'no_context', market: { id: 'US', currency: 'USD' } } });
  });

  it('exige la moneda base recibida explícitamente y no depende del EUR global', () => {
    expect(resolveMarketPricingContext(input({ selector: { by: 'id', marketId: 'US' }, baseCurrency: 'usd' })))
      .toMatchObject({ status: 'resolved', baseCurrency: 'USD', context: { currency: 'USD', market: 'US' } });
    const withoutBase = input();
    expect(() => resolveMarketPricingContext({ catalog: withoutBase.catalog, selector: withoutBase.selector,
      at: AT, channel: 'storefront' })).toThrow(MarketPricingContextContractError);
  });

  it('congela y copia catálogo, selector y contexto sin contaminar otra versión', () => {
    const supplied = catalog();
    const selector = { by: 'country', countryCode: 'ES' };
    const first = resolveMarketPricingContext(input({ catalog: supplied, selector }));
    if (first.status !== 'resolved') throw new Error('Expected a pricing context');
    supplied.version = 2;
    supplied.markets[0]!.id = 'ES-NEXT';
    supplied.markets[0]!.defaultLocale = 'ca-ES';
    supplied.markets[0]!.countryCodes.push('AD');
    supplied.fallback.marketId = 'ES-NEXT';
    selector.countryCode = 'PT';
    const next = resolveMarketPricingContext(input({ catalog: supplied, selector: { by: 'country', countryCode: 'ES' } }));
    expect(first).toMatchObject({ context: { market: 'ES' }, resolution: { catalogVersion: 1,
      selector: { by: 'country', countryCode: 'ES' }, market: { id: 'ES', defaultLocale: 'es-ES', countryCodes: ['ES'] } } });
    expect(next).toMatchObject({ context: { market: 'ES-NEXT' }, resolution: { catalogVersion: 2,
      market: { defaultLocale: 'ca-ES', countryCodes: ['AD', 'ES'] } } });
    for (const value of [first, first.context, first.resolution, first.resolution.selector,
      first.resolution.market, first.resolution.market.countryCodes, first.resolution.market.domains]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
    expect(() => { (first.context as { market: string }).market = 'US'; }).toThrow();
    const blocked = resolveMarketPricingContext(input({ selector: { by: 'none' }, catalog: { ...catalog(), fallback: { strategy: 'none' } } }));
    expect(Object.isFrozen(blocked)).toBe(true);
    expect(Object.isFrozen(blocked.resolution)).toBe(true);
  });

  it('no acepta resoluciones forjadas, flags ni importes en lugar del catálogo', () => {
    const forged = { outcome: 'matched', catalogId: 'qa-markets', catalogVersion: 1,
      selector: { by: 'id', marketId: 'ES' }, matchedBy: 'id', market: market() };
    expect(() => resolveMarketPricingContext({ resolution: forged, baseCurrency: 'EUR', at: AT, channel: 'storefront' }))
      .toThrow(MarketPricingContextContractError);
    expect(() => resolveMarketPricingContext(input({ catalog: forged }))).toThrow(MarketContextContractError);
    for (const extra of [{ resolution: forged }, { amount: 1 }, { active: true }, { bypassCurrency: true }]) {
      expect(() => resolveMarketPricingContext(input(extra))).toThrow(MarketPricingContextContractError);
    }
    expect(() => resolveMarketPricingContext(input({ selector: { by: 'none', market: market() } })))
      .toThrow(MarketContextContractError);
  });

  it.each([
    { baseCurrency: '' }, { baseCurrency: 'EU' }, { baseCurrency: 978 },
    { at: '' }, { at: '2026-02-30T12:00:00.000Z' }, { at: '2026-10-03T12:00:00+00:00' }, { at: 0 },
    { channel: '' }, { channel: '*' }, { channel: 'x'.repeat(41) }, { channel: null },
  ])('rechaza contexto inválido %o incluso si el mercado tampoco se resuelve', (invalid) => {
    expect(() => resolveMarketPricingContext(input({ ...invalid, selector: { by: 'id', marketId: 'UNKNOWN' } })))
      .toThrow(MarketPricingContextContractError);
  });

  it('rechaza getters sin ejecutarlos y valida el catálogo completo, no solo el mercado elegido', () => {
    const getter = vi.fn(() => catalog());
    const accessor = { ...input(), get catalog() { return getter(); } };
    expect(() => resolveMarketPricingContext(accessor)).toThrow(MarketPricingContextContractError);
    expect(getter).not.toHaveBeenCalled();
    const broken = catalog();
    broken.markets[1]!.currency = 'bad-currency';
    expect(() => resolveMarketPricingContext(input({ catalog: broken }))).toThrow(MarketContextContractError);
  });

  it('conserva el canal exacto de pricing y admite sus dos formatos ISO UTC', () => {
    const result = resolveMarketPricingContext(input({ channel: ' B2B ', at: '2026-10-03T12:00:00Z', baseCurrency: ' eur ' }));
    expect(result).toMatchObject({ status: 'resolved', context: { channel: 'B2B', at: '2026-10-03T12:00:00Z', currency: 'EUR' } });
    if (result.status !== 'resolved') throw new Error('Expected a pricing context');
    expect(() => evaluatePriceRules({ context: result.context, baseUnitPriceCents: 1000, quantity: 1 })).not.toThrow();
  });

  it('es determinista y no consulta reloj, red, almacenamiento ni temporizadores', () => {
    const expected = resolveMarketPricingContext(input());
    const unexpected = () => { throw new Error('Unexpected external effect'); };
    vi.spyOn(Date, 'now').mockImplementation(unexpected);
    vi.stubGlobal('fetch', unexpected);
    vi.stubGlobal('localStorage', { getItem: unexpected, setItem: unexpected });
    vi.stubGlobal('sessionStorage', { getItem: unexpected, setItem: unexpected });
    vi.stubGlobal('setTimeout', unexpected);
    expect(resolveMarketPricingContext(input())).toEqual(expected);
  });
});
