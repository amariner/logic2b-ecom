import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_FIXTURE_VAT_ID_CASES, TaxContractError, createFixtureVatIdAdapter, evaluateVatIdEvidence,
  type VatIdOutcome,
} from '../src/modules/taxes';

const AT = '2026-10-03T12:00:00.000Z';
const UNTIL = '2026-10-04T12:00:00.000Z';
const ADAPTER = 'fixture.vat';
function query(id = 'query.one') {
  return { schemaVersion: 1, id, countryCode: 'ES', identifier: 'FICTIONAL123' };
}
function evidence(outcome: VatIdOutcome = 'valid', id = 'query.one') {
  return { source: 'fixture', adapterId: ADAPTER, query: query(id), evidenceRef: `evidence.${id}`,
    checkedAt: AT, expiresAt: UNTIL, outcome };
}
function configuration() { return { adapterId: ADAPTER, cases: [evidence()] }; }

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('adaptador VAT de fixtures inyectados R5.10a', () => {
  it.each(['valid', 'invalid', 'unavailable', 'unsupported'] as const)('devuelve el caso %s sin convertirlo en una decisión fiscal', (outcome) => {
    const adapter = createFixtureVatIdAdapter({ adapterId: ADAPTER, cases: [evidence(outcome)] });
    expect(adapter.source).toBe('fixture');
    expect(adapter.adapterId).toBe(ADAPTER);
    const response = adapter.validate(query());
    expect(response).toEqual({ status: 'evidence', evidence: evidence(outcome) });
    const result = evaluateVatIdEvidence({ expectedAdapterId: ADAPTER, query: query(), at: AT, response });
    expect(result).toMatchObject(outcome === 'valid' || outcome === 'invalid'
      ? { status: 'usable', outcome } : { status: 'unusable', reason: outcome });
  });

  it('una consulta no configurada conserva identidad completa y ausencia explícita de evidencia', () => {
    const adapter = createFixtureVatIdAdapter({ adapterId: ADAPTER, cases: [] });
    const supplied = query();
    const response = adapter.validate(supplied);
    supplied.identifier = 'CHANGED';
    expect(response).toEqual({ status: 'unavailable', reason: 'not_configured', adapterId: ADAPTER, query: query(), evidence: null });
    expect(Object.isFrozen(response)).toBe(true);
    if (response.status !== 'unavailable') throw new Error('Expected absent evidence');
    expect(Object.isFrozen(response.query)).toBe(true);
    expect(Object.keys(response).sort()).toEqual(['adapterId', 'evidence', 'query', 'reason', 'status']);
  });

  it.each([{ id: 'query.other' }, { countryCode: 'FR' }, { identifier: 'OTHER123' }])('lookup exige la consulta completa: %o', (patch) => {
    const adapter = createFixtureVatIdAdapter(configuration());
    const requested = { ...query(), ...patch };
    const response = adapter.validate(requested);
    expect(response).toEqual({ status: 'unavailable', reason: 'not_configured', adapterId: ADAPTER, query: requested, evidence: null });
    expect(evaluateVatIdEvidence({ expectedAdapterId: ADAPTER, query: requested, at: AT, response }))
      .toMatchObject({ status: 'unusable', reason: 'not_configured' });
  });

  it('no refresca fechas: el mismo caso configurado caduca al evaluar el límite exacto', () => {
    const adapter = createFixtureVatIdAdapter(configuration());
    const response = adapter.validate(query());
    expect(evaluateVatIdEvidence({ expectedAdapterId: ADAPTER, query: query(), at: UNTIL, response }))
      .toMatchObject({ status: 'unusable', reason: 'expired', evidence: { checkedAt: AT, expiresAt: UNTIL } });
    expect(adapter.validate(query())).toEqual(response);
  });

  it('valida y copia todos los casos antes de devolver un adaptador inmutable', () => {
    const original = configuration();
    const adapter = createFixtureVatIdAdapter(original);
    original.adapterId = 'fixture.other';
    original.cases[0]!.query.identifier = 'CHANGED';
    original.cases[0]!.outcome = 'invalid';
    original.cases.length = 0;
    const response = adapter.validate(query());
    expect(response).toEqual({ status: 'evidence', evidence: evidence() });
    expect(Object.isFrozen(adapter)).toBe(true);
    expect(Object.isFrozen(response)).toBe(true);
    if (response.status !== 'evidence') throw new Error('Expected fixture evidence');
    expect(Object.isFrozen(response.evidence)).toBe(true);
    expect(Object.isFrozen(response.evidence.query)).toBe(true);
    expect(() => { (response.evidence.query as { identifier: string }).identifier = 'CHANGED'; }).toThrow();
    const other = createFixtureVatIdAdapter({ adapterId: ADAPTER, cases: [evidence('invalid')] });
    expect(other.validate(query())).toMatchObject({ evidence: { outcome: 'invalid' } });
    expect(adapter.validate(query())).toMatchObject({ evidence: { outcome: 'valid' } });
  });

  it('rechaza identidad repetida incluso con otro país o identificador', () => {
    for (const patch of [{}, { countryCode: 'FR' }, { identifier: 'OTHER123' }]) {
      const second = evidence('invalid');
      Object.assign(second.query, patch);
      expect(() => createFixtureVatIdAdapter({ adapterId: ADAPTER, cases: [evidence(), second] })).toThrow(TaxContractError);
    }
  });

  it('rechaza cualquier caso corrupto o de otro adaptador, aunque no se consulte', () => {
    for (const patch of [{ source: 'vies' }, { adapterId: 'fixture.other' }, { expiresAt: AT }, { outcome: 'exempt' }]) {
      const second = { ...evidence('valid', 'query.other'), ...patch };
      expect(() => createFixtureVatIdAdapter({ adapterId: ADAPTER, cases: [evidence(), second] })).toThrow(TaxContractError);
    }
  });

  it('permite 100 casos como máximo, sin descartar silenciosamente el último', () => {
    const cases = Array.from({ length: MAX_FIXTURE_VAT_ID_CASES }, (_, index) => evidence('valid', `query.n${index}`));
    const adapter = createFixtureVatIdAdapter({ adapterId: ADAPTER, cases });
    expect(adapter.validate(query('query.n99'))).toMatchObject({ status: 'evidence', evidence: { query: { id: 'query.n99' } } });
    expect(() => createFixtureVatIdAdapter({ adapterId: ADAPTER, cases: [...cases, evidence('valid', 'query.n100')] }))
      .toThrow(TaxContractError);
  });

  it('rechaza entradas ausentes, propiedades operativas, arrays dispersos y accesores sin ejecutarlos', () => {
    const getter = vi.fn(() => { throw new Error('Unexpected getter'); });
    const badCases = [evidence()];
    Object.defineProperty(badCases, '0', { get: getter });
    const badQuery = query();
    Object.defineProperty(badQuery, 'identifier', { get: getter });
    for (const invalid of [null, {}, { ...configuration(), endpoint: 'https://example.test' },
      { ...configuration(), cases: new Array(1) }, { ...configuration(), cases: badCases },
      { ...configuration(), get adapterId() { return getter(); } }]) {
      expect(() => createFixtureVatIdAdapter(invalid)).toThrow(TaxContractError);
    }
    expect(() => createFixtureVatIdAdapter(configuration()).validate(badQuery)).toThrow(TaxContractError);
    expect(getter).not.toHaveBeenCalled();
  });

  it('errores no revelan identificador ni escriben logs; factory y lookup son síncronos y sin efectos', () => {
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
    const adapter = createFixtureVatIdAdapter(configuration());
    expect(adapter.validate(query())).toMatchObject({ status: 'evidence' });
    expect(adapter.validate(query('query.absent'))).toMatchObject({ status: 'unavailable', evidence: null });
    try { adapter.validate({ ...query(), identifier: 'PRIVATE VAT 987654321' }); throw new Error('Expected rejection'); }
    catch (caught) {
      expect(caught).toBeInstanceOf(TaxContractError);
      expect(String(caught)).not.toContain('PRIVATE VAT 987654321');
    }
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
