import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CURRENCY_PRESENTMENT_PROFILE, MAX_CURRENCIES, CurrencyContractError,
  defineCurrencyCatalog, definePresentmentRequest, defineFxResponse, previewCurrencyPresentment,
  type CurrencyCatalog, type CurrencyUnit, type PresentmentRequest, type FxResponse, type FxRate,
} from '../src/modules/currencies';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const AT = '2026-10-04T12:00:00.000Z';
const catalog = (overrides: Partial<CurrencyCatalog> = {}): CurrencyCatalog => ({ schemaVersion: 1, id: 'fixture.units', version: 7,
  currencies: [{ code: 'AAA', exponent: 2 }, { code: 'BBB', exponent: 2 }, { code: 'CCC', exponent: 0 }], ...overrides });
const request = (overrides: Partial<PresentmentRequest> = {}): PresentmentRequest => ({ schemaVersion: 1, id: 'fixture.request',
  profile: CURRENCY_PRESENTMENT_PROFILE, at: AT, catalog: catalog(), original: { currency: 'AAA', amountMinor: 12345 },
  targetCurrency: 'BBB', ...overrides });
type Quoted = Extract<FxResponse, { outcome: 'quoted' }>;
const quote = (query = request(), overrides: Partial<Quoted> = {}): Quoted => ({ source: 'fixture', adapterId: 'fixture.fx',
  request: query, outcome: 'quoted', evidenceRef: 'fixture.evidence', quotedAt: '2026-10-04T11:00:00.000Z',
  expiresAt: '2026-10-04T13:00:00.000Z', rate: { baseCurrency: query.original.currency, targetCurrency: query.targetCurrency,
    numerator: 107, denominator: 100 }, ...overrides });
const preview = (query = request(), response: FxResponse = quote(query)) => previewCurrencyPresentment({
  mode: 'fx', request: query, expectedAdapterId: 'fixture.fx', response,
});
function convert(amountMinor: number, baseExponent: CurrencyUnit['exponent'], targetExponent: CurrencyUnit['exponent'], numerator = 1, denominator = 1) {
  const query = request({ original: { currency: 'AAA', amountMinor }, catalog: catalog({ currencies: [
    { code: 'AAA', exponent: baseExponent }, { code: 'BBB', exponent: targetExponent },
  ] }) });
  return preview(query, quote(query, { rate: { baseCurrency: 'AAA', targetCurrency: 'BBB', numerator, denominator } }));
}
function assertFrozen(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) assertFrozen(child);
}

