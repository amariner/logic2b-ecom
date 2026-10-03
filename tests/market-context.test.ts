import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  defineMarketCatalog, resolveMarket, MarketContextContractError,
  MAX_MARKETS, MAX_MARKET_COUNTRIES, MAX_MARKET_DOMAINS,
  type Market, type MarketCatalog, type MarketSelector,
} from '../src/modules/markets';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

// Catálogo sintético: no configura los países, monedas ni dominios de ninguna tienda.
const market = (overrides: Partial<Market> = {}): Market => ({
  id: 'ES-RETAIL', countryCodes: ['ES'], defaultLocale: 'es-ES', currency: 'EUR',
  domains: ['retail.example.test'], ...overrides,
});
const catalog = (overrides: Partial<MarketCatalog> = {}): MarketCatalog => ({
  schemaVersion: 1, id: 'test.markets', version: 7,
  markets: [market(), market({ id: 'FR-RETAIL', countryCodes: ['FR'], defaultLocale: 'fr-FR', domains: ['fr.example.test'] })],
  fallback: { strategy: 'none' }, ...overrides,
});
const withFallback = (overrides: Partial<MarketCatalog> = {}) => catalog({
  fallback: { strategy: 'market', marketId: 'ES-RETAIL' }, ...overrides,
});
const selector = { by: 'id', marketId: 'ES-RETAIL' } as const;

