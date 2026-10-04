import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canShowCurrencyMethodsDemo, configureCurrencyMethodsDemo, createCurrencyMethodsDemo,
  formatDemoMinorAmount, getCurrencyMethodsDemoView,
  type CurrencyMethodsDemoSelection, type CurrencyMethodsDemoState,
} from '../src/composition/currency-methods-demo';
import { createPlatform } from '../src/composition/create-platform';
import { createPresetManifest, createPublicDemoManifest } from '../src/platform/configuration';
import { previewCurrencyPresentment } from '../src/modules/currencies';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const configure = configureCurrencyMethodsDemo;
const view = getCurrencyMethodsDemoView;
const TARGETS = ['EUR', 'JPY', 'KWD'] as const;
const SCENARIOS = ['current', 'expired', 'unavailable'] as const;
const ORIGINALS = [
  { amountId: 'eur-2975', currency: 'EUR', exponent: 2, amountMinor: 2975, EUR: 2975, JPY: 4760, KWD: 9818 },
  { amountId: 'eur-0', currency: 'EUR', exponent: 2, amountMinor: 0, EUR: 0, JPY: 0, KWD: 0 },
  { amountId: 'eur-499', currency: 'EUR', exponent: 2, amountMinor: 499, EUR: 499, JPY: 798, KWD: 1647 },
  { amountId: 'eur-500', currency: 'EUR', exponent: 2, amountMinor: 500, EUR: 500, JPY: 800, KWD: 1650 },
  { amountId: 'eur-5000', currency: 'EUR', exponent: 2, amountMinor: 5000, EUR: 5000, JPY: 8000, KWD: 16500 },
  { amountId: 'eur-5001', currency: 'EUR', exponent: 2, amountMinor: 5001, EUR: 5001, JPY: 8002, KWD: 16503 },
  { amountId: 'jpy-3000', currency: 'JPY', exponent: 0, amountMinor: 3000, EUR: 1875, JPY: 3000, KWD: 6000 },
  { amountId: 'kwd-9875', currency: 'KWD', exponent: 3, amountMinor: 9875, EUR: 2963, JPY: 4938, KWD: 9875 },
] as const;
const MARKET_CURRENCY = { ES: 'EUR', FR: 'EUR', JP: 'JPY', KW: 'KWD' } as const;
const EXPS = { EUR: 2, JPY: 0, KWD: 3 } as const;
const CASES = (Object.keys(MARKET_CURRENCY) as CurrencyMethodsDemoSelection['marketId'][]).flatMap(marketId =>
  ORIGINALS.filter(original => original.currency === MARKET_CURRENCY[marketId]).flatMap(original =>
    TARGETS.flatMap(targetCurrency => SCENARIOS.map(fxScenario => ({ marketId, original, targetCurrency, fxScenario })))));
function stateFor(input: Partial<CurrencyMethodsDemoSelection>) { return configure(createCurrencyMethodsDemo(), input); }
function assertFrozen(input: unknown): void {
  if (input === null || typeof input !== 'object') return;
  expect(Object.isFrozen(input)).toBe(true);
  for (const value of Object.values(input)) assertFrozen(value);
}

