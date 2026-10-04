import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COMPANY_COLLECTION_LIMITS, CompanyCollectionContractError, CompanyPaymentTermsContractError,
  defineCompanyCollectionObligation, defineCompanyCollectionRequest, defineCompanyCollectionEvidence,
  evaluateCompanyCollectionEvidence, previewCompanyCollection,
  type CompanyCollectionContractReason,
} from '../src/modules/companies';

const AT = '2026-10-03T12:00:00.000Z';
const OBSERVED = '2026-10-02T12:00:00.000Z';
function fixture() {
  const directoryRef = { id: 'directory.fixture', version: 3, capturedAt: AT };
  const obligation = { schemaVersion: 1, source: 'fixture', profile: 'company-applied-eur-cents-v1', id: 'obligation.fixture', version: 2,
    directoryRef: { ...directoryRef }, companyId: 'company.a', currency: 'EUR', amountCents: 10000,
    terms: { policyRef: { id: 'terms.fixture', version: 4 }, baseDate: '2026-10-03' } };
  return {
    directory: { schemaVersion: 1, source: 'fixture', ...directoryRef, companies: [
      { id: 'company.a', displayName: 'Empresa A', state: 'active', vatId: null },
      { id: 'company.b', displayName: 'Empresa B', state: 'inactive', vatId: null },
    ], sites: [], contacts: [], roles: [], assignments: [] },
    termsPolicy: { schemaVersion: 1, source: 'fixture', id: 'terms.fixture', version: 4, calendar: 'utc-civil-days-v1',
      directoryRef: { ...directoryRef }, assignments: [{ companyId: 'company.a', condition: { kind: 'net_days', days: 30 }, reminderOffsetsDays: [-7, 0, 5] }] },
    obligation, request: { schemaVersion: 1, id: 'evaluation.fixture', evaluatedAt: AT },
    evidence: { schemaVersion: 1, source: 'fixture', id: 'evidence.fixture', version: 5, obligation: structuredClone(obligation),
      observedAt: OBSERVED, coverage: 'complete', appliedCents: 4000, reversedCents: 0 },
  };
}
function evaluation(input = fixture(), evidence: unknown = input.evidence) {
  return evaluateCompanyCollectionEvidence({ obligation: input.obligation, request: input.request, evidence });
}
function incomplete(input = fixture()) {
  const { appliedCents: _applied, reversedCents: _reversed, ...common } = input.evidence;
  return { ...common, coverage: 'incomplete' };
}
function correlate(input: ReturnType<typeof fixture>): void { input.evidence.obligation = structuredClone(input.obligation); }
function errorFrom(operation: () => unknown): CompanyCollectionContractError {
  try { operation(); } catch (error) {
    expect(error).toBeInstanceOf(CompanyCollectionContractError); return error as CompanyCollectionContractError;
  }
  throw new Error('Se esperaba un error de contrato.');
}
function reason(operation: () => unknown, expected: CompanyCollectionContractReason = 'invalid_data'): void {
  expect(errorFrom(operation)).toMatchObject({ code: 'company_collection_contract_invalid', reason: expected });
}
function frozen(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true); for (const child of Object.values(value)) frozen(child);
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('comparación de importes declarados en evidencia completa', () => {
  it('el evaluador público conserva obligación completa y fecha observada sin depender del preview conjunto', () => {
    const input = fixture(); const result = evaluation(input);
    expect(result).toEqual({ source: 'fixture', profile: 'company-applied-eur-cents-v1', requestId: input.request.id,
      obligation: input.obligation, evaluatedAt: AT, outcome: 'observed', reason: null,
      evidence: { id: 'evidence.fixture', version: 5, coverage: 'complete', observedAt: OBSERVED },
      observedAmounts: { asOf: OBSERVED, appliedCents: 4000, reversedCents: 0, netAppliedCents: 4000,
        differenceCents: 6000, amountPosition: 'below_expected', reversalPosition: 'none' } });
    expect(result.obligation).not.toBe(input.obligation); frozen(result);
  });

  it.each([
    [10000, 0, 0, 0, 10000, 'below_expected', 'none'],
    [10000, 4000, 0, 4000, 6000, 'below_expected', 'none'],
    [10000, 10000, 0, 10000, 0, 'equal_expected', 'none'],
    [10000, 12500, 0, 12500, -2500, 'above_expected', 'none'],
    [10000, 15000, 2000, 13000, -3000, 'above_expected', 'partial'],
    [10000, 10000, 10000, 0, 10000, 'below_expected', 'full'],
    [0, 0, 0, 0, 0, 'equal_expected', 'none'],
    [0, 1, 0, 1, -1, 'above_expected', 'none'],
    [0, 7, 7, 0, 0, 'equal_expected', 'full'],
  ] as const)('esperado %i / aplicado %i / revertido %i conserva neto %i y diferencia %i', (expected, applied, reversed, net, difference, amountPosition, reversalPosition) => {
    const input = fixture(); input.obligation.amountCents = expected; correlate(input);
    input.evidence.appliedCents = applied; input.evidence.reversedCents = reversed;
    const result = evaluation(input);
    expect(result).toMatchObject({ outcome: 'observed', observedAmounts: { netAppliedCents: net, differenceCents: difference,
      amountPosition, reversalPosition, asOf: OBSERVED } });
    for (const key of ['paid', 'unpaid', 'overdue', 'balance', 'debt', 'authorized', 'refund', 'creditLimit']) expect(result).not.toHaveProperty(key);
  });

  it('conserva los extremos seguros exactos sin redondear ni limitar excesos', () => {
    const input = fixture(); const max = Number.MAX_SAFE_INTEGER;
    input.obligation.amountCents = max; correlate(input); input.evidence.appliedCents = max; input.evidence.reversedCents = 1;
    expect(evaluation(input).observedAmounts).toMatchObject({ netAppliedCents: max - 1, differenceCents: 1 });
    input.obligation.amountCents = 0; correlate(input); input.evidence.reversedCents = 0;
    expect(evaluation(input).observedAmounts).toMatchObject({ netAppliedCents: max, differenceCents: -max });
    input.obligation.amountCents = max; correlate(input); input.evidence.appliedCents = 0;
    expect(evaluation(input).observedAmounts).toMatchObject({ netAppliedCents: 0, differenceCents: max });
    expect(COMPANY_COLLECTION_LIMITS.moneyCents).toBe(max);
  });

  it('rechaza contadores incompatibles incluso antes de futuro, ausencia de condición o inactividad', () => {
    const input = fixture(); input.evidence.appliedCents = 1; input.evidence.reversedCents = 2;
    reason(() => defineCompanyCollectionEvidence(input.evidence), 'inconsistent_evidence');
    input.evidence.observedAt = '2099-01-01T00:00:00.000Z';
    reason(() => evaluation(input), 'inconsistent_evidence');
    input.termsPolicy.assignments = []; input.directory.companies[0]!.state = 'inactive';
    reason(() => previewCompanyCollection(input), 'inconsistent_evidence');
  });

  it('rechaza importes no enteros seguros en cada contador y en la obligación', () => {
    const input = fixture();
    for (const amount of [-1, -0, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '100', null]) {
      reason(() => defineCompanyCollectionObligation({ ...input.obligation, amountCents: amount }));
      reason(() => defineCompanyCollectionEvidence({ ...input.evidence, appliedCents: amount }));
      reason(() => defineCompanyCollectionEvidence({ ...input.evidence, reversedCents: amount }));
    }
  });
});

