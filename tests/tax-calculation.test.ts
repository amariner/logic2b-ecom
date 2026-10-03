import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_TAX_LINES, TAX_CALCULATION_PROFILE, TaxContractError,
  defineTaxAssessmentResponse, defineTaxRequest, previewTaxCalculation,
  type TaxAssessmentResponse, type TaxDecision, type TaxRequest, type TaxRequestLine,
} from '../src/modules/taxes';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const AT = '2026-10-03T12:00:00.000Z';
const line = (overrides: Partial<TaxRequestLine> = {}): TaxRequestLine => ({ id: 'goods.one', kind: 'goods', amountCents: 100,
  priceBasis: 'excluded', ...overrides });
const request = (overrides: Partial<TaxRequest> = {}): TaxRequest => ({ schemaVersion: 1, id: 'test.tax.request',
  profile: TAX_CALCULATION_PROFILE, at: AT, currency: 'EUR', lines: [line()], ...overrides });
const decision = (lineId = 'goods.one', rateBasisPoints = 2100): TaxDecision => ({ lineId, treatment: 'taxable',
  jurisdictionRef: 'fixture.zone.alpha', ruleId: 'fixture.rule.standard', rateBasisPoints });
type Assessed = Extract<TaxAssessmentResponse, { outcome: 'assessed' }>;
const assessed = (query = request(), overrides: Partial<Assessed> = {}): Assessed => ({
  source: 'fixture', adapterId: 'test.tax.adapter', request: query, outcome: 'assessed',
  assessedAt: '2026-10-03T11:00:00.000Z', expiresAt: '2026-10-03T13:00:00.000Z',
  policy: { id: 'fixture.policy', version: 7 }, decisions: query.lines.map((item) => decision(item.id)), ...overrides,
});
const preview = (query = request(), response: TaxAssessmentResponse = assessed(query)) =>
  previewTaxCalculation({ request: query, expectedAdapterId: 'test.tax.adapter', response });
const resultFor = (amountCents: number, priceBasis: TaxRequestLine['priceBasis'], rate: number) => {
  const query = request({ lines: [line({ amountCents, priceBasis })] });
  return preview(query, assessed(query, { decisions: [decision('goods.one', rate)] }));
};
function assertFrozen(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) assertFrozen(child);
}

