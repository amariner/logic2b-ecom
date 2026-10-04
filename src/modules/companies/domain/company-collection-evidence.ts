import {
  CompanyPaymentTermsContractError, defineCompanyPaymentTermsRequest, previewCompanyPaymentTerms,
  type CompanyPaymentTermsPreview, type CompanyPaymentTermsRequest,
} from './company-payment-terms';

export const COMPANY_COLLECTION_LIMITS = /* @__PURE__ */ Object.freeze({
  obligationsPerPreview: 1, evidenceSnapshotsPerPreview: 1, moneyCents: Number.MAX_SAFE_INTEGER,
});
/** Importe esperado sintético, no factura, deuda acreditada ni autorización financiera. */
export type CompanyCollectionObligation = Readonly<{
  schemaVersion: 1; source: 'fixture'; profile: 'company-applied-eur-cents-v1'; id: string; version: number;
  directoryRef: CompanyPaymentTermsRequest['directoryRef']; companyId: string; currency: 'EUR'; amountCents: number;
  terms: Readonly<{ policyRef: CompanyPaymentTermsRequest['policyRef']; baseDate: string }>;
}>;
export type CompanyCollectionRequest = Readonly<{ schemaVersion: 1; id: string; evaluatedAt: string }>;
type EvidenceCommon = Readonly<{
  schemaVersion: 1; source: 'fixture'; id: string; version: number; obligation: CompanyCollectionObligation; observedAt: string;
}>;
/** Contadores acumulados declarados para esta obligación, hasta observedAt. No hay inferencia desde pagos esperados. */
export type CompanyCollectionEvidence = EvidenceCommon & (
  | Readonly<{ coverage: 'complete'; appliedCents: number; reversedCents: number }>
  | Readonly<{ coverage: 'incomplete' }>
);
export type CompanyCollectionEvidenceMetadata = Readonly<{
  id: string; version: number; coverage: 'complete' | 'incomplete'; observedAt: string;
}>;
export type CompanyCollectionObservedAmounts = Readonly<{
  asOf: string; appliedCents: number; reversedCents: number; netAppliedCents: number; differenceCents: number;
  amountPosition: 'below_expected' | 'equal_expected' | 'above_expected'; reversalPosition: 'none' | 'partial' | 'full';
}>;
type EvaluationCommon = Readonly<{
  source: 'fixture'; profile: 'company-applied-eur-cents-v1'; requestId: string;
  obligation: CompanyCollectionObligation; evaluatedAt: string;
}>;
export type CompanyCollectionEvidenceEvaluation = EvaluationCommon & (
  | Readonly<{ outcome: 'observed'; evidence: CompanyCollectionEvidenceMetadata & Readonly<{ coverage: 'complete' }>;
    reason: null; observedAmounts: CompanyCollectionObservedAmounts }>
  | Readonly<{ outcome: 'unknown'; evidence: CompanyCollectionEvidenceMetadata | null;
    reason: 'missing_evidence' | 'future_observation' | 'incomplete_evidence'; observedAmounts: null }>
);
/** Calendario y corte observado independientes: no declara saldo actual, impago ni una comunicación enviada. */
export type CompanyCollectionPreview = Readonly<{
  source: 'fixture'; profile: 'company-applied-eur-cents-v1'; requestId: string;
  company: CompanyPaymentTermsPreview['company']; calendar: CompanyPaymentTermsPreview; collection: CompanyCollectionEvidenceEvaluation;
}>;
export type CompanyCollectionContractReason = 'invalid_data' | 'unknown_company' | 'unknown_reference' | 'reference_mismatch'
  | 'inconsistent_evidence' | 'duplicate_assignment' | 'duplicate_offset' | 'date_overflow';
