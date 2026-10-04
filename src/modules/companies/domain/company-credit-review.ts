import { defineCompanyDirectory, type CompanyDirectory, type CompanyDirectoryRef } from './company-directory';
import {
  defineCompanyCreditPolicy, defineCompanyCreditRequest, defineCompanyCreditExposureEvidence, previewCompanyCredit,
  type CompanyCreditPolicy, type CompanyCreditRequest, type CompanyCreditExposureEvidence, type CompanyCreditPreview,
} from './company-credit';

export const COMPANY_CREDIT_REVIEW_LIMITS = /* @__PURE__ */ Object.freeze({
  reviewerContactIds: 20, decisionsPerCase: 20, casesPerCall: 1, commandsPerApply: 1,
});
/** Selección declarada de contactos, nunca roles, identidad autenticada ni permisos comerciales. */
export type CompanyCreditReviewPolicy = Readonly<{
  schemaVersion: 1; source: 'fixture'; profile: 'company-credit-review-v1'; id: string; version: number;
  directoryRef: CompanyDirectoryRef; companyId: string; reviewerContactIds: readonly string[];
  buyerSeparation: 'required' | 'allowed'; quorum: number;
}>;
export type CompanyCreditReviewContext = Readonly<{
  directory: CompanyDirectory; creditPolicy: CompanyCreditPolicy; request: CompanyCreditRequest;
  evaluatedAt: string; evidence: CompanyCreditExposureEvidence | null; reviewPolicy: CompanyCreditReviewPolicy;
}>;
export type CompanyCreditReviewDecisionCommand = Readonly<{
  id: string; caseId: string; expectedVersion: number; reviewerContactId: string;
  decision: 'accept' | 'reject'; occurredAt: string;
}>;
/** Contexto íntegro e historial declarados. No hay estado ni contador suministrado como autoridad. */
export type CompanyCreditReviewCase = Readonly<{
  schemaVersion: 1; source: 'fixture'; profile: 'company-credit-review-v1'; id: string; version: number;
  createdAt: string; context: CompanyCreditReviewContext; decisions: readonly CompanyCreditReviewDecisionCommand[];
}>;
export type CompanyCreditReviewStatus = 'pending' | 'accepted' | 'rejected';
/** accepted solo describe el quórum de declaraciones; no concede crédito ni autoriza pedidos. */
export type CompanyCreditReviewSnapshot = Readonly<{
  source: 'fixture'; profile: 'company-credit-review-v1'; case: CompanyCreditReviewCase; credit: CompanyCreditPreview;
  status: CompanyCreditReviewStatus; quorum: number; acceptanceCount: number; eligibleReviewerIds: readonly string[];
  decidedReviewerIds: readonly string[]; remainingReviewerIds: readonly string[]; lastOccurredAt: string;
}>;
export type CompanyCreditReviewCreationBlockReason = 'company_inactive' | 'buyer_inactive' | 'quorum_unreachable';
export type CompanyCreditReviewDecisionBlockReason = 'case_terminal' | 'reviewer_not_selected' | 'reviewer_inactive'
  | 'buyer_separation_required' | 'reviewer_already_decided';
export type CompanyCreditReviewCreation =
  | Readonly<{ outcome: 'created'; snapshot: CompanyCreditReviewSnapshot }>
  | Readonly<{ outcome: 'blocked'; reason: CompanyCreditReviewCreationBlockReason; context: CompanyCreditReviewContext;
    credit: CompanyCreditPreview; eligibleReviewerIds: readonly string[] }>;
export type CompanyCreditReviewTransition =
  | Readonly<{ outcome: 'applied' | 'replayed'; snapshot: CompanyCreditReviewSnapshot }>
  | Readonly<{ outcome: 'conflict'; reason: 'version_mismatch' | 'command_id_reused'; snapshot: CompanyCreditReviewSnapshot }>
  | Readonly<{ outcome: 'blocked'; reason: CompanyCreditReviewDecisionBlockReason; snapshot: CompanyCreditReviewSnapshot }>;
