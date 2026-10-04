import { defineCompanyDirectory, type CompanyDirectory, type CompanyDirectoryRef } from './company-directory';
import { defineCompanyCatalogSnapshot, type CompanyCatalogSnapshot, type CompanyCatalogRef } from './company-catalog';

export const COMPANY_NEGOTIATION_LIMITS = /* @__PURE__ */ Object.freeze({
  requestLines: 100, offerLines: 100, revisions: 20, quantityUnits: 10_000,
  unitPriceCents: 1_000_000_000, shippingCents: 1_000_000_000, totalCents: 1_000_000_000,
});
type RequestLine = Readonly<{ productId: number; variantId: number; quantityUnits: number }>;
type OfferLine = RequestLine & Readonly<{ unitPriceCents: number }>;
/** Cantidades declaradas, sin precio solicitado, cajas, stock ni autorización. */
export type CompanyNegotiationRequest = Readonly<{
  schemaVersion: 1; source: 'fixture'; profile: 'company-offer-eur-cents-v1'; id: string; version: number;
  directoryRef: CompanyDirectoryRef; catalogRef: CompanyCatalogRef; companyId: string; buyerContactId: string;
  requestedAt: string; currency: 'EUR'; lines: readonly RequestLine[];
}>;
export type CompanyNegotiationContext = Readonly<{
  directory: CompanyDirectory; catalog: CompanyCatalogSnapshot; request: CompanyNegotiationRequest;
}>;
/** proposedBy declara un lado, nunca una persona, un permiso o una aceptación. */
export type CompanyOfferRevision = Readonly<{
  id: string; revision: number; previousRevisionId: string | null; proposedBy: 'buyer' | 'seller';
  createdAt: string; expiresAt: string; lines: readonly OfferLine[]; shippingCents: number;
}>;
/** El historial conserva propuestas completas; los estados comerciales pertenecen a ORD-008. */
export type CompanyNegotiation = Readonly<{
  schemaVersion: 1; source: 'fixture'; profile: 'company-offer-eur-cents-v1'; id: string; version: number;
  createdAt: string; context: CompanyNegotiationContext; revisions: readonly CompanyOfferRevision[];
}>;
export type CompanyOfferAppendCommand = Readonly<{
  negotiationId: string; expectedVersion: number; revision: CompanyOfferRevision;
}>;
export type CompanyOfferAmountLine = OfferLine & Readonly<{ lineTotalCents: number }>;
type OfferWithAmounts = Omit<CompanyOfferRevision, 'lines'> & Readonly<{
  lines: readonly CompanyOfferAmountLine[]; subtotalCents: number; totalCents: number;
}>;
export type CompanyOfferSnapshot = Readonly<{
  source: 'fixture'; profile: 'company-offer-eur-cents-v1'; negotiationRef: Readonly<{ id: string; version: number }>;
  context: CompanyNegotiationContext; offer: OfferWithAmounts;
}>;
export type CompanyOfferTransition =
  | Readonly<{ outcome: 'appended' | 'replayed'; negotiation: CompanyNegotiation }>
  | Readonly<{ outcome: 'conflict'; reason: 'version_mismatch' | 'revision_id_reused'; negotiation: CompanyNegotiation }>;
type LineField = 'variantId' | 'quantityUnits' | 'unitPriceCents';
type OfferField = 'proposedBy' | 'createdAt' | 'expiresAt' | 'shippingCents';
type LineChange = Readonly<{
  productId: number; kind: 'added' | 'removed' | 'changed';
  before: CompanyOfferAmountLine | null; after: CompanyOfferAmountLine | null; changedFields: readonly LineField[];
}>;
export type CompanyOfferComparison = Readonly<{
  source: 'fixture'; profile: 'company-offer-eur-cents-v1'; negotiationRef: Readonly<{ id: string; version: number }>;
  context: CompanyNegotiationContext; before: OfferWithAmounts; after: OfferWithAmounts;
  lineChanges: readonly LineChange[]; changedFields: readonly OfferField[];
  deltas: Readonly<{ subtotalCents: number; shippingCents: number; totalCents: number }>;
}>;
export type CompanyNegotiationContractReason = 'invalid_data' | 'context_invalid' | 'duplicate_line' | 'unknown_reference'
  | 'cross_company_reference' | 'cross_product_reference' | 'reference_mismatch' | 'context_mismatch'
  | 'unexpected_offer_product' | 'invalid_history' | 'invalid_chronology' | 'amount_out_of_range' | 'history_limit' | 'unknown_revision';
