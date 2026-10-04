import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COMPANY_CREDIT_LIMITS, CompanyCreditContractError,
  defineCompanyCreditPolicy, defineCompanyCreditRequest, defineCompanyCreditExposureEvidence, previewCompanyCredit,
  type CompanyCreditContractReason, type CompanyContactIdentityRef,
} from '../src/modules/companies';

const AT = '2026-10-03T12:00:00.000Z';
const OBSERVED = '2026-10-02T10:00:00.000Z';
const MAX = Number.MAX_SAFE_INTEGER;
function fixture() {
  const directoryRef = { id: 'directory.fixture', version: 3, capturedAt: AT };
  const request = { schemaVersion: 1, source: 'fixture', profile: 'company-credit-eur-cents-v1', id: 'request.fixture', version: 2,
    directoryRef: { ...directoryRef }, policyRef: { id: 'credit.fixture', version: 4 }, companyId: 'company.a',
    buyerContactId: 'contact.a', currency: 'EUR', amountCents: 2000 };
  return {
    directory: { schemaVersion: 1, source: 'fixture', ...directoryRef, companies: [
      { id: 'company.a', displayName: 'Empresa A', state: 'active', vatId: null },
      { id: 'company.b', displayName: 'Empresa B', state: 'inactive', vatId: null },
    ], sites: [], contacts: [
      { id: 'contact.a', companyId: 'company.a', displayName: 'Contacto A', state: 'active', identityRef: null as CompanyContactIdentityRef | null },
      { id: 'contact.b', companyId: 'company.b', displayName: 'Contacto B', state: 'inactive', identityRef: null as CompanyContactIdentityRef | null },
    ], roles: [], assignments: [] },
    policy: { schemaVersion: 1, source: 'fixture', profile: 'company-credit-eur-cents-v1', id: 'credit.fixture', version: 4,
      directoryRef: { ...directoryRef }, currency: 'EUR', companyExposureLimits: [{ companyId: 'company.a', limitCents: 10000 }],
      companyRequestLimits: [{ companyId: 'company.a', limitCents: 5000 }],
      buyerLimits: [{ companyId: 'company.a', contactId: 'contact.a', requestLimitCents: 3000 }] },
    request, evaluatedAt: AT,
    evidence: { schemaVersion: 1, source: 'fixture', id: 'exposure.fixture', version: 5, excludedRequest: structuredClone(request),
      observedAt: OBSERVED, coverage: 'complete', companyExposureCents: 6000 },
  };
}
function correlate(input: ReturnType<typeof fixture>): void { input.evidence.excludedRequest = structuredClone(input.request); }
function incomplete(input = fixture()) {
  const { companyExposureCents: _amount, ...common } = input.evidence; return { ...common, coverage: 'incomplete' };
}
function errorFrom(operation: () => unknown): CompanyCreditContractError {
  try { operation(); } catch (error) {
    expect(error).toBeInstanceOf(CompanyCreditContractError); return error as CompanyCreditContractError;
  }
  throw new Error('Se esperaba un error de contrato.');
}
function reason(operation: () => unknown, expected: CompanyCreditContractReason = 'invalid_data'): void {
  expect(errorFrom(operation)).toMatchObject({ code: 'company_credit_contract_invalid', reason: expected });
}
function frozen(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true); for (const child of Object.values(value)) frozen(child);
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('tres comparaciones independientes, sin decisión de aprobación', () => {
  it('suma una sola vez la solicitud excluida y conserva el corte observado y las tres diferencias', () => {
    const input = fixture(); const result = previewCompanyCredit(input);
    expect(result).toEqual({ source: 'fixture', profile: 'company-credit-eur-cents-v1', request: input.request,
      policyRef: { id: 'credit.fixture', version: 4 }, evaluatedAt: AT,
      context: { company: { id: 'company.a', state: 'active' }, buyer: { contactId: 'contact.a', state: 'active' }, inactiveReasons: [] },
      exposure: { outcome: 'observed', reason: null, evidence: { id: 'exposure.fixture', version: 5, coverage: 'complete', observedAt: OBSERVED },
        amounts: { asOf: OBSERVED, companyExposureCents: 6000, companyExposureWithRequestCents: 8000 } },
      comparisons: {
        companyExposure: { status: 'compared', limitCents: 10000, comparedCents: 8000, differenceCents: 2000, position: 'below_limit', reason: null },
        requestAmount: { status: 'compared', limitCents: 5000, comparedCents: 2000, differenceCents: 3000, position: 'below_limit', reason: null },
        buyerAmount: { status: 'compared', limitCents: 3000, comparedCents: 2000, differenceCents: 1000, position: 'below_limit', reason: null },
      } });
    expect(result.request).not.toBe(input.request); frozen(result);
    for (const key of ['outcome', 'approved', 'eligible', 'available', 'reservedCents', 'currentBalance']) expect(result).not.toHaveProperty(key);
  });

  it.each([
    [false, false, false], [true, false, false], [false, true, false], [false, false, true],
    [true, true, false], [true, false, true], [false, true, true], [true, true, true],
  ])('presencia exposición %s / solicitud %s / comprador %s no configura otra dimensión', (exposure, request, buyer) => {
    const input = fixture();
    if (!exposure) input.policy.companyExposureLimits = [];
    if (!request) input.policy.companyRequestLimits = [];
    if (!buyer) input.policy.buyerLimits = [];
    const result = previewCompanyCredit(input);
    expect(result.comparisons.companyExposure).toMatchObject({ status: exposure ? 'compared' : 'unconfigured',
      limitCents: exposure ? 10000 : null, comparedCents: 8000, differenceCents: exposure ? 2000 : null });
    expect(result.comparisons.requestAmount).toMatchObject({ status: request ? 'compared' : 'unconfigured',
      limitCents: request ? 5000 : null, comparedCents: 2000, differenceCents: request ? 3000 : null });
    expect(result.comparisons.buyerAmount).toMatchObject({ status: buyer ? 'compared' : 'unconfigured',
      limitCents: buyer ? 3000 : null, comparedCents: 2000, differenceCents: buyer ? 1000 : null });
    const missing = previewCompanyCredit({ ...input, evidence: null });
    expect(missing.comparisons.companyExposure).toMatchObject({ status: exposure ? 'unknown' : 'unconfigured', comparedCents: null,
      limitCents: exposure ? 10000 : null, reason: exposure ? 'missing_evidence' : 'limit_unconfigured' });
    expect(missing.comparisons.requestAmount).toEqual(result.comparisons.requestAmount);
    expect(missing.comparisons.buyerAmount).toEqual(result.comparisons.buyerAmount);
    expect(missing.exposure).toEqual({ outcome: 'unknown', reason: 'missing_evidence', evidence: null, amounts: null });
  });

  it.each([
    [8000, 2000, 'equal_limit', 0, 'below_limit', 3000, 'below_limit', 1000],
    [8001, 2000, 'above_limit', -1, 'below_limit', 3000, 'below_limit', 1000],
    [0, 3000, 'below_limit', 7000, 'below_limit', 2000, 'equal_limit', 0],
    [0, 3001, 'below_limit', 6999, 'below_limit', 1999, 'above_limit', -1],
    [0, 5000, 'below_limit', 5000, 'equal_limit', 0, 'above_limit', -2000],
    [0, 5001, 'below_limit', 4999, 'above_limit', -1, 'above_limit', -2001],
  ] as const)('exposición %i + solicitud %i conserva bordes y diferencias independientes', (exposure, amount, ePos, eDiff, rPos, rDiff, bPos, bDiff) => {
    const input = fixture(); input.request.amountCents = amount; correlate(input); input.evidence.companyExposureCents = exposure;
    const result = previewCompanyCredit(input).comparisons;
    expect(result.companyExposure).toMatchObject({ position: ePos, differenceCents: eDiff });
    expect(result.requestAmount).toMatchObject({ position: rPos, differenceCents: rDiff });
    expect(result.buyerAmount).toMatchObject({ position: bPos, differenceCents: bDiff });
  });

  it('límite cero y solicitud cero son explícitos; ausencia de evidencia no los convierte en aprobación', () => {
    const input = fixture(); input.request.amountCents = 0; correlate(input); input.evidence.companyExposureCents = 0;
    input.policy.companyExposureLimits[0]!.limitCents = 0; input.policy.companyRequestLimits[0]!.limitCents = 0;
    input.policy.buyerLimits[0]!.requestLimitCents = 0;
    const result = previewCompanyCredit(input);
    for (const comparison of Object.values(result.comparisons)) expect(comparison).toMatchObject({ status: 'compared',
      limitCents: 0, comparedCents: 0, differenceCents: 0, position: 'equal_limit' });
    expect(result.exposure.amounts).toMatchObject({ companyExposureCents: 0, companyExposureWithRequestCents: 0 });
    expect(previewCompanyCredit({ ...input, evidence: null }).comparisons.companyExposure).toMatchObject({ status: 'unknown', limitCents: 0 });
    input.request.amountCents = 1; correlate(input);
    for (const comparison of Object.values(previewCompanyCredit(input).comparisons)) expect(comparison).toMatchObject({ position: 'above_limit', differenceCents: -1 });
  });

  it('conserva extremos seguros y diferencias firmadas sin pérdida de precisión', () => {
    const input = fixture(); input.request.amountCents = 0; correlate(input); input.evidence.companyExposureCents = MAX;
    input.policy.companyExposureLimits[0]!.limitCents = 0;
    expect(previewCompanyCredit(input).comparisons.companyExposure).toMatchObject({ comparedCents: MAX, differenceCents: -MAX });
    input.request.amountCents = MAX; correlate(input); input.evidence.companyExposureCents = 0;
    input.policy.companyRequestLimits[0]!.limitCents = 0; input.policy.buyerLimits[0]!.requestLimitCents = MAX;
    const result = previewCompanyCredit(input);
    expect(result.comparisons.requestAmount).toMatchObject({ comparedCents: MAX, differenceCents: -MAX });
    expect(result.comparisons.buyerAmount).toMatchObject({ comparedCents: MAX, differenceCents: 0, position: 'equal_limit' });
    expect(result.exposure.amounts?.companyExposureWithRequestCents).toBe(MAX);
    expect(COMPANY_CREDIT_LIMITS.moneyCents).toBe(MAX);
  });

  it('rechaza overflow en factory y antes de futuro, inactividad o ausencia de límites', () => {
    const input = fixture(); input.request.amountCents = 1; correlate(input); input.evidence.companyExposureCents = MAX;
    reason(() => defineCompanyCreditExposureEvidence(input.evidence), 'exposure_overflow');
    input.evidence.observedAt = '2099-01-01T00:00:00.000Z';
    reason(() => previewCompanyCredit(input), 'exposure_overflow');
    input.directory.companies[0]!.state = 'inactive'; input.directory.contacts[0]!.state = 'inactive';
    input.policy.companyExposureLimits = []; input.policy.companyRequestLimits = []; input.policy.buyerLimits = [];
    reason(() => previewCompanyCredit(input), 'exposure_overflow');
  });

  it('valida enteros seguros sin coerción en todos los campos monetarios', () => {
    const input = fixture();
    for (const value of [-1, -0, 0.1, MAX + 1, NaN, Infinity, '0', null]) {
      reason(() => defineCompanyCreditRequest({ ...input.request, amountCents: value }));
      reason(() => defineCompanyCreditExposureEvidence({ ...input.evidence, companyExposureCents: value }));
      reason(() => defineCompanyCreditPolicy({ ...input.policy, companyExposureLimits: [{ companyId: 'company.a', limitCents: value }] }));
      reason(() => defineCompanyCreditPolicy({ ...input.policy, companyRequestLimits: [{ companyId: 'company.a', limitCents: value }] }));
      reason(() => defineCompanyCreditPolicy({ ...input.policy, buyerLimits: [{ companyId: 'company.a', contactId: 'contact.a', requestLimitCents: value }] }));
    }
  });
});