describe('ausencia, incompletitud y fecha de observación', () => {
  it('cero esperado sin evidencia sigue desconocido y mantiene su obligación autocontenida', () => {
    const input = fixture(); input.obligation.amountCents = 0;
    expect(evaluation(input, null)).toEqual({ source: 'fixture', profile: 'company-applied-eur-cents-v1', requestId: input.request.id,
      obligation: input.obligation, evaluatedAt: AT, outcome: 'unknown', reason: 'missing_evidence', evidence: null, observedAmounts: null });
  });

  it('evidencia incompleta conserva metadatos y no equivale a aplicación parcial completa', () => {
    const input = fixture(); const result = evaluation(input, incomplete(input));
    expect(result).toMatchObject({ outcome: 'unknown', reason: 'incomplete_evidence', observedAmounts: null,
      evidence: { coverage: 'incomplete', observedAt: OBSERVED }, obligation: input.obligation });
    expect(evaluation(input)).toMatchObject({ outcome: 'observed', observedAmounts: { netAppliedCents: 4000, differenceCents: 6000 } });
    for (const extra of [{ appliedCents: 0 }, { reversedCents: 0 }, { appliedCents: undefined }, { reversedCents: undefined }]) {
      reason(() => defineCompanyCollectionEvidence({ ...incomplete(input), ...extra }));
    }
  });

  it('distingue futuro por un milisegundo y permite igualdad exacta sin anticipar importes', () => {
    const input = fixture(); input.evidence.observedAt = AT; input.request.evaluatedAt = '2026-10-03T11:59:59.999Z';
    expect(evaluation(input)).toMatchObject({ outcome: 'unknown', reason: 'future_observation', observedAmounts: null,
      evidence: { coverage: 'complete', observedAt: AT }, obligation: input.obligation });
    expect(evaluation(input, incomplete(input))).toMatchObject({ reason: 'future_observation' });
    input.request.evaluatedAt = AT;
    expect(evaluation(input)).toMatchObject({ outcome: 'observed', observedAmounts: { asOf: AT } });
    expect(evaluation(input, incomplete(input))).toMatchObject({ reason: 'incomplete_evidence' });
  });

  it('avanzar la evaluación conserva el corte observado sin caducidad ni saldo actual inferido', () => {
    const input = fixture(); const amounts = evaluation(input).observedAmounts;
    for (const evaluatedAt of ['2026-11-02T00:00:00.000Z', '2040-01-01T00:00:00.000Z', '9999-12-31T23:59:59.999Z']) {
      input.request.evaluatedAt = evaluatedAt;
      expect(evaluation(input).observedAmounts).toEqual(amounts);
    }
    for (const extra of [{ usableUntil: AT }, { expiresAt: undefined }, { maximumAge: 1 }]) {
      reason(() => defineCompanyCollectionEvidence({ ...input.evidence, ...extra }));
    }
  });

  it.each(['0001-01-01T00:00:00.000Z', '0099-12-31T23:59:59.999Z', '2000-02-29T12:00:00.000Z', '9999-12-31T23:59:59.999Z'])('acepta instante canónico %s sin remapeo de años', at => {
    const input = fixture(); input.request.evaluatedAt = at; input.evidence.observedAt = at;
    expect(evaluation(input)).toMatchObject({ outcome: 'observed', evaluatedAt: at, observedAmounts: { asOf: at } });
  });

  it('rechaza fechas no canónicas y comparte exactamente la frontera civil de términos', () => {
    const input = fixture();
    for (const at of ['0000-01-01T00:00:00.000Z', '1900-02-29T00:00:00.000Z', '2026-02-30T00:00:00.000Z',
      '2026-10-03T12:00:00Z', '2026-10-03T14:00:00.000+02:00', ` ${AT}`, '2026-10-03']) {
      reason(() => defineCompanyCollectionRequest({ ...input.request, evaluatedAt: at }));
      reason(() => defineCompanyCollectionEvidence({ ...input.evidence, observedAt: at }));
    }
    for (const baseDate of ['0000-01-01', '1900-02-29', '2026-02-30', '2026-1-01', AT]) {
      reason(() => defineCompanyCollectionObligation({ ...input.obligation, terms: { ...input.obligation.terms, baseDate } }));
    }
    expect(defineCompanyCollectionObligation({ ...input.obligation, terms: { ...input.obligation.terms, baseDate: '0099-12-31' } }).terms.baseDate).toBe('0099-12-31');
  });
});