describe('presentación con unidades menores explícitas', () => {
  it.each([
    [0, 0, 7, 7], [0, 2, 7, 700], [0, 3, 7, 7000],
    [2, 0, 750, 8], [2, 2, 750, 750], [2, 3, 750, 7500],
    [3, 0, 7550, 8], [3, 2, 7550, 755], [3, 3, 7550, 7550],
  ] as const)('escala exponente %i→%i antes de redondear %i a %i', (baseExponent, targetExponent, input, expected) => {
    const result = convert(input, baseExponent, targetExponent);
    expect(result.outcome).toBe('converted');
    expect(result.original).toEqual({ currency: 'AAA', amountMinor: input, exponent: baseExponent });
    expect(result.presented).toEqual({ currency: 'BBB', amountMinor: expected, exponent: targetExponent });
    expect(result.request.original).toEqual({ currency: 'AAA', amountMinor: input });
  });

  it.each([
    [499, 3, 0, 1, 1, 0], [500, 3, 0, 1, 1, 1], [501, 3, 0, 1, 1, 1],
    [1, 0, 0, 1, 2, 1], [1, 2, 2, 1, 2, 1], [1, 3, 3, 1, 2, 1],
    [5, 3, 2, 1, 1, 1], [1, 2, 0, 150, 1, 2], [1, 2, 3, 1, 3, 3],
  ] as const)('half-up único: %i, exponentes %i→%i, tasa %i/%i = %i', (amount, base, target, numerator, denominator, expected) => {
    expect(convert(amount, base, target, numerator, denominator).presented?.amountMinor).toBe(expected);
  });

  it('interpreta la tasa entre unidades principales, conserva evidencia y no redondea el original', () => {
    const query = request({ catalog: catalog({ currencies: [{ code: 'EUR', exponent: 2 }, { code: 'JPY', exponent: 0 }] }),
      original: { currency: 'EUR', amountMinor: 12345 }, targetCurrency: 'JPY' });
    const response = quote(query, { rate: { baseCurrency: 'EUR', targetCurrency: 'JPY', numerator: 160, denominator: 1 } });
    const result = preview(query, response);
    expect(result).toEqual({ outcome: 'converted', request: definePresentmentRequest(query),
      original: { currency: 'EUR', amountMinor: 12345, exponent: 2 }, presented: { currency: 'JPY', amountMinor: 19752, exponent: 0 },
      response: defineFxResponse(response) });
    expect(result).not.toHaveProperty('calculatedAt');
    expect(result).not.toHaveProperty('settlement');
  });

  it('preserva la razón recibida aunque otra fracción equivalente dé el mismo importe', () => {
    const first = convert(101, 2, 2, 1, 2);
    const second = convert(101, 2, 2, 2, 4);
    expect(first.presented).toEqual(second.presented);
    expect(second.response).toMatchObject({ rate: { numerator: 2, denominator: 4 } });
    expect(first.response).not.toEqual(second.response);
  });

  it('usa BigInt en los intermedios y conserva MAX_SAFE_INTEGER cuando la razón se cancela', () => {
    const result = convert(Number.MAX_SAFE_INTEGER, 2, 2, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
    expect(result.presented?.amountMinor).toBe(Number.MAX_SAFE_INTEGER);
    expect(convert(Number.MAX_SAFE_INTEGER, 3, 0).presented?.amountMinor).toBe(9007199254741);
    expect(convert(1, 3, 0, 1, Number.MAX_SAFE_INTEGER).presented?.amountMinor).toBe(0);
  });

  it('rechaza el resultado fuera del rango seguro sin truncarlo o saturarlo', () => {
    expect(() => convert(Number.MAX_SAFE_INTEGER, 0, 3)).toThrow(/rango seguro/);
    expect(() => convert(Number.MAX_SAFE_INTEGER, 2, 2, 2, 1)).toThrow(CurrencyContractError);
    expect(() => convert(1, 0, 3, Number.MAX_SAFE_INTEGER, 1)).toThrow(CurrencyContractError);
  });

  it('un cero conocido se convierte con evidencia vigente, pero no permite saltarse ausencia o vigencia', () => {
    const query = request({ original: { currency: 'AAA', amountMinor: 0 } });
    expect(preview(query).presented).toEqual({ currency: 'BBB', amountMinor: 0, exponent: 2 });
    expect(preview(query, quote(query, { expiresAt: AT }))).toMatchObject({ outcome: 'unresolved', reason: 'expired', presented: null });
    const unavailable: FxResponse = { source: 'fixture', adapterId: 'fixture.fx', request: query, outcome: 'unavailable', reason: 'not_configured' };
    expect(preview(query, unavailable)).toMatchObject({ outcome: 'unresolved', reason: 'not_configured', presented: null });
  });
});

describe('identidad explícita sin cotización ficticia', () => {
  it.each([0, 1, Number.MAX_SAFE_INTEGER])('misma moneda conserva %i exactamente y no fabrica evidencia', (amountMinor) => {
    const query = request({ original: { currency: 'AAA', amountMinor }, targetCurrency: 'AAA' });
    const result = previewCurrencyPresentment({ mode: 'identity', request: query });
    expect(result).toEqual({ outcome: 'identity', request: definePresentmentRequest(query),
      original: { currency: 'AAA', amountMinor, exponent: 2 }, presented: { currency: 'AAA', amountMinor, exponent: 2 }, response: null });
    expect(result).not.toHaveProperty('adapterId');
    expect(result).not.toHaveProperty('rate');
    assertFrozen(result);
  });

  it('no infiere modo ni acepta campos FX, incluso undefined, en identidad', () => {
    const query = request({ targetCurrency: 'AAA' });
    for (const input of [{ request: query }, { mode: 'identity', request: query, response: undefined },
      { mode: 'identity', request: query, response: null }, { mode: 'identity', request: query, expectedAdapterId: undefined },
      { mode: 'auto', request: query }]) expect(() => previewCurrencyPresentment(input)).toThrow(CurrencyContractError);
    expect(() => previewCurrencyPresentment({ mode: 'identity', request: request() })).toThrow(/misma moneda/);
  });

  it('rechaza FX para misma moneda tanto con razón 1/1 como con respuesta no disponible', () => {
    const query = request({ targetCurrency: 'AAA' });
    const response = quote(query, { rate: { baseCurrency: 'AAA', targetCurrency: 'AAA', numerator: 1, denominator: 1 } });
    const unavailable: FxResponse = { source: 'fixture', adapterId: 'fixture.fx', request: query, outcome: 'unavailable', reason: 'not_configured' };
    for (const candidate of [response, unavailable]) {
      expect(() => defineFxResponse(candidate)).toThrow(/identidad/);
      expect(() => preview(query, candidate)).toThrow(/identidad/);
    }
  });
});

describe('correlación íntegra y ventana temporal de FX', () => {
  it.each(['not_configured', 'unsupported', 'unavailable'] as const)('ausencia %s conserva original y respuesta sin inventar dinero ni metadatos', (reason) => {
    const response: FxResponse = { source: 'fixture', adapterId: 'fixture.fx', request: request(), outcome: 'unavailable', reason };
    const result = preview(request(), response);
    expect(result).toMatchObject({ outcome: 'unresolved', reason, presented: null, original: { amountMinor: 12345 } });
    expect(result.response).toEqual(defineFxResponse(response));
    expect(result.response).not.toHaveProperty('quotedAt');
    expect(result.response).not.toHaveProperty('evidenceRef');
    expect(result.response).not.toHaveProperty('rate');
  });

  it('admite quotedAt, excluye expiresAt y no consume evidencia futura', () => {
    expect(preview(request(), quote(request(), { quotedAt: AT })).outcome).toBe('converted');
    expect(preview(request(), quote(request(), { expiresAt: AT })))
      .toMatchObject({ outcome: 'unresolved', reason: 'expired', presented: null });
    expect(preview(request(), quote(request(), { quotedAt: '2026-10-04T12:00:00.001Z' })))
      .toMatchObject({ outcome: 'unresolved', reason: 'future', presented: null });
  });

  it.each([
    request({ id: 'other.request' }), request({ at: '2026-10-04T12:00:00.001Z' }),
    request({ original: { currency: 'AAA', amountMinor: 12346 } }), request({ original: { currency: 'CCC', amountMinor: 12345 } }),
    request({ targetCurrency: 'CCC' }), request({ catalog: catalog({ id: 'other.catalog' }) }),
    request({ catalog: catalog({ version: 8 }) }), request({ catalog: catalog({ currencies: [
      { code: 'AAA', exponent: 3 }, { code: 'BBB', exponent: 2 }, { code: 'CCC', exponent: 0 },
    ] }) }), request({ catalog: catalog({ currencies: [
      { code: 'AAA', exponent: 2 }, { code: 'BBB', exponent: 2 }, { code: 'CCC', exponent: 3 },
    ] }) }),
    request({ catalog: catalog({ currencies: [...catalog().currencies, { code: 'DDD', exponent: 2 }] }) }),
  ])('rechaza evidencia de otra petición o catálogo aunque comparta request.id: %j', (query) => {
    expect(() => preview(query, quote())).toThrow(/petición completa/);
  });

  it('correlaciona el adaptador y catálogo incluso cuando la respuesta no está disponible', () => {
    expect(() => previewCurrencyPresentment({ mode: 'fx', request: request(), expectedAdapterId: 'other.adapter', response: quote() }))
      .toThrow(/adaptador/);
    const response: FxResponse = { source: 'fixture', adapterId: 'fixture.fx', request: request(), outcome: 'unavailable', reason: 'not_configured' };
    expect(() => preview(request({ catalog: catalog({ version: 8 }) }), response)).toThrow(/petición completa/);
    expect(() => previewCurrencyPresentment({ mode: 'fx', request: request(), response: quote() })).toThrow(CurrencyContractError);
  });

  it('acepta orden diferente del mismo catálogo, sin confundirlo con un cambio de sus datos', () => {
    const query = request({ catalog: catalog({ currencies: [...catalog().currencies].reverse() }) });
    expect(preview(query, quote())).toEqual(preview());
    expect(defineCurrencyCatalog(query.catalog).currencies.map(({ code }) => code)).toEqual(['AAA', 'BBB', 'CCC']);
  });

  it('no invierte ni triangula una tasa de otra dirección', () => {
    const inverse: FxRate = { baseCurrency: 'BBB', targetCurrency: 'AAA', numerator: 100, denominator: 107 };
    const leg: FxRate = { baseCurrency: 'AAA', targetCurrency: 'CCC', numerator: 107, denominator: 100 };
    for (const rate of [inverse, leg]) expect(() => preview(request(), quote(request(), { rate }))).toThrow(/dirección/);
    expect(() => defineFxResponse({ ...quote(), rates: [inverse, leg] })).toThrow(CurrencyContractError);
  });

  it('una respuesta caducada corrupta sigue siendo error, nunca un resultado parcialmente validado', () => {
    expect(() => preview(request(), quote(request(), { expiresAt: AT, rate: { ...quote().rate, denominator: 0 } }))).toThrow(CurrencyContractError);
  });
});

describe('catálogo estructural de fixtures y validación estricta', () => {
  it('acepta códigos estructurales declarados sin inferir datos ISO, símbolos o capacidad de cobro', () => {
    const units = defineCurrencyCatalog(catalog({ currencies: [{ code: 'ZZZ', exponent: 3 }] }));
    expect(units.currencies).toEqual([{ code: 'ZZZ', exponent: 3 }]);
    const query = request({ catalog: units, original: { currency: 'ZZZ', amountMinor: 7 }, targetCurrency: 'ZZZ' });
    expect(previewCurrencyPresentment({ mode: 'identity', request: query }).presented).toEqual({ currency: 'ZZZ', amountMinor: 7, exponent: 3 });
    expect(units.currencies[0]).not.toHaveProperty('enabled');
    expect(units.currencies[0]).not.toHaveProperty('symbol');
  });

  it.each([
    ['schemaVersion', 2], ['id', ''], ['id', 'Catalog'], ['id', 'a'.repeat(101)],
    ['version', 0], ['version', 1.5], ['version', Number.MAX_SAFE_INTEGER + 1], ['currencies', []], ['fallback', 'EUR'],
  ])('rechaza catalog.%s=%s', (key, value) => {
    expect(() => defineCurrencyCatalog({ ...catalog(), [key]: value })).toThrow(CurrencyContractError);
  });

  it.each([
    ['code', 'eur'], ['code', 'EU'], ['code', 'EURO'], ['code', ' EUR'], ['code', 'EU1'],
    ['exponent', -0], ['exponent', -1], ['exponent', 1], ['exponent', 4], ['exponent', 2.5], ['exponent', '2'], ['enabled', true],
  ])('rechaza currency.%s=%s', (key, value) => {
    expect(() => defineCurrencyCatalog({ ...catalog(), currencies: [{ code: 'AAA', exponent: 2, [key]: value }] })).toThrow(CurrencyContractError);
  });

  it('rechaza monedas duplicadas o ausentes y aplica el límite exacto de cien entradas', () => {
    expect(() => defineCurrencyCatalog(catalog({ currencies: [{ code: 'AAA', exponent: 2 }, { code: 'AAA', exponent: 3 }] })))
      .toThrow(/duplicada/);
    expect(() => definePresentmentRequest(request({ original: { currency: 'DDD', amountMinor: 1 } }))).toThrow(/ausente/);
    expect(() => definePresentmentRequest(request({ targetCurrency: 'DDD' }))).toThrow(/ausente/);
    const currencies: CurrencyUnit[] = Array.from({ length: MAX_CURRENCIES }, (_, index) => ({
      code: `Z${String.fromCharCode(65 + Math.floor(index / 26))}${String.fromCharCode(65 + index % 26)}`, exponent: 2,
    }));
    expect(defineCurrencyCatalog(catalog({ currencies })).currencies).toHaveLength(100);
    expect(() => defineCurrencyCatalog(catalog({ currencies: [...currencies, { code: 'YYY', exponent: 2 }] }))).toThrow(CurrencyContractError);
  });

  it.each([
    ['schemaVersion', 2], ['profile', 'auto'], ['id', ''], ['at', '2026-02-29T00:00:00.000Z'],
    ['at', '2026-10-04T12:00:00Z'], ['at', '2026-10-04T12:00:00.000+00:00'], ['at', '2026-10-04T24:00:00.000Z'],
    ['at', '+002026-10-04T12:00:00.000Z'], ['targetCurrency', 'bbb'], ['locale', 'es-ES'],
  ])('rechaza request.%s=%s', (key, value) => {
    expect(() => definePresentmentRequest({ ...request(), [key]: value })).toThrow(CurrencyContractError);
  });

  it.each([-0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1', null])('rechaza amountMinor=%s no canónico', (amountMinor) => {
    expect(() => definePresentmentRequest({ ...request(), original: { currency: 'AAA', amountMinor } })).toThrow(CurrencyContractError);
  });

  it.each([
    ['source', 'provider'], ['adapterId', ''], ['outcome', 'success'], ['evidenceRef', ''],
    ['quotedAt', 'invalid'], ['expiresAt', '2026-10-04T11:00:00.000Z'], ['expiresAt', '2026-10-04T10:59:59.999Z'], ['feeMinor', 1],
  ])('rechaza response.%s=%s', (key, value) => {
    expect(() => defineFxResponse({ ...quote(), [key]: value })).toThrow(CurrencyContractError);
  });

  it.each([0, -0, -1, 1.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '107'])('rechaza razón no positiva/segura %s en ambos términos', (value) => {
    for (const key of ['numerator', 'denominator']) {
      expect(() => defineFxResponse({ ...quote(), rate: { ...quote().rate, [key]: value } })).toThrow(CurrencyContractError);
    }
  });

  it('cada forma exige todos sus campos y rechaza extras', () => {
    const cases: Array<[Record<string, unknown>, (input: unknown) => unknown]> = [
      [catalog(), defineCurrencyCatalog], [catalog().currencies[0]!, (item) => defineCurrencyCatalog({ ...catalog(), currencies: [item] })],
      [request(), definePresentmentRequest], [request().original, (original) => definePresentmentRequest({ ...request(), original })],
      [quote(), defineFxResponse], [quote().rate, (rate) => defineFxResponse({ ...quote(), rate })],
      [{ mode: 'fx', request: request(), expectedAdapterId: 'fixture.fx', response: quote() }, previewCurrencyPresentment],
      [{ source: 'fixture', adapterId: 'fixture.fx', request: request(), outcome: 'unavailable', reason: 'not_configured' }, defineFxResponse],
    ];
    for (const [record, run] of cases) {
      for (const key of Object.keys(record)) {
        const missing = { ...record }; delete missing[key];
        expect(() => run(missing)).toThrow(CurrencyContractError);
      }
      expect(() => run({ ...record, unexpected: true })).toThrow(CurrencyContractError);
    }
  });

  it('rechaza getters, prototipos, símbolos, campos ocultos y arrays dispersos sin ejecutarlos', () => {
    const getter = vi.fn(() => 2);
    const unit = Object.defineProperty({ code: 'AAA' }, 'exponent', { enumerable: true, get: getter });
    const currencies = [catalog().currencies[0]!];
    Object.defineProperty(currencies, '0', { enumerable: true, get: getter });
    for (const values of [[unit], currencies, new Array(1), Object.assign([{ code: 'AAA', exponent: 2 }], { extra: 1 })]) {
      expect(() => defineCurrencyCatalog({ ...catalog(), currencies: values })).toThrow(CurrencyContractError);
    }
    for (const input of [Object.assign(Object.create({ inherited: true }), request()), { ...request(), [Symbol('hidden')]: true },
      Object.defineProperty({ ...request() }, 'id', { value: 'fixture.request', enumerable: false }),
      Object.defineProperty({ ...request() }, 'catalog', { enumerable: true, get: getter })]) {
      expect(() => definePresentmentRequest(input)).toThrow(CurrencyContractError);
    }
    expect(() => defineFxResponse(Object.defineProperty({ ...quote() }, 'outcome', { enumerable: true, get: getter }))).toThrow(CurrencyContractError);
    expect(() => previewCurrencyPresentment(Object.defineProperty({ request: request() }, 'mode', { enumerable: true, get: getter })))
      .toThrow(CurrencyContractError);
    expect(getter).not.toHaveBeenCalled();
  });

  it('copia y congela profundamente; revalidar o permutar datos conserva el contrato', () => {
    const query = structuredClone(request());
    const response = structuredClone(quote(query));
    const result = preview(query, response);
    Object.assign(query.original, { amountMinor: 1 });
    Object.assign(query.catalog.currencies[0]!, { exponent: 3 });
    Object.assign(response.rate, { numerator: 1 });
    Object.assign(response, { evidenceRef: 'other.evidence' });
    expect(result.original).toEqual({ currency: 'AAA', amountMinor: 12345, exponent: 2 });
    expect(result.presented?.amountMinor).toBe(13209);
    expect(result.response).toMatchObject({ evidenceRef: 'fixture.evidence', rate: { numerator: 107, denominator: 100 } });
    expect(defineCurrencyCatalog(result.request.catalog)).toEqual(result.request.catalog);
    expect(definePresentmentRequest(result.request)).toEqual(result.request);
    expect(defineFxResponse(result.response)).toEqual(result.response);
    expect(definePresentmentRequest(Object.assign(Object.create(null), request()))).toEqual(definePresentmentRequest(request()));
    assertFrozen(result);
  });

  it('no consulta reloj implícito, red, storage ni temporizadores', () => {
    const unexpected = () => { throw new Error('Unexpected external effect'); };
    class ExplicitDate extends Date {
      constructor(value?: string | number) {
        if (value === undefined) throw new Error('Unexpected implicit clock');
        super(value);
      }
      static override now(): number { return unexpected(); }
    }
    vi.stubGlobal('Date', ExplicitDate);
    vi.stubGlobal('fetch', unexpected);
    vi.stubGlobal('localStorage', { getItem: unexpected, setItem: unexpected });
    vi.stubGlobal('sessionStorage', { getItem: unexpected, setItem: unexpected });
    vi.stubGlobal('setTimeout', unexpected);
    vi.stubGlobal('setInterval', unexpected);
    expect(preview().outcome).toBe('converted');
    expect(preview(request(), quote(request(), { expiresAt: AT })).outcome).toBe('unresolved');
    expect(previewCurrencyPresentment({ mode: 'identity', request: request({ targetCurrency: 'AAA' }) }).outcome).toBe('identity');
  });
});
