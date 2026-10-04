import {
  defineCompanyPurchaseOrderDeclaration, previewCompanyPurchaseOrderDeclaration,
  type CompanyPurchaseOrderDeclaration,
} from './company-purchase-order';
import { isCompanyPurchaseOrderNumber } from './company-purchase-order-number';

export const COMPANY_DOCUMENT_EVIDENCE_LIMITS = /* @__PURE__ */ Object.freeze({
  idLength: 100, amountCents: Number.MAX_SAFE_INTEGER,
});
export type CompanyDocumentRequest = Readonly<{
  schemaVersion: 1; source: 'fixture'; profile: 'company-commercial-document-evidence-v1';
  id: string; declaration: CompanyPurchaseOrderDeclaration;
}>;
/** Magnitud comercial expresamente declarada; nunca un total fiscal reinterpretado. */
export type CompanyDocumentCommercialAmount = Readonly<{
  basis: 'bound_offer_total_as_declared'; currency: 'EUR'; amountCents: number;
}>;
export type CompanyObservedDocument = Readonly<{
  reference: string;
  /** Empresa COMPRADORA declarada, no emisor/proveedor fiscal ni una identidad autenticada. */
  companyId: string | null;
  purchaseOrderNumber: string | null; commercialAmount: CompanyDocumentCommercialAmount | null;
}>;
export type CompanyDocumentEvidenceMetadata = Readonly<{
  ref: string; observedAt: string; coverage: 'complete' | 'incomplete';
}>;
export type CompanyDocumentEvidence =
  | Readonly<{ ref: string; observedAt: string; coverage: 'complete'; document: CompanyObservedDocument | null }>
  | Readonly<{ ref: string; observedAt: string; coverage: 'incomplete'; document: null }>;
type ResponseCommon = Readonly<{ source: 'fixture'; adapterId: string; request: CompanyDocumentRequest }>;
export type CompanyDocumentResponse =
  | (ResponseCommon & Readonly<{ outcome: 'evidence'; evidence: CompanyDocumentEvidence }>)
  | (ResponseCommon & Readonly<{ outcome: 'unavailable'; reason: 'not_configured' | 'unavailable' | 'unsupported' }>);
export type CompanyDocumentExpected = Readonly<{
  companyId: string; purchaseOrderNumber: string | null; commercialAmount: CompanyDocumentCommercialAmount;
}>;
export type CompanyDocumentFieldComparison =
  | Readonly<{ outcome: 'matches' | 'differs'; reason: null; expected: string; observed: string }>
  | Readonly<{ outcome: 'unknown'; reason: 'expected_not_provided' | 'observed_not_provided'; expected: string | null; observed: string | null }>;
type AmountUnknownReason = 'company_not_provided' | 'company_mismatch' | 'expected_po_not_provided'
  | 'observed_po_not_provided' | 'po_mismatch' | 'commercial_amount_not_provided';
export type CompanyDocumentAmountComparison =
  | Readonly<{ outcome: 'compared'; reason: null; expected: CompanyDocumentCommercialAmount; observed: CompanyDocumentCommercialAmount;
    asOf: string; deltaCents: number; position: 'below_declared' | 'equal_declared' | 'above_declared' }>
  | Readonly<{ outcome: 'unknown'; reason: AmountUnknownReason; expected: CompanyDocumentCommercialAmount; observed: null;
    asOf: null; deltaCents: null; position: null }>;
type EvaluationCommon = Readonly<{
  source: 'fixture'; profile: 'company-commercial-document-evidence-v1'; expectedAdapterId: string;
  request: CompanyDocumentRequest; evaluatedAt: string; expected: CompanyDocumentExpected;
  evidenceMetadata: CompanyDocumentEvidenceMetadata | null;
}>;
type EvaluationUnknownReason = 'missing_response' | 'not_configured' | 'unavailable' | 'unsupported'
  | 'future_observation' | 'incomplete_evidence' | 'document_not_provided';