export type CompanyCreditReviewContractReason = 'invalid_data' | 'credit_context_invalid' | 'duplicate_reviewer'
  | 'unknown_reference' | 'cross_company_reference' | 'reference_mismatch' | 'context_mismatch' | 'invalid_history' | 'invalid_chronology';
const ERROR_MESSAGES: Readonly<Record<CompanyCreditReviewContractReason, string>> = /* @__PURE__ */ Object.freeze({
  invalid_data: 'Los datos no cumplen el contrato de revisión de crédito.',
  credit_context_invalid: 'El contexto de crédito no cumple su contrato completo.',
  duplicate_reviewer: 'La política contiene un contacto revisor repetido.',
  unknown_reference: 'Un contacto revisor no existe en el directorio declarado.',
  cross_company_reference: 'El contacto revisor pertenece a otra empresa.',
  reference_mismatch: 'Las referencias de revisión no coinciden con el contexto declarado.',
  context_mismatch: 'El contexto completo difiere del ligado al expediente.',
  invalid_history: 'El historial no representa una secuencia válida del expediente.',
  invalid_chronology: 'La fecha declarada retrocede respecto a la secuencia admitida.',
});
export class CompanyCreditReviewContractError extends Error {
  readonly code = 'company_credit_review_contract_invalid';
  readonly reason: CompanyCreditReviewContractReason;
  constructor(reason: CompanyCreditReviewContractReason) {
    const safeReason = typeof reason === 'string' && Object.hasOwn(ERROR_MESSAGES, reason) ? reason : 'invalid_data';
    super(ERROR_MESSAGES[safeReason]); this.name = 'CompanyCreditReviewContractError'; this.reason = safeReason;
  }
}
function invalid(reason: CompanyCreditReviewContractReason = 'invalid_data'): never { throw new CompanyCreditReviewContractError(reason); }
function boundary<T>(operation: () => T): T {
  try { return operation(); }
  catch (error) {
    let reason: CompanyCreditReviewContractReason = 'invalid_data';
    try {
      if (error instanceof CompanyCreditReviewContractError) {
        const descriptor = Object.getOwnPropertyDescriptor(error, 'reason');
        if (descriptor && 'value' in descriptor && typeof descriptor.value === 'string' && Object.hasOwn(ERROR_MESSAGES, descriptor.value)) {
          reason = descriptor.value as CompanyCreditReviewContractReason;
        }
      }
    } catch { /* El error también puede ser hostil: no se leen sus getters, mensaje ni causa. */ }
    throw new CompanyCreditReviewContractError(reason);
  }
}
function creditBoundary<T>(operation: () => T): T {
  try { return operation(); } catch { return invalid('credit_context_invalid'); }
}
function record(input: unknown, keys: readonly string[]): Readonly<Record<string, unknown>> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return invalid();
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return invalid();
  const actual = Reflect.ownKeys(input);
  if (actual.length !== keys.length) return invalid();
  const row: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of actual) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (typeof key !== 'string' || !keys.includes(key) || !descriptor?.enumerable || !('value' in descriptor)) return invalid();
    row[key] = descriptor.value;
  }
  return Object.freeze(row);
}
function array(input: unknown, maximum: number, minimum = 0): readonly unknown[] {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) return invalid();
  const descriptor = Object.getOwnPropertyDescriptor(input, 'length');
  if (!descriptor || !('value' in descriptor)) return invalid();
  const length: unknown = descriptor.value;
  if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < minimum || length > maximum ||
    Reflect.ownKeys(input).length !== length + 1) return invalid();
  const values: unknown[] = [];
  for (let index = 0; index < length; index++) {
    const item = Object.getOwnPropertyDescriptor(input, String(index));
    if (!item?.enumerable || !('value' in item)) return invalid();
    values.push(item.value);
  }
  return Object.freeze(values);
}
function id(input: unknown): string {
  if (typeof input !== 'string' || input.length > 100 || !/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/.test(input)) return invalid();
  return input;
}
function integer(input: unknown): number {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || Object.is(input, -0) || input < 1) return invalid();
  return input;
}
function instant(input: unknown, directoryMetadata = false): string {
  if (typeof input !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input) ||
    (!directoryMetadata && input.startsWith('0000-'))) return invalid();
  const parsed = new Date(input);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== input) return invalid();
  return input;
}
function directoryRef(input: unknown): CompanyDirectoryRef {
  const row = record(input, ['id', 'version', 'capturedAt']);
  return Object.freeze({ id: id(row.id), version: integer(row.version), capturedAt: instant(row.capturedAt, true) });
}
function lexical(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
/** Solo se serializan copias canónicas de datos propios; nunca objetos de entrada arbitrarios. */
function same(left: unknown, right: unknown): boolean { return JSON.stringify(left) === JSON.stringify(right); }

export function defineCompanyCreditReviewPolicy(input: unknown): CompanyCreditReviewPolicy {
  return boundary(() => {
    const row = record(input, ['schemaVersion', 'source', 'profile', 'id', 'version', 'directoryRef', 'companyId',
      'reviewerContactIds', 'buyerSeparation', 'quorum']);
    if (row.schemaVersion !== 1 || row.source !== 'fixture' || row.profile !== 'company-credit-review-v1' ||
      (row.buyerSeparation !== 'required' && row.buyerSeparation !== 'allowed')) return invalid();
    const reviewers = array(row.reviewerContactIds, COMPANY_CREDIT_REVIEW_LIMITS.reviewerContactIds, 1).map(id);
    if (new Set(reviewers).size !== reviewers.length) return invalid('duplicate_reviewer');
    const quorum = integer(row.quorum);
    if (quorum > reviewers.length) return invalid();
    return Object.freeze({ schemaVersion: 1, source: 'fixture', profile: 'company-credit-review-v1', id: id(row.id),
      version: integer(row.version), directoryRef: directoryRef(row.directoryRef), companyId: id(row.companyId),
      reviewerContactIds: Object.freeze(reviewers.sort(lexical)), buyerSeparation: row.buyerSeparation, quorum });
  });
}
type NormalizedContext = Readonly<{
  context: CompanyCreditReviewContext; credit: CompanyCreditPreview; eligibleReviewerIds: readonly string[];
}>;
function normalizeContext(input: unknown): NormalizedContext {
  const row = record(input, ['directory', 'creditPolicy', 'request', 'evaluatedAt', 'evidence', 'reviewPolicy']);
  // Cada artefacto original se captura una vez; el cálculo posterior solo ve estas copias.
  const directory = creditBoundary(() => defineCompanyDirectory(row.directory));
  const creditPolicy = creditBoundary(() => defineCompanyCreditPolicy(row.creditPolicy));
  const request = creditBoundary(() => defineCompanyCreditRequest(row.request));
  const evaluatedAt = instant(row.evaluatedAt);
  const evidence = row.evidence === null ? null : creditBoundary(() => defineCompanyCreditExposureEvidence(row.evidence));
  const reviewPolicy = defineCompanyCreditReviewPolicy(row.reviewPolicy);
  const credit = creditBoundary(() => previewCompanyCredit({ directory, policy: creditPolicy, request, evaluatedAt, evidence }));
  if (reviewPolicy.directoryRef.id !== directory.id || reviewPolicy.directoryRef.version !== directory.version ||
    reviewPolicy.directoryRef.capturedAt !== directory.capturedAt || reviewPolicy.companyId !== request.companyId) return invalid('reference_mismatch');
  const contacts = new Map(directory.contacts.map(contact => [contact.id, contact]));
  const eligible: string[] = [];
  for (const contactId of reviewPolicy.reviewerContactIds) {
    const contact = contacts.get(contactId);
    if (!contact) return invalid('unknown_reference');
    if (contact.companyId !== reviewPolicy.companyId) return invalid('cross_company_reference');
    if (contact.state === 'active' && (reviewPolicy.buyerSeparation === 'allowed' || contact.id !== request.buyerContactId)) eligible.push(contact.id);
  }
  const context: CompanyCreditReviewContext = Object.freeze({ directory, creditPolicy, request, evaluatedAt, evidence, reviewPolicy });
  return Object.freeze({ context, credit, eligibleReviewerIds: Object.freeze(eligible) });
}
function openingBlock(normalized: NormalizedContext): CompanyCreditReviewCreationBlockReason | null {
  if (normalized.credit.context.company.state === 'inactive') return 'company_inactive';
  if (normalized.credit.context.buyer.state === 'inactive') return 'buyer_inactive';
  if (normalized.context.reviewPolicy.quorum > normalized.eligibleReviewerIds.length) return 'quorum_unreachable';
  return null;
}
function decisionCommand(input: unknown): CompanyCreditReviewDecisionCommand {
  const row = record(input, ['id', 'caseId', 'expectedVersion', 'reviewerContactId', 'decision', 'occurredAt']);
  if (row.decision !== 'accept' && row.decision !== 'reject') return invalid();
  return Object.freeze({ id: id(row.id), caseId: id(row.caseId), expectedVersion: integer(row.expectedVersion),
    reviewerContactId: id(row.reviewerContactId), decision: row.decision, occurredAt: instant(row.occurredAt) });
}
function reconstruct(reviewCase: CompanyCreditReviewCase, normalized: NormalizedContext): CompanyCreditReviewSnapshot {
  if (reviewCase.createdAt < normalized.context.evaluatedAt) return invalid('invalid_chronology');
  if (openingBlock(normalized) !== null || reviewCase.version !== reviewCase.decisions.length + 1) return invalid('invalid_history');
  const commandIds = new Set<string>(); const decided = new Set<string>();
  const eligible = new Set(normalized.eligibleReviewerIds);
  let status: CompanyCreditReviewStatus = 'pending'; let acceptanceCount = 0; let lastOccurredAt = reviewCase.createdAt;
  for (const [index, command] of reviewCase.decisions.entries()) {
    if (status !== 'pending' || command.caseId !== reviewCase.id || command.expectedVersion !== index + 1 ||
      commandIds.has(command.id) || decided.has(command.reviewerContactId) || !eligible.has(command.reviewerContactId) ||
      command.occurredAt < lastOccurredAt) return invalid('invalid_history');
    commandIds.add(command.id); decided.add(command.reviewerContactId); lastOccurredAt = command.occurredAt;
    if (command.decision === 'reject') status = 'rejected';
    else {
      acceptanceCount++;
      if (acceptanceCount >= normalized.context.reviewPolicy.quorum) status = 'accepted';
    }
  }
  return Object.freeze({ source: 'fixture', profile: 'company-credit-review-v1', case: reviewCase, credit: normalized.credit,
    status, quorum: normalized.context.reviewPolicy.quorum, acceptanceCount, eligibleReviewerIds: normalized.eligibleReviewerIds,
    decidedReviewerIds: Object.freeze([...decided].sort(lexical)),
    remainingReviewerIds: Object.freeze(normalized.eligibleReviewerIds.filter(contactId => !decided.has(contactId))), lastOccurredAt });
}
function readCase(input: unknown): CompanyCreditReviewSnapshot {
  const row = record(input, ['schemaVersion', 'source', 'profile', 'id', 'version', 'createdAt', 'context', 'decisions']);
  if (row.schemaVersion !== 1 || row.source !== 'fixture' || row.profile !== 'company-credit-review-v1') return invalid();
  const caseId = id(row.id); const version = integer(row.version); const createdAt = instant(row.createdAt);
  const normalized = normalizeContext(row.context);
  const decisions = Object.freeze(array(row.decisions, COMPANY_CREDIT_REVIEW_LIMITS.decisionsPerCase).map(decisionCommand));
  const reviewCase: CompanyCreditReviewCase = Object.freeze({ schemaVersion: 1, source: 'fixture', profile: 'company-credit-review-v1',
    id: caseId, version, createdAt, context: normalized.context, decisions });
  return reconstruct(reviewCase, normalized);
}

/** Relee todo el historial. Los campos derivados nunca son autoridad suministrada por el llamador. */
export function defineCompanyCreditReviewCase(input: unknown): CompanyCreditReviewCase {
  return boundary(() => readCase(input).case);
}

/** Abrir el expediente exige una llamada explícita; ningún resultado numérico lo inicia. */
export function createCompanyCreditReviewCase(input: unknown): CompanyCreditReviewCreation {
  return boundary(() => {
    const row = record(input, ['id', 'createdAt', 'context']);
    const caseId = id(row.id); const createdAt = instant(row.createdAt); const normalized = normalizeContext(row.context);
    if (createdAt < normalized.context.evaluatedAt) return invalid('invalid_chronology');
    const reason = openingBlock(normalized);
    if (reason !== null) return Object.freeze({ outcome: 'blocked', reason, context: normalized.context,
      credit: normalized.credit, eligibleReviewerIds: normalized.eligibleReviewerIds });
    const reviewCase: CompanyCreditReviewCase = Object.freeze({ schemaVersion: 1, source: 'fixture', profile: 'company-credit-review-v1',
      id: caseId, version: 1, createdAt, context: normalized.context, decisions: Object.freeze([]) });
    return Object.freeze({ outcome: 'created', snapshot: reconstruct(reviewCase, normalized) });
  });
}

export function previewCompanyCreditReview(input: unknown): CompanyCreditReviewSnapshot {
  return boundary(() => {
    const row = record(input, ['case', 'context']); const snapshot = readCase(row.case); const normalized = normalizeContext(row.context);
    if (!same(snapshot.case.context, normalized.context)) return invalid('context_mismatch');
    return snapshot;
  });
}

/** Replay y expectativa son puros: solo las decisiones aplicadas constan en el artefacto, sin CAS durable. */
export function applyCompanyCreditReviewDecision(input: unknown): CompanyCreditReviewTransition {
  return boundary(() => {
    const row = record(input, ['case', 'context', 'command']);
    const snapshot = readCase(row.case); const normalized = normalizeContext(row.context); const command = decisionCommand(row.command);
    // Un contexto cambiado invalida la correlación incluso antes de un replay histórico o un conflicto.
    if (!same(snapshot.case.context, normalized.context)) return invalid('context_mismatch');
    if (command.caseId !== snapshot.case.id) return invalid('reference_mismatch');
    const reviewer = normalized.context.directory.contacts.find(contact => contact.id === command.reviewerContactId);
    if (!reviewer) return invalid('unknown_reference');
    if (reviewer.companyId !== normalized.context.request.companyId) return invalid('cross_company_reference');
    const existing = snapshot.case.decisions.find(item => item.id === command.id);
    if (existing) {
      if (!same(existing, command)) return Object.freeze({ outcome: 'conflict', reason: 'command_id_reused', snapshot });
      // Se devuelve el expediente ACTUAL; no se retiran votos posteriores ni se retrocede versión.
      return Object.freeze({ outcome: 'replayed', snapshot });
    }
    if (command.expectedVersion !== snapshot.case.version) return Object.freeze({ outcome: 'conflict', reason: 'version_mismatch', snapshot });
    let reason: CompanyCreditReviewDecisionBlockReason | null = null;
    if (snapshot.status !== 'pending') reason = 'case_terminal';
    else if (snapshot.decidedReviewerIds.includes(command.reviewerContactId)) reason = 'reviewer_already_decided';
    else if (!normalized.context.reviewPolicy.reviewerContactIds.includes(command.reviewerContactId)) reason = 'reviewer_not_selected';
    else if (reviewer.state === 'inactive') reason = 'reviewer_inactive';
    else if (normalized.context.reviewPolicy.buyerSeparation === 'required' && command.reviewerContactId === normalized.context.request.buyerContactId) {
      reason = 'buyer_separation_required';
    }
    if (reason !== null) return Object.freeze({ outcome: 'blocked', reason, snapshot });
    if (command.occurredAt < snapshot.lastOccurredAt) return invalid('invalid_chronology');
    const nextCase: CompanyCreditReviewCase = Object.freeze({ ...snapshot.case, version: snapshot.case.version + 1,
      decisions: Object.freeze([...snapshot.case.decisions, command]) });
    return Object.freeze({ outcome: 'applied', snapshot: reconstruct(nextCase, normalized) });
  });
}
