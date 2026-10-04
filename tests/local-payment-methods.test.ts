import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LOCAL_PAYMENT_METHOD_LIMITS, LocalPaymentMethodContractError,
  defineLocalPaymentMethodPolicy, defineLocalPaymentMethodRequest, previewLocalPaymentMethods,
  type LocalPaymentMethodPolicy, type LocalPaymentMethodRequest, type LocalPaymentMethodRule,
} from '../src/modules/payments';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const rule = (overrides: Partial<LocalPaymentMethodRule> = {}): LocalPaymentMethodRule => ({
  methodId: 'alpha', marketId: 'ES', currency: 'EUR', exponent: 2, enabled: true, minMinor: 100, maxMinor: 1000, ...overrides,
});
const policy = (overrides: Partial<LocalPaymentMethodPolicy> = {}): LocalPaymentMethodPolicy => ({
  schemaVersion: 1, source: 'fixture', id: 'fixture.methods', version: 7,
  currencyCatalogRef: { id: 'fixture.currencies', version: 3 }, marketCatalogRef: { id: 'fixture.markets', version: 2 },
  methods: [{ id: 'alpha' }, { id: 'beta' }, { id: 'gamma' }],
  rules: [rule(), rule({ methodId: 'beta', enabled: false, minMinor: 1000, maxMinor: 2000 })], ...overrides,
});
const request = (overrides: Partial<LocalPaymentMethodRequest> = {}): LocalPaymentMethodRequest => ({
  schemaVersion: 1, id: 'fixture.request', marketId: 'ES', original: { currency: 'EUR', exponent: 2, amountMinor: 500 },
  currencyCatalogRef: { id: 'fixture.currencies', version: 3 }, marketCatalogRef: { id: 'fixture.markets', version: 2 }, ...overrides,
});
const preview = (query = request(), source = policy()) => previewLocalPaymentMethods({ policy: source, request: query });
function assertFrozen(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) assertFrozen(child);
}

