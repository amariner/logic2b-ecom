import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COMPANY_CREDIT_REVIEW_LIMITS, CompanyCreditReviewContractError,
  defineCompanyCreditReviewPolicy, defineCompanyCreditReviewCase, createCompanyCreditReviewCase,
  previewCompanyCreditReview, applyCompanyCreditReviewDecision, previewCompanyCredit,
  type CompanyCreditReviewContractReason, type CompanyCreditReviewSnapshot, type CompanyContactIdentityRef,
} from '../src/modules/companies';

const AT = '2026-10-03T12:00:00.000Z';
const FIRST = '2026-10-03T13:00:00.000Z';
const SECOND = '2026-10-03T14:00:00.000Z';
function fixture() {
  const directoryRef = { id: 'directory.fixture', version: 3, capturedAt: AT };
  const request = { schemaVersion: 1, source: 'fixture', profile: 'company-credit-eur-cents-v1', id: 'request.fixture', version: 2,
    directoryRef: { ...directoryRef }, policyRef: { id: 'credit.fixture', version: 4 }, companyId: 'company.a',
    buyerContactId: 'contact.buyer', currency: 'EUR', amountCents: 2000 };
  return {
    directory: { schemaVersion: 1, source: 'fixture', ...directoryRef, companies: [
      { id: 'company.a', displayName: 'Empresa A', state: 'active', vatId: null },
      { id: 'company.b', displayName: 'Empresa B', state: 'inactive', vatId: null },
    ], sites: [], contacts: ['contact.buyer', 'reviewer.one', 'reviewer.two', 'reviewer.three', 'reviewer.inactive', 'contact.unlisted', 'contact.foreign'].map(id => ({
      id, companyId: id === 'contact.foreign' ? 'company.b' : 'company.a', displayName: id,
      state: id === 'reviewer.inactive' ? 'inactive' : 'active', identityRef: null as CompanyContactIdentityRef | null,
    })), roles: [], assignments: [] },
    creditPolicy: { schemaVersion: 1, source: 'fixture', profile: 'company-credit-eur-cents-v1', id: 'credit.fixture', version: 4,
      directoryRef: { ...directoryRef }, currency: 'EUR', companyExposureLimits: [{ companyId: 'company.a', limitCents: 10000 }],
      companyRequestLimits: [{ companyId: 'company.a', limitCents: 5000 }],
      buyerLimits: [{ companyId: 'company.a', contactId: 'contact.buyer', requestLimitCents: 3000 }] },
    request, evaluatedAt: AT,
    evidence: { schemaVersion: 1, source: 'fixture', id: 'exposure.fixture', version: 5, excludedRequest: structuredClone(request),
      observedAt: '2026-10-02T10:00:00.000Z', coverage: 'complete', companyExposureCents: 6000 },
    reviewPolicy: { schemaVersion: 1, source: 'fixture', profile: 'company-credit-review-v1', id: 'review.fixture', version: 5,
      directoryRef: { ...directoryRef }, companyId: 'company.a', reviewerContactIds: ['reviewer.one', 'reviewer.two', 'reviewer.three'],
      buyerSeparation: 'required', quorum: 2 },
  };
}
function open(context: unknown = fixture(), createdAt = AT, id = 'case.fixture'): CompanyCreditReviewSnapshot {
  const result = createCompanyCreditReviewCase({ id, createdAt, context });
  expect(result.outcome).toBe('created'); if (result.outcome !== 'created') throw new Error('No se abrió el expediente de prueba.');
  return result.snapshot;
}
function command(snapshot: CompanyCreditReviewSnapshot, reviewerContactId = 'reviewer.one', decision: 'accept' | 'reject' = 'accept', occurredAt = FIRST) {
  return { id: `decision.v${snapshot.case.version}.${reviewerContactId}`, caseId: snapshot.case.id,
    expectedVersion: snapshot.case.version, reviewerContactId, decision, occurredAt };
}
function apply(snapshot: CompanyCreditReviewSnapshot, value: unknown) {
  return applyCompanyCreditReviewDecision({ case: snapshot.case, context: snapshot.case.context, command: value });
}
function advance(snapshot: CompanyCreditReviewSnapshot, reviewer = 'reviewer.one', decision: 'accept' | 'reject' = 'accept', at = FIRST) {
  const result = apply(snapshot, command(snapshot, reviewer, decision, at)); expect(result.outcome).toBe('applied'); return result.snapshot;
}
function credit(context: ReturnType<typeof fixture>) {
  return previewCompanyCredit({ directory: context.directory, policy: context.creditPolicy, request: context.request,
    evaluatedAt: context.evaluatedAt, evidence: context.evidence });
}
function incomplete(context = fixture()) {
  const { companyExposureCents: _counter, ...common } = context.evidence; return { ...common, coverage: 'incomplete' };
}
function errorFrom(operation: () => unknown): CompanyCreditReviewContractError {
  try { operation(); } catch (error) {
    expect(error).toBeInstanceOf(CompanyCreditReviewContractError); return error as CompanyCreditReviewContractError;
  }
  throw new Error('Se esperaba un error de contrato.');
}
function reason(operation: () => unknown, expected: CompanyCreditReviewContractReason = 'invalid_data'): void {
  expect(errorFrom(operation)).toMatchObject({ code: 'company_credit_review_contract_invalid', reason: expected });
}
function frozen(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true); for (const child of Object.values(value)) frozen(child);
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('apertura explícita y quórum de contactos declarados', () => {
  it('abre versión1 pendiente y recomputa el crédito sin aceptar estados o previews externos', () => {
    const context = fixture(); const snapshot = open(context);
    expect(snapshot).toMatchObject({ source: 'fixture', profile: 'company-credit-review-v1', status: 'pending', quorum: 2,
      acceptanceCount: 0, eligibleReviewerIds: ['reviewer.one', 'reviewer.three', 'reviewer.two'], decidedReviewerIds: [],
      remainingReviewerIds: ['reviewer.one', 'reviewer.three', 'reviewer.two'], lastOccurredAt: AT,
      case: { schemaVersion: 1, source: 'fixture', profile: 'company-credit-review-v1', id: 'case.fixture', version: 1, createdAt: AT, decisions: [] } });
    expect(snapshot.credit).toEqual(credit(context)); expect(snapshot.case.context).not.toBe(context); frozen(snapshot);
    expect(defineCompanyCreditReviewCase(snapshot.case)).toEqual(snapshot.case);
    expect(previewCompanyCreditReview({ case: snapshot.case, context })).toEqual(snapshot);
    reason(() => createCompanyCreditReviewCase({ id: 'case.fixture', createdAt: AT, context, credit: snapshot.credit }));
    for (const extra of [{ status: 'accepted' }, { acceptanceCount: 2 }, { quorum: 1 }, { credit: snapshot.credit }]) {
      reason(() => defineCompanyCreditReviewCase({ ...snapshot.case, ...extra }));
    }
  });

  it.each([6000, 8000, 8001])('la exposición %i no abre ni decide automáticamente la revisión', exposure => {
    const context = fixture(); context.evidence.companyExposureCents = exposure;
    const result = credit(context); expect(result).not.toHaveProperty('case'); expect(result).not.toHaveProperty('approved');
    const snapshot = open(context); expect(snapshot.status).toBe('pending'); expect(snapshot.credit).toEqual(result);
  });

  it.each([['inactive', 'active', 'company_inactive'], ['active', 'inactive', 'buyer_inactive'],
    ['inactive', 'inactive', 'company_inactive']] as const)('bloquea apertura empresa %s / comprador %s conservando crédito descriptivo', (company, buyer, expected) => {
    const context = fixture(); context.directory.companies[0]!.state = company; context.directory.contacts[0]!.state = buyer;
    const result = createCompanyCreditReviewCase({ id: 'case.fixture', createdAt: AT, context });
    expect(result).toMatchObject({ outcome: 'blocked', reason: expected, credit: credit(context) }); expect(result).not.toHaveProperty('snapshot'); frozen(result);
  });

  it('cuenta el quórum después de contactos activos y separación explícita del comprador', () => {
    const context = fixture(); context.reviewPolicy.reviewerContactIds = ['reviewer.one', 'contact.buyer', 'reviewer.inactive'];
    const result = createCompanyCreditReviewCase({ id: 'case.fixture', createdAt: AT, context });
    expect(result).toMatchObject({ outcome: 'blocked', reason: 'quorum_unreachable', eligibleReviewerIds: ['reviewer.one'] });
    context.reviewPolicy.buyerSeparation = 'allowed';
    const opened = open(context); expect(opened.eligibleReviewerIds).toEqual(['contact.buyer', 'reviewer.one']);
    const first = advance(opened, 'contact.buyer'); expect(first.acceptanceCount).toBe(1);
    expect(advance(first).status).toBe('accepted');
  });

  it('la misma identidad externa en dos contactos no los fusiona ni autentica personas', () => {
    const context = fixture(); context.directory.contacts[1]!.identityRef = { kind: 'email_identity', emailIdentityHash: 'a'.repeat(64) };
    context.directory.contacts[2]!.identityRef = { kind: 'email_identity', emailIdentityHash: 'a'.repeat(64) };
    const first = advance(open(context), 'reviewer.one'); const second = advance(first, 'reviewer.two');
    expect(second).toMatchObject({ status: 'accepted', acceptanceCount: 2, decidedReviewerIds: ['reviewer.one', 'reviewer.two'] });
    expect(second).not.toHaveProperty('authenticated'); expect(second).not.toHaveProperty('personCount');
  });

  it('una etiqueta de rol no incorpora contactos a la política ni altera la selección', () => {
    const context = fixture(); const directory = { ...context.directory, roles: [{ id: 'role.approver', label: 'Aprobador' }],
      assignments: [{ companyId: 'company.a', contactId: 'contact.unlisted', roleId: 'role.approver', scope: { type: 'company' } }] };
    const snapshot = open({ ...context, directory });
    expect(apply(snapshot, command(snapshot, 'contact.unlisted'))).toMatchObject({ outcome: 'blocked', reason: 'reviewer_not_selected' });
  });
});