describe('aislamiento y contexto de la demo de divisas', () => {
  it.each(['demo', 'client'] as const)('gate AND para manifest %s y DEMO_MODE literal true', mode => {
    const deployment = { id: 'currency-demo-isolation', environment: 'development' as const };
    const platform = createPlatform(mode === 'demo' ? createPublicDemoManifest(deployment)
      : createPresetManifest('standard', { ...deployment, mode }));
    for (const DEMO_MODE of ['true', 'TRUE', 'false', '', undefined]) {
      const env = { DEMO_MODE, get DB(): never { throw new Error('No database'); } };
      expect(canShowCurrencyMethodsDemo(env, platform)).toBe(mode === 'demo' && DEMO_MODE === 'true');
    }
    expect(canShowCurrencyMethodsDemo(undefined, platform)).toBe(false);
  });

  it('mostrar el ejemplo conserva las capacidades instaladas e inactivas', () => {
    const platform = createPlatform(createPublicDemoManifest({ id: 'currency-demo-isolation', environment: 'development' }));
    expect(canShowCurrencyMethodsDemo({ DEMO_MODE: 'true' }, platform)).toBe(true);
    for (const id of ['MKT-008', 'CHK-010'] as const) {
      expect(platform.capabilityState(id)).toBe('installed');
      expect(platform.isCapabilityActive(id)).toBe(false);
      expect(platform.hasCapabilityFlag(id, 'routes')).toBe(false);
    }
    expect(platform.scheduledJobs('*/1 * * * *')).toEqual([]);
  });

  it('inicia ES EUR2975 → JPY4760 con dos métodos disponibles y una ausencia explícita', () => {
    const state = createCurrencyMethodsDemo();
    const current = view(state);
    expect(state.selection).toEqual({ marketId: 'ES', amountId: 'eur-2975', targetCurrency: 'JPY', fxScenario: 'current' });
    expect(current.context.original).toEqual({ currency: 'EUR', amountMinor: 2975, exponent: 2, formatted: '29,75 EUR' });
    expect(current.presentment).toMatchObject({ outcome: 'converted', reason: null,
      presented: { currency: 'JPY', amountMinor: 4760, exponent: 0, formatted: '4.760 JPY' },
      at: '2026-10-03T12:00:00.000Z', evidence: { quotedAt: '2026-10-03T11:00:00.000Z',
        expiresAt: '2026-10-03T13:00:00.000Z', rateLabel: '1 EUR = 160 JPY' } });
    expect(current.methods.map(({ id, available, reason }) => ({ id, available, reason }))).toEqual([
      { id: 'method.alternative', available: false, reason: 'not_configured' },
      { id: 'method.local', available: true, reason: null },
      { id: 'method.transfer', available: true, reason: null },
    ]);
    expect(current.marketOptions.map(({ id }) => id)).toEqual(['ES', 'FR', 'JP', 'KW']);
    expect(current.amountOptions.map(({ id }) => id)).toEqual(['eur-2975', 'eur-0', 'eur-499', 'eur-500', 'eur-5000', 'eur-5001']);
    expect(current.targetCurrencyOptions.map(({ id }) => id)).toEqual(TARGETS);
    expect(current.fxScenarioOptions.map(({ id }) => id)).toEqual(SCENARIOS);
    expect(current.feedback.code).toBe('initial');
  });
});