describe('correlación completa de la obligación', () => {
  it('rechaza toda alteración válida de contexto aunque conserve los demás identificadores', () => {
    const original = fixture().obligation;
    const alternatives = [
      { ...original, id: 'obligation.other' }, { ...original, version: 3 }, { ...original, amountCents: 10001 },
      { ...original, companyId: 'company.b' },
      ...[{ id: 'directory.other' }, { version: 4 }, { capturedAt: '2026-10-04T12:00:00.000Z' }].map(patch => ({ ...original, directoryRef: { ...original.directoryRef, ...patch } })),
      { ...original, terms: { ...original.terms, baseDate: '2026-10-04' } },
      ...[{ id: 'terms.other' }, { version: 5 }].map(patch => ({ ...original, terms: { ...original.terms, policyRef: { ...original.terms.policyRef, ...patch } } })),
    ];
    for (const obligation of alternatives) {
      const input = fixture(); input.evidence.obligation = obligation;
      reason(() => evaluation(input), 'reference_mismatch');
      input.evidence.observedAt = '2099-01-01T00:00:00.000Z';
      reason(() => evaluation(input, incomplete(input)), 'reference_mismatch');
    }
  });

  it('datos de perfil inválidos fallan antes de correlación y versiones nuevas no arrastran evidencia previa', () => {
    const input = fixture();
    for (const patch of [{ currency: 'JPY' }, { schemaVersion: 2 }, { source: 'bank' }, { profile: 'other' }]) {
      reason(() => evaluation(input, { ...input.evidence, obligation: { ...input.obligation, ...patch } }));
    }
    input.obligation.version = 3;
    reason(() => evaluation(input), 'reference_mismatch');
    expect(evaluation(input, null)).toMatchObject({ reason: 'missing_evidence', observedAmounts: null });
    correlate(input);
    expect(evaluation(input)).toMatchObject({ outcome: 'observed', obligation: { version: 3 }, observedAmounts: { netAppliedCents: 4000 } });
  });

  it('canoniza campos independientemente del orden y valida IDs/versiones en todas las fronteras', () => {
    const input = fixture(); const reversed = Object.fromEntries(Object.entries(input.evidence.obligation).reverse());
    expect(evaluation(input, { ...input.evidence, obligation: reversed }).outcome).toBe('observed');
    for (const version of [0, -0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, '1']) {
      reason(() => defineCompanyCollectionObligation({ ...input.obligation, version }));
      reason(() => defineCompanyCollectionEvidence({ ...input.evidence, version }));
    }
    for (const id of ['', 'UPPER', 'id/other', 'id..other', 'a'.repeat(101)]) {
      reason(() => defineCompanyCollectionObligation({ ...input.obligation, id }));
      reason(() => defineCompanyCollectionRequest({ ...input.request, id }));
      reason(() => defineCompanyCollectionEvidence({ ...input.evidence, id }));
    }
    expect(defineCompanyCollectionEvidence({ ...input.evidence, id: 'a'.repeat(100), version: Number.MAX_SAFE_INTEGER }).version).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe('calendario calculado desde evidencia y obligación normalizadas', () => {
  it('une los contratos reales sin duplicar obligación y conserva diagnósticos independientes', () => {
    const input = fixture(); const result = previewCompanyCollection(input);
    expect(result).toMatchObject({ source: 'fixture', profile: 'company-applied-eur-cents-v1', requestId: input.request.id,
      company: { id: 'company.a', state: 'active' }, calendar: { requestId: input.request.id, company: { id: 'company.a' },
        evaluationDate: '2026-10-03', baseDate: '2026-10-03', dueDate: '2026-11-02', duePosition: 'before_due' },
      collection: { requestId: input.request.id, obligation: input.obligation, outcome: 'observed' } });
    expect(result).not.toHaveProperty('obligation');
    expect(Object.keys(result).sort()).toEqual(['calendar', 'collection', 'company', 'profile', 'requestId', 'source']);
    const amounts = result.collection.observedAmounts;
    for (const [evaluatedAt, duePosition] of [['2026-11-02T00:00:00.000Z', 'on_due'], ['2026-11-03T00:00:00.000Z', 'after_due']]) {
      input.request.evaluatedAt = evaluatedAt!;
      const next = previewCompanyCollection(input);
      expect(next.calendar.duePosition).toBe(duePosition); expect(next.collection.observedAmounts).toEqual(amounts);
    }
    const unknown = previewCompanyCollection({ ...input, evidence: null });
    expect(unknown.calendar.duePosition).toBe('after_due'); expect(unknown.collection).toMatchObject({ outcome: 'unknown', observedAmounts: null });
  });

  it('admite observación previa a la base y evaluación de planificación anterior a ella', () => {
    const input = fixture(); input.request.evaluatedAt = OBSERVED;
    const result = previewCompanyCollection(input);
    expect(result.calendar.basePosition).toBe('before_base'); expect(result.collection.outcome).toBe('observed');
    expect(result.collection.observedAmounts?.asOf).toBe(OBSERVED);
  });

  it('empresa inactiva y condición ausente no borran una observación válida ni inventan condición', () => {
    const input = fixture(); input.directory.companies[0]!.state = 'inactive';
    expect(previewCompanyCollection(input)).toMatchObject({ company: { state: 'inactive' }, calendar: { outcome: 'configured' }, collection: { outcome: 'observed' } });
    input.termsPolicy.assignments = [];
    expect(previewCompanyCollection(input)).toMatchObject({ company: { state: 'inactive' }, calendar: { outcome: 'unconfigured', dueDate: null },
      collection: { outcome: 'observed', observedAmounts: { netAppliedCents: 4000 } } });
  });

  it('valida directorio y todas las condiciones incluso cuando la evidencia es unknown', () => {
    const input = fixture();
    const unknownEvidence: unknown[] = [null, incomplete(input), { ...input.evidence, observedAt: '2099-01-01T00:00:00.000Z' }];
    for (const evidence of unknownEvidence) {
      const policy = { ...input.termsPolicy, assignments: [{ ...input.termsPolicy.assignments[0], companyId: 'company.missing' }] };
      reason(() => previewCompanyCollection({ ...input, evidence, termsPolicy: policy }), 'unknown_reference');
      const directory = { ...input.directory, sites: [{ id: 'site.broken', companyId: 'company.absent', label: 'Sede', state: 'inactive', countryCode: null }] };
      reason(() => previewCompanyCollection({ ...input, evidence, directory }));
    }
    input.obligation.companyId = 'company.absent'; correlate(input);
    reason(() => previewCompanyCollection(input), 'unknown_company');
  });

  it('correlaciona directorio/política con sus artefactos completos y prohíbe calendario externo', () => {
    const input = fixture();
    for (const patch of [{ id: 'directory.other' }, { version: 4 }, { capturedAt: '2026-10-04T12:00:00.000Z' }]) {
      reason(() => previewCompanyCollection({ ...input, directory: { ...input.directory, ...patch } }), 'reference_mismatch');
    }
    for (const patch of [{ id: 'terms.other' }, { version: 5 }]) {
      reason(() => previewCompanyCollection({ ...input, termsPolicy: { ...input.termsPolicy, ...patch } }), 'reference_mismatch');
    }
    for (const extra of [{ calendar: {} }, { dueDate: '2000-01-01' }, { collectionStatus: 'paid' }]) reason(() => previewCompanyCollection({ ...input, ...extra }));
  });

  it('mapea errores cerrados de términos sin entregar una comparación monetaria parcial', () => {
    const input = fixture(); input.obligation.terms.baseDate = '9999-12-31'; correlate(input);
    reason(() => previewCompanyCollection(input), 'date_overflow');
    input.obligation.terms.baseDate = '2026-10-03'; correlate(input);
    input.termsPolicy.assignments.push(input.termsPolicy.assignments[0]!);
    reason(() => previewCompanyCollection(input), 'duplicate_assignment');
    input.termsPolicy.assignments.pop(); input.termsPolicy.assignments[0]!.reminderOffsetsDays = [0, 0];
    reason(() => previewCompanyCollection(input), 'duplicate_offset');
  });

  it('construye calendario exclusivamente desde collection normalizado aunque después se alteren originales', () => {
    const input = fixture();
    const directory = new Proxy(input.directory, { getPrototypeOf(target) {
      input.obligation.companyId = 'company.b'; input.obligation.terms.baseDate = '0001-01-01';
      input.obligation.amountCents = 999; input.obligation.terms.policyRef.version = 999;
      input.request.id = 'request.mutated'; input.request.evaluatedAt = '0001-01-01T00:00:00.000Z';
      return Object.getPrototypeOf(target);
    } });
    const result = previewCompanyCollection({ ...input, directory });
    expect(result).toMatchObject({ requestId: 'evaluation.fixture', company: { id: 'company.a' },
      calendar: { requestId: 'evaluation.fixture', baseDate: '2026-10-03', evaluationDate: '2026-10-03', dueDate: '2026-11-02' },
      collection: { obligation: { companyId: 'company.a', amountCents: 10000, terms: { policyRef: { version: 4 } } }, evaluatedAt: AT } });
    expect(input.obligation.amountCents).toBe(999);
  });
});

describe('frontera hostil y pureza', () => {
  it('congela copias independientes en todas las fábricas y en observed/unknown', () => {
    const input = fixture(); const before = JSON.stringify(input);
    const obligation = defineCompanyCollectionObligation(input.obligation); const request = defineCompanyCollectionRequest(input.request);
    const evidence = defineCompanyCollectionEvidence(input.evidence); const result = previewCompanyCollection(input);
    const unknown = evaluation(input, incomplete(input));
    for (const value of [obligation, request, evidence, result, unknown, COMPANY_COLLECTION_LIMITS]) frozen(value);
    expect(JSON.stringify(input)).toBe(before);
    input.obligation.amountCents = 0; input.evidence.appliedCents = 9000; input.evidence.obligation.terms.baseDate = '0001-01-01';
    input.request.evaluatedAt = '0001-01-01T00:00:00.000Z';
    expect(result.collection).toMatchObject({ obligation: { amountCents: 10000 }, evaluatedAt: AT, observedAmounts: { appliedCents: 4000 } });
    expect(unknown.obligation.amountCents).toBe(10000); expect(evidence.obligation.terms.baseDate).toBe('2026-10-03');
  });

  it('rechaza getters anidados y de errores sin ejecutarlos', () => {
    const getter = vi.fn(() => { throw new Error('private@example.test'); }); const input = fixture();
    const obligation = fixture().obligation; Object.defineProperty(obligation.terms, 'baseDate', { enumerable: true, get: getter });
    reason(() => defineCompanyCollectionObligation(obligation));
    const evidence = fixture().evidence; Object.defineProperty(evidence, 'appliedCents', { enumerable: true, get: getter });
    reason(() => defineCompanyCollectionEvidence(evidence));
    const request = fixture().request; Object.defineProperty(request, 'evaluatedAt', { enumerable: true, get: getter });
    reason(() => defineCompanyCollectionRequest(request));
    const error = new CompanyPaymentTermsContractError('date_overflow'); Object.defineProperty(error, 'reason', { get: getter });
    const hostile = new Proxy({}, { getPrototypeOf() { throw error; } });
    reason(() => previewCompanyCollection({ ...input, directory: hostile }));
    Object.defineProperty(input, 'evidence', { enumerable: true, get: getter }); reason(() => previewCompanyCollection(input));
    expect(getter).not.toHaveBeenCalled();
  });

  it('rechaza campos extra, prototipos, símbolos y variantes incompletas sin valores por defecto', () => {
    const input = fixture();
    for (const obligation of [null, [], Object.assign(Object.create({ inherited: 1 }), input.obligation),
      { ...input.obligation, extra: undefined }, { ...input.obligation, [Symbol('secret')]: true }]) reason(() => defineCompanyCollectionObligation(obligation));
    const hidden = { ...input.evidence }; Object.defineProperty(hidden, 'secret', { value: 'private', enumerable: false });
    reason(() => defineCompanyCollectionEvidence(hidden));
    for (const evidence of [undefined, {}, [], { ...input.evidence, coverage: 'partial' }, { ...incomplete(input), coverage: 'complete' }]) {
      reason(() => evaluateCompanyCollectionEvidence({ obligation: input.obligation, request: input.request, evidence }));
    }
    reason(() => defineCompanyCollectionRequest({ ...input.request, now: AT }));
    reason(() => evaluateCompanyCollectionEvidence({ obligation: input.obligation, request: input.request, evidence: null, directory: input.directory }));
    expect(defineCompanyCollectionObligation(Object.assign(Object.create(null), input.obligation))).toEqual(defineCompanyCollectionObligation(input.obligation));
  });

  it('redacta errores ajenos y Proxy sin reflejar valores ni causas', () => {
    const secret = 'private@example.test'; const input = fixture(); const hostile = new Proxy({}, { ownKeys() { throw new Error(secret); } });
    for (const operation of [() => defineCompanyCollectionObligation(hostile), () => defineCompanyCollectionRequest(hostile),
      () => defineCompanyCollectionEvidence(hostile), () => evaluation(input, hostile),
      () => previewCompanyCollection({ ...input, termsPolicy: hostile })]) {
      const error = errorFrom(operation); expect(error.reason).toBe('invalid_data'); expect(error.message).not.toContain(secret);
      expect(error).not.toHaveProperty('cause'); expect(JSON.stringify(error)).not.toContain(secret);
    }
    const error = new CompanyCollectionContractError(secret as CompanyCollectionContractReason);
    expect(error.reason).toBe('invalid_data'); expect(error.message).not.toContain(secret);
  });

  it('carece de efectos y usa exclusivamente instantes explícitos', () => {
    class ExplicitDate extends Date {
      constructor(value?: string | number) { if (value === undefined) throw new Error('Implicit clock'); super(value); }
      static override now(): never { throw new Error('Implicit clock'); }
    }
    const forbidden = vi.fn(() => { throw new Error('Unexpected effect'); }); vi.stubGlobal('Date', ExplicitDate);
    for (const name of ['fetch', 'setTimeout', 'setInterval']) vi.stubGlobal(name, forbidden);
    for (const name of ['localStorage', 'sessionStorage']) vi.stubGlobal(name, { getItem: forbidden, setItem: forbidden });
    const input = fixture(); expect(evaluation(input).outcome).toBe('observed');
    expect(previewCompanyCollection({ ...input, evidence: null }).collection.outcome).toBe('unknown');
    expect(previewCompanyCollection({ ...input, evidence: incomplete(input) }).collection.reason).toBe('incomplete_evidence');
    expect(forbidden).not.toHaveBeenCalled();
  });
});
