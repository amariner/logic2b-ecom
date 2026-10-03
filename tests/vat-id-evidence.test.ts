import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  VAT_ID_OUTCOMES, TaxContractError, defineVatIdQuery, defineVatIdEvidence, defineVatIdValidationResponse,
  evaluateVatIdEvidence, type VatIdOutcome,
} from '../src/modules/taxes';

const CHECKED = '2026-10-03T12:00:00.000Z';
const EXPIRES = '2026-10-04T12:00:00.000Z';
const AT = '2026-10-03T15:00:00.000Z';
const ADAPTER = 'fixture.vat';

function query() {
  return { schemaVersion: 1, id: 'query.one', countryCode: 'ES', identifier: 'FICTIONAL123' };
}
function evidence(outcome: VatIdOutcome = 'valid') {
  return { source: 'fixture', adapterId: ADAPTER, query: query(), evidenceRef: 'evidence.one',
    checkedAt: CHECKED, expiresAt: EXPIRES, outcome };
}
function input(outcome: VatIdOutcome = 'valid') {
  return { expectedAdapterId: ADAPTER, query: query(), at: AT, response: { status: 'evidence', evidence: evidence(outcome) } };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('consulta y evidencia VAT ficticia R5.10a', () => {
  it('el vocabulario público es inmutable y no permite introducir estados fiscales', () => {
    expect(Object.isFrozen(VAT_ID_OUTCOMES)).toBe(true);
    expect(() => { (VAT_ID_OUTCOMES as unknown as string[]).push('exempt'); }).toThrow();
    expect(VAT_ID_OUTCOMES).toEqual(['valid', 'invalid', 'unavailable', 'unsupported']);
    expect(() => defineVatIdEvidence({ ...evidence(), outcome: 'exempt' })).toThrow(TaxContractError);
  });

  it('valida estructura canónica, sin verificar formato VAT real ni inferir país del identificador', () => {
    const supplied = { ...query(), countryCode: 'ZZ', identifier: 'A' };
    const normalized = defineVatIdQuery(supplied);
    expect(normalized).toEqual(supplied);
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(normalized).not.toBe(supplied);
    expect(defineVatIdQuery({ ...query(), identifier: 'A'.repeat(32), id: 'a'.repeat(100) })).toBeDefined();
  });

  it.each([
    { schemaVersion: 2 }, { id: '' }, { id: 'UPPER' }, { id: 'a'.repeat(101) },
    { countryCode: 'es' }, { countryCode: ' ES' }, { countryCode: 'ESP' }, { countryCode: 34 },
    { identifier: '' }, { identifier: 'fictional' }, { identifier: ' FICTIONAL123' }, { identifier: 'FICTIONAL-123' },
    { identifier: 'FICTÍONAL123' }, { identifier: 'A'.repeat(33) }, { identifier: 123 },
    { exempt: true },
  ])('rechaza entrada no canónica sin normalizarla: %o', (invalid) => {
    expect(() => defineVatIdQuery({ ...query(), ...invalid })).toThrow(TaxContractError);
  });

  it('distingue positivo de negativo conocido; ninguno concede exención ni condición empresarial', () => {
    for (const outcome of ['valid', 'invalid'] as const) {
      const result = evaluateVatIdEvidence(input(outcome));
      expect(result).toMatchObject({ status: 'usable', outcome, adapterId: ADAPTER, at: AT,
        query: query(), evidence: { source: 'fixture', outcome, evidenceRef: 'evidence.one' } });
      expect(Object.keys(result).sort()).toEqual(['adapterId', 'at', 'evidence', 'outcome', 'query', 'status']);
      for (const property of ['exempt', 'reverseCharge', 'b2b', 'jurisdiction', 'taxRate']) expect(result).not.toHaveProperty(property);
    }
  });

  it.each(['unavailable', 'unsupported'] as const)('conserva %s como resultado no utilizable, nunca como invalid', (outcome) => {
    const result = evaluateVatIdEvidence(input(outcome));
    expect(result).toMatchObject({ status: 'unusable', reason: outcome, evidence: { outcome } });
    expect(result).not.toHaveProperty('outcome');
  });

  it.each([
    ['2026-10-03T11:59:59.999Z', 'unusable', 'future'],
    [CHECKED, 'usable', null],
    ['2026-10-04T11:59:59.999Z', 'usable', null],
    [EXPIRES, 'unusable', 'expired'],
    ['2026-10-04T12:00:00.001Z', 'unusable', 'expired'],
  ])('respeta el intervalo semiabierto con at=%s', (at, status, reason) => {
    const result = evaluateVatIdEvidence({ ...input(), at });
    expect(result.status).toBe(status);
    if (reason) expect(result).toHaveProperty('reason', reason);
    else expect(result).toHaveProperty('outcome', 'valid');
  });

  it('también caduca la evidencia negativa y evalúa la ventana antes del estado declarado', () => {
    for (const outcome of ['invalid', 'unavailable', 'unsupported'] as const) {
      expect(evaluateVatIdEvidence({ ...input(outcome), at: EXPIRES }))
        .toMatchObject({ status: 'unusable', reason: 'expired', evidence: { outcome } });
      expect(evaluateVatIdEvidence({ ...input(outcome), at: '2026-10-03T11:00:00.000Z' }))
        .toMatchObject({ status: 'unusable', reason: 'future', evidence: { outcome } });
    }
  });

  it('ausencia de configuración no inventa comprobación ni timestamps', () => {
    const response = { status: 'unavailable', reason: 'not_configured', adapterId: ADAPTER, query: query(), evidence: null };
    expect(defineVatIdValidationResponse(response)).toEqual(response);
    const result = evaluateVatIdEvidence({ ...input(), response });
    expect(result).toEqual({ status: 'unusable', reason: 'not_configured', adapterId: ADAPTER,
      query: query(), at: AT, evidence: null });
    for (const key of ['evidenceRef', 'checkedAt', 'expiresAt', 'outcome']) expect(result).not.toHaveProperty(key);
    expect(() => defineVatIdValidationResponse({ ...response, checkedAt: CHECKED })).toThrow(TaxContractError);
  });

  it.each([
    { adapterId: 'fixture.other' }, { query: { ...query(), id: 'query.other' } },
    { query: { ...query(), countryCode: 'FR' } }, { query: { ...query(), identifier: 'OTHER123' } },
  ])('exige correlación exacta de evidencia y rechaza respuesta ajena: %o', (patch) => {
    expect(() => evaluateVatIdEvidence({ ...input(), response: { status: 'evidence', evidence: { ...evidence(), ...patch } } }))
      .toThrow(TaxContractError);
  });

  it('exige la misma correlación incluso cuando no existe evidencia', () => {
    const response = { status: 'unavailable', reason: 'not_configured', adapterId: ADAPTER, query: query(), evidence: null };
    for (const patch of [{ adapterId: 'fixture.other' }, { query: { ...query(), id: 'query.other' } },
      { query: { ...query(), countryCode: 'FR' } }, { query: { ...query(), identifier: 'OTHER123' } }]) {
      expect(() => evaluateVatIdEvidence({ ...input(), response: { ...response, ...patch } })).toThrow(TaxContractError);
    }
  });

  it.each([
    { source: 'vies' }, { adapterId: 'Fixture' }, { evidenceRef: '' }, { evidenceRef: 'a'.repeat(101) },
    { checkedAt: '2026-02-30T12:00:00.000Z' }, { checkedAt: '2026-10-03T12:00:00Z' },
    { expiresAt: '2026-10-04T12:00:00+00:00' }, { expiresAt: CHECKED },
    { expiresAt: '2026-10-03T11:59:59.999Z' }, { outcome: 'exempt' }, { exemption: true },
  ])('rechaza evidencia corrupta: %o', (patch) => {
    expect(() => defineVatIdEvidence({ ...evidence(), ...patch })).toThrow(TaxContractError);
  });

  it.each([
    { at: undefined }, { at: '2026-02-30T12:00:00.000Z' }, { at: '2026-10-03T12:00:00Z' },
    { expectedAdapterId: '' }, { response: { status: 'valid' } },
    { response: { status: 'unavailable', reason: 'timeout', adapterId: ADAPTER, query: query(), evidence: null } },
    { response: { status: 'unavailable', reason: 'not_configured', adapterId: ADAPTER, query: query(), evidence: evidence() } },
    { response: { status: 'evidence', evidence: evidence(), exempt: true } },
  ])('no transforma un contrato inválido en indisponibilidad: %o', (patch) => {
    expect(() => evaluateVatIdEvidence({ ...input(), ...patch })).toThrow(TaxContractError);
  });

  it('copia y congela la consulta, evidencia y resultado antes de exponerlos', () => {
    const request = input();
    const result = evaluateVatIdEvidence(request);
    request.query.identifier = 'CHANGED1';
    request.response.evidence.query.identifier = 'CHANGED2';
    request.response.evidence.outcome = 'invalid';
    request.at = EXPIRES;
    expect(result).toMatchObject({ at: AT, query: query(), status: 'usable', outcome: 'valid',
      evidence: { query: query(), outcome: 'valid' } });
    for (const object of [result, result.query, result.evidence, result.evidence?.query]) expect(Object.isFrozen(object)).toBe(true);
    expect(() => { (result.query as { identifier: string }).identifier = 'CHANGED'; }).toThrow();
    const response = defineVatIdValidationResponse({ status: 'evidence', evidence: evidence() });
    expect(Object.isFrozen(response)).toBe(true);
  });

  it('rechaza getters en cada nivel sin ejecutarlos ni interpolar el identificador en errores', () => {
    const getter = vi.fn(() => { throw new Error('Must not execute'); });
    for (const target of ['evaluation', 'response', 'evidence', 'query']) {
      const request = input();
      const object = target === 'evaluation' ? request : target === 'response' ? request.response
        : target === 'evidence' ? request.response.evidence : request.response.evidence.query;
      const key = target === 'evaluation' ? 'at' : target === 'response' ? 'status' : target === 'evidence' ? 'outcome' : 'identifier';
      Object.defineProperty(object, key, { enumerable: true, get: getter });
      expect(() => evaluateVatIdEvidence(request)).toThrow(TaxContractError);
    }
    expect(getter).not.toHaveBeenCalled();
    for (const value of ['PRIVATE VAT 987654321', 'private987654321']) {
      try { defineVatIdQuery({ ...query(), identifier: value }); throw new Error('Expected rejection'); }
      catch (error) {
        expect(error).toBeInstanceOf(TaxContractError);
        expect(String(error)).not.toContain(value);
      }
    }
    try { evaluateVatIdEvidence({ ...input(), query: { ...query(), identifier: 'PRIVATE987654321' } }); }
    catch (error) { expect(String(error)).not.toContain('PRIVATE987654321'); }
  });

  it('no consulta reloj actual, red, almacenamiento ni temporizadores', () => {
    const request = input();
    const expected = evaluateVatIdEvidence(request);
    const unexpected = () => { throw new Error('Unexpected effect'); };
    vi.spyOn(Date, 'now').mockImplementation(unexpected);
    vi.stubGlobal('fetch', unexpected);
    vi.stubGlobal('setTimeout', unexpected);
    vi.stubGlobal('localStorage', { getItem: unexpected, setItem: unexpected });
    vi.stubGlobal('sessionStorage', { getItem: unexpected, setItem: unexpected });
    expect(evaluateVatIdEvidence(request)).toEqual(expected);
  });
});