describe('126 combinaciones de mercado, importe, destino y evidencia', () => {
  it('la matriz tiene exactamente 126 estados compatibles', () => expect(CASES).toHaveLength(126));

  it.each(CASES)('$marketId / $original.amountId / $targetCurrency / $fxScenario', ({ marketId, original, targetCurrency, fxScenario }) => {
    const current = view(stateFor({ marketId, amountId: original.amountId, targetCurrency, fxScenario }));
    const nominal = { currency: original.currency, amountMinor: original.amountMinor, exponent: original.exponent };
    expect(current.methodsResult.request.original).toEqual(nominal);
    expect(current.context.original).toMatchObject(nominal);
    expect(current.presentment.original).toEqual(current.context.original);
    expect(current.methodsResult.request.marketId).toBe(marketId);
    const identity = original.currency === targetCurrency;
    const outcome = identity ? 'identity' : fxScenario === 'current' ? 'converted' : 'unresolved';
    expect(current.presentment.outcome).toBe(outcome);
    expect(current.presentmentResult.outcome).toBe(outcome);
    if (identity || fxScenario === 'current') {
      expect(current.presentment.presented).toEqual({ currency: targetCurrency, amountMinor: original[targetCurrency], exponent: EXPS[targetCurrency],
        formatted: formatDemoMinorAmount({ currency: targetCurrency, amountMinor: original[targetCurrency], exponent: EXPS[targetCurrency] }) });
      expect(current.presentment.reason).toBeNull();
    } else {
      expect(current.presentment.presented).toBeNull();
      expect(current.presentmentResult.presented).toBeNull();
      expect(current.presentment.reason).toBe(fxScenario === 'expired' ? 'expired' : 'not_configured');
    }
    if (identity) {
      expect(current.presentment.evidence).toBeNull();
      expect(current.presentmentResult.response).toBeNull();
      expect(current.presentmentResult.request.id).toContain('.identity');
    } else if (fxScenario === 'unavailable') {
      expect(current.presentment.evidence).toBeNull();
      expect(current.presentmentResult.response).toMatchObject({ outcome: 'unavailable', reason: 'not_configured' });
      expect(current.presentmentResult.response).not.toHaveProperty('quotedAt');
    } else {
      expect(current.presentment.evidence?.expiresAt).toBe(fxScenario === 'expired' ? current.presentment.at : '2026-10-03T13:00:00.000Z');
      expect(current.presentment.evidence?.quotedAt).toBe('2026-10-03T11:00:00.000Z');
    }
    // Tanto el DTO visible como la petición completa de métodos permanecen invariantes al variar FX.
    const baseline = view(stateFor({ marketId, amountId: original.amountId, targetCurrency: original.currency, fxScenario: 'current' }));
    expect(current.methodsResult).toEqual(baseline.methodsResult);
    expect(current.methods).toEqual(baseline.methods);
    const result = current.presentmentResult;
    expect(result).toEqual(previewCurrencyPresentment(result.outcome === 'identity' ? { mode: 'identity', request: result.request }
      : { mode: 'fx', request: result.request, expectedAdapterId: result.response.adapterId, response: result.response }));
  });

  it('expone exactamente 32 evidencias únicas, sin duplicarlas por ES/FR ni fabricar evidencia para identidad', () => {
    const quotes = new Map<string, string>();
    for (const { marketId, original, targetCurrency, fxScenario } of CASES) {
      const response = view(stateFor({ marketId, amountId: original.amountId, targetCurrency, fxScenario })).presentmentResult.response;
      if (response?.outcome !== 'quoted') continue;
      const serialized = JSON.stringify(response);
      if (quotes.has(response.request.id)) expect(serialized).toBe(quotes.get(response.request.id));
      quotes.set(response.request.id, serialized);
    }
    expect(quotes.size).toBe(32);
  });

  it.each([
    ['ES', 'JPY', '1 EUR = 160 JPY'], ['ES', 'KWD', '100 EUR = 33 KWD'],
    ['JP', 'EUR', '160 JPY = 1 EUR'], ['JP', 'KWD', '500 JPY = 1 KWD'],
    ['KW', 'EUR', '1 KWD = 3 EUR'], ['KW', 'JPY', '1 KWD = 500 JPY'],
  ] as const)('tasa dirigida explícita %s → %s: %s', (marketId, targetCurrency, rateLabel) => {
    expect(view(stateFor({ marketId, targetCurrency })).presentment.evidence?.rateLabel).toBe(rateLabel);
  });

  it('identidad completa independiente del escenario, sin aparentar cotización 1/1', () => {
    const results = SCENARIOS.map(fxScenario => view(stateFor({ targetCurrency: 'EUR', fxScenario })).presentmentResult);
    expect(results[1]).toEqual(results[0]); expect(results[2]).toEqual(results[0]);
    expect(results[0]).not.toHaveProperty('rate');
  });

  it('importe cero exige evidencia vigente para convertir a otra moneda', () => {
    expect(view(stateFor({ amountId: 'eur-0', fxScenario: 'current' })).presentment.presented?.amountMinor).toBe(0);
    for (const fxScenario of ['expired', 'unavailable'] as const) {
      const current = view(stateFor({ amountId: 'eur-0', fxScenario }));
      expect(current.presentment.presented).toBeNull();
      expect(current.methods.filter(method => method.reason === 'below_minimum')).toHaveLength(2);
    }
  });
});