const ERROR_MESSAGES: Readonly<Record<CompanyNegotiationContractReason, string>> = /* @__PURE__ */ Object.freeze({
  invalid_data: 'Los datos no cumplen el contrato de negociación de empresa.',
  context_invalid: 'El contexto declarado no cumple los contratos de directorio y catálogo.',
  duplicate_line: 'La selección contiene un producto repetido.',
  unknown_reference: 'Una referencia no existe en el contexto declarado.',
  cross_company_reference: 'El contacto declarado pertenece a otra empresa.',
  cross_product_reference: 'La variante declarada pertenece a otro producto.',
  reference_mismatch: 'Las referencias no coinciden con el contexto declarado.',
  context_mismatch: 'El contexto completo difiere del ligado a la negociación.',
  unexpected_offer_product: 'La oferta incluye un producto ajeno a la solicitud.',
  invalid_history: 'El historial no representa una secuencia íntegra de revisiones.',
  invalid_chronology: 'Las fechas declaradas no respetan la secuencia de la negociación.',
  amount_out_of_range: 'El importe total no pertenece al perfil de oferta declarado.',
  history_limit: 'La negociación alcanzó el límite de revisiones del perfil.',
  unknown_revision: 'La revisión seleccionada no existe en la negociación.',
});
export class CompanyNegotiationContractError extends Error {
  readonly code = 'company_negotiation_contract_invalid';
  readonly reason: CompanyNegotiationContractReason;
  constructor(reason: CompanyNegotiationContractReason) {
    const safeReason = typeof reason === 'string' && Object.hasOwn(ERROR_MESSAGES, reason) ? reason : 'invalid_data';
    super(ERROR_MESSAGES[safeReason]); this.name = 'CompanyNegotiationContractError'; this.reason = safeReason;
  }
}
function invalid(reason: CompanyNegotiationContractReason = 'invalid_data'): never { throw new CompanyNegotiationContractError(reason); }
/** Incluye errores hostiles de introspección: ningún mensaje, getter o causa ajenos se propaga. */
function boundary<T>(operation: () => T): T {
  try { return operation(); }
  catch (error) {
    let reason: CompanyNegotiationContractReason = 'invalid_data';
    try {
      if (error instanceof CompanyNegotiationContractError) {
        const descriptor = Object.getOwnPropertyDescriptor(error, 'reason');
        if (descriptor && 'value' in descriptor && typeof descriptor.value === 'string' && Object.hasOwn(ERROR_MESSAGES, descriptor.value)) {
          reason = descriptor.value as CompanyNegotiationContractReason;
        }
      }
    } catch { /* El error también puede ser un Proxy. */ }
    throw new CompanyNegotiationContractError(reason);
  }
}
function contextBoundary<T>(operation: () => T): T {
  try { return operation(); } catch { return invalid('context_invalid'); }
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
function integer(input: unknown, minimum = 1, maximum = Number.MAX_SAFE_INTEGER): number {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || Object.is(input, -0) || input < minimum || input > maximum) return invalid();
  return input;
}
function array(input: unknown, maximum: number, minimum = 0): readonly unknown[] {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) return invalid();
  const descriptor = Object.getOwnPropertyDescriptor(input, 'length');
  if (!descriptor || !('value' in descriptor)) return invalid();
  const length = integer(descriptor.value, minimum, maximum);
  if (Reflect.ownKeys(input).length !== length + 1) return invalid();
  const result: unknown[] = [];
  for (let index = 0; index < length; index++) {
    const item = Object.getOwnPropertyDescriptor(input, String(index));
    if (!item?.enumerable || !('value' in item)) return invalid();
    result.push(item.value);
  }
  return Object.freeze(result);
}
function id(input: unknown): string {
  if (typeof input !== 'string' || input.length > 100 || !/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/.test(input)) return invalid();
  return input;
}
function instant(input: unknown, metadata = false): string {
  if (typeof input !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input) ||
    (!metadata && input.startsWith('0000-'))) return invalid();
  const parsed = new Date(input);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== input) return invalid();
  return input;
}
function directoryRef(input: unknown): CompanyDirectoryRef {
  const row = record(input, ['id', 'version', 'capturedAt']);
  return Object.freeze({ id: id(row.id), version: integer(row.version), capturedAt: instant(row.capturedAt, true) });
}
function catalogRef(input: unknown): CompanyCatalogRef {
  const row = record(input, ['ref', 'capturedAt']);
  return Object.freeze({ ref: id(row.ref), capturedAt: instant(row.capturedAt, true) });
}
function header(row: Readonly<Record<string, unknown>>): void {
  if (row.schemaVersion !== 1 || row.source !== 'fixture' || row.profile !== 'company-offer-eur-cents-v1') return invalid();
}
function lineIdentity(row: Readonly<Record<string, unknown>>): RequestLine {
  return Object.freeze({ productId: integer(row.productId, 1, 2_147_483_647), variantId: integer(row.variantId),
    quantityUnits: integer(row.quantityUnits, 1, COMPANY_NEGOTIATION_LIMITS.quantityUnits) });
}
function canonicalLines<T extends RequestLine>(lines: T[]): readonly T[] {
  const seen = new Set<number>();
  for (const line of lines) {
    if (seen.has(line.productId)) return invalid('duplicate_line');
    seen.add(line.productId);
  }
  return Object.freeze(lines.sort((a, b) => a.productId - b.productId));
}
function readRequest(input: unknown): CompanyNegotiationRequest {
  const row = record(input, ['schemaVersion', 'source', 'profile', 'id', 'version', 'directoryRef', 'catalogRef',
    'companyId', 'buyerContactId', 'requestedAt', 'currency', 'lines']);
  header(row);
  if (row.currency !== 'EUR') return invalid();
  const requestId = id(row.id); const version = integer(row.version);
  const directory = directoryRef(row.directoryRef); const catalog = catalogRef(row.catalogRef);
  const companyId = id(row.companyId); const buyerContactId = id(row.buyerContactId); const requestedAt = instant(row.requestedAt);
  const lines = canonicalLines(array(row.lines, COMPANY_NEGOTIATION_LIMITS.requestLines, 1)
    .map(value => lineIdentity(record(value, ['productId', 'variantId', 'quantityUnits']))));
  return Object.freeze({ schemaVersion: 1, source: 'fixture', profile: 'company-offer-eur-cents-v1', id: requestId, version,
    directoryRef: directory, catalogRef: catalog, companyId, buyerContactId, requestedAt, currency: 'EUR', lines });
}
export function defineCompanyNegotiationRequest(input: unknown): CompanyNegotiationRequest { return boundary(() => readRequest(input)); }
function assertLineReferences(lines: readonly RequestLine[], catalog: CompanyCatalogSnapshot): void {
  const products = new Set(catalog.products.map(product => product.id));
  const owners = new Map(catalog.products.flatMap(product => product.variants.map(variant => [variant.id, product.id] as const)));
  for (const line of lines) {
    const owner = owners.get(line.variantId);
    if (!products.has(line.productId) || owner === undefined) return invalid('unknown_reference');
    if (owner !== line.productId) return invalid('cross_product_reference');
  }
}
/** El contexto entero se copia antes de validar relaciones; no se consulta su origen ni se deducen permisos. */
function readContext(input: unknown): CompanyNegotiationContext {
  const row = record(input, ['directory', 'catalog', 'request']);
  const directory = contextBoundary(() => defineCompanyDirectory(row.directory));
  const catalog = contextBoundary(() => defineCompanyCatalogSnapshot(row.catalog));
  const request = readRequest(row.request);
  if (request.directoryRef.id !== directory.id || request.directoryRef.version !== directory.version ||
    request.directoryRef.capturedAt !== directory.capturedAt || request.catalogRef.ref !== catalog.ref ||
    request.catalogRef.capturedAt !== catalog.capturedAt) return invalid('reference_mismatch');
  const company = directory.companies.find(item => item.id === request.companyId);
  const buyer = directory.contacts.find(item => item.id === request.buyerContactId);
  if (!company || !buyer) return invalid('unknown_reference');
  if (buyer.companyId !== company.id) return invalid('cross_company_reference');
  assertLineReferences(request.lines, catalog);
  return Object.freeze({ directory, catalog, request });
}
/** No redondea ni usa precio de catálogo. Number solo recibe valores ya acotados por el total positivo. */
function amounts(revision: CompanyOfferRevision): OfferWithAmounts {
  const totals = revision.lines.map(line => BigInt(line.unitPriceCents) * BigInt(line.quantityUnits));
  const subtotal = totals.reduce((sum, value) => sum + value, 0n);
  const total = subtotal + BigInt(revision.shippingCents);
  if (total < 1n || total > BigInt(COMPANY_NEGOTIATION_LIMITS.totalCents)) return invalid('amount_out_of_range');
  return Object.freeze({ ...revision,
    lines: Object.freeze(revision.lines.map((line, index) => Object.freeze({ ...line, lineTotalCents: Number(totals[index]!) }))),
    subtotalCents: Number(subtotal), totalCents: Number(total) });
}
function readRevision(input: unknown, context: CompanyNegotiationContext): CompanyOfferRevision {
  const row = record(input, ['id', 'revision', 'previousRevisionId', 'proposedBy', 'createdAt', 'expiresAt', 'lines', 'shippingCents']);
  const revisionId = id(row.id); const revision = integer(row.revision);
  const previousRevisionId = row.previousRevisionId === null ? null : id(row.previousRevisionId);
  if (row.proposedBy !== 'buyer' && row.proposedBy !== 'seller') return invalid();
  const createdAt = instant(row.createdAt); const expiresAt = instant(row.expiresAt);
  if (expiresAt <= createdAt) return invalid('invalid_chronology');
  const lines = canonicalLines(array(row.lines, COMPANY_NEGOTIATION_LIMITS.offerLines, 1).map((value): OfferLine => {
    const line = record(value, ['productId', 'variantId', 'quantityUnits', 'unitPriceCents']);
    return Object.freeze({ ...lineIdentity(line), unitPriceCents: integer(line.unitPriceCents, 0, COMPANY_NEGOTIATION_LIMITS.unitPriceCents) });
  }));
  assertLineReferences(lines, context.catalog);
  const requestedProducts = new Set(context.request.lines.map(line => line.productId));
  if (lines.some(line => !requestedProducts.has(line.productId))) return invalid('unexpected_offer_product');
  const result: CompanyOfferRevision = Object.freeze({ id: revisionId, revision, previousRevisionId, proposedBy: row.proposedBy,
    createdAt, expiresAt, lines, shippingCents: integer(row.shippingCents, 0, COMPANY_NEGOTIATION_LIMITS.shippingCents) });
  amounts(result); // También se valida el dinero de revisiones históricas o candidatas que no se seleccionan.
  return result;
}
function assertNext(revision: CompanyOfferRevision, previous: CompanyOfferRevision | undefined, createdAt: string, ordinal: number): void {
  if (revision.revision !== ordinal || revision.previousRevisionId !== (previous?.id ?? null)) return invalid('invalid_history');
  if (revision.createdAt < createdAt || (previous && revision.createdAt < previous.createdAt)) return invalid('invalid_chronology');
}
function readNegotiation(input: unknown): CompanyNegotiation {
  const row = record(input, ['schemaVersion', 'source', 'profile', 'id', 'version', 'createdAt', 'context', 'revisions']);
  header(row);
  const negotiationId = id(row.id); const version = integer(row.version); const createdAt = instant(row.createdAt);
  const context = readContext(row.context);
  if (createdAt < context.request.requestedAt) return invalid('invalid_chronology');
  const revisions = array(row.revisions, COMPANY_NEGOTIATION_LIMITS.revisions).map(value => readRevision(value, context));
  if (version !== revisions.length + 1) return invalid('invalid_history');
  const seen = new Set<string>();
  for (let index = 0; index < revisions.length; index++) {
    const revision = revisions[index]!;
    if (seen.has(revision.id)) return invalid('invalid_history');
    seen.add(revision.id);
    assertNext(revision, revisions[index - 1], createdAt, index + 1);
  }
  return Object.freeze({ schemaVersion: 1, source: 'fixture', profile: 'company-offer-eur-cents-v1', id: negotiationId,
    version, createdAt, context, revisions: Object.freeze(revisions) });
}
export function defineCompanyNegotiation(input: unknown): CompanyNegotiation { return boundary(() => readNegotiation(input)); }
export function createCompanyNegotiation(input: unknown): CompanyNegotiation {
  return boundary(() => {
    const row = record(input, ['id', 'createdAt', 'context']);
    const negotiationId = id(row.id); const createdAt = instant(row.createdAt); const context = readContext(row.context);
    if (createdAt < context.request.requestedAt) return invalid('invalid_chronology');
    return Object.freeze({ schemaVersion: 1, source: 'fixture', profile: 'company-offer-eur-cents-v1', id: negotiationId,
      version: 1, createdAt, context, revisions: Object.freeze([]) });
  });
}
/** Igualdad exclusiva de copias canónicas; no pretende firma, autenticidad ni CAS durable. */
function same(left: unknown, right: unknown): boolean { return JSON.stringify(left) === JSON.stringify(right); }
function boundNegotiation(negotiationInput: unknown, contextInput: unknown): CompanyNegotiation {
  const negotiation = readNegotiation(negotiationInput); const context = readContext(contextInput);
  if (!same(negotiation.context, context)) return invalid('context_mismatch');
  return negotiation;
}
export function appendCompanyOfferRevision(input: unknown): CompanyOfferTransition {
  return boundary(() => {
    const row = record(input, ['negotiation', 'context', 'command']);
    const negotiation = boundNegotiation(row.negotiation, row.context);
    const command = record(row.command, ['negotiationId', 'expectedVersion', 'revision']);
    const negotiationId = id(command.negotiationId); const expectedVersion = integer(command.expectedVersion);
    const revision = readRevision(command.revision, negotiation.context);
    if (negotiationId !== negotiation.id) return invalid('reference_mismatch');
    const stored = negotiation.revisions.find(item => item.id === revision.id);
    if (stored) {
      // La revisión n se añadió con expectedVersion n. Reconstruye el comando completo, no solo el ID.
      if (expectedVersion === stored.revision && same(stored, revision)) return Object.freeze({ outcome: 'replayed', negotiation });
      return Object.freeze({ outcome: 'conflict', reason: 'revision_id_reused', negotiation });
    }
    if (expectedVersion !== negotiation.version) return Object.freeze({ outcome: 'conflict', reason: 'version_mismatch', negotiation });
    if (negotiation.revisions.length === COMPANY_NEGOTIATION_LIMITS.revisions) return invalid('history_limit');
    assertNext(revision, negotiation.revisions.at(-1), negotiation.createdAt, negotiation.revisions.length + 1);
    return Object.freeze({ outcome: 'appended', negotiation: Object.freeze({ ...negotiation, version: negotiation.version + 1,
      revisions: Object.freeze([...negotiation.revisions, revision]) }) });
  });
}
function selectedOffer(negotiation: CompanyNegotiation, revisionInput: unknown): OfferWithAmounts {
  const revisionId = id(revisionInput); const revision = negotiation.revisions.find(item => item.id === revisionId);
  if (!revision) return invalid('unknown_revision');
  return amounts(revision);
}
function negotiationRef(negotiation: CompanyNegotiation) { return Object.freeze({ id: negotiation.id, version: negotiation.version }); }
export function previewCompanyOfferRevision(input: unknown): CompanyOfferSnapshot {
  return boundary(() => {
    const row = record(input, ['negotiation', 'context', 'revisionId']);
    const negotiation = boundNegotiation(row.negotiation, row.context);
    return Object.freeze({ source: 'fixture', profile: 'company-offer-eur-cents-v1', negotiationRef: negotiationRef(negotiation),
      context: negotiation.context, offer: selectedOffer(negotiation, row.revisionId) });
  });
}
export function compareCompanyOfferRevisions(input: unknown): CompanyOfferComparison {
  return boundary(() => {
    const row = record(input, ['negotiation', 'context', 'beforeRevisionId', 'afterRevisionId']);
    const negotiation = boundNegotiation(row.negotiation, row.context);
    const before = selectedOffer(negotiation, row.beforeRevisionId); const after = selectedOffer(negotiation, row.afterRevisionId);
    const beforeLines = new Map(before.lines.map(line => [line.productId, line]));
    const afterLines = new Map(after.lines.map(line => [line.productId, line]));
    const productIds = [...new Set([...beforeLines.keys(), ...afterLines.keys()])].sort((a, b) => a - b);
    const lineChanges: LineChange[] = [];
    const lineFields: readonly LineField[] = ['variantId', 'quantityUnits', 'unitPriceCents'];
    for (const productId of productIds) {
      const previous = beforeLines.get(productId) ?? null; const next = afterLines.get(productId) ?? null;
      if (!previous || !next) {
        lineChanges.push(Object.freeze({ productId, kind: previous ? 'removed' : 'added', before: previous, after: next,
          changedFields: Object.freeze([]) }));
      } else {
        const changedFields = Object.freeze(lineFields.filter(field => previous[field] !== next[field]));
        if (changedFields.length > 0) lineChanges.push(Object.freeze({ productId, kind: 'changed', before: previous, after: next, changedFields }));
      }
    }
    const offerFields: readonly OfferField[] = ['proposedBy', 'createdAt', 'expiresAt', 'shippingCents'];
    const delta = (left: number, right: number) => Number(BigInt(right) - BigInt(left));
    return Object.freeze({ source: 'fixture', profile: 'company-offer-eur-cents-v1', negotiationRef: negotiationRef(negotiation),
      context: negotiation.context, before, after, lineChanges: Object.freeze(lineChanges),
      changedFields: Object.freeze(offerFields.filter(field => before[field] !== after[field])),
      deltas: Object.freeze({ subtotalCents: delta(before.subtotalCents, after.subtotalCents), shippingCents: delta(before.shippingCents, after.shippingCents),
        totalCents: delta(before.totalCents, after.totalCents) }) });
  });
}