const ERROR_MESSAGES: Readonly<Record<CompanyCollectionContractReason, string>> = /* @__PURE__ */ Object.freeze({
  invalid_data: 'Los datos no cumplen el contrato de evidencia de cobro.',
  unknown_company: 'La empresa solicitada no está presente en el directorio.',
  unknown_reference: 'Una condición hace referencia a una empresa ausente.',
  reference_mismatch: 'Las referencias o la obligación no coinciden con los artefactos recibidos.',
  inconsistent_evidence: 'Las reversiones declaradas superan las aplicaciones de la evidencia completa.',
  duplicate_assignment: 'La política contiene más de una condición para la misma empresa.',
  duplicate_offset: 'La condición contiene un offset de recordatorio repetido.',
  date_overflow: 'Una fecha calculada queda fuera del calendario admitido.',
});
export class CompanyCollectionContractError extends Error {
  readonly code = 'company_collection_contract_invalid';
  readonly reason: CompanyCollectionContractReason;
  constructor(reason: CompanyCollectionContractReason) {
    const safeReason = typeof reason === 'string' && Object.hasOwn(ERROR_MESSAGES, reason) ? reason : 'invalid_data';
    super(ERROR_MESSAGES[safeReason]); this.name = 'CompanyCollectionContractError'; this.reason = safeReason;
  }
}
function invalid(reason: CompanyCollectionContractReason = 'invalid_data'): never { throw new CompanyCollectionContractError(reason); }
function boundary<T>(operation: () => T): T {
  try { return operation(); }
  catch (error) {
    let reason: CompanyCollectionContractReason = 'invalid_data';
    try {
      if (error instanceof CompanyCollectionContractError || error instanceof CompanyPaymentTermsContractError) {
        const descriptor = Object.getOwnPropertyDescriptor(error, 'reason');
        if (descriptor && 'value' in descriptor && typeof descriptor.value === 'string' && Object.hasOwn(ERROR_MESSAGES, descriptor.value)) {
          reason = descriptor.value as CompanyCollectionContractReason;
        }
      }
    } catch { /* No se propagan mensajes, getters del error, causas ni datos de entrada. */ }
    throw new CompanyCollectionContractError(reason);
  }
}
function dataRecord(input: unknown): Readonly<Record<string, unknown>> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return invalid();
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return invalid();
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(input)) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (typeof key !== 'string' || !descriptor?.enumerable || !('value' in descriptor)) return invalid();
    result[key] = descriptor.value;
  }
  return Object.freeze(result);
}
function record(input: unknown, keys: readonly string[]): Readonly<Record<string, unknown>> {
  const row = dataRecord(input); const actual = Object.keys(row);
  if (actual.length !== keys.length || actual.some(key => !keys.includes(key))) return invalid();
  return row;
}
function integer(input: unknown, minimum = 1): number {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || Object.is(input, -0) || input < minimum) return invalid();
  return input;
}
function id(input: unknown): string {
  if (typeof input !== 'string' || input.length > 100 || !/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/.test(input)) return invalid();
  return input;
}
function instant(input: unknown): string {
  if (typeof input !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input) || input.startsWith('0000-')) return invalid();
  const date = new Date(input);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== input) return invalid();
  return input;
}

export function defineCompanyCollectionObligation(input: unknown): CompanyCollectionObligation {
  return boundary(() => {
    const row = record(input, ['schemaVersion', 'source', 'profile', 'id', 'version', 'directoryRef', 'companyId', 'currency', 'amountCents', 'terms']);
    if (row.schemaVersion !== 1 || row.source !== 'fixture' || row.profile !== 'company-applied-eur-cents-v1' || row.currency !== 'EUR') return invalid();
    const terms = record(row.terms, ['policyRef', 'baseDate']); const version = integer(row.version);
    const amountCents = integer(row.amountCents, 0);
    // Reutiliza la frontera exacta de fechas/referencias del calendario; no hay un segundo parser civil.
    const calendarRequest = defineCompanyPaymentTermsRequest({
      schemaVersion: 1, id: row.id, directoryRef: row.directoryRef, policyRef: terms.policyRef,
      companyId: row.companyId, baseDate: terms.baseDate, evaluationDate: terms.baseDate,
    });
    return Object.freeze({ schemaVersion: 1, source: 'fixture', profile: 'company-applied-eur-cents-v1',
      id: calendarRequest.id, version, directoryRef: calendarRequest.directoryRef, companyId: calendarRequest.companyId,
      currency: 'EUR', amountCents, terms: Object.freeze({ policyRef: calendarRequest.policyRef, baseDate: calendarRequest.baseDate }) });
  });
}

export function defineCompanyCollectionRequest(input: unknown): CompanyCollectionRequest {
  return boundary(() => {
    const row = record(input, ['schemaVersion', 'id', 'evaluatedAt']);
    if (row.schemaVersion !== 1) return invalid();
    return Object.freeze({ schemaVersion: 1, id: id(row.id), evaluatedAt: instant(row.evaluatedAt) });
  });
}