describe('métodos sintéticos sobre importe original', () => {
  it('distingue disponible, desactivado y no configurado con la regla exacta y refs originales', () => {
    const result = preview();
    expect(result).toEqual({ source: 'fixture', request: defineLocalPaymentMethodRequest(request()),
      policyRef: { id: 'fixture.methods', version: 7 }, methods: [
        { methodId: 'alpha', outcome: 'available_in_fixture', reason: null, matchedRule: rule() },
        { methodId: 'beta', outcome: 'unavailable_in_fixture', reason: 'disabled', matchedRule: rule({ methodId: 'beta', enabled: false, minMinor: 1000, maxMinor: 2000 }) },
        { methodId: 'gamma', outcome: 'unavailable_in_fixture', reason: 'not_configured', matchedRule: null },
      ] });
    assertFrozen(result);
  });

  it.each([
    [99, 'unavailable_in_fixture', 'below_minimum'], [100, 'available_in_fixture', null],
    [500, 'available_in_fixture', null], [1000, 'available_in_fixture', null],
    [1001, 'unavailable_in_fixture', 'above_maximum'],
  ] as const)('importe %i respeta límites inclusivos y devuelve %s/%s', (amountMinor, outcome, reason) => {
    const result = preview(request({ original: { currency: 'EUR', exponent: 2, amountMinor } }));
    expect(result.methods[0]).toMatchObject({ outcome, reason, matchedRule: { minMinor: 100, maxMinor: 1000 } });
  });

  it.each([0, 500, 2500])('desactivado precede a límites incluso con importe %i', (amountMinor) => {
    expect(preview(request({ original: { currency: 'EUR', exponent: 2, amountMinor } })).methods[1])
      .toMatchObject({ outcome: 'unavailable_in_fixture', reason: 'disabled' });
  });

  it('una política sin reglas no fabrica métodos disponibles ni aplica otro mercado o moneda', () => {
    expect(preview(request(), policy({ rules: [] })).methods.every((method) => method.reason === 'not_configured' && method.matchedRule === null)).toBe(true);
    expect(preview(request({ marketId: 'FR' })).methods.every((method) => method.reason === 'not_configured')).toBe(true);
    expect(preview(request({ original: { currency: 'JPY', exponent: 0, amountMinor: 500 } })).methods.every((method) => method.reason === 'not_configured')).toBe(true);
  });

  it('selecciona una tupla exacta por método, mercado y moneda sin herencia ni wildcard', () => {
    const configured = policy({ rules: [rule(), rule({ marketId: 'FR', enabled: false }),
      rule({ currency: 'JPY', exponent: 0, minMinor: 1, maxMinor: 10 }),
      rule({ methodId: 'beta', marketId: 'FR', minMinor: 1, maxMinor: 5 })] });
    expect(preview(request(), configured).methods[0]).toMatchObject({ outcome: 'available_in_fixture', matchedRule: { marketId: 'ES', currency: 'EUR' } });
    expect(preview(request({ marketId: 'FR' }), configured).methods[0]).toMatchObject({ reason: 'disabled', matchedRule: { marketId: 'FR' } });
    expect(preview(request({ original: { currency: 'JPY', exponent: 0, amountMinor: 10 } }), configured).methods[0])
      .toMatchObject({ outcome: 'available_in_fixture', matchedRule: { currency: 'JPY', exponent: 0 } });
    expect(preview(request({ marketId: 'FR', original: { currency: 'JPY', exponent: 0, amountMinor: 10 } }), configured).methods[0])
      .toMatchObject({ reason: 'not_configured', matchedRule: null });
    expect(preview(request({ marketId: 'FR', original: { currency: 'EUR', exponent: 2, amountMinor: 5 } }), configured).methods[1]!.outcome)
      .toBe('available_in_fixture');
  });

  it.each([0, 2, 3] as const)('cero con min=max=0 es explícitamente disponible con exponente %i', (exponent) => {
    const configured = policy({ rules: [rule({ exponent, minMinor: 0, maxMinor: 0 })] });
    expect(preview(request({ original: { currency: 'EUR', exponent, amountMinor: 0 } }), configured).methods[0]!.outcome).toBe('available_in_fixture');
    expect(preview(request({ original: { currency: 'EUR', exponent, amountMinor: 1 } }), configured).methods[0]!.reason).toBe('above_maximum');
  });

  it('compara MAX_SAFE_INTEGER exactamente sin multiplicar o convertir unidades', () => {
    const max = Number.MAX_SAFE_INTEGER;
    const configured = policy({ rules: [rule({ minMinor: max, maxMinor: max })] });
    expect(preview(request({ original: { currency: 'EUR', exponent: 2, amountMinor: max } }), configured).methods[0]!.outcome).toBe('available_in_fixture');
    expect(preview(request({ original: { currency: 'EUR', exponent: 2, amountMinor: max - 1 } }), configured).methods[0]!.reason).toBe('below_minimum');
  });

  it('el resultado no aporta proveedor, intención, URL, tasa ni autorización de cobro', () => {
    const result = preview();
    for (const method of result.methods) {
      expect(Object.keys(method).sort()).toEqual(['matchedRule', 'methodId', 'outcome', 'reason']);
    }
    for (const property of ['provider', 'paymentIntent', 'redirectUrl', 'fx', 'rate', 'available', 'canCharge']) {
      expect(result).not.toHaveProperty(property);
    }
  });
});