describe('declaraciones, terminalidad y datos financieros independientes', () => {
  it('dos aceptaciones alcanzan quórum conservando todos los importes y asOf', () => {
    const initial = open(); const first = advance(initial); const second = advance(first, 'reviewer.two', 'accept', SECOND);
    expect(first).toMatchObject({ status: 'pending', acceptanceCount: 1, case: { version: 2 }, lastOccurredAt: FIRST });
    expect(second).toMatchObject({ status: 'accepted', acceptanceCount: 2, case: { version: 3 }, lastOccurredAt: SECOND,
      decidedReviewerIds: ['reviewer.one', 'reviewer.two'], remainingReviewerIds: ['reviewer.three'] });
    expect(second.credit).toEqual(initial.credit); expect(initial.case.decisions).toEqual([]); expect(first.case.decisions).toHaveLength(1);
    expect(apply(second, command(second, 'reviewer.three', 'reject', SECOND))).toMatchObject({ outcome: 'blocked', reason: 'case_terminal', snapshot: second });
  });

  it.each([false, true])('un rechazo termina el expediente con aceptación previa %s', previousAcceptance => {
    const initial = open(); const beforeReject = previousAcceptance ? advance(initial) : initial;
    const rejected = advance(beforeReject, 'reviewer.two', 'reject', SECOND);
    expect(rejected).toMatchObject({ status: 'rejected', acceptanceCount: previousAcceptance ? 1 : 0, case: { version: previousAcceptance ? 3 : 2 } });
    expect(apply(rejected, command(rejected, 'reviewer.three', 'accept', SECOND))).toMatchObject({ outcome: 'blocked', reason: 'case_terminal', snapshot: rejected });
    expect(rejected.credit).toEqual(initial.credit);
  });

  it('quórum1 cierra tras la primera aceptación y no permite revocación o reapertura', () => {
    const context = fixture(); context.reviewPolicy.quorum = 1; const initial = open(context); const accepted = advance(initial);
    expect(accepted).toMatchObject({ status: 'accepted', acceptanceCount: 1, case: { version: 2 } });
    expect(apply(accepted, command(accepted, 'reviewer.one', 'reject'))).toMatchObject({ outcome: 'blocked', reason: 'case_terminal' });
    reason(() => apply(accepted, { ...command(accepted), decision: 'reopen' }));
  });

  it('un mismo contacto no suma dos veces aunque declare otro ID o decisión', () => {
    const first = advance(open()); const next = command(first, 'reviewer.one', 'reject');
    expect(apply(first, next)).toEqual({ outcome: 'blocked', reason: 'reviewer_already_decided', snapshot: first });
    expect(first.case.decisions).toHaveLength(1); expect(first.acceptanceCount).toBe(1);
  });

  it.each([
    ['contact.unlisted', 'reviewer_not_selected'], ['reviewer.inactive', 'reviewer_inactive'], ['contact.buyer', 'buyer_separation_required'],
  ])('bloquea %s con %s sin consumir commandId', (reviewer, expected) => {
    const context = fixture(); context.reviewPolicy.reviewerContactIds.push('reviewer.inactive', 'contact.buyer');
    const initial = open(context); const blockedCommand = command(initial, reviewer);
    const result = apply(initial, blockedCommand); expect(result).toEqual({ outcome: 'blocked', reason: expected, snapshot: initial });
    // Un comando bloqueado no consta en historial: reutilizar explícitamente su ID no inventa replay.
    const corrected = { ...blockedCommand, reviewerContactId: 'reviewer.one' };
    expect(apply(result.snapshot, corrected)).toMatchObject({ outcome: 'applied', snapshot: { acceptanceCount: 1, case: { version: 2 } } });
  });

  it.each(['missing', 'incomplete', 'future', 'unconfigured', 'above'] as const)(
    'aceptar declarativamente contexto %s no completa datos ni concede crédito', mode => {
      const context = fixture();
      if (mode === 'unconfigured') { context.creditPolicy.companyExposureLimits = []; context.creditPolicy.companyRequestLimits = []; context.creditPolicy.buyerLimits = []; }
      if (mode === 'future') context.evidence.observedAt = '2026-10-04T00:00:00.000Z';
      if (mode === 'above') context.evidence.companyExposureCents = 10000;
      const evidence = mode === 'missing' ? null : mode === 'incomplete' ? incomplete(context) : context.evidence;
      const initial = open({ ...context, evidence }); const accepted = advance(advance(initial), 'reviewer.two');
      expect(accepted.status).toBe('accepted'); expect(accepted.credit).toEqual(initial.credit);
      if (mode === 'missing' || mode === 'incomplete' || mode === 'future') expect(accepted.credit.exposure.amounts).toBeNull();
      if (mode === 'above') expect(accepted.credit.comparisons.companyExposure).toMatchObject({ position: 'above_limit', differenceCents: -2000 });
      if (mode === 'unconfigured') for (const comparison of Object.values(accepted.credit.comparisons)) expect(comparison.status).toBe('unconfigured');
      for (const key of ['availableCredit', 'authorized', 'creditApproved', 'reservation', 'order']) expect(accepted).not.toHaveProperty(key);
    });
});