export function defineCompanyCollectionEvidence(input: unknown): CompanyCollectionEvidence {
  return boundary(() => {
    const row = dataRecord(input);
    const commonKeys = ['schemaVersion', 'source', 'id', 'version', 'obligation', 'observedAt', 'coverage'];
    if (row.coverage === 'complete') record(row, [...commonKeys, 'appliedCents', 'reversedCents']);
    else if (row.coverage === 'incomplete') record(row, commonKeys);
    else return invalid();
    if (row.schemaVersion !== 1 || row.source !== 'fixture') return invalid();
    const common = { schemaVersion: 1 as const, source: 'fixture' as const, id: id(row.id), version: integer(row.version),
      obligation: defineCompanyCollectionObligation(row.obligation), observedAt: instant(row.observedAt) };
    if (row.coverage === 'incomplete') return Object.freeze({ ...common, coverage: 'incomplete' });
    const appliedCents = integer(row.appliedCents, 0); const reversedCents = integer(row.reversedCents, 0);
    if (reversedCents > appliedCents) return invalid('inconsistent_evidence');
    return Object.freeze({ ...common, coverage: 'complete', appliedCents, reversedCents });
  });
}
function safeSigned(value: bigint): number {
  if (value < BigInt(-COMPANY_COLLECTION_LIMITS.moneyCents) || value > BigInt(COMPANY_COLLECTION_LIMITS.moneyCents)) return invalid();
  return Number(value);
}

/** Un corte antiguo conserva su asOf. Evaluarlo después no acredita ausencia de movimientos intermedios. */
export function evaluateCompanyCollectionEvidence(input: unknown): CompanyCollectionEvidenceEvaluation {
  return boundary(() => {
    const row = record(input, ['obligation', 'request', 'evidence']);
    const obligation = defineCompanyCollectionObligation(row.obligation); const request = defineCompanyCollectionRequest(row.request);
    const evidence = row.evidence === null ? null : defineCompanyCollectionEvidence(row.evidence);
    // Ambos artefactos ya son copias canónicas de campos exactos, sin getters ni orden externo.
    if (evidence && JSON.stringify(obligation) !== JSON.stringify(evidence.obligation)) return invalid('reference_mismatch');
    const common: EvaluationCommon = { source: 'fixture', profile: 'company-applied-eur-cents-v1', requestId: request.id,
      obligation, evaluatedAt: request.evaluatedAt };
    if (!evidence) return Object.freeze({ ...common, outcome: 'unknown', evidence: null, reason: 'missing_evidence', observedAmounts: null });
    const metadata = Object.freeze({ id: evidence.id, version: evidence.version, coverage: evidence.coverage, observedAt: evidence.observedAt });
    // Instantes canónicos UTC de igual longitud: el orden textual coincide con el orden temporal.
    if (request.evaluatedAt < evidence.observedAt) return Object.freeze({ ...common, outcome: 'unknown', evidence: metadata,
      reason: 'future_observation', observedAmounts: null });
    if (evidence.coverage === 'incomplete') return Object.freeze({ ...common, outcome: 'unknown', evidence: metadata,
      reason: 'incomplete_evidence', observedAmounts: null });
    const net = BigInt(evidence.appliedCents) - BigInt(evidence.reversedCents);
    const difference = BigInt(obligation.amountCents) - net;
    const observedAmounts: CompanyCollectionObservedAmounts = Object.freeze({
      asOf: evidence.observedAt, appliedCents: evidence.appliedCents, reversedCents: evidence.reversedCents,
      netAppliedCents: safeSigned(net), differenceCents: safeSigned(difference),
      amountPosition: difference > 0n ? 'below_expected' : difference === 0n ? 'equal_expected' : 'above_expected',
      reversalPosition: evidence.reversedCents === 0 ? 'none' : evidence.reversedCents === evidence.appliedCents ? 'full' : 'partial',
    });
    return Object.freeze({ ...common, outcome: 'observed', evidence: Object.freeze({ ...metadata, coverage: 'complete' as const }),
      reason: null, observedAmounts });
  });
}

/** Recalcula el calendario desde la obligación normalizada; nunca acepta un preview suministrado como autoridad. */
export function previewCompanyCollection(input: unknown): CompanyCollectionPreview {
  return boundary(() => {
    const row = record(input, ['directory', 'termsPolicy', 'obligation', 'request', 'evidence']);
    const collection = evaluateCompanyCollectionEvidence({ obligation: row.obligation, request: row.request, evidence: row.evidence });
    const obligation = collection.obligation;
    const calendar = previewCompanyPaymentTerms({ directory: row.directory, policy: row.termsPolicy, request: {
      schemaVersion: 1, id: collection.requestId, directoryRef: obligation.directoryRef, policyRef: obligation.terms.policyRef,
      companyId: obligation.companyId, baseDate: obligation.terms.baseDate, evaluationDate: collection.evaluatedAt.slice(0, 10),
    } });
    return Object.freeze({ source: collection.source, profile: collection.profile, requestId: collection.requestId,
      company: calendar.company, calendar, collection });
  });
}