describe('evidencia correlacionada, desconocido y tiempo explícito', () => {
  it('incomplete no admite importes parciales ni declaraciones de inclusión ambiguas', () => {
    const input = fixture(); const evidence = incomplete(input);
    expect(previewCompanyCredit({ ...input, evidence }).exposure).toEqual({ outcome: 'unknown', reason: 'incomplete_evidence', amounts: null,
      evidence: { id: 'exposure.fixture', version: 5, coverage: 'incomplete', observedAt: OBSERVED } });
    for (const extra of [{ companyExposureCents: 0 }, { companyExposureCents: undefined }, { includedRequest: input.request }]) {
      reason(() => defineCompanyCreditExposureEvidence({ ...evidence, ...extra }));
    }
    reason(() => defineCompanyCreditExposureEvidence({ ...input.evidence, includedRequest: input.request }));
    reason(() => previewCompanyCredit({ ...input, evidence: undefined }));
  });

  it('futuro tiene prioridad sobre incomplete y la igualdad temporal permite el corte completo', () => {
    const input = fixture(); input.evidence.observedAt = AT; input.evaluatedAt = '2026-10-03T11:59:59.999Z';
    expect(previewCompanyCredit(input).exposure).toMatchObject({ outcome: 'unknown', reason: 'future_observation', amounts: null });
    expect(previewCompanyCredit({ ...input, evidence: incomplete(input) }).exposure.reason).toBe('future_observation');
    input.evaluatedAt = AT;
    expect(previewCompanyCredit(input).exposure).toMatchObject({ outcome: 'observed', amounts: { asOf: AT } });
    expect(previewCompanyCredit({ ...input, evidence: incomplete(input) }).exposure.reason).toBe('incomplete_evidence');
  });

  it('evaluar años después conserva asOf y cifras sin inventar disponibilidad actual o TTL', () => {
    const input = fixture(); const original = previewCompanyCredit(input);
    input.evaluatedAt = '9999-12-31T23:59:59.999Z'; const later = previewCompanyCredit(input);
    expect(later.exposure).toEqual(original.exposure); expect(later.comparisons).toEqual(original.comparisons);
    expect(later.request).toEqual(original.request); expect(later.evaluatedAt).not.toBe(original.evaluatedAt);
  });

  it('compara excludedRequest completo, también para evidencia futura e incompleta', () => {
    const input = fixture(); const changedRequests = [
      { ...input.request, id: 'request.other' }, { ...input.request, version: 3 }, { ...input.request, amountCents: 2001 },
      { ...input.request, companyId: 'company.b' }, { ...input.request, buyerContactId: 'contact.b' },
      { ...input.request, directoryRef: { ...input.request.directoryRef, id: 'directory.other' } },
      { ...input.request, directoryRef: { ...input.request.directoryRef, version: 4 } },
      { ...input.request, directoryRef: { ...input.request.directoryRef, capturedAt: OBSERVED } },
      { ...input.request, policyRef: { ...input.request.policyRef, id: 'credit.other' } },
      { ...input.request, policyRef: { ...input.request.policyRef, version: 5 } },
    ];
    for (const excludedRequest of changedRequests) {
      reason(() => previewCompanyCredit({ ...input, evidence: { ...input.evidence, excludedRequest } }), 'reference_mismatch');
      reason(() => previewCompanyCredit({ ...input, evidence: { ...incomplete(input), observedAt: '2099-01-01T00:00:00.000Z', excludedRequest } }), 'reference_mismatch');
    }
  });

  it('una revisión o importe nuevos requieren correlación explícita y no reinician la exposición', () => {
    const input = fixture(); input.request.version++; input.request.amountCents = 3000;
    reason(() => previewCompanyCredit(input), 'reference_mismatch'); correlate(input);
    expect(previewCompanyCredit(input).exposure.amounts).toMatchObject({ companyExposureCents: 6000, companyExposureWithRequestCents: 9000 });
  });

  it('perfil, esquema, moneda y procedencia inválidos fallan antes de correlación', () => {
    const input = fixture();
    for (const patch of [{ schemaVersion: 2 }, { profile: 'another-profile' }, { source: 'live' }, { currency: 'JPY' }]) {
      reason(() => defineCompanyCreditPolicy({ ...input.policy, ...patch }));
      reason(() => defineCompanyCreditRequest({ ...input.request, ...patch }));
      reason(() => previewCompanyCredit({ ...input, evidence: { ...input.evidence, excludedRequest: { ...input.request, ...patch } } }));
    }
  });

  it('capturedAt mantiene año cero del directorio, mientras observación/evaluación lo rechazan', () => {
    const input = fixture(); const zero = '0000-02-29T00:00:00.000Z';
    input.directory.capturedAt = zero; input.policy.directoryRef.capturedAt = zero; input.request.directoryRef.capturedAt = zero; correlate(input);
    expect(previewCompanyCredit(input).request.directoryRef.capturedAt).toBe(zero);
    reason(() => previewCompanyCredit({ ...input, evaluatedAt: zero }));
    reason(() => defineCompanyCreditExposureEvidence({ ...input.evidence, observedAt: zero }));
  });

  it('acepta años pequeños y bisiestos reales, rechaza fechas inexistentes o no canónicas', () => {
    const input = fixture();
    for (const date of ['0001-01-01T00:00:00.000Z', '0099-12-31T23:59:59.999Z', '2000-02-29T10:20:30.456Z', '9999-12-31T23:59:59.999Z']) {
      expect(previewCompanyCredit({ ...input, evaluatedAt: date, evidence: { ...input.evidence, observedAt: date } }).exposure.amounts?.asOf).toBe(date);
    }
    for (const date of ['1900-02-29T00:00:00.000Z', '2026-02-29T00:00:00.000Z', '2026-04-31T00:00:00.000Z',
      '2026-10-03', '2026-10-03T12:00:00Z', '2026-10-03T12:00:00.000+00:00', '2026-10-03T24:00:00.000Z',
      '+010000-01-01T00:00:00.000Z', ' 2026-10-03T12:00:00.000Z', null, undefined]) {
      reason(() => previewCompanyCredit({ ...input, evaluatedAt: date }));
      reason(() => defineCompanyCreditExposureEvidence({ ...input.evidence, observedAt: date }));
    }
  });
});