describe('replay íntegro y conflictos puros', () => {
  it.each(['accept', 'reject'] as const)('replay del primer voto conserva expediente posterior %s y todos los votos', decision => {
    const initial = open(); const firstCommand = command(initial); const first = apply(initial, firstCommand).snapshot;
    const final = advance(first, 'reviewer.two', decision, SECOND); const replay = apply(final, firstCommand);
    expect(replay).toEqual({ outcome: 'replayed', snapshot: final });
    expect(replay.snapshot.case.version).toBe(3); expect(replay.snapshot.case.decisions).toHaveLength(2);
    expect(replay.snapshot.lastOccurredAt).toBe(SECOND); frozen(replay);
  });

  it('el payload completo decide replay, no solo ID o contacto', () => {
    const initial = open(); const original = command(initial); const first = apply(initial, original).snapshot;
    for (const patch of [{ expectedVersion: 2 }, { reviewerContactId: 'reviewer.two' }, { decision: 'reject' }, { occurredAt: SECOND }]) {
      expect(apply(first, { ...original, ...patch })).toEqual({ outcome: 'conflict', reason: 'command_id_reused', snapshot: first });
    }
    reason(() => apply(first, { ...original, caseId: 'case.other' }), 'reference_mismatch');
    const reordered = Object.fromEntries(Object.entries(original).reverse());
    expect(apply(first, reordered)).toEqual({ outcome: 'replayed', snapshot: first });
  });

  it('dos comandos con la misma expectativa no se fusionan ni ajustan versión automáticamente', () => {
    const initial = open(); const one = command(initial); const two = command(initial, 'reviewer.two');
    const first = apply(initial, one).snapshot;
    expect(apply(first, two)).toEqual({ outcome: 'conflict', reason: 'version_mismatch', snapshot: first });
    expect(first.case.decisions).toEqual([one]);
    const explicitRetry = { ...two, expectedVersion: 2 };
    expect(apply(first, explicitRetry)).toMatchObject({ outcome: 'applied', snapshot: { status: 'accepted', case: { version: 3 } } });
    expect(apply(first, { ...two, expectedVersion: Number.MAX_SAFE_INTEGER })).toMatchObject({ outcome: 'conflict', reason: 'version_mismatch' });
  });

  it('una expectativa incorrecta precede bloqueo terminal, y replay exacto precede ambos', () => {
    const initial = open(); const firstCommand = command(initial); const first = apply(initial, firstCommand).snapshot;
    const accepted = advance(first, 'reviewer.two');
    expect(apply(accepted, command(initial, 'reviewer.three'))).toMatchObject({ outcome: 'conflict', reason: 'version_mismatch' });
    expect(apply(accepted, firstCommand)).toMatchObject({ outcome: 'replayed', snapshot: { status: 'accepted', case: { version: 3 } } });
  });

  it('el contexto cambiado gana incluso sobre replay conocido, conflicto o terminalidad', () => {
    const context = fixture(); const initial = open(context); const original = command(initial); const first = apply(initial, original).snapshot;
    const accepted = advance(first, 'reviewer.two');
    context.evaluatedAt = FIRST;
    for (const value of [original, { ...original, expectedVersion: 999 }, command(accepted, 'reviewer.three')]) {
      reason(() => applyCompanyCreditReviewDecision({ case: accepted.case, context, command: value }), 'context_mismatch');
    }
  });

  it('repetir create es determinista pero no conserva declaraciones ni acredita idempotencia global', () => {
    const context = fixture(); const initial = open(context); const accepted = advance(advance(initial), 'reviewer.two');
    expect(open(context)).toEqual(initial); expect(open(context).case.decisions).toHaveLength(0);
    expect(accepted.case.decisions).toHaveLength(2);
  });
});

