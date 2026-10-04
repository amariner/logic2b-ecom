import {
  defineCompanyNegotiation, previewCompanyOfferRevision,
  type CompanyNegotiation, type CompanyOfferSnapshot,
} from './company-negotiation';
import { COMPANY_PURCHASE_ORDER_NUMBER_LENGTH, isCompanyPurchaseOrderNumber } from './company-purchase-order-number';

export const COMPANY_PURCHASE_ORDER_LIMITS = /* @__PURE__ */ Object.freeze({
  idLength: 100, numberLength: COMPANY_PURCHASE_ORDER_NUMBER_LENGTH, documentReferenceLength: 100, version: Number.MAX_SAFE_INTEGER,
});
/** Corte histórico íntegro: ni una referencia abreviada ni la última oferta implícita. */
export type CompanyPurchaseOrderBinding = Readonly<{
  negotiation: CompanyNegotiation; revisionId: string;
}>;
/** Metadatos declarados. El token documental no es un archivo, URL ni prueba de emisión. */
export type CompanyPurchaseOrderReference = Readonly<{
  issuerCompanyId: string; number: string; documentReference: string | null;
}>;
/** version es declarativa; este contrato no acredita historial, unicidad global ni CAS durable. */
export type CompanyPurchaseOrderDeclaration = Readonly<{
  schemaVersion: 1; source: 'fixture'; profile: 'company-po-reference-v1'; id: string; version: number;
  recordedAt: string; binding: CompanyPurchaseOrderBinding; purchaseOrder: CompanyPurchaseOrderReference | null;
}>;
export type CompanyPurchaseOrderSnapshot = Readonly<{
  source: 'fixture'; profile: 'company-po-reference-v1'; declaration: CompanyPurchaseOrderDeclaration;
  offer: CompanyOfferSnapshot; purchaseOrderStatus: 'declared' | 'not_provided';
  documentReferenceStatus: 'declared' | 'not_provided';
}>;
export type CompanyPurchaseOrderContractReason = 'invalid_data' | 'offer_invalid' | 'issuer_mismatch'
  | 'binding_mismatch' | 'invalid_chronology';