describe('referencias, propiedad y contexto descriptivo', () => {
  it.each([['active', 'active'], ['inactive', 'active'], ['active', 'inactive'], ['inactive', 'inactive']] as const)(
    'empresa %s y comprador %s conservan diagnósticos sin otorgar permisos', (companyState, buyerState) => {
      const input = fixture(); const baseline = previewCompanyCredit(input);
      input.directory.companies[0]!.state = companyState; input.directory.contacts[0]!.state = buyerState;
      const result = previewCompanyCredit(input);
      expect(result.context).toEqual({ company: { id: 'company.a', state: companyState }, buyer: { contactId: 'contact.a', state: buyerState },
        inactiveReasons: [...(companyState === 'inactive' ? ['company_inactive'] : []), ...(buyerState === 'inactive' ? ['buyer_inactive'] : [])] });
      expect(result.comparisons).toEqual(baseline.comparisons); expect(result.exposure).toEqual(baseline.exposure);
    });

  it('no deriva límites de roles ni fusiona contactos por identidad externa repetida', () => {
    const input = fixture(); const baseline = previewCompanyCredit(input);
    input.directory.contacts.forEach(contact => { contact.identityRef = { kind: 'email_identity', emailIdentityHash: 'a'.repeat(64) }; });
    const directory = { ...input.directory, roles: [{ id: 'role.owner', label: 'Propietario' }],
      assignments: [{ companyId: 'company.a', contactId: 'contact.a', roleId: 'role.owner', scope: { type: 'company' } }] };
    expect(previewCompanyCredit({ ...input, directory })).toEqual(baseline);
    input.request.companyId = 'company.b'; input.request.buyerContactId = 'contact.b'; correlate(input);
    const other = previewCompanyCredit({ ...input, directory });
    for (const comparison of Object.values(other.comparisons)) expect(comparison.status).toBe('unconfigured');
    expect(JSON.stringify(other)).not.toContain('emailIdentityHash'); expect(JSON.stringify(other)).not.toContain('role.owner');
  });

  it('distingue selección desconocida y comprador de otra empresa, incluso sin evidencia', () => {
    const input = fixture();
    reason(() => previewCompanyCredit({ ...input, evidence: null, request: { ...input.request, companyId: 'company.absent' } }), 'unknown_company');
    reason(() => previewCompanyCredit({ ...input, evidence: null, request: { ...input.request, buyerContactId: 'contact.absent' } }), 'unknown_buyer');
    reason(() => previewCompanyCredit({ ...input, evidence: null, request: { ...input.request, buyerContactId: 'contact.b' } }), 'cross_company_reference');
  });

  it('valida las tres colecciones completas incluyendo referencias ajenas o inactivas', () => {
    const input = fixture();
    for (const field of ['companyExposureLimits', 'companyRequestLimits'] as const) {
      reason(() => previewCompanyCredit({ ...input, evidence: null, policy: { ...input.policy,
        [field]: [...input.policy[field], { companyId: 'company.absent', limitCents: 0 }] } }), 'unknown_reference');
    }
    for (const rule of [{ companyId: 'company.absent', contactId: 'contact.b', requestLimitCents: 0 },
      { companyId: 'company.b', contactId: 'contact.absent', requestLimitCents: 0 }]) {
      reason(() => previewCompanyCredit({ ...input, evidence: null, policy: { ...input.policy, buyerLimits: [...input.policy.buyerLimits, rule] } }), 'unknown_reference');
    }
    reason(() => previewCompanyCredit({ ...input, evidence: null, policy: { ...input.policy,
      buyerLimits: [...input.policy.buyerLimits, { companyId: 'company.b', contactId: 'contact.a', requestLimitCents: 0 }] } }), 'cross_company_reference');
    input.policy.buyerLimits = []; input.policy.companyExposureLimits = []; input.policy.companyRequestLimits = [];
    reason(() => previewCompanyCredit({ ...input, evidence: null, directory: { ...input.directory,
      sites: [{ id: 'site.foreign', companyId: 'company.absent', label: 'Dato privado', state: 'inactive', countryCode: null }] } }));
  });

  it('compara id/version/capturedAt del directorio y ambos campos de policyRef exactamente', () => {
    const input = fixture(); const changes = [{ id: 'directory.other' }, { version: 4 }, { capturedAt: OBSERVED }];
    for (const patch of changes) {
      reason(() => previewCompanyCredit({ ...input, evidence: null, policy: { ...input.policy, directoryRef: { ...input.policy.directoryRef, ...patch } } }), 'reference_mismatch');
      reason(() => previewCompanyCredit({ ...input, evidence: null, request: { ...input.request, directoryRef: { ...input.request.directoryRef, ...patch } } }), 'reference_mismatch');
    }
    for (const patch of [{ id: 'credit.other' }, { version: 5 }]) {
      reason(() => previewCompanyCredit({ ...input, evidence: null, request: { ...input.request, policyRef: { ...input.request.policyRef, ...patch } } }), 'reference_mismatch');
    }
  });

  it('rechaza duplicados dentro de cada colección pero admite la misma empresa entre colecciones', () => {
    const input = fixture();
    reason(() => defineCompanyCreditPolicy({ ...input.policy, companyExposureLimits: [...input.policy.companyExposureLimits, { companyId: 'company.a', limitCents: 0 }] }), 'duplicate_company_exposure_limit');
    reason(() => defineCompanyCreditPolicy({ ...input.policy, companyRequestLimits: [...input.policy.companyRequestLimits, { companyId: 'company.a', limitCents: 0 }] }), 'duplicate_company_request_limit');
    reason(() => defineCompanyCreditPolicy({ ...input.policy, buyerLimits: [...input.policy.buyerLimits, { companyId: 'company.a', contactId: 'contact.a', requestLimitCents: 0 }] }), 'duplicate_buyer_limit');
    expect(defineCompanyCreditPolicy(input.policy).companyExposureLimits[0]?.companyId).toBe('company.a');
    expect(defineCompanyCreditPolicy(input.policy).companyRequestLimits[0]?.companyId).toBe('company.a');
  });

  it('acepta máximos simultáneos de 100/100/2000 y rechaza un registro adicional en cada array', () => {
    const input = fixture();
    const companies = Array.from({ length: 100 }, (_, i) => ({ id: `company.c${i}`, displayName: `Empresa ${i}`, state: 'active', vatId: null }));
    const contacts = companies.flatMap(company => Array.from({ length: 20 }, (_, i) => ({ id: `${company.id}.buyer${i}`,
      companyId: company.id, displayName: `Contacto ${i}`, state: 'active', identityRef: null })));
    const policy = { ...input.policy, companyExposureLimits: companies.map(company => ({ companyId: company.id, limitCents: MAX })),
      companyRequestLimits: companies.map(company => ({ companyId: company.id, limitCents: MAX })),
      buyerLimits: contacts.map(contact => ({ companyId: contact.companyId, contactId: contact.id, requestLimitCents: MAX })) };
    const request = { ...input.request, companyId: companies[0]!.id, buyerContactId: contacts[0]!.id };
    const result = previewCompanyCredit({ ...input, directory: { ...input.directory, companies, contacts }, policy, request, evidence: null });
    expect(result.comparisons.requestAmount).toMatchObject({ status: 'compared', limitCents: MAX });
    for (const field of ['companyExposureLimits', 'companyRequestLimits', 'buyerLimits'] as const) {
      reason(() => defineCompanyCreditPolicy({ ...policy, [field]: [...policy[field], policy[field][0]] }));
    }
    expect(COMPANY_CREDIT_LIMITS).toMatchObject({ companyExposureLimits: 100, companyRequestLimits: 100, buyerLimits: 2000 });
  });
});

