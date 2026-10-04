import { defineCompanyDirectory, type CompanyDirectoryRef, type CompanyDirectoryState } from './company-directory';

export const COMPANY_CREDIT_LIMITS = /* @__PURE__ */ Object.freeze({
  companyExposureLimits: 100, companyRequestLimits: 100, buyerLimits: 2000,
  requestsPerPreview: 1, evidencePerPreview: 1, moneyCents: Number.MAX_SAFE_INTEGER,
});
export type CompanyCreditPolicyRef = Readonly<{ id: string; version: number }>;
export type CompanyCreditCompanyLimit = Readonly<{ companyId: string; limitCents: number }>;
/** Límite POR SOLICITUD del contacto declarado, nunca presupuesto acumulado ni delegación. */
export type CompanyCreditBuyerLimit = Readonly<{ companyId: string; contactId: string; requestLimitCents: number }>;
export type CompanyCreditPolicy = Readonly<{
  schemaVersion: 1; source: 'fixture'; profile: 'company-credit-eur-cents-v1'; id: string; version: number;
  directoryRef: CompanyDirectoryRef; currency: 'EUR';
  companyExposureLimits: readonly CompanyCreditCompanyLimit[];
  companyRequestLimits: readonly CompanyCreditCompanyLimit[];
  buyerLimits: readonly CompanyCreditBuyerLimit[];
}>;
/** Solicitud sintética: no representa un pedido, una obligación ni una reserva. */
export type CompanyCreditRequest = Readonly<{
  schemaVersion: 1; source: 'fixture'; profile: 'company-credit-eur-cents-v1'; id: string; version: number;
  directoryRef: CompanyDirectoryRef; policyRef: CompanyCreditPolicyRef;
  companyId: string; buyerContactId: string; currency: 'EUR'; amountCents: number;
}>;
type EvidenceCommon = Readonly<{
  schemaVersion: 1; source: 'fixture'; id: string; version: number;
  excludedRequest: CompanyCreditRequest; observedAt: string;
}>;
/** Cobertura y exclusión íntegras declaradas por el fixture; no acreditan un origen contable. */
export type CompanyCreditExposureEvidence = EvidenceCommon & (
  | Readonly<{ coverage: 'complete'; companyExposureCents: number }>
  | Readonly<{ coverage: 'incomplete' }>
);
export type CompanyCreditEvidenceMetadata = Readonly<{
  id: string; version: number; coverage: 'complete' | 'incomplete'; observedAt: string;
}>;
export type CompanyCreditObservedExposure = Readonly<{
  asOf: string; companyExposureCents: number; companyExposureWithRequestCents: number;
}>;
export type CompanyCreditUnknownReason = 'missing_evidence' | 'future_observation' | 'incomplete_evidence';
export type CompanyCreditExposureEvaluation =
  | Readonly<{ outcome: 'observed'; reason: null;
    evidence: CompanyCreditEvidenceMetadata & Readonly<{ coverage: 'complete' }>; amounts: CompanyCreditObservedExposure }>
  | Readonly<{ outcome: 'unknown'; reason: CompanyCreditUnknownReason;
    evidence: CompanyCreditEvidenceMetadata | null; amounts: null }>;