describe('perfil fiscal EUR por línea con mitad arriba', () => {
  it.each([
    [100, 'excluded', 2100, 100, 21, 121], [121, 'included', 2100, 100, 21, 121],
    [1, 'excluded', 4999, 1, 0, 1], [1, 'excluded', 5000, 1, 1, 2], [1, 'excluded', 5001, 1, 1, 2],
    [1, 'included', 9999, 1, 0, 1], [1, 'included', 10000, 0, 1, 1],
    [3, 'included', 10000, 1, 2, 3], [3, 'included', 9999, 2, 1, 3],
    [0, 'included', 10000, 0, 0, 0], [0, 'excluded', 1, 0, 0, 0],
  ] as const)('%ic %s a %ibp conserva net=%i tax=%i gross=%i', (amount, basis, rate, netCents, taxCents, grossCents) => {
    const result = resultFor(amount, basis, rate);
    expect(result.outcome).toBe('calculated');
    expect(result.snapshot!.totals).toEqual({ netCents, taxCents, grossCents });
    expect(result.snapshot!.lines[0]).toMatchObject({ line: { amountCents: amount, priceBasis: basis },
      decision: { treatment: 'taxable', rateBasisPoints: rate }, netCents, taxCents, grossCents });
    expect(netCents + taxCents).toBe(grossCents);
    expect(basis === 'included' ? grossCents : netCents).toBe(amount);
  });

  it('preserva la política, evidencia, petición completa y perfil sin fabricar un timestamp de cálculo', () => {
    const query = request();
    const response = assessed(query);
    const result = preview(query, response);
    expect(result.snapshot).toEqual({ schemaVersion: 1, profile: TAX_CALCULATION_PROFILE, source: 'fixture',
      adapterId: 'test.tax.adapter', request: defineTaxRequest(query), assessedAt: response.assessedAt,
      expiresAt: response.expiresAt, policy: { id: 'fixture.policy', version: 7 },
      lines: [{ line: line(), decision: decision(), netCents: 100, taxCents: 21, grossCents: 121 }],
      totals: { netCents: 100, taxCents: 21, grossCents: 121 } });
    expect(result.response).toEqual(defineTaxAssessmentResponse(response));
    expect(result.snapshot).not.toHaveProperty('calculatedAt');
    assertFrozen(result);
  });

  it('cada línea declara su base, incluidos portes, y los totales suman el dinero ya redondeado', () => {
    const query = request({ lines: [line({ amountCents: 121, priceBasis: 'included' }),
      line({ id: 'goods.two', amountCents: 200, priceBasis: 'excluded' }),
      line({ id: 'shipping', kind: 'shipping', amountCents: 50, priceBasis: 'excluded' })] });
    const result = preview(query, assessed(query, { decisions: [decision('goods.one'), decision('goods.two', 1000), decision('shipping', 1000)] }));
    expect(result.snapshot!.totals).toEqual({ netCents: 350, taxCents: 46, grossCents: 396 });
    expect(result.snapshot!.lines[2]).toMatchObject({ line: { kind: 'shipping' }, netCents: 50, taxCents: 5, grossCents: 55 });
  });

  it('dividir líneas no es una invariancia del perfil de redondeo', () => {
    const merged = resultFor(3, 'excluded', 5000);
    const split = request({ lines: ['one', 'two', 'three'].map((id) => line({ id, amountCents: 1 })) });
    const result = preview(split, assessed(split, { decisions: split.lines.map(({ id }) => decision(id, 5000)) }));
    expect(merged.snapshot!.totals).toEqual({ netCents: 3, taxCents: 2, grossCents: 5 });
    expect(result.snapshot!.totals).toEqual({ netCents: 3, taxCents: 3, grossCents: 6 });
  });

  it('cero, exención y dinero cero gravado conservan tratamientos distintos', () => {
    const query = request({ lines: [line({ id: 'zero', amountCents: 50 }), line({ id: 'exempt', amountCents: 121, priceBasis: 'included' }),
      line({ id: 'free', amountCents: 0 })] });
    const result = preview(query, assessed(query, { decisions: [
      { lineId: 'zero', treatment: 'zero_rate', jurisdictionRef: 'fixture.zone', ruleId: 'fixture.zero' },
      { lineId: 'exempt', treatment: 'exempt', jurisdictionRef: 'fixture.zone', ruleId: 'fixture.exempt', exemptionEvidenceRef: 'fixture.evidence' },
      decision('free'),
    ] }));
    expect(result.snapshot!.totals).toEqual({ netCents: 171, taxCents: 0, grossCents: 171 });
    expect(result.snapshot!.lines.map(({ decision: applied }) => applied.treatment)).toEqual(['exempt', 'taxable', 'zero_rate']);
    expect(result.snapshot!.lines[0]).toMatchObject({ decision: { exemptionEvidenceRef: 'fixture.evidence' },
      line: { amountCents: 121, priceBasis: 'included' }, netCents: 121, taxCents: 0, grossCents: 121 });
  });

  it.each(['not_configured', 'unsupported', 'missing_evidence'] as const)('una línea %s conserva null y bloquea el total global', (reason) => {
    const query = request({ lines: [line(), line({ id: 'shipping', kind: 'shipping', amountCents: 0 })] });
    const result = preview(query, assessed(query, { decisions: [decision(), { lineId: 'shipping', treatment: 'unresolved', reason }] }));
    expect(result).toMatchObject({ outcome: 'unresolved', reason: 'line_unresolved', snapshot: { totals: null } });
    expect(result.snapshot!.lines[0]).toMatchObject({ netCents: 100, taxCents: 21, grossCents: 121 });
    expect(result.snapshot!.lines[1]).toMatchObject({ line: { amountCents: 0 }, decision: { treatment: 'unresolved', reason },
      netCents: null, taxCents: null, grossCents: null });
  });

  it('multiplica con BigInt y conserva el céntimo impar en el límite seguro', () => {
    const result = resultFor(Number.MAX_SAFE_INTEGER, 'included', 10000);
    expect(result.snapshot!.totals).toEqual({ netCents: 4503599627370495, taxCents: 4503599627370496, grossCents: 9007199254740991 });
  });

  it('rechaza overflow de una línea y de los totales, sin devolver dinero redondeado inseguro', () => {
    expect(() => resultFor(Number.MAX_SAFE_INTEGER, 'excluded', 1)).toThrow(/rango monetario seguro/);
    const query = request({ lines: [line({ amountCents: Number.MAX_SAFE_INTEGER }), line({ id: 'other', amountCents: 1 })] });
    const response = assessed(query, { decisions: query.lines.map(({ id }) => ({
      lineId: id, treatment: 'zero_rate', jurisdictionRef: 'fixture.zone', ruleId: 'fixture.zero',
    })) });
    expect(() => preview(query, response)).toThrow(TaxContractError);
    const one = request({ lines: [line({ amountCents: Number.MAX_SAFE_INTEGER })] });
    expect(preview(one, assessed(one, { decisions: [response.decisions[0]!] })).snapshot!.totals)
      .toEqual({ netCents: Number.MAX_SAFE_INTEGER, taxCents: 0, grossCents: Number.MAX_SAFE_INTEGER });
  });
});