describe('referencias y coherencia de unidades antes de evaluar', () => {
  it.each(['currencyCatalogRef', 'marketCatalogRef'] as const)('exige ID y versión exactos de %s', (field) => {
    for (const patch of [{ ...request()[field], id: 'other.catalog' }, { ...request()[field], version: request()[field].version + 1 }]) {
      expect(() => preview({ ...request(), [field]: patch })).toThrow(/referencia de la política/);
      expect(() => preview({ ...request(), [field]: patch }, policy({ rules: [] }))).toThrow(LocalPaymentMethodContractError);
    }
  });

  it('exige el exponente coherente para la moneda de la petición aunque no exista tupla en su mercado', () => {
    const configured = policy({ rules: [rule({ marketId: 'ES', enabled: false })] });
    for (const marketId of ['ES', 'FR']) {
      expect(() => preview(request({ marketId, original: { currency: 'EUR', exponent: 3, amountMinor: 500 } }), configured))
        .toThrow(/unidades de la política/);
    }
  });

  it('rechaza exponentes contradictorios en cualquier regla incluso desactivada y fuera del contexto', () => {
    for (const contradictory of [rule({ methodId: 'beta', exponent: 3 }), rule({ marketId: 'FR', enabled: false, exponent: 0 })]) {
      expect(() => preview(request(), policy({ rules: [rule(), contradictory] }))).toThrow(/exponente contradictorio/);
    }
  });

  it('valida toda regla aunque esté desactivada o fuera del contexto solicitado', () => {
    for (const malformed of [rule({ methodId: 'unknown' }), rule({ marketId: 'FR', enabled: false, minMinor: 2, maxMinor: 1 }),
      rule({ marketId: 'FR', enabled: false, minMinor: -1 })]) {
      expect(() => preview(request(), policy({ rules: [rule(), malformed] }))).toThrow(LocalPaymentMethodContractError);
    }
  });

  it('rechaza dos reglas de una misma tupla aunque cambien límites o desactivación', () => {
    expect(() => defineLocalPaymentMethodPolicy(policy({ rules: [rule(), rule({ enabled: false, minMinor: 0 })] }))).toThrow(/duplicada/);
    expect(() => defineLocalPaymentMethodPolicy(policy({ methods: [{ id: 'alpha' }, { id: 'alpha' }], rules: [] }))).toThrow(/duplicado/);
  });
});