const ERROR_MESSAGES: Readonly<Record<CompanyPurchaseOrderContractReason, string>> = /* @__PURE__ */ Object.freeze({
  invalid_data: 'Los datos no cumplen el contrato de referencia PO declarada.',
  offer_invalid: 'El vínculo no contiene una negociación y una oferta válidas.',
  issuer_mismatch: 'La empresa emisora declarada no coincide con la empresa del vínculo.',
  binding_mismatch: 'El vínculo completo difiere del asociado a la referencia declarada.',
  invalid_chronology: 'La asociación declarada precede a las revisiones incluidas en el vínculo.',
});
export class CompanyPurchaseOrderContractError extends Error {
  readonly code = 'company_purchase_order_contract_invalid';
  readonly reason: CompanyPurchaseOrderContractReason;
  constructor(reason: CompanyPurchaseOrderContractReason) {
    const safeReason = typeof reason === 'string' && Object.hasOwn(ERROR_MESSAGES, reason) ? reason : 'invalid_data';
    super(ERROR_MESSAGES[safeReason]); this.name = 'CompanyPurchaseOrderContractError'; this.reason = safeReason;
  }
}
function invalid(reason: CompanyPurchaseOrderContractReason = 'invalid_data'): never {
  throw new CompanyPurchaseOrderContractError(reason);
}
function boundary<T>(operation: () => T): T {
  try { return operation(); }
  catch (error) {
    let reason: CompanyPurchaseOrderContractReason = 'invalid_data';
    try {
      if (error instanceof CompanyPurchaseOrderContractError) {
        const descriptor = Object.getOwnPropertyDescriptor(error, 'reason');
        if (descriptor && 'value' in descriptor && typeof descriptor.value === 'string' && Object.hasOwn(ERROR_MESSAGES, descriptor.value)) {
          reason = descriptor.value as CompanyPurchaseOrderContractReason;
        }
      }
    } catch { /* Ni los getters ni las trampas del error ajeno constituyen un mensaje público. */ }
    throw new CompanyPurchaseOrderContractError(reason);
  }
}
function offerBoundary<T>(operation: () => T): T {
  try { return operation(); } catch { return invalid('offer_invalid'); }
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
function id(input: unknown, maximum = COMPANY_PURCHASE_ORDER_LIMITS.idLength): string {
  if (typeof input !== 'string' || input.length > maximum || !/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/.test(input)) return invalid();
  return input;
}
function version(input: unknown): number {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || Object.is(input, -0) ||
    input < 1 || input > COMPANY_PURCHASE_ORDER_LIMITS.version) return invalid();
  return input;
}
function instant(input: unknown): string {
  if (typeof input !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input) || input.startsWith('0000-')) return invalid();
  const parsed = new Date(input);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== input) return invalid();
  return input;
}
/** Texto exacto: no trim, case folding ni normalización Unicode o numérica. */
function purchaseNumber(input: unknown): string {
  if (!isCompanyPurchaseOrderNumber(input)) return invalid();
  return input;
}
function readBinding(input: unknown): Readonly<{ binding: CompanyPurchaseOrderBinding; offer: CompanyOfferSnapshot }> {
  const row = record(input, ['negotiation', 'revisionId']);
  const revisionId = id(row.revisionId);
  const negotiation = offerBoundary(() => defineCompanyNegotiation(row.negotiation));
  const offer = offerBoundary(() => previewCompanyOfferRevision({ negotiation, context: negotiation.context, revisionId }));
  return Object.freeze({ binding: Object.freeze({ negotiation, revisionId }), offer });
}
function readPurchaseOrder(input: unknown, companyId: string): CompanyPurchaseOrderReference | null {
  if (input === null) return null;
  const row = record(input, ['issuerCompanyId', 'number', 'documentReference']);
  const issuerCompanyId = id(row.issuerCompanyId); const number = purchaseNumber(row.number);
  const documentReference = row.documentReference === null ? null : id(row.documentReference, COMPANY_PURCHASE_ORDER_LIMITS.documentReferenceLength);
  if (issuerCompanyId !== companyId) return invalid('issuer_mismatch');
  return Object.freeze({ issuerCompanyId, number, documentReference });
}
function readDeclaration(input: unknown): Readonly<{ declaration: CompanyPurchaseOrderDeclaration; offer: CompanyOfferSnapshot }> {
  const row = record(input, ['schemaVersion', 'source', 'profile', 'id', 'version', 'recordedAt', 'binding', 'purchaseOrder']);
  if (row.schemaVersion !== 1 || row.source !== 'fixture' || row.profile !== 'company-po-reference-v1') return invalid();
  const declarationId = id(row.id); const revision = version(row.version); const recordedAt = instant(row.recordedAt);
  const { binding, offer } = readBinding(row.binding);
  const purchaseOrder = readPurchaseOrder(row.purchaseOrder, binding.negotiation.context.request.companyId);
  // Fecha de asociación al corte, no fecha de emisión de la PO ni caducidad comercial.
  const latest = binding.negotiation.revisions.at(-1);
  if (!latest) return invalid('offer_invalid');
  if (recordedAt < latest.createdAt) return invalid('invalid_chronology');
  return Object.freeze({ declaration: Object.freeze({ schemaVersion: 1, source: 'fixture', profile: 'company-po-reference-v1',
    id: declarationId, version: revision, recordedAt, binding, purchaseOrder }), offer });
}
export function defineCompanyPurchaseOrderBinding(input: unknown): CompanyPurchaseOrderBinding {
  return boundary(() => readBinding(input).binding);
}
export function defineCompanyPurchaseOrderDeclaration(input: unknown): CompanyPurchaseOrderDeclaration {
  return boundary(() => readDeclaration(input).declaration);
}
export function previewCompanyPurchaseOrderDeclaration(input: unknown): CompanyPurchaseOrderSnapshot {
  return boundary(() => {
    const row = record(input, ['declaration', 'binding']);
    const { declaration, offer } = readDeclaration(row.declaration);
    const external = readBinding(row.binding).binding;
    // Solo copias canónicas; esta igualdad no acredita origen, firma ni autenticidad.
    if (JSON.stringify(declaration.binding) !== JSON.stringify(external)) return invalid('binding_mismatch');
    return Object.freeze({ source: 'fixture', profile: 'company-po-reference-v1', declaration, offer,
      purchaseOrderStatus: declaration.purchaseOrder === null ? 'not_provided' : 'declared',
      documentReferenceStatus: declaration.purchaseOrder?.documentReference == null ? 'not_provided' : 'declared' });
  });
}