export type CompanyDocumentEvaluation =
  | (EvaluationCommon & Readonly<{ outcome: 'observed'; reason: null;
    observation: Readonly<{ asOf: string; document: CompanyObservedDocument }>;
    comparisons: Readonly<{ company: CompanyDocumentFieldComparison; purchaseOrder: CompanyDocumentFieldComparison;
      amount: CompanyDocumentAmountComparison }> }>)
  | (EvaluationCommon & Readonly<{ outcome: 'unknown'; reason: EvaluationUnknownReason; observation: null; comparisons: null }>);
export type CompanyDocumentContractReason = 'invalid_data' | 'purchase_order_invalid' | 'adapter_mismatch' | 'request_mismatch' | 'duplicate_request';
const ERROR_MESSAGES: Readonly<Record<CompanyDocumentContractReason, string>> = /* @__PURE__ */ Object.freeze({
  invalid_data: 'Los datos no cumplen el contrato de evidencia documental comercial.',
  purchase_order_invalid: 'La consulta no contiene una declaración PO y una oferta válidas.',
  adapter_mismatch: 'La respuesta no corresponde al adaptador declarado.',
  request_mismatch: 'La respuesta no corresponde a la consulta completa declarada.',
  duplicate_request: 'El adaptador contiene una identidad de consulta repetida.',
});
export class CompanyDocumentContractError extends Error {
  readonly code = 'company_document_contract_invalid';
  readonly reason: CompanyDocumentContractReason;
  constructor(reason: CompanyDocumentContractReason) {
    const safe = typeof reason === 'string' && Object.hasOwn(ERROR_MESSAGES, reason) ? reason : 'invalid_data';
    super(ERROR_MESSAGES[safe]); this.name = 'CompanyDocumentContractError'; this.reason = safe;
  }
}
function invalid(reason: CompanyDocumentContractReason = 'invalid_data'): never { throw new CompanyDocumentContractError(reason); }
function boundary<T>(operation: () => T): T {
  try { return operation(); }
  catch (error) {
    let reason: CompanyDocumentContractReason = 'invalid_data';
    try {
      if (error instanceof CompanyDocumentContractError) {
        const descriptor = Object.getOwnPropertyDescriptor(error, 'reason');
        if (descriptor && 'value' in descriptor && typeof descriptor.value === 'string' && Object.hasOwn(ERROR_MESSAGES, descriptor.value)) {
          reason = descriptor.value as CompanyDocumentContractReason;
        }
      }
    } catch { /* Ninguna trampa o mensaje ajeno constituye un error público. */ }
    throw new CompanyDocumentContractError(reason);
  }
}
function purchaseBoundary<T>(operation: () => T): T {
  try { return operation(); } catch { return invalid('purchase_order_invalid'); }
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
function discriminator(input: unknown): unknown {
  if (input === null || typeof input !== 'object') return invalid();
  const descriptor = Object.getOwnPropertyDescriptor(input, 'outcome');
  if (!descriptor?.enumerable || !('value' in descriptor)) return invalid();
  return descriptor.value;
}
function id(input: unknown): string {
  if (typeof input !== 'string' || input.length > COMPANY_DOCUMENT_EVIDENCE_LIMITS.idLength ||
    !/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/.test(input)) return invalid();
  return input;
}
function instant(input: unknown): string {
  if (typeof input !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input) || input.startsWith('0000-')) return invalid();
  const date = new Date(input);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== input) return invalid();
  return input;
}
function readAmount(input: unknown): CompanyDocumentCommercialAmount {
  const row = record(input, ['basis', 'currency', 'amountCents']);
  const value = row.amountCents;
  if (row.basis !== 'bound_offer_total_as_declared' || row.currency !== 'EUR' || typeof value !== 'number' ||
    !Number.isSafeInteger(value) || Object.is(value, -0) || value < 0 || value > COMPANY_DOCUMENT_EVIDENCE_LIMITS.amountCents) return invalid();
  return Object.freeze({ basis: 'bound_offer_total_as_declared', currency: 'EUR', amountCents: value });
}
function readDocument(input: unknown): CompanyObservedDocument {
  const row = record(input, ['reference', 'companyId', 'purchaseOrderNumber', 'commercialAmount']);
  const reference = id(row.reference);
  const companyId = row.companyId === null ? null : id(row.companyId);
  const number = row.purchaseOrderNumber;
  if (number !== null && !isCompanyPurchaseOrderNumber(number)) return invalid();
  const commercialAmount = row.commercialAmount === null ? null : readAmount(row.commercialAmount);
  return Object.freeze({ reference, companyId, purchaseOrderNumber: number, commercialAmount });
}
function readEvidence(input: unknown): CompanyDocumentEvidence {
  const row = record(input, ['ref', 'observedAt', 'coverage', 'document']);
  const ref = id(row.ref); const observedAt = instant(row.observedAt);
  if (row.coverage === 'incomplete') {
    if (row.document !== null) return invalid();
    return Object.freeze({ ref, observedAt, coverage: 'incomplete', document: null });
  }
  if (row.coverage !== 'complete') return invalid();
  const document = row.document === null ? null : readDocument(row.document);
  return Object.freeze({ ref, observedAt, coverage: 'complete', document });
}
function readRequest(input: unknown): CompanyDocumentRequest {
  const row = record(input, ['schemaVersion', 'source', 'profile', 'id', 'declaration']);
  if (row.schemaVersion !== 1 || row.source !== 'fixture' || row.profile !== 'company-commercial-document-evidence-v1') return invalid();
  const requestId = id(row.id);
  const declaration = purchaseBoundary(() => defineCompanyPurchaseOrderDeclaration(row.declaration));
  return Object.freeze({ schemaVersion: 1, source: 'fixture', profile: 'company-commercial-document-evidence-v1', id: requestId, declaration });
}
function readResponse(input: unknown): CompanyDocumentResponse {
  const outcome = discriminator(input);
  if (outcome !== 'evidence' && outcome !== 'unavailable') return invalid();
  const row = record(input, ['source', 'adapterId', 'request', 'outcome', outcome === 'evidence' ? 'evidence' : 'reason']);
  // Releer desde la copia evita aceptar un discriminante que cambió durante la introspección.
  if (row.source !== 'fixture' || row.outcome !== outcome) return invalid();
  const adapterId = id(row.adapterId); const request = readRequest(row.request);
  if (outcome === 'evidence') return Object.freeze({ source: 'fixture', adapterId, request, outcome, evidence: readEvidence(row.evidence) });
  const reason = row.reason;
  if (reason !== 'not_configured' && reason !== 'unavailable' && reason !== 'unsupported') return invalid();
  return Object.freeze({ source: 'fixture', adapterId, request, outcome, reason });
}
function expectedFrom(request: CompanyDocumentRequest): CompanyDocumentExpected {
  const snapshot = purchaseBoundary(() => previewCompanyPurchaseOrderDeclaration({ declaration: request.declaration, binding: request.declaration.binding }));
  return Object.freeze({ companyId: request.declaration.binding.negotiation.context.request.companyId,
    purchaseOrderNumber: request.declaration.purchaseOrder?.number ?? null,
    commercialAmount: Object.freeze({ basis: 'bound_offer_total_as_declared', currency: 'EUR', amountCents: snapshot.offer.offer.totalCents }) });
}
function compareField(expected: string | null, observed: string | null): CompanyDocumentFieldComparison {
  if (expected === null) return Object.freeze({ outcome: 'unknown', reason: 'expected_not_provided', expected, observed });
  if (observed === null) return Object.freeze({ outcome: 'unknown', reason: 'observed_not_provided', expected, observed });
  return Object.freeze({ outcome: expected === observed ? 'matches' : 'differs', reason: null, expected, observed });
}
function compareAmount(expected: CompanyDocumentExpected, document: CompanyObservedDocument, asOf: string): CompanyDocumentAmountComparison {
  let reason: AmountUnknownReason | null = null;
  if (document.companyId === null) reason = 'company_not_provided';
  else if (document.companyId !== expected.companyId) reason = 'company_mismatch';
  else if (expected.purchaseOrderNumber === null) reason = 'expected_po_not_provided';
  else if (document.purchaseOrderNumber === null) reason = 'observed_po_not_provided';
  else if (document.purchaseOrderNumber !== expected.purchaseOrderNumber) reason = 'po_mismatch';
  else if (document.commercialAmount === null) reason = 'commercial_amount_not_provided';
  if (reason !== null) return Object.freeze({ outcome: 'unknown', reason, expected: expected.commercialAmount,
    observed: null, asOf: null, deltaCents: null, position: null });
  const observed = document.commercialAmount;
  if (observed === null) return invalid();
  const delta = BigInt(observed.amountCents) - BigInt(expected.commercialAmount.amountCents);
  if (delta < -BigInt(Number.MAX_SAFE_INTEGER) || delta > BigInt(Number.MAX_SAFE_INTEGER)) return invalid();
  return Object.freeze({ outcome: 'compared', reason: null, expected: expected.commercialAmount, observed, asOf,
    deltaCents: Number(delta), position: delta < 0n ? 'below_declared' : delta > 0n ? 'above_declared' : 'equal_declared' });
}
export function defineCompanyDocumentRequest(input: unknown): CompanyDocumentRequest { return boundary(() => readRequest(input)); }
export function defineCompanyDocumentResponse(input: unknown): CompanyDocumentResponse { return boundary(() => readResponse(input)); }
export function evaluateCompanyDocumentEvidence(input: unknown): CompanyDocumentEvaluation {
  return boundary(() => {
    const row = record(input, ['request', 'expectedAdapterId', 'evaluatedAt', 'response']);
    const request = readRequest(row.request); const expectedAdapterId = id(row.expectedAdapterId); const evaluatedAt = instant(row.evaluatedAt);
    const expected = expectedFrom(request);
    const response = row.response === null ? null : readResponse(row.response);
    if (response !== null) {
      if (response.adapterId !== expectedAdapterId) return invalid('adapter_mismatch');
      // Contexto completo canónico, nunca mera igualdad de IDs o de importes.
      if (JSON.stringify(request) !== JSON.stringify(response.request)) return invalid('request_mismatch');
    }
    const evidence = response?.outcome === 'evidence' ? response.evidence : null;
    const evidenceMetadata: CompanyDocumentEvidenceMetadata | null = evidence === null ? null
      : Object.freeze({ ref: evidence.ref, observedAt: evidence.observedAt, coverage: evidence.coverage });
    const common: EvaluationCommon = Object.freeze({ source: 'fixture', profile: 'company-commercial-document-evidence-v1',
      expectedAdapterId, request, evaluatedAt, expected, evidenceMetadata });
    const unknown = (reason: EvaluationUnknownReason): CompanyDocumentEvaluation => Object.freeze({ ...common, outcome: 'unknown', reason, observation: null, comparisons: null });
    if (response === null) return unknown('missing_response');
    if (response.outcome === 'unavailable') return unknown(response.reason);
    if (evidence === null) return invalid();
    if (evidence.observedAt > evaluatedAt) return unknown('future_observation');
    if (evidence.coverage === 'incomplete') return unknown('incomplete_evidence');
    if (evidence.document === null) return unknown('document_not_provided');
    const document = evidence.document;
    // Su dato propio puede conservarse; solo comparison.amount atribuye una magnitud a la oferta.
    return Object.freeze({ ...common, outcome: 'observed', reason: null,
      observation: Object.freeze({ asOf: evidence.observedAt, document }),
      comparisons: Object.freeze({ company: compareField(expected.companyId, document.companyId),
        purchaseOrder: compareField(expected.purchaseOrderNumber, document.purchaseOrderNumber),
        amount: compareAmount(expected, document, evidence.observedAt) }) });
  });
}
