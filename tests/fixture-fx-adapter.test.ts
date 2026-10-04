import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CURRENCY_PRESENTMENT_PROFILE, CurrencyContractError, MAX_FIXTURE_FX_CASES,
  createFixtureFxAdapter, previewCurrencyPresentment,
} from '../src/modules/currencies';

const AT = '2026-10-03T12:00:00.000Z';
const QUOTED = '2026-10-03T11:00:00.000Z';
const UNTIL = '2026-10-03T13:00:00.000Z';
const ADAPTER = 'fixture.fx';

function request(id = 'request.one') {
  return {
    schemaVersion: 1, id, profile: CURRENCY_PRESENTMENT_PROFILE, at: AT,
    catalog: { schemaVersion: 1, id: 'currencies.fixture', version: 1, currencies: [
      { code: 'EUR', exponent: 2 }, { code: 'GBP', exponent: 2 }, { code: 'JPY', exponent: 0 },
      { code: 'KWD', exponent: 3 }, { code: 'USD', exponent: 2 },
    ] },
    original: { currency: 'EUR', amountMinor: 1900 }, targetCurrency: 'USD',
  };
}

function quoted(id = 'request.one') {
  return {
    source: 'fixture', adapterId: ADAPTER, request: request(id), outcome: 'quoted',
    evidenceRef: `quote.${id}`, quotedAt: QUOTED, expiresAt: UNTIL,
    rate: { baseCurrency: 'EUR', targetCurrency: 'USD', numerator: 11, denominator: 10 },
  };
}

function unavailable(reason = 'not_configured', id = 'request.one') {
  return { source: 'fixture', adapterId: ADAPTER, request: request(id), outcome: 'unavailable', reason };
}