describe('reglas nominales y rangos inclusivos de los métodos', () => {
  it.each([
    ['ES', 'eur-0', 'below_minimum', 'below_minimum'], ['ES', 'eur-499', 'below_minimum', null],
    ['ES', 'eur-500', null, null], ['ES', 'eur-5000', null, null], ['ES', 'eur-5001', null, 'above_maximum'],
    ['FR', 'eur-0', 'disabled', 'below_minimum'], ['FR', 'eur-500', 'disabled', null], ['FR', 'eur-5001', 'disabled', 'above_maximum'],
  ] as const)('%s %s distingue transferencia %s y local %s', (marketId, amountId, transferReason, localReason) => {
    const current = view(stateFor({ marketId, amountId }));
    for (const [id, reason] of [['method.transfer', transferReason], ['method.local', localReason]] as const) {
      const row = current.methods.find(method => method.id === id)!;
      expect(row.reason).toBe(reason);
      expect(row.available).toBe(reason === null);
      expect(row.outcome).toBe(reason === null ? 'available_in_fixture' : 'unavailable_in_fixture');
      expect(row.range).toEqual({ currency: 'EUR', exponent: 2, minMinor: id === 'method.transfer' ? 500 : 100,
        maxMinor: id === 'method.transfer' ? 100000 : 5000 });
      expect(row.reasonLabels).toHaveLength(reason === null ? 0 : 1);
    }
  });

  it.each([
    ['JP', 'method.local', 'JPY', 0, 1000, 20000, 'De 1.000 JPY a 20.000 JPY, ambos incluidos.'],
    ['KW', 'method.alternative', 'KWD', 3, 1000, 50000, 'De 1,000 KWD a 50,000 KWD, ambos incluidos.'],
  ] as const)('%s usa su moneda original y exponente declarado', (marketId, id, currency, exponent, minMinor, maxMinor, rangeLabel) => {
    const current = view(stateFor({ marketId }));
    const selected = current.methods.find(method => method.id === id)!;
    expect(selected).toMatchObject({ available: true, reason: null, range: { currency, exponent, minMinor, maxMinor }, rangeLabel });
    for (const other of current.methods.filter(method => method.id !== id)) {
      expect(other).toMatchObject({ available: false, reason: 'not_configured', range: null, rangeLabel: null });
    }
  });

  it('la vista conserva exactamente las decisiones del dominio, incluidas reglas desactivadas', () => {
    const current = view(stateFor({ marketId: 'FR', amountId: 'eur-0' }));
    expect(Object.keys(current.methodsResult).sort()).toEqual(['methods', 'policyRef', 'request', 'source']);
    expect(current.methodsResult.source).toBe('fixture');
    for (const method of current.methodsResult.methods) {
      const row = current.methods.find(({ id }) => id === method.methodId)!;
      expect(row.outcome).toBe(method.outcome); expect(row.reason).toBe(method.reason);
      if (method.matchedRule) {
        const { currency, exponent, minMinor, maxMinor } = method.matchedRule;
        expect(row.range).toEqual({ currency, exponent, minMinor, maxMinor });
      } else expect(row.range).toBeNull();
    }
    expect(current.methodsResult.methods.find(({ methodId }) => methodId === 'method.transfer')!.matchedRule?.enabled).toBe(false);
  });
});

describe('selección explícita sin buffers ni conversión del importe original', () => {
  it('ES↔FR conserva EUR5001 y cambia solo la regla del mercado', () => {
    const initial = stateFor({ amountId: 'eur-5001', targetCurrency: 'KWD', fxScenario: 'expired' });
    const next = configure(initial, { marketId: 'FR' });
    expect(next.selection).toEqual({ ...initial.selection, marketId: 'FR' });
    expect(next.feedback.code).toBe('selection_changed');
    expect(view(next).presentmentResult).toEqual(view(initial).presentmentResult);
    expect(view(next).methods.find(({ id }) => id === 'method.transfer')!.reason).toBe('disabled');
    expect(configure(next, { marketId: 'ES' }).selection).toEqual(initial.selection);
  });

  it('cambio de moneda nominal usa su fixture, conserva destino/FX y volver no recupera buffers', () => {
    const initial = stateFor({ amountId: 'eur-5001', targetCurrency: 'KWD', fxScenario: 'unavailable' });
    const japan = configure(initial, { marketId: 'JP' });
    expect(japan.selection).toEqual({ marketId: 'JP', amountId: 'jpy-3000', targetCurrency: 'KWD', fxScenario: 'unavailable' });
    expect(japan.feedback.code).toBe('nominal_amount_reset');
    expect(japan.feedback.message).toContain('No se ha convertido');
    expect(view(japan).amountOptions).toEqual([{ id: 'jpy-3000', label: '3.000 JPY' }]);
    const kuwait = configure(japan, { marketId: 'KW' });
    expect(kuwait.selection.amountId).toBe('kwd-9875');
    expect(view(kuwait).presentment.outcome).toBe('identity');
    const back = configure(kuwait, { marketId: 'FR' });
    expect(back.selection.amountId).toBe('eur-2975');
    expect(back.selection.targetCurrency).toBe('KWD');
  });

  it('un patch explícito compatible se respeta y uno incompatible no se sustituye', () => {
    expect(configure(stateFor({ marketId: 'JP' }), { marketId: 'ES', amountId: 'eur-499' }).selection.amountId).toBe('eur-499');
    expect(() => configure(createCurrencyMethodsDemo(), { marketId: 'JP', amountId: 'eur-2975' })).toThrow(RangeError);
    expect(() => configure(createCurrencyMethodsDemo(), { amountId: 'jpy-3000' })).toThrow(RangeError);
  });

  it('reset crea un estado inicial independiente y reproducible sin contaminar estados anteriores', () => {
    const initial = createCurrencyMethodsDemo();
    const changed = configure(initial, { marketId: 'KW', targetCurrency: 'EUR', fxScenario: 'expired' });
    const reset = createCurrencyMethodsDemo();
    expect(reset).toEqual(initial); expect(reset).not.toBe(initial);
    expect(view(reset)).toEqual(view(initial));
    expect(changed.selection.marketId).toBe('KW');
    expect(initial.selection.marketId).toBe('ES');
  });
});