export type CompanyCreditCompared = Readonly<{
  status: 'compared'; limitCents: number; comparedCents: number; differenceCents: number;
  position: 'below_limit' | 'equal_limit' | 'above_limit'; reason: null;
}>;
export type CompanyCreditUnconfigured = Readonly<{
  status: 'unconfigured'; limitCents: null; comparedCents: number | null;
  differenceCents: null; position: null; reason: 'limit_unconfigured';
}>;
export type CompanyCreditUnknownComparison = Readonly<{
  status: 'unknown'; limitCents: number; comparedCents: null;
  differenceCents: null; position: null; reason: CompanyCreditUnknownReason;
}>;
export type CompanyCreditAmountComparison = CompanyCreditCompared | CompanyCreditUnconfigured;
export type CompanyCreditExposureComparison = CompanyCreditAmountComparison | CompanyCreditUnknownComparison;
/** Tres diagnósticos independientes, sin resultado agregado de aprobación o disponibilidad. */
export type CompanyCreditPreview = Readonly<{
  source: 'fixture'; profile: 'company-credit-eur-cents-v1'; request: CompanyCreditRequest;
  policyRef: CompanyCreditPolicyRef; evaluatedAt: string;
  context: Readonly<{
    company: Readonly<{ id: string; state: CompanyDirectoryState }>;
    buyer: Readonly<{ contactId: string; state: CompanyDirectoryState }>;
    inactiveReasons: readonly ('company_inactive' | 'buyer_inactive')[];
  }>;
  exposure: CompanyCreditExposureEvaluation;
  comparisons: Readonly<{
    companyExposure: CompanyCreditExposureComparison;
    requestAmount: CompanyCreditAmountComparison;
    buyerAmount: CompanyCreditAmountComparison;
  }>;
}>;
export type CompanyCreditContractReason = 'invalid_data' | 'duplicate_company_exposure_limit'
  | 'duplicate_company_request_limit' | 'duplicate_buyer_limit' | 'unknown_reference' | 'unknown_company'
  | 'unknown_buyer' | 'cross_company_reference' | 'reference_mismatch' | 'exposure_overflow';