describe('correlación y vigencia de la evaluación fixture', () => {
  it('admite el comienzo inclusivo y rechaza el final exclusivo de la ventana', () => {
    expect(preview(request(), assessed(request(), { assessedAt: AT })).outcome).toBe('calculated');
    expect(preview(request(), assessed(request(), { expiresAt: AT }))).toMatchObject({
      outcome: 'unresolved', reason: 'assessment_stale', snapshot: null,
    });
  });

  it('no calcula con evaluación futura ni caducada aunque sus tasas parezcan válidas', () => {
    expect(preview(request(), assessed(request(), { assessedAt: '2026-10-03T12:00:00.001Z' })))
      .toMatchObject({ outcome: 'unresolved', reason: 'assessment_future', snapshot: null });
    expect(preview(request(), assessed(request(), { expiresAt: '2026-10-03T11:59:59.999Z' })))
      .toMatchObject({ outcome: 'unresolved', reason: 'assessment_stale', snapshot: null });
  });

  it.each(['not_configured', 'unsupported', 'unavailable'] as const)('una respuesta %s no fabrica política, vigencia ni dinero', (reason) => {
    const response: TaxAssessmentResponse = { source: 'fixture', adapterId: 'test.tax.adapter', request: request(), outcome: 'unavailable', reason };
    const result = preview(request(), response);
    expect(result).toMatchObject({ outcome: 'unresolved', reason: 'assessment_unavailable', snapshot: null, response: { reason } });
    expect(result.response).not.toHaveProperty('policy');
    expect(result.response).not.toHaveProperty('assessedAt');
    expect(result.response).not.toHaveProperty('expiresAt');
  });

  it.each([
    request({ id: 'other.request' }), request({ at: '2026-10-03T12:00:00.001Z' }),
    request({ lines: [line({ amountCents: 101 })] }), request({ lines: [line({ priceBasis: 'included' })] }),
    request({ lines: [line({ kind: 'shipping' })] }), request({ lines: [line({ id: 'another.line' })] }),
  ])('no correlaciona una petición distinta por compartir el ID: %j', (query) => {
    expect(() => preview(query, assessed())).toThrow(/petición completa/);
  });

  it('comprueba la identidad del adaptador y la petición también cuando no hay evaluación', () => {
    expect(() => previewTaxCalculation({ request: request(), expectedAdapterId: 'other.adapter', response: assessed() })).toThrow(/adaptador/);
    const response: TaxAssessmentResponse = { source: 'fixture', adapterId: 'test.tax.adapter', request: request(), outcome: 'unavailable', reason: 'not_configured' };
    expect(() => preview(request({ id: 'other.request' }), response)).toThrow(/petición completa/);
    expect(() => previewTaxCalculation({ request: request(), response: assessed() })).toThrow(TaxContractError);
  });

  it('una respuesta desordenada sigue correlacionada tras copiar su petición canónica completa', () => {
    const query = request({ lines: [line(), line({ id: 'shipping', kind: 'shipping' })] });
    const response = assessed({ ...query, lines: [...query.lines].reverse() });
    expect(preview(query, { ...response, decisions: [...response.decisions].reverse() })).toEqual(preview(query));
  });
});