describe('formato exacto de unidades menores, sin flotantes ni defaults ISO', () => {
  it.each([
    ['EUR', 2, 0, '0,00 EUR'], ['EUR', 2, 1, '0,01 EUR'], ['EUR', 2, 2975, '29,75 EUR'],
    ['JPY', 0, 0, '0 JPY'], ['JPY', 0, 1, '1 JPY'], ['JPY', 0, 4760, '4.760 JPY'],
    ['KWD', 3, 0, '0,000 KWD'], ['KWD', 3, 1, '0,001 KWD'], ['KWD', 3, 9875, '9,875 KWD'],
    ['JPY', 0, Number.MAX_SAFE_INTEGER, '9.007.199.254.740.991 JPY'],
    ['EUR', 2, Number.MAX_SAFE_INTEGER, '90.071.992.547.409,91 EUR'],
    ['KWD', 3, Number.MAX_SAFE_INTEGER, '9.007.199.254.740,991 KWD'],
    ['ZZZ', 3, 1234, '1,234 ZZZ'], ['EUR', 0, 1234, '1.234 EUR'],
  ] as const)('%s exp%i importe%i produce %s', (currency, exponent, amountMinor, expected) => {
    expect(formatDemoMinorAmount({ currency, exponent, amountMinor })).toBe(expected);
  });

  it.each([-1, -0, 0.1, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, '100', 1n])('rechaza importe no representable %s', amountMinor => {
    expect(() => formatDemoMinorAmount({ currency: 'EUR', exponent: 2, amountMinor } as never)).toThrow(RangeError);
  });
  it.each([-0, 1, 4, '2', null, undefined])('exponente explícito inválido %s no usa defaults de moneda', exponent => {
    expect(() => formatDemoMinorAmount({ currency: 'EUR', exponent, amountMinor: 1 } as never)).toThrow(RangeError);
  });
  it.each(['eur', '', '€', ' EUR', 'EURO'])('código inválido %s no se normaliza', currency => {
    expect(() => formatDemoMinorAmount({ currency, exponent: 2, amountMinor: 1 })).toThrow(RangeError);
  });
});

