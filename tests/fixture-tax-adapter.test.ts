import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_FIXTURE_TAX_CASES, TAX_CALCULATION_PROFILE, TaxContractError,
  createFixtureTaxAdapter, defineTaxAssessmentResponse, previewTaxCalculation,
  type TaxAssessmentResponse, type TaxRequest,
} from '../src/modules/taxes';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const request = (overrides: Partial<TaxRequest> = {}): TaxRequest => ({ schemaVersion: 1, id: 'fixture.request',
  profile: TAX_CALCULATION_PROFILE, at: '2026-10-03T12:00:00.000Z', currency: 'EUR',
  lines: [{ id: 'goods', kind: 'goods', amountCents: 5, priceBasis: 'excluded' }], ...overrides });
const response = (query = request()): TaxAssessmentResponse => ({ source: 'fixture', adapterId: 'fixture.adapter', request: query,
  outcome: 'assessed', assessedAt: '2026-10-03T11:00:00.000Z', expiresAt: '2026-10-03T13:00:00.000Z',
  policy: { id: 'fixture.policy', version: 1 }, decisions: query.lines.map((line) => ({ lineId: line.id,
    treatment: 'taxable', rateBasisPoints: 1000, jurisdictionRef: 'fixture.zone', ruleId: 'fixture.rule' })) });