describe('contexto completo y validación de todo el historial', () => {
  it('rechaza cambios válidos de cualquier componente aunque los IDs/versiones se conserven', () => {
    const baseline = fixture(); const initial = open(baseline); const firstCommand = command(initial); const first = apply(initial, firstCommand).snapshot;
    const contexts = Array.from({ length: 10 }, () => fixture());
    contexts[0]!.directory.companies[1]!.displayName = 'Empresa B editada';
    contexts[1]!.creditPolicy.companyRequestLimits[0]!.limitCents = 6000;
    contexts[2]!.request.amountCents = 2500; contexts[2]!.evidence.excludedRequest = structuredClone(contexts[2]!.request);
    contexts[3]!.request.version++; contexts[3]!.evidence.excludedRequest = structuredClone(contexts[3]!.request);
    contexts[4]!.request.buyerContactId = 'contact.unlisted'; contexts[4]!.evidence.excludedRequest = structuredClone(contexts[4]!.request);
    contexts[5]!.evaluatedAt = FIRST;
    contexts[6]!.evidence.companyExposureCents++;
    contexts[7]!.evidence.observedAt = AT;
    contexts[8]!.reviewPolicy.quorum = 3;
    contexts[9]!.reviewPolicy.version++;
    for (const context of contexts) {
      reason(() => previewCompanyCreditReview({ case: first.case, context }), 'context_mismatch');
      reason(() => applyCompanyCreditReviewDecision({ case: first.case, context, command: firstCommand }), 'context_mismatch');
    }
    reason(() => previewCompanyCreditReview({ case: first.case, context: { ...baseline, evidence: null } }), 'context_mismatch');
    const fresh = open(contexts[1], FIRST, 'case.new'); expect(fresh.case.decisions).toHaveLength(0); expect(fresh.status).toBe('pending');
  });

  it('contexto nuevo inactivo es una discrepancia y no transforma un expediente anterior aceptado', () => {
    const context = fixture(); const accepted = advance(advance(open(context)), 'reviewer.two');
    context.directory.companies[0]!.state = 'inactive'; context.directory.contacts[0]!.state = 'inactive';
    reason(() => previewCompanyCreditReview({ case: accepted.case, context }), 'context_mismatch');
    reason(() => applyCompanyCreditReviewDecision({ case: accepted.case, context, command: accepted.case.decisions[0] }), 'context_mismatch');
    expect(createCompanyCreditReviewCase({ id: 'case.new', createdAt: AT, context })).toMatchObject({ outcome: 'blocked', reason: 'company_inactive' });
    expect(accepted.status).toBe('accepted');
  });

  it('el orden canónico permite permutar colecciones, pero no cambia el orden declarado del historial', () => {
    const context = fixture(); const first = advance(open(context), 'reviewer.two');
    context.directory.companies.reverse(); context.directory.contacts.reverse(); context.reviewPolicy.reviewerContactIds.reverse();
    expect(previewCompanyCreditReview({ case: first.case, context })).toEqual(first);
    const final = advance(first, 'reviewer.one', 'accept', FIRST);
    expect(final.case.decisions.map(value => value.reviewerContactId)).toEqual(['reviewer.two', 'reviewer.one']);
    expect(final.decidedReviewerIds).toEqual(['reviewer.one', 'reviewer.two']);
  });

  it('valida referencias de todos los revisores y la política antes de bloquear apertura', () => {
    const context = fixture(); context.directory.companies[0]!.state = 'inactive';
    reason(() => createCompanyCreditReviewCase({ id: 'case.fixture', createdAt: AT, context: { ...context,
      reviewPolicy: { ...context.reviewPolicy, reviewerContactIds: ['reviewer.one', 'contact.missing'] } } }), 'unknown_reference');
    reason(() => createCompanyCreditReviewCase({ id: 'case.fixture', createdAt: AT, context: { ...context,
      reviewPolicy: { ...context.reviewPolicy, reviewerContactIds: ['reviewer.one', 'contact.foreign'] } } }), 'cross_company_reference');
    for (const patch of [{ companyId: 'company.b' }, { directoryRef: { ...context.reviewPolicy.directoryRef, version: 4 } },
      { directoryRef: { ...context.reviewPolicy.directoryRef, capturedAt: FIRST } }]) {
      reason(() => createCompanyCreditReviewCase({ id: 'case.fixture', createdAt: AT, context: { ...context,
        reviewPolicy: { ...context.reviewPolicy, ...patch } } }), 'reference_mismatch');
    }
  });

  it('rechaza comandos con contacto desconocido/ajeno antes de conflictos de versión', () => {
    const initial = open();
    reason(() => apply(initial, { ...command(initial), expectedVersion: 999, reviewerContactId: 'contact.missing' }), 'unknown_reference');
    reason(() => apply(initial, { ...command(initial), expectedVersion: 999, reviewerContactId: 'contact.foreign' }), 'cross_company_reference');
  });

  it('crédito/directorio corruptos se redactan antes de ausencia, conflicto, inactividad o replay', () => {
    const context = fixture(); const initial = open(context); const original = command(initial); const first = apply(initial, original).snapshot;
    const broken = { ...context, creditPolicy: { ...context.creditPolicy,
      companyRequestLimits: [...context.creditPolicy.companyRequestLimits, { companyId: 'company.missing', limitCents: 0 }] } };
    reason(() => createCompanyCreditReviewCase({ id: 'case.fixture', createdAt: AT, context: { ...broken, evidence: null } }), 'credit_context_invalid');
    reason(() => applyCompanyCreditReviewDecision({ case: first.case, context: broken, command: original }), 'credit_context_invalid');
    reason(() => previewCompanyCreditReview({ case: first.case, context: { ...context,
      directory: { ...context.directory, sites: [{ id: 'site.bad', companyId: 'company.missing', label: 'Privado', state: 'inactive', countryCode: null }] } } }), 'credit_context_invalid');
    const overflow = { ...context, evidence: { ...context.evidence, companyExposureCents: Number.MAX_SAFE_INTEGER } };
    reason(() => createCompanyCreditReviewCase({ id: 'case.fixture', createdAt: AT, context: overflow }), 'credit_context_invalid');
  });

  it('reconstruye versión, secuencia, unicidad, elegibilidad y terminalidad desde TODO el historial', () => {
    const initial = open(); const firstCommand = command(initial); const first = apply(initial, firstCommand).snapshot;
    const secondCommand = command(first, 'reviewer.two', 'accept', SECOND); const accepted = apply(first, secondCommand).snapshot;
    const badCases = [
      { ...first.case, version: 1 }, { ...first.case, version: 100 },
      { ...first.case, decisions: [{ ...firstCommand, expectedVersion: 2 }] },
      { ...first.case, decisions: [{ ...firstCommand, caseId: 'case.other' }] },
      { ...first.case, decisions: [{ ...firstCommand, reviewerContactId: 'contact.missing' }] },
      { ...first.case, decisions: [{ ...firstCommand, reviewerContactId: 'contact.unlisted' }] },
      { ...first.case, decisions: [{ ...firstCommand, reviewerContactId: 'reviewer.inactive' }] },
      { ...first.case, decisions: [{ ...firstCommand, reviewerContactId: 'contact.buyer' }] },
      { ...accepted.case, decisions: [firstCommand, { ...secondCommand, id: firstCommand.id }] },
      { ...accepted.case, decisions: [firstCommand, { ...secondCommand, reviewerContactId: firstCommand.reviewerContactId }] },
      { ...accepted.case, decisions: [firstCommand, { ...secondCommand, occurredAt: AT }] },
      { ...accepted.case, decisions: [{ ...firstCommand, decision: 'reject' }, secondCommand] },
      { ...accepted.case, version: 4, decisions: [...accepted.case.decisions, command(accepted, 'reviewer.three', 'accept', SECOND)] },
    ];
    for (const bad of badCases) reason(() => defineCompanyCreditReviewCase(bad), 'invalid_history');
    const inactive = fixture(); inactive.directory.companies[0]!.state = 'inactive';
    reason(() => defineCompanyCreditReviewCase({ ...initial.case, context: inactive }), 'invalid_history');
    const unreachable = fixture(); unreachable.reviewPolicy.reviewerContactIds = ['reviewer.one', 'reviewer.inactive'];
    reason(() => defineCompanyCreditReviewCase({ ...initial.case, context: unreachable }), 'invalid_history');
    expect(defineCompanyCreditReviewCase(accepted.case)).toEqual(accepted.case);
  });
});