describe('catálogo explícito de mercados R5.7a', () => {
  it('copia, ordena y congela el catálogo sin elegir país, idioma ni moneda', () => {
    const countries = ['PT', 'ES'];
    const domains = ['Z.Example.Test', 'a.example.test'];
    const sourceMarkets = [market({ countryCodes: countries, domains, defaultLocale: 'es-es' }),
      market({ id: 'ANOTHER', countryCodes: ['GB'], defaultLocale: 'fr', currency: 'JPY', domains: [] })];
    const fallback = { strategy: 'market' as const, marketId: 'ES-RETAIL' };
    const input = catalog({ markets: sourceMarkets, fallback });
    const result = defineMarketCatalog(input);
    expect(result).toEqual({
      schemaVersion: 1, id: 'test.markets', version: 7, fallback: { strategy: 'market', marketId: 'ES-RETAIL' },
      markets: [
        { id: 'ANOTHER', countryCodes: ['GB'], defaultLocale: 'fr', currency: 'JPY', domains: [] },
        { id: 'ES-RETAIL', countryCodes: ['ES', 'PT'], defaultLocale: 'es-ES', currency: 'EUR', domains: ['a.example.test', 'z.example.test'] },
      ],
    });
    countries.push('FR');
    domains[0] = 'changed.example.test';
    sourceMarkets.pop();
    fallback.marketId = 'ANOTHER';
    expect(result.markets).toHaveLength(2);
    expect(result.markets[1]?.countryCodes).toEqual(['ES', 'PT']);
    expect(result.markets[1]?.domains).toEqual(['a.example.test', 'z.example.test']);
    expect(result.fallback).toEqual({ strategy: 'market', marketId: 'ES-RETAIL' });
    for (const value of [result, result.markets, result.markets[0], result.markets[0]!.countryCodes,
      result.markets[0]!.domains, result.fallback]) expect(Object.isFrozen(value)).toBe(true);
    expect(defineMarketCatalog(result)).toEqual(result);
  });

  it('exige todos los campos, incluido un fallback explícito, sin completar defaults', () => {
    for (const key of Object.keys(catalog())) {
      const input = { ...catalog() } as Record<string, unknown>;
      delete input[key];
      expect(() => defineMarketCatalog(input)).toThrow(MarketContextContractError);
    }
    for (const key of Object.keys(market())) {
      const input = { ...market() } as Record<string, unknown>;
      delete input[key];
      expect(() => defineMarketCatalog({ ...catalog(), markets: [input] })).toThrow(MarketContextContractError);
    }
  });

  it.each([
    ['schemaVersion', 0], ['schemaVersion', '1'], ['schemaVersion', 2],
    ['id', ''], ['id', 'Test.Markets'], ['id', 'test..markets'], ['id', 'test/markets'], ['id', 'a'.repeat(101)],
    ['version', 0], ['version', -1], ['version', 1.5], ['version', NaN], ['version', Infinity],
    ['version', Number.MAX_SAFE_INTEGER + 1], ['version', '1'], ['extra', true],
  ])('rechaza %s=%s fuera del contrato del catálogo', (key, value) => {
    expect(() => defineMarketCatalog({ ...catalog(), [key]: value })).toThrow(MarketContextContractError);
  });

  it.each([
    ['id', 'ES'], ['id', 'EU-B2B'], ['id', 'EU.RETAIL_01'], ['id', 'A'.repeat(40)],
    ['countryCodes', ['ZZ']], ['currency', 'XXX'], ['defaultLocale', 'zh-hant-tw'], ['domains', []],
  ])('permite %s=%s sin atribuir disponibilidad comercial a los códigos', (key, value) => {
    expect(() => defineMarketCatalog({ ...catalog(), markets: [{ ...market(), [key]: value }] })).not.toThrow();
  });

  it.each([
    ['id', '*'], ['id', 'E'], ['id', 'es'], ['id', 'ES '], ['id', 'ES/RETAIL'], ['id', 'ES--RETAIL'],
    ['id', 'A'.repeat(41)], ['id', '1ES'], ['id', '__PROTO__'],
    ['countryCodes', []], ['countryCodes', ['ES', 'ES']], ['countryCodes', ['es']], ['countryCodes', ['ESP']],
    ['countryCodes', ['E1']], ['countryCodes', [' ES']], ['countryCodes', ['España']],
    ['currency', 'eur'], ['currency', 'EU'], ['currency', 'EURO'], ['currency', '€'], ['currency', 978],
    ['defaultLocale', ''], ['defaultLocale', ' es-ES'], ['defaultLocale', 'es_ES'], ['defaultLocale', 'en--US'],
    ['defaultLocale', 'en-u-ca-gregory'], ['defaultLocale', 'es-ES-u-cu-usd'], ['defaultLocale', 'en-x-private'],
    ['defaultLocale', 'x-private'], ['defaultLocale', ['es-ES']], ['defaultLocale', 'a'.repeat(101)],
    ['domains', ['retail.example.test', 'RETAIL.EXAMPLE.TEST']], ['extra', true],
  ])('rechaza %s=%s fuera del contrato de un mercado', (key, value) => {
    expect(() => defineMarketCatalog({ ...catalog(), markets: [{ ...market(), [key]: value }] })).toThrow(MarketContextContractError);
  });

  it('detecta identificadores y dominios repetidos entre mercados tras canonicalizar', () => {
    expect(() => defineMarketCatalog(catalog({ markets: [market(), market({ domains: [] })] }))).toThrow(/identificadores/);
    expect(() => defineMarketCatalog(catalog({ markets: [market(), market({ id: 'OTHER', domains: ['RETAIL.EXAMPLE.TEST'] })] })))
      .toThrow(/dominio/);
    expect(() => defineMarketCatalog(catalog({ markets: [market(), market({ id: 'OTHER', domains: [] })] }))).not.toThrow();
  });

  it('aplica el límite de locale también después de expandir un alias para conservar la revalidación', () => {
    const defaultLocale = `sh-${Array.from({ length: 16 }, (_, index) =>
      String.fromCharCode(97 + index).repeat(index === 15 ? 7 : 5)).join('-')}`;
    expect(defaultLocale).toHaveLength(100);
    expect(Intl.getCanonicalLocales(defaultLocale)[0]).toHaveLength(105);
    expect(() => defineMarketCatalog(catalog({ markets: [market({ defaultLocale })] }))).toThrow(/canónica supera/);
    const accepted = defineMarketCatalog(catalog({ markets: [market({ defaultLocale: 'sh' })] }));
    expect(accepted.markets[0]?.defaultLocale).toBe('sr-Latn');
    expect(defineMarketCatalog(accepted)).toEqual(accepted);
  });

  it.each([null, {}, { strategy: 'automatic' }, { strategy: 'none', marketId: 'ES-RETAIL' },
    { strategy: 'market' }, { strategy: 'market', marketId: 'MISSING' },
    { strategy: 'market', marketId: 'es-retail' }, { strategy: 'market', marketId: 'ES-RETAIL', next: 'FR-RETAIL' },
  ])('rechaza un fallback inválido o una referencia ausente: %j', (fallback) => {
    expect(() => defineMarketCatalog({ ...catalog(), fallback })).toThrow(MarketContextContractError);
  });

  it('admite los límites técnicos y rechaza excederlos sin recorrer arrays arbitrarios', () => {
    const countries = Array.from({ length: MAX_MARKET_COUNTRIES }, (_, index) =>
      String.fromCharCode(65 + Math.floor(index / 26), 65 + index % 26));
    const domains = Array.from({ length: MAX_MARKET_DOMAINS }, (_, index) => `market-${index}.example.test`);
    const markets = Array.from({ length: MAX_MARKETS }, (_, index) => market({ id: `MARKET-${index}`, domains: [] }));
    expect(defineMarketCatalog(catalog({ id: 'a'.repeat(100), version: Number.MAX_SAFE_INTEGER, markets })).markets).toHaveLength(MAX_MARKETS);
    expect(defineMarketCatalog(catalog({ markets: [market({ countryCodes: countries, domains })] })).markets[0]?.domains)
      .toHaveLength(MAX_MARKET_DOMAINS);
    expect(() => defineMarketCatalog(catalog({ markets: [...markets, market()] }))).toThrow(/entre/);
    expect(() => defineMarketCatalog(catalog({ markets: [market({ countryCodes: [...countries, 'ZZ'] })] }))).toThrow(/entre/);
    expect(() => defineMarketCatalog(catalog({ markets: [market({ domains: [...domains, 'another.example.test'] })] }))).toThrow(/entre/);
    expect(() => defineMarketCatalog(catalog({ markets: [] }))).toThrow(/entre/);
  });

  it('admite DNS ASCII y A-labels IDNA válidos, con límites de longitud exactos', () => {
    const longest = `${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(61)}`;
    const result = defineMarketCatalog(catalog({ markets: [market({ domains: [longest, 'xn--bcher-kva.example.test'] })] }));
    expect(result.markets[0]?.domains).toContain(longest);
    expect(() => defineMarketCatalog(catalog({ markets: [market({ domains: [`${longest}a`] })] }))).toThrow(MarketContextContractError);
    expect(() => defineMarketCatalog(catalog({ markets: [market({ domains: [`${'a'.repeat(64)}.example.test`] })] })))
      .toThrow(MarketContextContractError);
  });

  it.each([
    '', 'localhost', '127.0.0.1', '127.1', '2130706433', '0x7f000001', '[::1]', 'example.test:443',
    'https://example.test', 'user@example.test', 'example.test/path', 'example.test?query', 'example.test#fragment',
    '*.example.test', 'example.test.', ' example.test', 'example.test\n', 'example..test', '-shop.example.test',
    'shop-.example.test', 'shop_name.example.test', 'bücher.example.test', 'xn--a.example.test',
  ])('rechaza el hostname ambiguo, inválido o ajeno al contrato %s', (hostname) => {
    expect(() => defineMarketCatalog(catalog({ markets: [market({ domains: [hostname] })] }))).toThrow(MarketContextContractError);
    expect(() => resolveMarket(withFallback(), { by: 'domain', hostname })).toThrow(MarketContextContractError);
  });

  it('rechaza accesores, propiedades ocultas, símbolos, clases y arrays alterados sin ejecutarlos', () => {
    const getter = vi.fn(() => 'ES-RETAIL');
    const values: unknown[] = [
      null, [], Object.create(catalog()),
      Object.defineProperty(catalog(), 'id', { enumerable: true, get: getter }),
      Object.defineProperty(catalog(), 'hidden', { value: true }),
      Object.assign(catalog(), { [Symbol('extra')]: true }),
      { ...catalog(), markets: Array(1) },
      { ...catalog(), markets: Object.assign([market()], { extra: true }) },
      { ...catalog(), markets: Object.defineProperty([market()], '0', { enumerable: true, get: getter }) },
      { ...catalog(), markets: [Object.defineProperty(market(), 'currency', { enumerable: true, get: getter })] },
      { ...catalog(), markets: [market({ countryCodes: Object.defineProperty(['ES'], '0', { enumerable: true, get: getter }) })] },
      { ...catalog(), markets: [market({ domains: Object.assign([], { extra: true }) })] },
      { ...catalog(), markets: [market({ countryCodes: Object.defineProperty(['ES'], 'extra', { value: true }) })] },
      { ...catalog(), fallback: Object.defineProperty({}, 'strategy', { enumerable: true, get: getter }) },
    ];
    for (const input of values) expect(() => defineMarketCatalog(input)).toThrow(MarketContextContractError);
    expect(getter).not.toHaveBeenCalled();
    expect(() => defineMarketCatalog(Object.assign(Object.create(null), catalog()))).not.toThrow();
  });
});