describe('adaptador fiscal de fixtures, sin proveedor', () => {
  it('expone identidad fija y resuelve únicamente casos declarados de forma síncrona', () => {
    const adapter = createFixtureTaxAdapter({ adapterId: 'fixture.adapter', cases: [response()] });
    expect(adapter.source).toBe('fixture');
    expect(adapter.adapterId).toBe('fixture.adapter');
    expect(Object.isFrozen(adapter)).toBe(true);
    expect(adapter.assess(request())).toEqual(defineTaxAssessmentResponse(response()));
    const result = previewTaxCalculation({ request: request(), expectedAdapterId: adapter.adapterId, response: adapter.assess(request()) });
    expect(result.outcome).toBe('calculated');
    expect(result.snapshot!.totals).toEqual({ netCents: 5, taxCents: 1, grossCents: 6 });
  });

  it.each([
    request({ id: 'another.request' }), request({ at: '2026-10-03T12:00:00.001Z' }),
    request({ lines: [{ ...request().lines[0]!, amountCents: 6 }] }),
    request({ lines: [{ ...request().lines[0]!, priceBasis: 'included' }] }),
    request({ lines: [{ ...request().lines[0]!, kind: 'shipping' }] }),
    request({ lines: [{ ...request().lines[0]!, id: 'another.line' }] }),
  ])('consulta desconocida devuelve not_configured sin reutilizar evidencia por ID: %j', (query) => {
    const adapter = createFixtureTaxAdapter({ adapterId: 'fixture.adapter', cases: [response()] });
    const result = adapter.assess(query);
    expect(result).toEqual({ source: 'fixture', adapterId: 'fixture.adapter', request: query, outcome: 'unavailable', reason: 'not_configured' });
    expect(result).not.toHaveProperty('assessedAt');
    expect(result).not.toHaveProperty('policy');
    expect(previewTaxCalculation({ request: query, expectedAdapterId: adapter.adapterId, response: result }).snapshot).toBeNull();
  });

  it('puede declarar indisponibilidad explícita y distinguirla de un caso ausente', () => {
    const unavailable: TaxAssessmentResponse = { source: 'fixture', adapterId: 'fixture.adapter', request: request(),
      outcome: 'unavailable', reason: 'unavailable' };
    const adapter = createFixtureTaxAdapter({ adapterId: 'fixture.adapter', cases: [unavailable] });
    expect(adapter.assess(request())).toEqual(unavailable);
    expect(createFixtureTaxAdapter({ adapterId: 'fixture.adapter', cases: [] }).assess(request()))
      .toMatchObject({ outcome: 'unavailable', reason: 'not_configured' });
  });

  it('el orden de líneas no altera una consulta canónica ni permite mezclar sus decisiones', () => {
    const query = request({ lines: [{ ...request().lines[0]!, id: 'goods.z' }, { ...request().lines[0]!, id: 'goods.a', amountCents: 15 }] });
    const adapter = createFixtureTaxAdapter({ adapterId: 'fixture.adapter', cases: [response(query)] });
    expect(adapter.assess({ ...query, lines: [...query.lines].reverse() })).toEqual(adapter.assess(query));
    const swappedAmounts = { ...query, lines: query.lines.map((line, index) => ({ ...line, amountCents: index === 0 ? 15 : 5 })) };
    expect(adapter.assess(swappedAmounts)).toMatchObject({ outcome: 'unavailable', reason: 'not_configured' });
  });

  it('conserva evidencia temporal explícita, y el evaluador impide consumir un caso caducado', () => {
    const source = response();
    if (source.outcome !== 'assessed') throw new Error('fixture inválido');
    const adapter = createFixtureTaxAdapter({ adapterId: 'fixture.adapter', cases: [{ ...source, expiresAt: request().at }] });
    expect(adapter.assess(request())).toMatchObject({ outcome: 'assessed', expiresAt: request().at });
    expect(previewTaxCalculation({ request: request(), expectedAdapterId: adapter.adapterId, response: adapter.assess(request()) }))
      .toMatchObject({ outcome: 'unresolved', reason: 'assessment_stale', snapshot: null });
  });

  it('rechaza casos duplicados, IDs reutilizados y respuestas de otro adaptador', () => {
    expect(() => createFixtureTaxAdapter({ adapterId: 'fixture.adapter', cases: [response(), response()] })).toThrow(/duplicado/);
    expect(() => createFixtureTaxAdapter({ adapterId: 'fixture.adapter', cases: [response(), response(request({
      lines: [{ ...request().lines[0]!, amountCents: 6 }],
    }))] })).toThrow(/duplicado/);
    expect(() => createFixtureTaxAdapter({ adapterId: 'other.adapter', cases: [response()] })).toThrow(/otro adaptador/);
  });

  it('rechaza toda entrada malformada incluso casos que nunca se consultarían', () => {
    const malformed = { ...response(request({ id: 'other.request' })), decisions: [] };
    expect(() => createFixtureTaxAdapter({ adapterId: 'fixture.adapter', cases: [response(), malformed] })).toThrow(TaxContractError);
    for (const input of [null, {}, { cases: [] }, { adapterId: 'fixture.adapter', cases: [], endpoint: 'https://example.test' }]) {
      expect(() => createFixtureTaxAdapter(input)).toThrow(TaxContractError);
    }
    expect(() => createFixtureTaxAdapter({ adapterId: 'fixture.adapter', cases: [] }).assess({ ...request(), currency: 'USD' }))
      .toThrow(TaxContractError);
  });

  it('limita los casos declarados y permite el máximo exacto', () => {
    const cases = Array.from({ length: MAX_FIXTURE_TAX_CASES }, (_, index) => response(request({ id: `fixture.case-${index}` })));
    const adapter = createFixtureTaxAdapter({ adapterId: 'fixture.adapter', cases });
    expect(adapter.assess(request({ id: 'fixture.case-99' })).outcome).toBe('assessed');
    expect(() => createFixtureTaxAdapter({ adapterId: 'fixture.adapter', cases: [...cases, response(request({ id: 'extra.case' }))] }))
      .toThrow(TaxContractError);
  });

  it('copia los casos y consultas, congela respuestas y no ejecuta getters ni efectos', () => {
    const source = structuredClone(response());
    const adapter = createFixtureTaxAdapter({ adapterId: 'fixture.adapter', cases: [source] });
    Object.assign(source.request.lines[0]!, { amountCents: 999 });
    const unexpected = () => { throw new Error('Unexpected external effect'); };
    vi.spyOn(Date, 'now').mockImplementation(unexpected);
    vi.stubGlobal('fetch', unexpected);
    vi.stubGlobal('sessionStorage', { getItem: unexpected, setItem: unexpected });
    vi.stubGlobal('setTimeout', unexpected);
    const result = adapter.assess(request());
    expect(result.outcome).toBe('assessed');
    expect(result.request.lines[0]!.amountCents).toBe(5);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.request.lines[0])).toBe(true);
    const query = structuredClone(request({ id: 'unknown.request' }));
    const unavailable = adapter.assess(query);
    Object.assign(query.lines[0]!, { amountCents: 1000 });
    expect(unavailable.request.lines[0]!.amountCents).toBe(5);
    const getter = vi.fn(() => []);
    expect(() => createFixtureTaxAdapter(Object.defineProperty({ adapterId: 'fixture.adapter' }, 'cases', { enumerable: true, get: getter })))
      .toThrow(TaxContractError);
    expect(() => adapter.assess(Object.defineProperty({ ...request() }, 'lines', { enumerable: true, get: getter }))).toThrow(TaxContractError);
    expect(getter).not.toHaveBeenCalled();
  });
});