describe('contrato estricto de importes, tratamientos y evidencia', () => {
  it.each([
    ['schemaVersion', 2], ['id', ''], ['id', 'Request'], ['id', 'x'.repeat(101)], ['profile', 'auto'], ['currency', 'USD'],
    ['currency', 'eur'], ['at', '2026-02-29T00:00:00.000Z'], ['at', '2026-10-03T12:00:00Z'],
    ['at', '2026-10-03T12:00:00.000+00:00'], ['quantity', 2],
  ])('rechaza request.%s=%s', (key, value) => {
    expect(() => defineTaxRequest({ ...request(), [key]: value })).toThrow(TaxContractError);
  });

  it.each([
    ['id', ''], ['kind', 'discount'], ['priceBasis', 'automatic'], ['amountCents', -1], ['amountCents', -0],
    ['amountCents', 1.5], ['amountCents', '1'], ['amountCents', NaN], ['amountCents', Infinity],
    ['amountCents', Number.MAX_SAFE_INTEGER + 1], ['quantity', 2], ['discountCents', 10],
  ])('rechaza line.%s=%s sin recalcular cantidad o descuento', (key, value) => {
    expect(() => defineTaxRequest({ ...request(), lines: [{ ...line(), [key]: value }] })).toThrow(TaxContractError);
  });

  it.each([
    ['treatment', 'evidence'], ['treatment', 'automatic'], ['rateBasisPoints', 0], ['rateBasisPoints', -1],
    ['rateBasisPoints', 10001], ['rateBasisPoints', 12.5], ['rateBasisPoints', '2100'],
    ['jurisdictionRef', ''], ['ruleId', ''], ['isExempt', true],
  ])('rechaza decision.%s=%s', (key, value) => {
    expect(() => defineTaxAssessmentResponse({ ...assessed(), decisions: [{ ...decision(), [key]: value }] })).toThrow(TaxContractError);
  });

  it('exige una decisión por línea, rechaza duplicados y no ignora referencias ajenas incluso caducadas', () => {
    const query = request({ lines: [line(), line({ id: 'other' })] });
    for (const decisions of [[], [decision()], [decision(), decision()], [decision(), decision('foreign')]]) {
      expect(() => defineTaxAssessmentResponse(assessed(query, { decisions }))).toThrow(TaxContractError);
    }
    expect(() => preview(query, assessed(query, { expiresAt: AT, decisions: [decision(), decision('foreign')] }))).toThrow(/ajena/);
    expect(() => defineTaxRequest(request({ lines: [line(), line()] }))).toThrow(/duplicada/);
  });

  it('tipo cero no acepta tasa ni evidencia de exención; exención exige su propia evidencia explícita', () => {
    const zero = { lineId: 'goods.one', treatment: 'zero_rate', jurisdictionRef: 'fixture.zone', ruleId: 'fixture.zero' };
    const exempt = { ...zero, treatment: 'exempt', exemptionEvidenceRef: 'fixture.evidence' };
    for (const invalid of [{ ...zero, rateBasisPoints: 0 }, { ...zero, exemptionEvidenceRef: 'fixture.evidence' },
      { ...zero, treatment: 'exempt' }, { ...exempt, exemptionEvidenceRef: '' }, { ...exempt, vatValid: true },
      { lineId: 'goods.one', treatment: 'unresolved', reason: 'invalid_vat' },
      { lineId: 'goods.one', treatment: 'unresolved', reason: 'missing_evidence', rateBasisPoints: 0 }]) {
      expect(() => defineTaxAssessmentResponse({ ...assessed(), decisions: [invalid] })).toThrow(TaxContractError);
    }
  });

  it.each([
    ['source', 'provider'], ['adapterId', ''], ['outcome', 'success'], ['assessedAt', 'invalid'],
    ['expiresAt', '2026-10-03T11:00:00.000Z'], ['expiresAt', '2026-10-03T10:59:59.999Z'],
    ['policy', { id: 'fixture.policy', version: 0 }], ['policy', { id: 'fixture.policy', version: Number.MAX_SAFE_INTEGER + 1 }],
    ['policy', { id: 'fixture.policy', version: 1, rate: 2100 }], ['extra', true],
  ])('rechaza response.%s=%s', (key, value) => {
    expect(() => defineTaxAssessmentResponse({ ...assessed(), [key]: value })).toThrow(TaxContractError);
  });

  it('aplica el límite de cien líneas sin aceptar vacío', () => {
    const lines = Array.from({ length: MAX_TAX_LINES }, (_, index) => line({ id: `line-${index}`, amountCents: 1 }));
    const query = request({ lines });
    expect(preview(query).snapshot!.lines).toHaveLength(100);
    expect(() => defineTaxRequest(request({ lines: [] }))).toThrow(TaxContractError);
    expect(() => defineTaxRequest(request({ lines: [...lines, line({ id: 'extra' })] }))).toThrow(TaxContractError);
  });

  it('exige todos los campos en cada nivel, sin completar defaults', () => {
    const cases: Array<[Record<string, unknown>, (value: unknown) => unknown]> = [
      [request(), defineTaxRequest], [line(), (value) => defineTaxRequest({ ...request(), lines: [value] })],
      [assessed(), defineTaxAssessmentResponse],
      [decision(), (value) => defineTaxAssessmentResponse({ ...assessed(), decisions: [value] })],
      [assessed().policy, (value) => defineTaxAssessmentResponse({ ...assessed(), policy: value })],
    ];
    for (const [record, run] of cases) for (const key of Object.keys(record)) {
      const missing = { ...record }; delete missing[key];
      expect(() => run(missing)).toThrow(TaxContractError);
    }
  });

  it('rechaza accesores y estructuras hostiles sin ejecutarlos', () => {
    const getter = vi.fn(() => 100);
    const getterLine = Object.defineProperty({ ...line() }, 'amountCents', { enumerable: true, get: getter });
    const getterArray = [line()];
    Object.defineProperty(getterArray, '0', { enumerable: true, get: getter });
    for (const lines of [[getterLine], getterArray, new Array(1), Object.assign([line()], { extra: 1 })]) {
      expect(() => defineTaxRequest({ ...request(), lines })).toThrow(TaxContractError);
    }
    for (const input of [Object.assign(Object.create({ inherited: true }), request()),
      { ...request(), [Symbol('hidden')]: true }, Object.defineProperty({ ...request() }, 'at', { value: AT, enumerable: false })]) {
      expect(() => defineTaxRequest(input)).toThrow(TaxContractError);
    }
    expect(() => defineTaxAssessmentResponse(Object.defineProperty({ ...assessed() }, 'outcome', { enumerable: true, get: getter }))).toThrow(TaxContractError);
    expect(() => previewTaxCalculation(Object.defineProperty({ request: request(), expectedAdapterId: 'test.tax.adapter' }, 'response', { enumerable: true, get: getter })))
      .toThrow(TaxContractError);
    expect(getter).not.toHaveBeenCalled();
  });

  it('copia y congela cada artefacto, admite revalidación y evita reloj, red o almacenamiento', () => {
    const query = structuredClone(request());
    const response = structuredClone(assessed(query));
    const unexpected = () => { throw new Error('Unexpected external effect'); };
    vi.spyOn(Date, 'now').mockImplementation(unexpected);
    vi.stubGlobal('fetch', unexpected);
    vi.stubGlobal('localStorage', { getItem: unexpected, setItem: unexpected });
    vi.stubGlobal('setTimeout', unexpected);
    const result = preview(query, response);
    Object.assign(query.lines[0]!, { amountCents: 999 });
    Object.assign(response.policy, { version: 99 });
    Object.assign(response.decisions[0]!, { rateBasisPoints: 9999 });
    expect(result.snapshot!.totals).toEqual({ netCents: 100, taxCents: 21, grossCents: 121 });
    expect(result.snapshot!.policy.version).toBe(7);
    expect(defineTaxRequest(result.request)).toEqual(result.request);
    expect(defineTaxAssessmentResponse(result.response)).toEqual(result.response);
    assertFrozen(result);
    expect(defineTaxRequest(Object.assign(Object.create(null), request()))).toEqual(defineTaxRequest(request()));
  });
});