describe('resolución pura y observable de mercado', () => {
  it.each([
    { by: 'id', marketId: 'ES-RETAIL' },
    { by: 'domain', hostname: 'RETAIL.EXAMPLE.TEST' },
    { by: 'country', countryCode: 'ES' },
  ] as const)('resuelve exactamente una fuente: $by', (input) => {
    const result = resolveMarket(catalog(), input);
    expect(result).toEqual({
      outcome: 'matched', matchedBy: input.by, catalogId: 'test.markets', catalogVersion: 7,
      selector: input.by === 'domain' ? { by: 'domain', hostname: 'retail.example.test' } : input,
      market: market(),
    });
  });

  it('mantiene la identidad del mercado separada de país, dominio y locale', () => {
    const configured = catalog({ markets: [market({ id: 'EU-RETAIL', countryCodes: ['FR', 'ES'], defaultLocale: 'en-GB' })] });
    const result = resolveMarket(configured, { by: 'country', countryCode: 'FR' });
    expect(result).toMatchObject({ outcome: 'matched', selector: { by: 'country', countryCode: 'FR' },
      market: { id: 'EU-RETAIL', countryCodes: ['ES', 'FR'], defaultLocale: 'en-GB', currency: 'EUR' } });
    expect(resolveMarket(configured, { by: 'id', marketId: 'ES' }))
      .toMatchObject({ outcome: 'unresolved', reason: 'unknown_market_id' });
  });

  it.each([
    [{ by: 'none' }, 'no_context'],
    [{ by: 'domain', hostname: 'unknown.example.test' }, 'domain_not_matched'],
    [{ by: 'country', countryCode: 'DE' }, 'country_not_matched'],
  ] as const)('aplica solo el fallback declarado a %j', (input, reason) => {
    expect(resolveMarket(withFallback(), input)).toEqual({
      catalogId: 'test.markets', catalogVersion: 7, selector: input,
      outcome: 'fallback', reason, market: market(),
    });
    expect(resolveMarket(catalog(), input)).toEqual({
      catalogId: 'test.markets', catalogVersion: 7, selector: input,
      outcome: 'unresolved', reason: 'fallback_disabled',
    });
  });

  it('no hace fallback para una elección de ID desconocida ni un país ambiguo', () => {
    const configured = withFallback({ markets: [market(), market({ id: 'ES-B2B', domains: ['b2b.example.test'] })] });
    expect(resolveMarket(configured, { by: 'id', marketId: 'UNKNOWN' }))
      .toMatchObject({ outcome: 'unresolved', reason: 'unknown_market_id' });
    expect(resolveMarket(configured, { by: 'country', countryCode: 'ES' })).toEqual({
      catalogId: 'test.markets', catalogVersion: 7, selector: { by: 'country', countryCode: 'ES' },
      outcome: 'unresolved', reason: 'ambiguous_country',
    });
    expect(resolveMarket(configured, { by: 'domain', hostname: 'b2b.example.test' }))
      .toMatchObject({ outcome: 'matched', market: { id: 'ES-B2B' } });
  });

  it('no amplía dominios a subdominios ni coincidencias de sufijos', () => {
    for (const hostname of ['shop.retail.example.test', 'retail.example.test.attacker.test', 'example.test']) {
      expect(resolveMarket(catalog(), { by: 'domain', hostname })).toMatchObject({ outcome: 'unresolved' });
    }
  });

  it('ignora el orden de entrada sin usar prioridad implícita para elegir mercado', () => {
    const markets = [market({ countryCodes: ['PT', 'ES'], domains: ['z.example.test', 'a.example.test'] }),
      market({ id: 'ES-B2B', domains: ['b2b.example.test'] })];
    const left = withFallback({ markets });
    const right = withFallback({ markets: [...markets].reverse().map((item) => ({ ...item,
      countryCodes: [...item.countryCodes].reverse(), domains: [...item.domains].reverse() })) });
    expect(JSON.stringify(defineMarketCatalog(left))).toBe(JSON.stringify(defineMarketCatalog(right)));
    const inputs: MarketSelector[] = [selector, { by: 'country', countryCode: 'ES' },
      { by: 'domain', hostname: 'z.example.test' }, { by: 'none' }];
    for (const input of inputs) expect(resolveMarket(left, input)).toEqual(resolveMarket(right, input));
  });

  it.each([null, {}, { by: 'ip', countryCode: 'ES' }, { by: 'none', marketId: 'ES-RETAIL' },
    { by: 'id' }, { by: 'id', marketId: 'es-retail' }, { by: 'id', marketId: 'ES-RETAIL', hostname: 'retail.example.test' },
    { by: 'domain' }, { by: 'country', countryCode: 'es' }, { by: 'country', countryCode: 'ESP' },
  ])('no oculta con fallback un selector inválido o varias fuentes: %j', (input) => {
    expect(() => resolveMarket(withFallback(), input)).toThrow(MarketContextContractError);
  });

  it('rechaza accesores y estructuras manipuladas del selector sin ejecutar código', () => {
    const getter = vi.fn(() => 'id');
    for (const input of [
      Object.defineProperty({}, 'by', { enumerable: true, get: getter }),
      Object.defineProperty({ by: 'id' }, 'marketId', { enumerable: true, get: getter }),
      Object.assign({ by: 'none' }, { [Symbol('extra')]: true }),
      Object.defineProperty({ by: 'none' }, 'hidden', { value: true }),
      Object.create(selector),
    ]) expect(() => resolveMarket(withFallback(), input)).toThrow(MarketContextContractError);
    expect(getter).not.toHaveBeenCalled();
  });

  it('revalida el catálogo incluso si el selector no coincide y existe fallback', () => {
    const input = { ...withFallback(), markets: [market({ currency: 'eur' })] };
    expect(() => resolveMarket(input, { by: 'none' })).toThrow(MarketContextContractError);
    expect(() => resolveMarket({ ...withFallback(), fallback: { strategy: 'market', marketId: 'UNKNOWN' } }, selector))
      .toThrow(MarketContextContractError);
  });

  it('devuelve evidencia inmutable desvinculada de catálogo y selector mutables', () => {
    const countries = ['ES'];
    const input = catalog({ markets: [market({ countryCodes: countries })] });
    const selected = { by: 'domain' as const, hostname: 'RETAIL.EXAMPLE.TEST' };
    const result = resolveMarket(input, selected);
    countries.push('FR');
    selected.hostname = 'other.example.test';
    expect(result.selector).toEqual({ by: 'domain', hostname: 'retail.example.test' });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.selector)).toBe(true);
    if (result.outcome === 'unresolved') throw new Error('Expected a resolved market');
    expect(result.market.countryCodes).toEqual(['ES']);
    expect(Object.isFrozen(result.market)).toBe(true);
    expect(() => { (result.market.countryCodes as string[]).push('FR'); }).toThrow();
    expect(Object.isFrozen(resolveMarket(withFallback(), { by: 'none' }))).toBe(true);
    expect(Object.isFrozen(resolveMarket(catalog(), { by: 'none' }))).toBe(true);
  });

  it('no lee reloj, red, almacenamiento ni temporizadores para resolver', () => {
    const unexpected = () => { throw new Error('Unexpected external effect'); };
    vi.spyOn(Date, 'now').mockImplementation(unexpected);
    vi.stubGlobal('fetch', unexpected);
    vi.stubGlobal('localStorage', { getItem: unexpected, setItem: unexpected });
    vi.stubGlobal('sessionStorage', { getItem: unexpected, setItem: unexpected });
    vi.stubGlobal('setTimeout', unexpected);
    expect(resolveMarket(catalog(), selector)).toMatchObject({ outcome: 'matched' });
    expect(resolveMarket(withFallback(), { by: 'none' })).toMatchObject({ outcome: 'fallback' });
  });
});