describe('validación de datos canónicos, límites e inmutabilidad', () => {
  it.each([
    ['schemaVersion', 2], ['source', 'provider'], ['id', ''], ['id', 'Policy'], ['id', 'a'.repeat(101)],
    ['version', 0], ['version', 1.5], ['version', Number.MAX_SAFE_INTEGER + 1], ['methods', []], ['defaultMethod', 'alpha'],
  ])('rechaza policy.%s=%s', (key, value) => {
    expect(() => defineLocalPaymentMethodPolicy({ ...policy(), [key]: value })).toThrow(LocalPaymentMethodContractError);
  });

  it.each([
    ['methodId', ''], ['methodId', 'Alpha'], ['methodId', 'unknown'], ['marketId', '*'], ['marketId', 'E'],
    ['marketId', 'es'], ['marketId', 'ES--SHOP'], ['marketId', 'ES/SHOP'], ['marketId', 'A'.repeat(41)],
    ['currency', '*'], ['currency', 'eur'], ['currency', 'EU'], ['currency', 'EURO'],
    ['exponent', -0], ['exponent', 1], ['exponent', 4], ['exponent', '2'], ['enabled', 1], ['enabled', 'false'],
    ['minMinor', -1], ['minMinor', -0], ['minMinor', 1.5], ['minMinor', '100'], ['minMinor', NaN],
    ['maxMinor', Infinity], ['maxMinor', Number.MAX_SAFE_INTEGER + 1], ['maxMinor', null], ['channel', 'storefront'],
  ])('rechaza rule.%s=%s', (key, value) => {
    expect(() => defineLocalPaymentMethodPolicy({ ...policy(), rules: [{ ...rule(), [key]: value }] })).toThrow(LocalPaymentMethodContractError);
  });

  it('admite identificadores de mercado compatibles, sin normalizarlos ni convertirlos en países', () => {
    for (const marketId of ['ES', 'EU-B2B', 'EU.RETAIL_01', 'A'.repeat(40)]) {
      const query = request({ marketId });
      expect(preview(query, policy({ rules: [rule({ marketId })] })).methods[0]!.outcome).toBe('available_in_fixture');
    }
  });

  it.each([
    ['schemaVersion', 2], ['id', ''], ['marketId', '*'], ['marketId', 'es'], ['marketId', 'E'],
    ['marketId', 'ES--SHOP'], ['at', '2026-10-04T12:00:00.000Z'], ['presented', { currency: 'EUR', amountMinor: 500 }],
  ])('rechaza request.%s=%s', (key, value) => {
    expect(() => defineLocalPaymentMethodRequest({ ...request(), [key]: value })).toThrow(LocalPaymentMethodContractError);
  });

  it.each([
    ['currency', 'eur'], ['exponent', 1], ['exponent', -0], ['amountMinor', -0], ['amountMinor', -1],
    ['amountMinor', 0.5], ['amountMinor', NaN], ['amountMinor', Infinity], ['amountMinor', Number.MAX_SAFE_INTEGER + 1],
    ['amountMinor', '500'], ['rate', 1],
  ])('rechaza original.%s=%s sin reemplazar importe por FX', (key, value) => {
    expect(() => defineLocalPaymentMethodRequest({ ...request(), original: { ...request().original, [key]: value } })).toThrow(LocalPaymentMethodContractError);
  });

  it('refs estrictas: no acepta ID vacío, versión insegura ni evidencia añadida', () => {
    for (const field of ['currencyCatalogRef', 'marketCatalogRef'] as const) {
      for (const ref of [{ id: '', version: 1 }, { id: 'fixture.catalog', version: 0 },
        { id: 'fixture.catalog', version: Number.MAX_SAFE_INTEGER + 1 }, { id: 'fixture.catalog', version: 1, verified: true }]) {
        expect(() => defineLocalPaymentMethodPolicy({ ...policy(), [field]: ref })).toThrow(LocalPaymentMethodContractError);
        expect(() => defineLocalPaymentMethodRequest({ ...request(), [field]: ref })).toThrow(LocalPaymentMethodContractError);
      }
    }
  });

  it('aplica los máximos de 100 métodos y 10000 reglas sin admitir entradas extra', () => {
    const methods = Array.from({ length: LOCAL_PAYMENT_METHOD_LIMITS.methods }, (_, index) => ({ id: `method-${index}` }));
    const rules = methods.flatMap(({ id: methodId }) => Array.from({ length: 100 }, (_, index) => rule({ methodId, marketId: `M${index}` })));
    const accepted = defineLocalPaymentMethodPolicy(policy({ methods, rules }));
    expect(accepted.methods).toHaveLength(100);
    expect(accepted.rules).toHaveLength(10000);
    expect(() => defineLocalPaymentMethodPolicy(policy({ methods: [...methods, { id: 'extra' }], rules: [] }))).toThrow(LocalPaymentMethodContractError);
    expect(() => defineLocalPaymentMethodPolicy(policy({ methods, rules: [...rules, rule({ methodId: 'method-0', marketId: 'OTHER' })] })))
      .toThrow(LocalPaymentMethodContractError);
  });

  it('exige todos los campos y rechaza extras en cada nivel', () => {
    const cases: Array<[Record<string, unknown>, (input: unknown) => unknown]> = [
      [policy(), defineLocalPaymentMethodPolicy], [request(), defineLocalPaymentMethodRequest],
      [rule(), (value) => defineLocalPaymentMethodPolicy({ ...policy(), rules: [value] })],
      [{ id: 'alpha' }, (value) => defineLocalPaymentMethodPolicy({ ...policy(), methods: [value], rules: [] })],
      [request().original, (value) => defineLocalPaymentMethodRequest({ ...request(), original: value })],
      [request().marketCatalogRef, (value) => defineLocalPaymentMethodRequest({ ...request(), marketCatalogRef: value })],
      [{ policy: policy(), request: request() }, previewLocalPaymentMethods],
    ];
    for (const [record, run] of cases) {
      for (const key of Object.keys(record)) {
        const missing = { ...record }; delete missing[key];
        expect(() => run(missing)).toThrow(LocalPaymentMethodContractError);
      }
      expect(() => run({ ...record, unexpected: true })).toThrow(LocalPaymentMethodContractError);
    }
  });

  it('rechaza getters, prototipos, símbolos, ocultos y arrays no propios sin ejecutar accesores', () => {
    const getter = vi.fn(() => 100);
    const accessorRule = Object.defineProperty({ ...rule() }, 'minMinor', { enumerable: true, get: getter });
    const accessorRules = [rule()];
    Object.defineProperty(accessorRules, '0', { enumerable: true, get: getter });
    class RuleArray extends Array<LocalPaymentMethodRule> {}
    for (const rules of [[accessorRule], accessorRules, new Array(1), Object.assign([rule()], { extra: true }), new RuleArray(rule())]) {
      expect(() => defineLocalPaymentMethodPolicy({ ...policy(), rules })).toThrow(LocalPaymentMethodContractError);
    }
    for (const invalid of [Object.assign(Object.create({ inherited: true }), request()),
      { ...request(), [Symbol('hidden')]: true }, Object.defineProperty({ ...request() }, 'id', { enumerable: false, value: 'fixture.request' }),
      Object.defineProperty({ ...request() }, 'marketCatalogRef', { enumerable: true, get: getter })]) {
      expect(() => defineLocalPaymentMethodRequest(invalid)).toThrow(LocalPaymentMethodContractError);
    }
    expect(() => defineLocalPaymentMethodPolicy(Object.defineProperty({ ...policy() }, 'methods', { enumerable: true, get: getter })))
      .toThrow(LocalPaymentMethodContractError);
    expect(() => previewLocalPaymentMethods(Object.defineProperty({ request: request() }, 'policy', { enumerable: true, get: getter })))
      .toThrow(LocalPaymentMethodContractError);
    expect(getter).not.toHaveBeenCalled();
  });

  it('ordena copias, congela todo y revalida sin depender del orden de entrada', () => {
    const source = structuredClone(policy());
    const query = structuredClone(request());
    const normalized = defineLocalPaymentMethodPolicy(source);
    const result = preview(query, source);
    const permuted = policy({ methods: [...source.methods].reverse(), rules: [...source.rules].reverse() });
    expect(defineLocalPaymentMethodPolicy(permuted)).toEqual(normalized);
    expect(preview(query, permuted)).toEqual(result);
    Object.assign(source.rules[0]!, { enabled: false });
    Object.assign(source.currencyCatalogRef, { version: 99 });
    Object.assign(query.original, { amountMinor: 99999 });
    expect(result.methods[0]!.outcome).toBe('available_in_fixture');
    expect(result.request.original.amountMinor).toBe(500);
    expect(normalized.currencyCatalogRef.version).toBe(3);
    expect(defineLocalPaymentMethodPolicy(normalized)).toEqual(normalized);
    expect(defineLocalPaymentMethodRequest(result.request)).toEqual(result.request);
    expect(defineLocalPaymentMethodRequest(Object.assign(Object.create(null), request()))).toEqual(defineLocalPaymentMethodRequest(request()));
    for (const value of [normalized, result, LOCAL_PAYMENT_METHOD_LIMITS]) assertFrozen(value);
  });

  it('no consulta reloj, red, almacenamiento, timers o conversiones para decidir', () => {
    const unexpected = () => { throw new Error('Unexpected external effect'); };
    vi.stubGlobal('Date', unexpected);
    vi.stubGlobal('fetch', unexpected);
    vi.stubGlobal('localStorage', { getItem: unexpected, setItem: unexpected });
    vi.stubGlobal('sessionStorage', { getItem: unexpected, setItem: unexpected });
    vi.stubGlobal('setTimeout', unexpected);
    vi.stubGlobal('setInterval', unexpected);
    const result = preview();
    expect(result.methods[0]!.outcome).toBe('available_in_fixture');
    expect(result.request.original).toEqual(request().original);
    expect(Object.keys(result).sort()).toEqual(['methods', 'policyRef', 'request', 'source']);
  });
});