describe('estado y entradas hostiles sin efectos', () => {
  it.each([
    {}, { marketId: 'XX' }, { marketId: undefined }, { marketId: 'es' }, { amountId: 'eur-1' }, { amountId: undefined },
    { targetCurrency: 'USD' }, { targetCurrency: undefined }, { fxScenario: 'future' }, { fxScenario: undefined },
    { fxScenario: 'current', extra: true }, null, [], new Date('2026-10-03T12:00:00.000Z'),
  ])('rechaza patch hostil %j sin alterar el estado válido', patch => {
    const state = createCurrencyMethodsDemo();
    expect(() => configure(state, patch as never)).toThrow(RangeError);
    expect(state).toEqual(createCurrencyMethodsDemo());
  });

  it('valida estado completo también al leerlo: no acepta datos ajenos por fallback', () => {
    const initial = createCurrencyMethodsDemo();
    const invalidStates: unknown[] = [null, [], {}, { ...initial, extra: true },
      { ...initial, selection: { ...initial.selection, amountId: 'eur-1' } },
      { ...initial, selection: { ...initial.selection, marketId: 'JP' } },
      { ...initial, selection: { ...initial.selection, fxScenario: 'future' } },
      { ...initial, selection: { ...initial.selection, extra: true } },
      { ...initial, feedback: { ...initial.feedback, code: 'fake' } },
      { ...initial, feedback: { ...initial.feedback, message: 'fake' } },
      { ...initial, feedback: { ...initial.feedback, tone: 'error' } },
    ];
    for (const state of invalidStates) {
      expect(() => view(state as CurrencyMethodsDemoState)).toThrow(RangeError);
      expect(() => configure(state as CurrencyMethodsDemoState, { marketId: 'FR' })).toThrow(RangeError);
    }
  });

  it('rechaza getters, símbolos, campos ocultos y prototipos sin ejecutar accesores', () => {
    let accessed = 0;
    const getter = () => { accessed++; return 'FR'; };
    for (const patch of [Object.defineProperty({}, 'marketId', { enumerable: true, get: getter }),
      { marketId: 'FR', [Symbol('extra')]: true }, Object.defineProperty({ marketId: 'FR' }, 'hidden', { value: 1 }),
      Object.create({ marketId: 'FR' })]) expect(() => configure(createCurrencyMethodsDemo(), patch)).toThrow(RangeError);
    const state = createCurrencyMethodsDemo();
    for (const input of [Object.defineProperty({ feedback: state.feedback }, 'selection', { enumerable: true, get: getter }),
      { ...state, selection: Object.defineProperty({ ...state.selection }, 'marketId', { enumerable: true, get: getter }) },
      { ...state, feedback: Object.defineProperty({ ...state.feedback }, 'message', { enumerable: true, get: getter }) }]) {
      expect(() => view(input as CurrencyMethodsDemoState)).toThrow(RangeError);
    }
    const money = Object.defineProperty({ currency: 'EUR', exponent: 2 }, 'amountMinor', { enumerable: true, get: getter });
    expect(() => formatDemoMinorAmount(money as never)).toThrow(RangeError);
    expect(() => formatDemoMinorAmount({ currency: 'EUR', exponent: 2, amountMinor: 1, extra: true } as never)).toThrow(RangeError);
    expect(accessed).toBe(0);
  });

  it('copia datos propios y congela todos los resultados, sin compartir entradas mutables', () => {
    const initial = createCurrencyMethodsDemo();
    const input = JSON.parse(JSON.stringify(initial)) as { selection: { marketId: string }; feedback: { message: string } };
    const current = view(input as CurrencyMethodsDemoState);
    input.selection.marketId = 'XX'; input.feedback.message = 'changed';
    expect(current.selection.marketId).toBe('ES');
    expect(current.feedback.message).toBe(initial.feedback.message);
    assertFrozen(initial); assertFrozen(current);
    const nullPrototype = Object.assign(Object.create(null) as Record<string, unknown>, { marketId: 'FR' as const });
    expect(configure(initial, nullPrototype).selection.marketId).toBe('FR');
  });

  it('no consulta reloj, red, storage ni temporizadores al crear, seleccionar, leer o resetear', async () => {
    const NativeDate = Date;
    const forbidden = vi.fn(() => { throw new Error('Unexpected effect'); });
    class GuardedDate extends NativeDate {
      constructor(value?: string | number) { if (value === undefined) forbidden(); super(value!); }
      static override now(): number { return forbidden() as never; }
    }
    vi.stubGlobal('Date', GuardedDate);
    for (const name of ['fetch', 'setTimeout', 'setInterval', 'requestAnimationFrame']) vi.stubGlobal(name, forbidden);
    for (const name of ['localStorage', 'sessionStorage']) vi.stubGlobal(name, { getItem: forbidden, setItem: forbidden, removeItem: forbidden });
    const state = createCurrencyMethodsDemo();
    for (const marketId of ['ES', 'FR', 'JP', 'KW'] as const) {
      for (const fxScenario of SCENARIOS) expect(view(configure(state, { marketId, fxScenario })).context.original.amountMinor).toBeGreaterThanOrEqual(0);
    }
    expect(createCurrencyMethodsDemo()).toEqual(state);
    expect(formatDemoMinorAmount({ currency: 'KWD', exponent: 3, amountMinor: Number.MAX_SAFE_INTEGER })).toBe('9.007.199.254.740,991 KWD');
    expect(forbidden).not.toHaveBeenCalled();
  });
});