function configuration() { return { adapterId: ADAPTER, cases: [quoted()] }; }

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('adaptador FX de fixtures R5.11a', () => {
  it('entrega una cotización dirigida y correlacionada, sin tocar el importe original', () => {
    const adapter = createFixtureFxAdapter(configuration());
    expect(adapter.source).toBe('fixture');
    expect(adapter.adapterId).toBe(ADAPTER);
    expect(adapter.quote(request())).toEqual(quoted());
    expect(adapter.quote(request())).not.toBeInstanceOf(Promise);
    expect(adapter.quote(request())).toMatchObject({ request: { original: { currency: 'EUR', amountMinor: 1900 } } });
  });

  it.each(['not_configured', 'unsupported', 'unavailable'])('conserva la respuesta configurada %s sin fabricar evidencia', (reason) => {
    const adapter = createFixtureFxAdapter({ adapterId: ADAPTER, cases: [unavailable(reason)] });
    expect(adapter.quote(request())).toEqual(unavailable(reason));
    expect(Object.keys(adapter.quote(request())).sort()).toEqual(['adapterId', 'outcome', 'reason', 'request', 'source']);
  });

  it('cero casos devuelve not_configured y una copia completa congelada de la consulta', () => {
    const adapter = createFixtureFxAdapter({ adapterId: ADAPTER, cases: [] });
    const input = request();
    const response = adapter.quote(input);
    input.original.amountMinor = 7;
    input.catalog.currencies[0]!.exponent = 3;
    expect(response).toEqual(unavailable());
    expect(Object.keys(response).sort()).toEqual(['adapterId', 'outcome', 'reason', 'request', 'source']);
    expect(Object.isFrozen(response)).toBe(true);
    expect(Object.isFrozen(response.request)).toBe(true);
    expect(Object.isFrozen(response.request.catalog)).toBe(true);
    expect(Object.isFrozen(response.request.catalog.currencies)).toBe(true);
    expect(Object.isFrozen(response.request.catalog.currencies[0])).toBe(true);
    expect(Object.isFrozen(response.request.original)).toBe(true);
    expect(previewCurrencyPresentment({ mode: 'fx', request: request(), expectedAdapterId: ADAPTER, response }))
      .toMatchObject({ outcome: 'unresolved', reason: 'not_configured', presented: null });
  });

  const changedRequests = [
    ['id', () => ({ ...request(), id: 'request.other' })],
    ['instante', () => ({ ...request(), at: UNTIL })],
    ['perfil del catálogo', () => ({ ...request(), catalog: { ...request().catalog, id: 'currencies.other' } })],
    ['versión del catálogo', () => ({ ...request(), catalog: { ...request().catalog, version: 2 } })],
    ['exponente de la moneda original', () => {
      const value = request(); value.catalog.currencies[0]!.exponent = 3; return value;
    }],
    ['exponente ajeno al par', () => {
      const value = request(); value.catalog.currencies[2]!.exponent = 2; return value;
    }],
    ['catálogo completo, incluso otra moneda', () => {
      const value = request(); value.catalog.currencies.push({ code: 'CHF', exponent: 2 }); return value;
    }],
    ['importe original', () => ({ ...request(), original: { currency: 'EUR', amountMinor: 1901 } })],
    ['moneda original', () => ({ ...request(), original: { currency: 'GBP', amountMinor: 1900 } })],
    ['moneda de destino', () => ({ ...request(), targetCurrency: 'JPY' })],
  ] as const;

  it.each(changedRequests)('lookup exige %s exacto y no reutiliza por id', (_label, changed) => {
    const adapter = createFixtureFxAdapter(configuration());
    const input = changed();
    const response = adapter.quote(input);
    expect(response).toMatchObject({ source: 'fixture', adapterId: ADAPTER, outcome: 'unavailable', reason: 'not_configured' });
    expect(response.request.id).toBe(input.id);
    expect(response.request.original).toEqual(input.original);
    expect(response.request.targetCurrency).toBe(input.targetCurrency);
    expect(response.request.at).toBe(input.at);
    expect(response.request.catalog).toEqual({ ...input.catalog,
      currencies: [...input.catalog.currencies].sort((a, b) => a.code < b.code ? -1 : a.code > b.code ? 1 : 0) });
  });

  it('normaliza el orden del catálogo antes de comparar, sin inferir tipos inversos', () => {
    const config = configuration();
    config.cases[0]!.request.catalog.currencies.reverse();
    const adapter = createFixtureFxAdapter(config);
    const reversedOrder = request();
    reversedOrder.catalog.currencies.reverse();
    expect(adapter.quote(request())).toEqual(quoted());
    expect(adapter.quote(reversedOrder)).toEqual(quoted());
    expect(adapter.quote({ ...request(), original: { currency: 'USD', amountMinor: 1900 }, targetCurrency: 'EUR' }))
      .toMatchObject({ outcome: 'unavailable', reason: 'not_configured' });
  });

  it('la cotización nunca renueva fechas ni descarta por su cuenta evidencia caducada o futura', () => {
    for (const [at, expected] of [[QUOTED, 'converted'], [UNTIL, 'expired'], ['2026-10-03T10:00:00.000Z', 'future']] as const) {
      const response = quoted(); response.request.at = at;
      const adapter = createFixtureFxAdapter({ adapterId: ADAPTER, cases: [response] });
      expect(adapter.quote(response.request)).toEqual(response);
      expect(adapter.quote(response.request)).toMatchObject({ quotedAt: QUOTED, expiresAt: UNTIL });
      expect(previewCurrencyPresentment({ mode: 'fx', request: response.request,
        expectedAdapterId: ADAPTER, response: adapter.quote(response.request) }))
        .toMatchObject(expected === 'converted'
          ? { outcome: 'converted', presented: { currency: 'USD', amountMinor: 2090, exponent: 2 } }
          : { outcome: 'unresolved', reason: expected, presented: null });
    }
  });

  it('copia y congela toda respuesta configurada; un adaptador no altera a otro', () => {
    const original = configuration();
    const adapter = createFixtureFxAdapter(original);
    original.adapterId = 'fixture.other';
    original.cases[0]!.request.original.amountMinor = 9999;
    original.cases[0]!.request.catalog.currencies[0]!.exponent = 3;
    original.cases[0]!.rate.numerator = 99;
    original.cases.length = 0;
    const response = adapter.quote(request());
    expect(response).toEqual(quoted());
    expect(Object.isFrozen(adapter)).toBe(true);
    expect(Object.isFrozen(response)).toBe(true);
    expect(Object.isFrozen(response.request.original)).toBe(true);
    expect(Object.isFrozen(response.request.catalog.currencies[0])).toBe(true);
    if (response.outcome !== 'quoted') throw new Error('Expected quotation');
    expect(Object.isFrozen(response.rate)).toBe(true);
    expect(() => { (response.rate as { numerator: number }).numerator = 88; }).toThrow();
    const other = createFixtureFxAdapter({ adapterId: ADAPTER, cases: [unavailable('unsupported')] });
    expect(other.quote(request())).toMatchObject({ outcome: 'unavailable', reason: 'unsupported' });
    expect(adapter.quote(request())).toEqual(quoted());
  });

  it('rechaza ids de consulta repetidos, aunque cambien el contenido o tipo de respuesta', () => {
    const changed = quoted(); changed.request.original.amountMinor = 1901;
    for (const second of [quoted(), changed, unavailable('unsupported')]) {
      expect(() => createFixtureFxAdapter({ adapterId: ADAPTER, cases: [quoted(), second] })).toThrow(CurrencyContractError);
    }
  });

  it('rechaza cualquier caso corrupto o de otro adaptador antes de aceptar la configuración', () => {
    for (const patch of [{ source: 'provider' }, { adapterId: 'fixture.other' }, { expiresAt: QUOTED },
      { rate: { ...quoted().rate, denominator: 0 } }, { rate: { ...quoted().rate, baseCurrency: 'USD' } },
      { request: { ...request('request.other'), profile: 'settlement-v1' } }, { endpoint: 'https://example.test' }]) {
      expect(() => createFixtureFxAdapter({ adapterId: ADAPTER, cases: [quoted(), { ...quoted('request.other'), ...patch }] }))
        .toThrow(CurrencyContractError);
    }
  });

  it('misma moneda pertenece a identity del preview, nunca al adaptador ni a sus casos', () => {
    const same = { ...request(), targetCurrency: 'EUR' };
    const adapter = createFixtureFxAdapter(configuration());
    expect(() => adapter.quote(same)).toThrow(CurrencyContractError);
    expect(() => createFixtureFxAdapter({ adapterId: ADAPTER, cases: [] }).quote(same)).toThrow(CurrencyContractError);
    for (const response of [
      { ...quoted(), request: same, rate: { ...quoted().rate, targetCurrency: 'EUR' } },
      { ...unavailable(), request: same },
    ]) expect(() => createFixtureFxAdapter({ adapterId: ADAPTER, cases: [response] })).toThrow(CurrencyContractError);
  });

  it('acepta hasta 100 casos y rechaza 101 sin descartar ninguno silenciosamente', () => {
    const cases = Array.from({ length: MAX_FIXTURE_FX_CASES }, (_, index) => quoted(`request.n${index}`));
    const adapter = createFixtureFxAdapter({ adapterId: ADAPTER, cases });
    expect(adapter.quote(request('request.n99'))).toEqual(quoted('request.n99'));
    expect(() => createFixtureFxAdapter({ adapterId: ADAPTER, cases: [...cases, quoted('request.n100')] }))
      .toThrow(CurrencyContractError);
  });

  it('rechaza configuración abierta, arrays dispersos y getters sin ejecutarlos', () => {
    const getter = vi.fn(() => { throw new Error('Unexpected getter'); });
    const badCases = [quoted()]; Object.defineProperty(badCases, '0', { get: getter });
    const badResponse = quoted(); Object.defineProperty(badResponse, 'request', { get: getter });
    const badRate = quoted(); Object.defineProperty(badRate.rate, 'numerator', { get: getter });
    const badCatalog = quoted(); Object.defineProperty(badCatalog.request.catalog.currencies[0]!, 'exponent', { get: getter });
    for (const input of [null, {}, { ...configuration(), endpoint: 'https://example.test' },
      { ...configuration(), cases: new Array(1) }, { ...configuration(), cases: badCases },
      { ...configuration(), get adapterId() { return getter(); } },
      ...[badResponse, badRate, badCatalog].map(response => ({ adapterId: ADAPTER, cases: [response] }))]) {
      expect(() => createFixtureFxAdapter(input)).toThrow(CurrencyContractError);
    }
    const badRequest = request(); Object.defineProperty(badRequest.original, 'amountMinor', { get: getter });
    expect(() => createFixtureFxAdapter(configuration()).quote(badRequest)).toThrow(CurrencyContractError);
    expect(getter).not.toHaveBeenCalled();
  });

  it('lookup valida consultas incluso sin caso configurado, sin normalizar datos operativos', () => {
    const adapter = createFixtureFxAdapter({ adapterId: ADAPTER, cases: [] });
    for (const input of [null, {}, { ...request(), profile: 'another-profile' },
      { ...request(), at: '2026-10-03T12:00:00Z' },
      { ...request(), original: { currency: 'eur', amountMinor: 1900 } },
      { ...request(), original: { currency: 'EUR', amountMinor: 19.5 } },
      { ...request(), original: { currency: 'EUR', amountMinor: -0 } },
      { ...request(), paymentIntent: 'not-allowed' }]) {
      expect(() => adapter.quote(input)).toThrow(CurrencyContractError);
    }
  });

  it('fábrica y consulta son deterministas sin IO, reloj, timers, almacenamiento ni logs', () => {
    const unexpected = () => { throw new Error('Unexpected effect'); };
    const log = vi.spyOn(console, 'log').mockImplementation(unexpected);
    const warn = vi.spyOn(console, 'warn').mockImplementation(unexpected);
    const error = vi.spyOn(console, 'error').mockImplementation(unexpected);
    vi.spyOn(Date, 'now').mockImplementation(unexpected);
    vi.stubGlobal('fetch', unexpected);
    vi.stubGlobal('setTimeout', unexpected);
    vi.stubGlobal('setInterval', unexpected);
    vi.stubGlobal('localStorage', { getItem: unexpected, setItem: unexpected });
    vi.stubGlobal('sessionStorage', { getItem: unexpected, setItem: unexpected });
    const adapter = createFixtureFxAdapter(configuration());
    expect(adapter.quote(request())).toEqual(quoted());
    expect(adapter.quote(request('request.absent'))).toEqual(unavailable('not_configured', 'request.absent'));
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