const ERROR_MESSAGES: Readonly<Record<CompanyCreditContractReason, string>> = /* @__PURE__ */ Object.freeze({
  invalid_data: 'Los datos no cumplen el contrato de comparación de crédito.',
  duplicate_company_exposure_limit: 'Existe más de un límite de exposición para la misma empresa.',
  duplicate_company_request_limit: 'Existe más de un límite por solicitud para la misma empresa.',
  duplicate_buyer_limit: 'Existe más de un límite por solicitud para el mismo comprador de empresa.',
  unknown_reference: 'Un límite contiene una referencia ausente del directorio.',
  unknown_company: 'La empresa solicitada no está presente en el directorio.',
  unknown_buyer: 'El comprador solicitado no está presente en el directorio.',
  cross_company_reference: 'El contacto pertenece a una empresa distinta de la declarada.',
  reference_mismatch: 'Las referencias o la solicitud excluida no coinciden con los artefactos recibidos.',
  exposure_overflow: 'La exposición con la solicitud supera el rango entero admitido.',
});
export class CompanyCreditContractError extends Error {
  readonly code = 'company_credit_contract_invalid';
  readonly reason: CompanyCreditContractReason;
  constructor(reason: CompanyCreditContractReason) {
    const safeReason = typeof reason === 'string' && Object.hasOwn(ERROR_MESSAGES, reason) ? reason : 'invalid_data';
    super(ERROR_MESSAGES[safeReason]); this.name = 'CompanyCreditContractError'; this.reason = safeReason;
  }
}
function invalid(reason: CompanyCreditContractReason = 'invalid_data'): never { throw new CompanyCreditContractError(reason); }
function boundary<T>(operation: () => T): T {
  try { return operation(); }
  catch (error) {
    let reason: CompanyCreditContractReason = 'invalid_data';
    try {
      if (error instanceof CompanyCreditContractError) {
        const descriptor = Object.getOwnPropertyDescriptor(error, 'reason');
        if (descriptor && 'value' in descriptor && typeof descriptor.value === 'string' && Object.hasOwn(ERROR_MESSAGES, descriptor.value)) {
          reason = descriptor.value as CompanyCreditContractReason;
        }
      }
    } catch { /* No se propagan errores ajenos, getters del error, mensajes, causas ni datos de entrada. */ }
    throw new CompanyCreditContractError(reason);
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
function array(input: unknown, maximum: number): readonly unknown[] {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) return invalid();
  const lengthDescriptor = Object.getOwnPropertyDescriptor(input, 'length');
  if (!lengthDescriptor || !('value' in lengthDescriptor)) return invalid();
  const length: unknown = lengthDescriptor.value;
  if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0 || length > maximum ||
    Reflect.ownKeys(input).length !== length + 1) return invalid();
  const result: unknown[] = [];
  for (let index = 0; index < length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
    if (!descriptor?.enumerable || !('value' in descriptor)) return invalid();
    result.push(descriptor.value);
  }
  return Object.freeze(result);
}
function id(input: unknown): string {
  if (typeof input !== 'string' || input.length > 100 || !/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/.test(input)) return invalid();
  return input;
}
function integer(input: unknown, minimum = 1): number {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || Object.is(input, -0) || input < minimum) return invalid();
  return input;
}
function instant(input: unknown, directoryMetadata = false): string {
  if (typeof input !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input) ||
    (!directoryMetadata && input.startsWith('0000-'))) return invalid();
  const date = new Date(input);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== input) return invalid();
  return input;
}
function directoryRef(input: unknown): CompanyDirectoryRef {
  const row = record(input, ['id', 'version', 'capturedAt']);
  // capturedAt conserva la frontera del directorio, incluido año cero; no expresa vigencia.
  return Object.freeze({ id: id(row.id), version: integer(row.version), capturedAt: instant(row.capturedAt, true) });
}
function policyRef(input: unknown): CompanyCreditPolicyRef {
  const row = record(input, ['id', 'version']); return Object.freeze({ id: id(row.id), version: integer(row.version) });
}
function lexical(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function companyLimits(input: unknown, maximum: number, duplicate: CompanyCreditContractReason): readonly CompanyCreditCompanyLimit[] {
  const seen = new Set<string>();
  const rows = array(input, maximum).map(item => {
    const row = record(item, ['companyId', 'limitCents']);
    const companyId = id(row.companyId); const limitCents = integer(row.limitCents, 0);
    if (seen.has(companyId)) return invalid(duplicate);
    seen.add(companyId); return Object.freeze({ companyId, limitCents });
  });
  return Object.freeze(rows.sort((left, right) => lexical(left.companyId, right.companyId)));
}

export function defineCompanyCreditPolicy(input: unknown): CompanyCreditPolicy {
  return boundary(() => {
    const row = record(input, ['schemaVersion', 'source', 'profile', 'id', 'version', 'directoryRef', 'currency',
      'companyExposureLimits', 'companyRequestLimits', 'buyerLimits']);
    if (row.schemaVersion !== 1 || row.source !== 'fixture' || row.profile !== 'company-credit-eur-cents-v1' || row.currency !== 'EUR') return invalid();
    const companyExposureLimits = companyLimits(row.companyExposureLimits, COMPANY_CREDIT_LIMITS.companyExposureLimits, 'duplicate_company_exposure_limit');
    const companyRequestLimits = companyLimits(row.companyRequestLimits, COMPANY_CREDIT_LIMITS.companyRequestLimits, 'duplicate_company_request_limit');
    const seen = new Set<string>();
    const buyerLimits = array(row.buyerLimits, COMPANY_CREDIT_LIMITS.buyerLimits).map(item => {
      const rule = record(item, ['companyId', 'contactId', 'requestLimitCents']);
      const companyId = id(rule.companyId); const contactId = id(rule.contactId); const requestLimitCents = integer(rule.requestLimitCents, 0);
      const key = `${companyId}/${contactId}`;
      if (seen.has(key)) return invalid('duplicate_buyer_limit');
      seen.add(key); return Object.freeze({ companyId, contactId, requestLimitCents });
    });
    buyerLimits.sort((left, right) => lexical(left.companyId, right.companyId) || lexical(left.contactId, right.contactId));
    return Object.freeze({ schemaVersion: 1, source: 'fixture', profile: 'company-credit-eur-cents-v1', id: id(row.id),
      version: integer(row.version), directoryRef: directoryRef(row.directoryRef), currency: 'EUR', companyExposureLimits,
      companyRequestLimits, buyerLimits: Object.freeze(buyerLimits) });
  });
}

export function defineCompanyCreditRequest(input: unknown): CompanyCreditRequest {
  return boundary(() => {
    const row = record(input, ['schemaVersion', 'source', 'profile', 'id', 'version', 'directoryRef', 'policyRef',
      'companyId', 'buyerContactId', 'currency', 'amountCents']);
    if (row.schemaVersion !== 1 || row.source !== 'fixture' || row.profile !== 'company-credit-eur-cents-v1' || row.currency !== 'EUR') return invalid();
    return Object.freeze({ schemaVersion: 1, source: 'fixture', profile: 'company-credit-eur-cents-v1', id: id(row.id),
      version: integer(row.version), directoryRef: directoryRef(row.directoryRef), policyRef: policyRef(row.policyRef),
      companyId: id(row.companyId), buyerContactId: id(row.buyerContactId), currency: 'EUR', amountCents: integer(row.amountCents, 0) });
  });
}
function exposureWithRequest(exposureCents: number, amountCents: number): number {
  const total = BigInt(exposureCents) + BigInt(amountCents);
  if (total > BigInt(COMPANY_CREDIT_LIMITS.moneyCents)) return invalid('exposure_overflow');
  return Number(total);
}
export function defineCompanyCreditExposureEvidence(input: unknown): CompanyCreditExposureEvidence {
  return boundary(() => {
    const row = dataRecord(input);
    const keys = ['schemaVersion', 'source', 'id', 'version', 'excludedRequest', 'observedAt', 'coverage'];
    if (row.coverage === 'complete') record(row, [...keys, 'companyExposureCents']);
    else if (row.coverage === 'incomplete') record(row, keys);
    else return invalid();
    if (row.schemaVersion !== 1 || row.source !== 'fixture') return invalid();
    const common = { schemaVersion: 1 as const, source: 'fixture' as const, id: id(row.id), version: integer(row.version),
      excludedRequest: defineCompanyCreditRequest(row.excludedRequest), observedAt: instant(row.observedAt) };
    if (row.coverage === 'incomplete') return Object.freeze({ ...common, coverage: 'incomplete' });
    const companyExposureCents = integer(row.companyExposureCents, 0);
    // La corrupción monetaria se rechaza incluso en evidencias futuras, sin reglas o contextos inactivos.
    exposureWithRequest(companyExposureCents, common.excludedRequest.amountCents);
    return Object.freeze({ ...common, coverage: 'complete', companyExposureCents });
  });
}
function evaluateExposure(evidence: CompanyCreditExposureEvidence | null, evaluatedAt: string): CompanyCreditExposureEvaluation {
  if (!evidence) return Object.freeze({ outcome: 'unknown', reason: 'missing_evidence', evidence: null, amounts: null });
  const metadata = Object.freeze({ id: evidence.id, version: evidence.version, coverage: evidence.coverage, observedAt: evidence.observedAt });
  if (evidence.observedAt > evaluatedAt) return Object.freeze({ outcome: 'unknown', reason: 'future_observation', evidence: metadata, amounts: null });
  if (evidence.coverage === 'incomplete') return Object.freeze({ outcome: 'unknown', reason: 'incomplete_evidence', evidence: metadata, amounts: null });
  return Object.freeze({ outcome: 'observed', reason: null, evidence: Object.freeze({ ...metadata, coverage: 'complete' as const }),
    amounts: Object.freeze({ asOf: evidence.observedAt, companyExposureCents: evidence.companyExposureCents,
      companyExposureWithRequestCents: exposureWithRequest(evidence.companyExposureCents, evidence.excludedRequest.amountCents) }) });
}
function unconfigured(comparedCents: number | null): CompanyCreditUnconfigured {
  return Object.freeze({ status: 'unconfigured', limitCents: null, comparedCents, differenceCents: null, position: null, reason: 'limit_unconfigured' });
}
function compareAmount(limitCents: number | null, comparedCents: number): CompanyCreditAmountComparison {
  if (limitCents === null) return unconfigured(comparedCents);
  const difference = BigInt(limitCents) - BigInt(comparedCents);
  // La diferencia de dos enteros seguros no negativos cabe exactamente en el rango firmado seguro.
  return Object.freeze({ status: 'compared', limitCents, comparedCents, differenceCents: Number(difference),
    position: difference > 0n ? 'below_limit' : difference === 0n ? 'equal_limit' : 'above_limit', reason: null });
}
function compareExposure(limitCents: number | null, exposure: CompanyCreditExposureEvaluation): CompanyCreditExposureComparison {
  if (limitCents === null) return unconfigured(exposure.amounts?.companyExposureWithRequestCents ?? null);
  if (exposure.outcome === 'unknown') return Object.freeze({ status: 'unknown', limitCents, comparedCents: null,
    differenceCents: null, position: null, reason: exposure.reason });
  return compareAmount(limitCents, exposure.amounts.companyExposureWithRequestCents);
}

/** Corte descriptivo asOf más hipótesis de la solicitud; no saldo actual ni autorización comercial. */
export function previewCompanyCredit(input: unknown): CompanyCreditPreview {
  return boundary(() => {
    const row = record(input, ['directory', 'policy', 'request', 'evaluatedAt', 'evidence']);
    const directory = defineCompanyDirectory(row.directory); const policy = defineCompanyCreditPolicy(row.policy);
    const request = defineCompanyCreditRequest(row.request); const evaluatedAt = instant(row.evaluatedAt);
    const evidence = row.evidence === null ? null : defineCompanyCreditExposureEvidence(row.evidence);
    const companies = new Map(directory.companies.map(company => [company.id, company]));
    const contacts = new Map(directory.contacts.map(contact => [contact.id, contact]));
    for (const rule of [...policy.companyExposureLimits, ...policy.companyRequestLimits]) {
      if (!companies.has(rule.companyId)) return invalid('unknown_reference');
    }
    for (const rule of policy.buyerLimits) {
      const contact = contacts.get(rule.contactId);
      if (!companies.has(rule.companyId) || !contact) return invalid('unknown_reference');
      if (contact.companyId !== rule.companyId) return invalid('cross_company_reference');
    }
    const actualDirectoryRef = { id: directory.id, version: directory.version, capturedAt: directory.capturedAt };
    if (JSON.stringify(policy.directoryRef) !== JSON.stringify(actualDirectoryRef) ||
      JSON.stringify(request.directoryRef) !== JSON.stringify(actualDirectoryRef) ||
      request.policyRef.id !== policy.id || request.policyRef.version !== policy.version) return invalid('reference_mismatch');
    const company = companies.get(request.companyId); if (!company) return invalid('unknown_company');
    const buyer = contacts.get(request.buyerContactId); if (!buyer) return invalid('unknown_buyer');
    if (buyer.companyId !== company.id) return invalid('cross_company_reference');
    // Comparación íntegra entre copias canónicas: ID/version por sí solos no bastan.
    if (evidence && JSON.stringify(evidence.excludedRequest) !== JSON.stringify(request)) return invalid('reference_mismatch');
    const exposure = evaluateExposure(evidence, evaluatedAt);
    const inactiveReasons: ('company_inactive' | 'buyer_inactive')[] = [];
    if (company.state === 'inactive') inactiveReasons.push('company_inactive');
    if (buyer.state === 'inactive') inactiveReasons.push('buyer_inactive');
    return Object.freeze({ source: 'fixture', profile: 'company-credit-eur-cents-v1', request,
      policyRef: Object.freeze({ id: policy.id, version: policy.version }), evaluatedAt,
      context: Object.freeze({ company: Object.freeze({ id: company.id, state: company.state }),
        buyer: Object.freeze({ contactId: buyer.id, state: buyer.state }), inactiveReasons: Object.freeze(inactiveReasons) }),
      exposure, comparisons: Object.freeze({
        companyExposure: compareExposure(policy.companyExposureLimits.find(rule => rule.companyId === company.id)?.limitCents ?? null, exposure),
        requestAmount: compareAmount(policy.companyRequestLimits.find(rule => rule.companyId === company.id)?.limitCents ?? null, request.amountCents),
        buyerAmount: compareAmount(policy.buyerLimits.find(rule => rule.companyId === company.id && rule.contactId === buyer.id)?.requestLimitCents ?? null, request.amountCents),
      }) });
  });
}