describe('fechas explícitas y límites acotados', () => {
  it('acepta igualdad temporal; impide retroceso en creación y nueva decisión, pero no en replay histórico', () => {
    const context = fixture(); reason(() => createCompanyCreditReviewCase({ id: 'case.fixture', createdAt: '2026-10-03T11:59:59.999Z', context }), 'invalid_chronology');
    const initial = open(context); const firstCommand = command(initial, 'reviewer.one', 'accept', AT);
    const first = apply(initial, firstCommand).snapshot; const final = advance(first, 'reviewer.two', 'accept', SECOND);
    expect(first.lastOccurredAt).toBe(AT); expect(apply(final, firstCommand).outcome).toBe('replayed');
    reason(() => apply(advance(initial), command(advance(initial), 'reviewer.two', 'accept', AT)), 'invalid_chronology');
    reason(() => defineCompanyCreditReviewCase({ ...first.case, createdAt: '2026-10-03T11:00:00.000Z' }), 'invalid_chronology');
  });

  it('capturedAt año0000 es metadata válida; fechas propias excluyen año cero y rollovers', () => {
    const context = fixture(); const zero = '0000-02-29T00:00:00.000Z';
    context.directory.capturedAt = zero; context.creditPolicy.directoryRef.capturedAt = zero;
    context.request.directoryRef.capturedAt = zero; context.evidence.excludedRequest.directoryRef.capturedAt = zero;
    context.reviewPolicy.directoryRef.capturedAt = zero;
    const initial = open(context); expect(initial.case.context.directory.capturedAt).toBe(zero);
    for (const date of [zero, '1900-02-29T00:00:00.000Z', '2026-04-31T00:00:00.000Z',
      '2026-10-03T24:00:00.000Z', '2026-10-03T12:00:00Z', '+010000-01-01T00:00:00.000Z', null]) {
      reason(() => createCompanyCreditReviewCase({ id: 'case.fixture', createdAt: date, context }));
      reason(() => apply(initial, { ...command(initial), occurredAt: date }));
    }
    for (const date of ['0001-01-01T00:00:00.000Z', '0099-12-31T23:59:59.999Z', '2000-02-29T10:20:30.456Z', '9999-12-31T23:59:59.999Z']) {
      const historical = open({ ...context, evaluatedAt: date, evidence: null }, date);
      expect(advance(historical, 'reviewer.one', 'accept', date).lastOccurredAt).toBe(date);
    }
  });

  it('permite veinte contactos/votos con versión21 y rechaza veintiuno sin truncar', () => {
    const context = fixture(); const reviewers = Array.from({ length: 20 }, (_, index) => `reviewer.r${index}`);
    context.directory.contacts = [context.directory.contacts[0]!, ...reviewers.map(id => ({ id, companyId: 'company.a', displayName: id, state: 'active', identityRef: null }))];
    context.reviewPolicy.reviewerContactIds = reviewers; context.reviewPolicy.quorum = 20;
    context.reviewPolicy.version = Number.MAX_SAFE_INTEGER;
    let snapshot = open(context);
    for (const reviewer of reviewers) snapshot = advance(snapshot, reviewer, 'accept', AT);
    expect(snapshot).toMatchObject({ status: 'accepted', acceptanceCount: 20, case: { version: 21 } });
    expect(snapshot.remainingReviewerIds).toEqual([]); expect(defineCompanyCreditReviewCase(snapshot.case)).toEqual(snapshot.case);
    reason(() => defineCompanyCreditReviewPolicy({ ...context.reviewPolicy, reviewerContactIds: [...reviewers, 'reviewer.extra'] }));
    reason(() => defineCompanyCreditReviewCase({ ...snapshot.case, version: 22, decisions: [...snapshot.case.decisions, command(snapshot)] }));
    expect(COMPANY_CREDIT_REVIEW_LIMITS).toEqual({ reviewerContactIds: 20, decisionsPerCase: 20, casesPerCall: 1, commandsPerApply: 1 });
  });

  it('reglas de quórum e identidad son exactas, no defaults o coerciones', () => {
    const context = fixture();
    reason(() => defineCompanyCreditReviewPolicy({ ...context.reviewPolicy, reviewerContactIds: ['reviewer.one', 'reviewer.one'] }), 'duplicate_reviewer');
    for (const quorum of [0, -0, -1, 1.2, 4, Number.MAX_SAFE_INTEGER, '2', null]) {
      reason(() => defineCompanyCreditReviewPolicy({ ...context.reviewPolicy, quorum }));
    }
    reason(() => defineCompanyCreditReviewPolicy({ ...context.reviewPolicy, reviewerContactIds: [] }));
    reason(() => defineCompanyCreditReviewPolicy({ ...context.reviewPolicy, buyerSeparation: undefined }));
    const initial = open(context);
    for (const value of [0, -0, -1, 1.2, Number.MAX_SAFE_INTEGER + 1, '1']) reason(() => apply(initial, { ...command(initial), expectedVersion: value }));
    for (const value of ['', 'Reviewer.ONE', 'reviewer/one', 'a'.repeat(101), null]) {
      reason(() => defineCompanyCreditReviewPolicy({ ...context.reviewPolicy, id: value }));
      reason(() => apply(initial, { ...command(initial), id: value }));
    }
  });
});

