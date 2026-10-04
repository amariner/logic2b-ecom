import { afterEach, describe, expect, it, vi } from 'vitest';
import { previewLocalPaymentMethodsContext } from '../src/composition/local-payment-methods-context';
import { CurrencyContractError } from '../src/modules/currencies';
import { MarketContextContractError } from '../src/modules/markets';
import { LocalPaymentMethodContractError } from '../src/modules/payments';

function market(id: string, currency: string, countryCode: string) {
  return { id, currency, countryCodes: [countryCode], defaultLocale: 'es-ES', domains: [] };
}
function markets() {
  return { schemaVersion: 1, id: 'markets.fixture', version: 1, markets: [
    market('ES', 'EUR', 'ES'), market('ES-B2B', 'EUR', 'ES'),
    market('JP', 'JPY', 'JP'), market('KW', 'KWD', 'KW'),
  ], fallback: { strategy: 'market', marketId: 'ES' } };
}
function currencies() {
  return { schemaVersion: 1, id: 'currencies.fixture', version: 1,
    currencies: [{ code: 'EUR', exponent: 2 }, { code: 'JPY', exponent: 0 }, { code: 'KWD', exponent: 3 }] };
}
function refs() {
  return { marketCatalogRef: { id: 'markets.fixture', version: 1 }, currencyCatalogRef: { id: 'currencies.fixture', version: 1 } };
}
function rule(methodId: string, marketId: string, currency: string, exponent: number, enabled = true, minMinor = 0, maxMinor = 100) {
  return { methodId, marketId, currency, exponent, enabled, minMinor, maxMinor };
}
function policy() {
  return { schemaVersion: 1, source: 'fixture', id: 'methods.fixture', version: 1, ...refs(),
    methods: [{ id: 'method.bank' }, { id: 'method.card' }, { id: 'method.wallet' }], rules: [
      rule('method.bank', 'ES', 'EUR', 2),
      rule('method.card', 'ES', 'EUR', 2, true, 100, 10000),
      rule('method.wallet', 'ES', 'EUR', 2, false, 0, 1000),
      rule('method.bank', 'JP', 'JPY', 0, false, 0, 50000),
      rule('method.card', 'KW', 'KWD', 3, true, 1000, 99999),
    ] };
}
function request() {
  return { schemaVersion: 1, id: 'request.one', marketId: 'ES',
    original: { currency: 'EUR', exponent: 2, amountMinor: 100 }, ...refs() };
}
function input() { return { markets: markets(), currencies: currencies(), policy: policy(), request: request() }; }

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('composición de mercados, monedas y métodos locales R5.11b', () => {
  it('conserva catálogos, política y consulta original explícitos, sin producir un cobro', () => {
    const result = previewLocalPaymentMethodsContext(input());
    expect(Object.keys(result).sort()).toEqual(['currencies', 'markets', 'policy', 'result']);
    expect(result.markets).toEqual(markets());
    expect(result.currencies).toEqual(currencies());
    expect(result.policy.id).toBe('methods.fixture');
    expect(result.result).toMatchObject({ source: 'fixture', request: request(), policyRef: { id: 'methods.fixture', version: 1 } });
    expect(result.result.methods.map(method => method.methodId)).toEqual(['method.bank', 'method.card', 'method.wallet']);
    expect(result.result).not.toHaveProperty('paymentId');
    expect(result.result).not.toHaveProperty('presented');
  });

  it.each([
    [0, 'method.bank'], [100, 'method.bank'], [100, 'method.card'], [10000, 'method.card'],
  ] as const)('límite inclusivo o cero %i permite el método %s configurado', (amountMinor, methodId) => {
    const data = input(); data.request.original.amountMinor = amountMinor;
    const method = previewLocalPaymentMethodsContext(data).result.methods.find(item => item.methodId === methodId)!;
    expect(method).toMatchObject({ outcome: 'available_in_fixture', reason: null });
    expect(method.matchedRule).not.toBeNull();
  });

  it.each([[99, 'below_minimum'], [10001, 'above_maximum']] as const)('importe original %i conserva la exclusión %s', (amountMinor, reason) => {
    const data = input(); data.request.original.amountMinor = amountMinor;
    const method = previewLocalPaymentMethodsContext(data).result.methods.find(item => item.methodId === 'method.card')!;
    expect(method).toMatchObject({ outcome: 'unavailable_in_fixture', reason });
    expect(method.matchedRule).not.toBeNull();
  });

  it('un contexto conocido sin regla no usa el fallback ni otro mercado del mismo país', () => {
    const data = input(); data.request.marketId = 'ES-B2B';
    const result = previewLocalPaymentMethodsContext(data);
    expect(result.result.request.marketId).toBe('ES-B2B');
    expect(result.result.methods.every(method => method.outcome === 'unavailable_in_fixture' &&
      method.reason === 'not_configured' && method.matchedRule === null)).toBe(true);
    expect(result.markets.fallback).toEqual({ strategy: 'market', marketId: 'ES' });
  });

  it('usa las unidades nominales cero y tres, sin convertir ni inferir unidades monetarias', () => {
    for (const [marketId, currency, exponent, amountMinor] of [['JP', 'JPY', 0, 50], ['KW', 'KWD', 3, 1000]] as const) {
      const data = input(); data.request.marketId = marketId;
      data.request.original = { currency, exponent, amountMinor };
      const result = previewLocalPaymentMethodsContext(data);
      expect(result.result.request.original).toEqual({ currency, exponent, amountMinor });
      const method = result.result.methods.find(item => item.methodId === (marketId === 'JP' ? 'method.bank' : 'method.card'))!;
      expect(method).toMatchObject(marketId === 'JP' ? { outcome: 'unavailable_in_fixture', reason: 'disabled' } : { outcome: 'available_in_fixture', reason: null });
      expect(method.matchedRule).toMatchObject({ marketId, currency, exponent });
    }
  });

  it.each(['policy', 'request'] as const)('exige referencias de ambos catálogos exactas en %s', (owner) => {
    for (const ref of ['marketCatalogRef', 'currencyCatalogRef'] as const) {
      for (const patch of [{ id: 'catalog.other' }, { version: 2 }]) {
        const data = input(); Object.assign(data[owner][ref], patch);
        expect(() => previewLocalPaymentMethodsContext(data)).toThrow(LocalPaymentMethodContractError);
      }
    }
  });

  it('no basta con que política y petición compartan referencias si los catálogos recibidos son otros', () => {
    for (const ref of ['marketCatalogRef', 'currencyCatalogRef'] as const) {
      const data = input(); data.policy[ref].version = 2; data.request[ref].version = 2;
      expect(() => previewLocalPaymentMethodsContext(data)).toThrow(LocalPaymentMethodContractError);
    }
  });

  it.each([true, false])('valida todas las referencias de reglas ajenas al contexto aunque enabled=%s', (enabled) => {
    for (const patch of [{ marketId: 'UNKNOWN' }, { currency: 'CHF' }, { exponent: 3 },
      { currency: 'EUR', exponent: 2 }, { methodId: 'method.unknown' }]) {
      const data = input(); Object.assign(data.policy.rules[3]!, { enabled }, patch);
      expect(() => previewLocalPaymentMethodsContext(data)).toThrow(LocalPaymentMethodContractError);
    }
  });

  it('rechaza moneda y exponente incoherentes en la regla seleccionada, sin ofrecer indisponibilidad comercial', () => {
    for (const patch of [{ currency: 'JPY', exponent: 0 }, { exponent: 0 }]) {
      const data = input(); Object.assign(data.policy.rules[0]!, patch);
      expect(() => previewLocalPaymentMethodsContext(data)).toThrow(LocalPaymentMethodContractError);
    }
  });

  it('un mercado desconocido o ausente en la consulta es error, aunque exista fallback explícito', () => {
    for (const value of ['UNKNOWN', '', 'es']) {
      const data = input(); data.request.marketId = value;
      expect(() => previewLocalPaymentMethodsContext(data)).toThrow(LocalPaymentMethodContractError);
    }
    const { marketId: _unused, ...withoutMarket } = request();
    expect(() => previewLocalPaymentMethodsContext({ ...input(), request: withoutMarket })).toThrow(LocalPaymentMethodContractError);
  });

  it('exige moneda nominal y exponente del importe original incluso sin reglas', () => {
    for (const patch of [{ currency: 'JPY', exponent: 0 }, { currency: 'CHF', exponent: 2 }, { exponent: 3 }]) {
      const data = input(); data.policy.rules = [];
      Object.assign(data.request.original, patch);
      expect(() => previewLocalPaymentMethodsContext(data)).toThrow(LocalPaymentMethodContractError);
    }
  });

  it('conserva el mayor importe entero seguro cuando coincide exactamente con un límite', () => {
    const data = input(); data.request.original.amountMinor = Number.MAX_SAFE_INTEGER;
    data.policy.rules[1]!.minMinor = Number.MAX_SAFE_INTEGER;
    data.policy.rules[1]!.maxMinor = Number.MAX_SAFE_INTEGER;
    const result = previewLocalPaymentMethodsContext(data);
    expect(result.result.request.original.amountMinor).toBe(Number.MAX_SAFE_INTEGER);
    expect(result.result.methods.find(method => method.methodId === 'method.card'))
      .toMatchObject({ outcome: 'available_in_fixture', reason: null });
  });

  it('valida ambos catálogos completos y propaga su error específico', () => {
    const badMarkets = input(); badMarkets.markets.markets[3]!.currency = 'bad';
    expect(() => previewLocalPaymentMethodsContext(badMarkets)).toThrow(MarketContextContractError);
    const badCurrencies = input(); badCurrencies.currencies.currencies.push({ code: 'CHF', exponent: 1 });
    expect(() => previewLocalPaymentMethodsContext(badCurrencies)).toThrow(CurrencyContractError);
  });

  it('mantiene versiones coherentes sin ligarlas a una configuración global', () => {
    const data = input(); data.markets.version = 7; data.currencies.version = 8; data.policy.version = 9;
    for (const row of [data.policy, data.request]) {
      row.marketCatalogRef.version = 7; row.currencyCatalogRef.version = 8;
    }
    const result = previewLocalPaymentMethodsContext(data);
    expect(result.markets.version).toBe(7);
    expect(result.currencies.version).toBe(8);
    expect(result.result).toMatchObject({ policyRef: { id: 'methods.fixture', version: 9 }, request: {
      marketCatalogRef: { id: 'markets.fixture', version: 7 }, currencyCatalogRef: { id: 'currencies.fixture', version: 8 },
    } });
  });

  it('normaliza el orden y copia profundamente sin retener entradas mutables', () => {
    const data = input(); data.markets.markets.reverse(); data.currencies.currencies.reverse();
    data.policy.methods.reverse(); data.policy.rules.reverse();
    const result = previewLocalPaymentMethodsContext(data);
    const snapshot = JSON.stringify(result);
    data.markets.markets[0]!.currency = 'USD';
    data.currencies.currencies[0]!.exponent = 0;
    data.policy.methods[0]!.id = 'changed'; data.policy.rules[0]!.enabled = false;
    data.request.original.amountMinor = 999;
    data.request.marketCatalogRef.version = 100;
    expect(JSON.stringify(result)).toBe(snapshot);
    expect(result).toEqual(previewLocalPaymentMethodsContext(input()));
    for (const value of [result, result.markets, result.markets.markets, result.markets.markets[0],
      result.currencies, result.currencies.currencies, result.currencies.currencies[0], result.policy,
      result.policy.methods, result.policy.rules, result.policy.rules[0], result.result, result.result.request,
      result.result.request.original, result.result.request.marketCatalogRef, result.result.methods,
      result.result.methods[0], result.result.methods[0]!.matchedRule]) expect(Object.isFrozen(value)).toBe(true);
  });

  it('rechaza importes presentados, cotizaciones FX, reloj o contexto forjado como sustitutos del original', () => {
    for (const extra of [{ presented: { currency: 'EUR', amountMinor: 100 } }, { fx: null },
      { response: { outcome: 'quoted' } }, { at: '2026-10-04T00:00:00.000Z' }, { selector: { by: 'none' } }]) {
      expect(() => previewLocalPaymentMethodsContext({ ...input(), ...extra })).toThrow(LocalPaymentMethodContractError);
    }
    for (const extra of [{ presented: { currency: 'EUR', amountMinor: 100 } }, { fx: null }, { at: '2026-10-04T00:00:00.000Z' }]) {
      expect(() => previewLocalPaymentMethodsContext({ ...input(), request: { ...request(), ...extra } })).toThrow(LocalPaymentMethodContractError);
    }
    const { original: _unused, ...withoutOriginal } = request();
    expect(() => previewLocalPaymentMethodsContext({ ...input(), request: {
      ...withoutOriginal, presented: request().original,
    } })).toThrow(LocalPaymentMethodContractError);
  });

  it.each([-1, -0, 0.1, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])('rechaza el importe original no canónico %s', (amountMinor) => {
    const data = input(); data.request.original.amountMinor = amountMinor;
    expect(() => previewLocalPaymentMethodsContext(data)).toThrow(LocalPaymentMethodContractError);
  });

  it('valida datos propios sin getters, símbolos, propiedades ocultas o prototipos personalizados', () => {
    const getter = vi.fn(() => { throw new Error('Unexpected getter'); });
    const accessor = { ...input(), get markets() { return getter(); } };
    const hidden = input(); Object.defineProperty(hidden, 'request', { enumerable: false });
    const symbolic = { ...input(), [Symbol('extra')]: true };
    for (const candidate of [null, {}, [], accessor, hidden, symbolic, Object.create(input())]) {
      expect(() => previewLocalPaymentMethodsContext(candidate)).toThrow(LocalPaymentMethodContractError);
    }
    const badRule = input(); Object.defineProperty(badRule.policy.rules[3]!, 'enabled', { get: getter });
    const badOriginal = input(); Object.defineProperty(badOriginal.request.original, 'amountMinor', { get: getter });
    for (const candidate of [badRule, badOriginal]) expect(() => previewLocalPaymentMethodsContext(candidate)).toThrow(LocalPaymentMethodContractError);
    const badCurrency = input(); Object.defineProperty(badCurrency.currencies.currencies[0]!, 'exponent', { get: getter });
    expect(() => previewLocalPaymentMethodsContext(badCurrency)).toThrow(CurrencyContractError);
    const badMarket = input(); Object.defineProperty(badMarket.markets.markets[0]!, 'currency', { get: getter });
    expect(() => previewLocalPaymentMethodsContext(badMarket)).toThrow(MarketContextContractError);
    expect(getter).not.toHaveBeenCalled();
  });

  it('es determinista y no utiliza reloj, red, almacenamiento, timers ni logs', () => {
    const expected = previewLocalPaymentMethodsContext(input());
    const unexpected = () => { throw new Error('Unexpected effect'); };
    vi.spyOn(Date, 'now').mockImplementation(unexpected);
    const log = vi.spyOn(console, 'log').mockImplementation(unexpected);
    const warn = vi.spyOn(console, 'warn').mockImplementation(unexpected);
    const error = vi.spyOn(console, 'error').mockImplementation(unexpected);
    vi.stubGlobal('fetch', unexpected);
    vi.stubGlobal('setTimeout', unexpected);
    vi.stubGlobal('setInterval', unexpected);
    vi.stubGlobal('localStorage', { getItem: unexpected, setItem: unexpected });
    vi.stubGlobal('sessionStorage', { getItem: unexpected, setItem: unexpected });
    expect(previewLocalPaymentMethodsContext(input())).toEqual(expected);
    expect(log).not.toHaveBeenCalled(); expect(warn).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
  });
});