describe('fronteras strict, copias canónicas y ausencia de efectos', () => {
  it('ordena reglas por identidad de forma estable sin mutar entradas y congela toda salida', () => {
    const input = fixture(); input.policy.companyExposureLimits.unshift({ companyId: 'company.b', limitCents: 0 });
    input.policy.companyRequestLimits.unshift({ companyId: 'company.b', limitCents: 1 });
    input.policy.buyerLimits.unshift({ companyId: 'company.b', contactId: 'contact.b', requestLimitCents: 2 });
    const policy = defineCompanyCreditPolicy(input.policy); const request = defineCompanyCreditRequest(input.request);
    const evidence = defineCompanyCreditExposureEvidence(input.evidence); const result = previewCompanyCredit(input);
    expect(policy.companyExposureLimits.map(rule => rule.companyId)).toEqual(['company.a', 'company.b']);
    expect(policy.companyRequestLimits.map(rule => rule.companyId)).toEqual(['company.a', 'company.b']);
    expect(policy.buyerLimits.map(rule => rule.contactId)).toEqual(['contact.a', 'contact.b']);
    expect(input.policy.companyExposureLimits[0]!.companyId).toBe('company.b');
    for (const output of [policy, request, evidence, result]) frozen(output);
    input.request.amountCents = 999; input.policy.companyExposureLimits[1]!.limitCents = 0;
    input.evidence.companyExposureCents = 99;
    expect(request.amountCents).toBe(2000); expect(evidence.excludedRequest.amountCents).toBe(2000);
    expect(result.exposure.amounts?.companyExposureCents).toBe(6000); expect(policy.companyExposureLimits[0]!.limitCents).toBe(10000);
    const reordered = Object.fromEntries(Object.entries(evidence.excludedRequest).reverse());
    const fresh = fixture(); expect(previewCompanyCredit({ ...fresh, evidence: { ...fresh.evidence, excludedRequest: reordered } }).comparisons).toEqual(result.comparisons);
  });

  it('no relee entradas normalizadas aunque otra entrada las altere durante la introspección', () => {
    const input = fixture(); const baseline = previewCompanyCredit(input);
    const evidence = new Proxy(input.evidence, { ownKeys(target) {
      input.directory.companies[0]!.state = 'inactive'; input.policy.companyExposureLimits[0]!.limitCents = 0;
      input.request.amountCents = 1; input.evaluatedAt = '0001-01-01T00:00:00.000Z';
      return Reflect.ownKeys(target);
    } });
    expect(previewCompanyCredit({ ...input, evidence })).toEqual(baseline);
    expect(input.request.amountCents).toBe(1);
  });

  it('rechaza campos extra, símbolos, propiedades ocultas y prototipos ajenos', () => {
    const input = fixture();
    for (const extra of [{ extra: undefined }, { [Symbol('private')]: 1 }]) {
      reason(() => defineCompanyCreditRequest({ ...input.request, ...extra }));
      reason(() => defineCompanyCreditPolicy({ ...input.policy, ...extra }));
      reason(() => defineCompanyCreditExposureEvidence({ ...input.evidence, ...extra }));
      reason(() => previewCompanyCredit({ ...input, ...extra }));
    }
    const hidden = { ...input.request }; Object.defineProperty(hidden, 'secret', { value: 'private', enumerable: false });
    reason(() => defineCompanyCreditRequest(hidden));
    reason(() => defineCompanyCreditRequest(Object.assign(Object.create({ inherited: true }) as object, input.request)));
    expect(defineCompanyCreditRequest(Object.assign(Object.create(null) as object, input.request))).toEqual(input.request);
    reason(() => defineCompanyCreditRequest({ ...input.request, directoryRef: { ...input.request.directoryRef, extra: undefined } }));
  });

  it('rechaza arrays dispersos, extendidos o con accesores sin ejecutar getters', () => {
    const input = fixture(); let getters = 0;
    const accessed = [input.policy.companyExposureLimits[0]];
    Object.defineProperty(accessed, '0', { enumerable: true, get() { getters++; throw new Error('private getter'); } });
    for (const values of [new Array(1), Object.assign([], { extra: true }), accessed, Object.setPrototypeOf([], null)]) {
      reason(() => defineCompanyCreditPolicy({ ...input.policy, companyExposureLimits: values }));
    }
    const request = { ...input.request }; Object.defineProperty(request, 'amountCents', { enumerable: true, get() { getters++; return 0; } });
    reason(() => defineCompanyCreditRequest(request));
    reason(() => previewCompanyCredit({ ...input, evidence: { ...input.evidence, excludedRequest: request } }));
    expect(getters).toBe(0);
  });

  it('IDs y versiones siguen el perfil explícito sin aceptar aliases ni campos ausentes', () => {
    const input = fixture();
    for (const value of ['', 'Company.A', 'a/b', 'a..b', 'a'.repeat(101), null]) {
      reason(() => defineCompanyCreditRequest({ ...input.request, id: value }));
      reason(() => defineCompanyCreditPolicy({ ...input.policy, id: value }));
    }
    for (const value of [0, -0, -1, 1.2, MAX + 1, '1', null]) {
      reason(() => defineCompanyCreditRequest({ ...input.request, version: value }));
      reason(() => defineCompanyCreditExposureEvidence({ ...input.evidence, version: value }));
    }
    expect(defineCompanyCreditRequest({ ...input.request, id: 'a'.repeat(100), version: MAX }).version).toBe(MAX);
    const { policyRef: _ref, ...missing } = input.request; reason(() => defineCompanyCreditRequest(missing));
  });

  it('redacta fallos del directorio, Proxy y errores hostiles sin leer mensajes ni reason getters', () => {
    const input = fixture(); const secret = 'PII customer@example.test / 999999'; let getters = 0;
    const hostileError = new CompanyCreditContractError('unknown_company');
    Object.defineProperty(hostileError, 'reason', { get() { getters++; throw new Error(secret); } });
    Object.defineProperty(hostileError, 'message', { get() { getters++; throw new Error(secret); } });
    for (const thrown of [new Error(secret), hostileError, new Proxy({}, { getPrototypeOf() { throw new Error(secret); } })]) {
      const directory = new Proxy(input.directory, { ownKeys() { throw thrown; } });
      const error = errorFrom(() => previewCompanyCredit({ ...input, directory }));
      expect(error.reason).toBe('invalid_data'); expect(error.message).not.toContain(secret);
      expect(error).not.toHaveProperty('cause');
    }
    const error = errorFrom(() => defineCompanyCreditRequest(new Proxy(input.request, { getPrototypeOf() { throw new Error(secret); } })));
    expect(error.reason).toBe('invalid_data'); expect(error.message).not.toContain(secret); expect(getters).toBe(0);
  });

  it('funciona con red, storage, timers y reloj implícito bloqueados', () => {
    const input = fixture(); const RealDate = Date; let effects = 0;
    const forbidden = () => { effects++; throw new Error('Efecto no permitido'); };
    class ExplicitDate extends RealDate {
      constructor(value?: string | number) { if (value === undefined) forbidden(); super(value!); }
      static override now(): number { return forbidden(); }
    }
    vi.stubGlobal('Date', ExplicitDate);
    for (const name of ['fetch', 'setTimeout', 'setInterval', 'queueMicrotask']) vi.stubGlobal(name, forbidden);
    for (const name of ['localStorage', 'sessionStorage']) vi.stubGlobal(name, { getItem: forbidden, setItem: forbidden, removeItem: forbidden });
    expect(previewCompanyCredit(input).comparisons.companyExposure).toMatchObject({ status: 'compared', differenceCents: 2000 });
    expect(defineCompanyCreditPolicy(input.policy).buyerLimits).toHaveLength(1); expect(effects).toBe(0);
  });
});