describe('datos propios, copias y ausencia de efectos', () => {
  it('congela copias separadas y no muta políticas, contexto ni case al aplicar', () => {
    const context = fixture(); context.reviewPolicy.reviewerContactIds.reverse();
    const originalOrder = [...context.reviewPolicy.reviewerContactIds]; const policy = defineCompanyCreditReviewPolicy(context.reviewPolicy);
    const initial = open(context); const inputCommand = command(initial); const result = apply(initial, inputCommand);
    expect(context.reviewPolicy.reviewerContactIds).toEqual(originalOrder); expect(policy.reviewerContactIds).toEqual(['reviewer.one', 'reviewer.three', 'reviewer.two']);
    for (const output of [policy, initial, result]) frozen(output);
    context.request.amountCents = 1; context.reviewPolicy.quorum = 1; inputCommand.reviewerContactId = 'reviewer.two';
    expect(result.snapshot.case.context.request.amountCents).toBe(2000); expect(result.snapshot.quorum).toBe(2);
    expect(result.snapshot.case.decisions[0]!.reviewerContactId).toBe('reviewer.one'); expect(initial.case.decisions).toHaveLength(0);
    expect(result.snapshot.case).not.toBe(initial.case);
  });

  it('normaliza originales una vez y consume crédito desde copias pese a mutaciones tardías', () => {
    const context = fixture(); const baseline = open(context); const original = context.reviewPolicy;
    const reviewPolicy = new Proxy(original, { ownKeys(target) {
      context.directory.companies[0]!.state = 'inactive'; context.creditPolicy.companyExposureLimits[0]!.limitCents = 0;
      context.request.amountCents = 1; context.evidence.companyExposureCents = 9; context.evaluatedAt = SECOND;
      return Reflect.ownKeys(target);
    } });
    expect(open({ ...context, reviewPolicy })).toEqual(baseline);
    expect(context.request.amountCents).toBe(1);
  });

  it('un comando hostil no cambia snapshots/contextos capturados antes de leerlo', () => {
    const initial = open(); const rawCase = structuredClone(initial.case); const rawContext = fixture(); const value = command(initial);
    const expected = apply(initial, value);
    const hostile = new Proxy(value, { ownKeys(target) {
      Object.defineProperty(rawCase, 'version', { value: 999 });
      rawContext.request.amountCents = 1; rawContext.reviewPolicy.quorum = 1;
      return Reflect.ownKeys(target);
    } });
    expect(applyCompanyCreditReviewDecision({ case: rawCase, context: rawContext, command: hostile })).toEqual(expected);
  });

  it('no acepta extras, getters, símbolos, propiedades ocultas o prototipos heredados', () => {
    const context = fixture(); const initial = open(context); let getters = 0;
    for (const extra of [{ extra: undefined }, { [Symbol('private')]: 1 }]) {
      reason(() => defineCompanyCreditReviewPolicy({ ...context.reviewPolicy, ...extra }));
      reason(() => defineCompanyCreditReviewCase({ ...initial.case, ...extra }));
      reason(() => apply(initial, { ...command(initial), ...extra }));
      reason(() => previewCompanyCreditReview({ case: initial.case, context, ...extra }));
    }
    const accessed = { ...context.reviewPolicy }; Object.defineProperty(accessed, 'quorum', { enumerable: true, get() { getters++; return 1; } });
    reason(() => defineCompanyCreditReviewPolicy(accessed));
    const hidden = command(initial); Object.defineProperty(hidden, 'note', { value: 'private', enumerable: false }); reason(() => apply(initial, hidden));
    reason(() => defineCompanyCreditReviewPolicy(Object.assign(Object.create({ inherited: true }) as object, context.reviewPolicy)));
    const ownNull = Object.assign(Object.create(null) as object, context.reviewPolicy); expect(defineCompanyCreditReviewPolicy(ownNull)).toEqual(initial.case.context.reviewPolicy);
    const caseGetter = { ...initial.case }; Object.defineProperty(caseGetter, 'decisions', { enumerable: true, get() { getters++; return []; } });
    reason(() => defineCompanyCreditReviewCase(caseGetter)); expect(getters).toBe(0);
  });

  it('rechaza arrays dispersos, extendidos y accesores sin ejecutar getters', () => {
    const context = fixture(); const initial = open(context); let getters = 0;
    const accessed = ['reviewer.one']; Object.defineProperty(accessed, '0', { enumerable: true, get() { getters++; return 'reviewer.one'; } });
    for (const list of [new Array(1), Object.assign([], { extra: true }), accessed, Object.setPrototypeOf([], null)]) {
      reason(() => defineCompanyCreditReviewPolicy({ ...context.reviewPolicy, reviewerContactIds: list }));
      reason(() => defineCompanyCreditReviewCase({ ...initial.case, decisions: list }));
    }
    expect(getters).toBe(0);
  });

  it('redacta Proxy y errores ajenos sin propagar contenido, causa o getters del error', () => {
    const context = fixture(); const initial = open(context); const secret = 'PII private@example.test 123456'; let getters = 0;
    const error = new CompanyCreditReviewContractError('unknown_reference');
    Object.defineProperty(error, 'reason', { get() { getters++; throw new Error(secret); } });
    Object.defineProperty(error, 'message', { get() { getters++; throw new Error(secret); } });
    for (const thrown of [new Error(secret), error, new Proxy({}, { getPrototypeOf() { throw new Error(secret); } })]) {
      const commandProxy = new Proxy(command(initial), { ownKeys() { throw thrown; } });
      const result = errorFrom(() => apply(initial, commandProxy));
      expect(result.reason).toBe('invalid_data'); expect(result.message).not.toContain(secret); expect(result).not.toHaveProperty('cause');
      const directory = new Proxy(context.directory, { ownKeys() { throw thrown; } });
      const creditError = errorFrom(() => createCompanyCreditReviewCase({ id: 'case.fixture', createdAt: AT, context: { ...context, directory } }));
      expect(creditError.reason).toBe('credit_context_invalid'); expect(creditError.message).not.toContain(secret);
    }
    expect(getters).toBe(0);
  });

  it('las cinco APIs funcionan sin red, storage, timers ni reloj implícito', () => {
    const context = fixture(); const RealDate = Date; let effects = 0;
    const forbidden = () => { effects++; throw new Error('Efecto no permitido'); };
    class ExplicitDate extends RealDate {
      constructor(value?: string | number) { if (value === undefined) forbidden(); super(value!); }
      static override now(): number { return forbidden(); }
    }
    vi.stubGlobal('Date', ExplicitDate);
    for (const name of ['fetch', 'setTimeout', 'setInterval', 'queueMicrotask']) vi.stubGlobal(name, forbidden);
    for (const name of ['localStorage', 'sessionStorage']) vi.stubGlobal(name, { getItem: forbidden, setItem: forbidden, removeItem: forbidden });
    expect(defineCompanyCreditReviewPolicy(context.reviewPolicy).quorum).toBe(2);
    const initial = open(context); expect(defineCompanyCreditReviewCase(initial.case)).toEqual(initial.case);
    expect(previewCompanyCreditReview({ case: initial.case, context })).toEqual(initial);
    expect(advance(initial).acceptanceCount).toBe(1); expect(effects).toBe(0);
  });
});
