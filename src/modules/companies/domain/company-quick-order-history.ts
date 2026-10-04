import {
  COMPANY_QUICK_ORDER_LIMITS, CompanyQuickOrderContractError, defineCompanyQuickOrderCatalog, defineCompanyQuickOrderList,
  type CompanyQuickOrderCatalog, type CompanyQuickOrderCatalogRef, type CompanyQuickOrderCatalogVariant,
  type CompanyQuickOrderIdentity,
} from './company-quick-order';

export const COMPANY_QUICK_ORDER_HISTORY_LIMITS = /* @__PURE__ */ (() => Object.freeze({
  lines: COMPANY_QUICK_ORDER_LIMITS.lines, version: COMPANY_QUICK_ORDER_LIMITS.version,
}))();
const PROFILE = 'company-quick-order-history-v1';
export type CompanyQuickOrderHistoryLine = Readonly<{
  id: string; sku: string; quantityUnits: number; identity: CompanyQuickOrderIdentity | null;
}>;
/** Intención declarada con origen íntegro: no prueba una compra ni continuidad externa de los IDs. */
export type CompanyQuickOrderHistory = Readonly<{
  schemaVersion: 1; source: 'fixture'; profile: typeof PROFILE; id: string; version: number;
  originCatalogRef: CompanyQuickOrderCatalogRef; originCatalog: CompanyQuickOrderCatalog;
  lines: readonly CompanyQuickOrderHistoryLine[];
}>;
export type CompanyQuickOrderHistoricalIdentityComparison =
  | Readonly<{ outcome: 'found'; comparedSku: string; skuRelation: 'same' | 'different' }>
  | Readonly<{ outcome: 'not_found' | 'not_provided'; comparedSku: null; skuRelation: null }>;
export type CompanyQuickOrderHistoricalSkuComparison =
  | Readonly<{ outcome: 'resolved'; reason: null; matchCount: 1; identity: CompanyQuickOrderIdentity;
    relationToHistoricalIdentity: 'same' | 'different' | 'not_provided' }>
  | Readonly<{ outcome: 'unresolved'; reason: 'sku_not_found'; matchCount: 0; identity: null; relationToHistoricalIdentity: null }>
  | Readonly<{ outcome: 'unresolved'; reason: 'sku_ambiguous'; matchCount: number; identity: null; relationToHistoricalIdentity: null }>;
export type CompanyQuickOrderHistoryLinePreview = Readonly<{
  position: number; line: CompanyQuickOrderHistoryLine;
  identityComparison: CompanyQuickOrderHistoricalIdentityComparison; skuComparison: CompanyQuickOrderHistoricalSkuComparison;
}>;
/** Las coincidencias son diagnósticos bajo un espacio de IDs declarado, nunca una intención nueva. */
export type CompanyQuickOrderHistoryPreview = Readonly<{
  source: 'fixture'; profile: typeof PROFILE; identityRelation: 'same_declared_space';
  history: CompanyQuickOrderHistory; comparedCatalog: CompanyQuickOrderCatalog;
  lines: readonly CompanyQuickOrderHistoryLinePreview[];
}>;
export type CompanyQuickOrderHistoryContractReason = 'invalid_data' | 'duplicate_line_id' | 'origin_reference_mismatch'
  | 'unknown_origin_identity' | 'cross_product_reference' | 'origin_sku_mismatch';
const ERROR_MESSAGES: Readonly<Record<CompanyQuickOrderHistoryContractReason, string>> = /* @__PURE__ */ Object.freeze({
  invalid_data: 'Los datos no cumplen el contrato de intención histórica de ejemplo.',
  duplicate_line_id: 'El histórico contiene una identidad de fila repetida.',
  origin_reference_mismatch: 'La referencia histórica no coincide con el catálogo de origen recibido.',
  unknown_origin_identity: 'Una identidad histórica declarada no figura en el catálogo de origen.',
  cross_product_reference: 'La variante histórica declarada pertenece a otro producto de origen.',
  origin_sku_mismatch: 'El SKU histórico no coincide con la identidad declarada en el catálogo de origen.',
});
export class CompanyQuickOrderHistoryContractError extends Error {
  readonly code = 'company_quick_order_history_contract_invalid';
  readonly reason: CompanyQuickOrderHistoryContractReason;
  constructor(reason: CompanyQuickOrderHistoryContractReason) {
    const safeReason = typeof reason === 'string' && Object.hasOwn(ERROR_MESSAGES, reason) ? reason : 'invalid_data';
    super(ERROR_MESSAGES[safeReason]); this.name = 'CompanyQuickOrderHistoryContractError'; this.reason = safeReason;
  }
}
function invalid(reason: CompanyQuickOrderHistoryContractReason = 'invalid_data'): never {
  throw new CompanyQuickOrderHistoryContractError(reason);
}
function boundary<T>(operation: () => T): T {
  try { return operation(); }
  catch (error) {
    let reason: CompanyQuickOrderHistoryContractReason = 'invalid_data';
    try {
      if (error instanceof CompanyQuickOrderHistoryContractError) {
        const descriptor = Object.getOwnPropertyDescriptor(error, 'reason');
        if (descriptor && 'value' in descriptor && typeof descriptor.value === 'string' && Object.hasOwn(ERROR_MESSAGES, descriptor.value)) {
          reason = descriptor.value as CompanyQuickOrderHistoryContractReason;
        }
      }
    } catch { /* No conservar causa, mensaje ni trampas de errores externos. */ }
    throw new CompanyQuickOrderHistoryContractError(reason);
  }
}
function record(input: unknown, keys: readonly string[]): Readonly<Record<string, unknown>> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return invalid();
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return invalid();
  const actual = Reflect.ownKeys(input);
  if (actual.length !== keys.length) return invalid();
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of actual) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (typeof key !== 'string' || !keys.includes(key) || !descriptor?.enumerable || !('value' in descriptor)) return invalid();
    result[key] = descriptor.value;
  }
  return Object.freeze(result);
}
function integer(input: unknown, minimum = 1, maximum = Number.MAX_SAFE_INTEGER): number {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || Object.is(input, -0) || input < minimum || input > maximum) return invalid();
  return input;
}
function array(input: unknown): readonly unknown[] {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) return invalid();
  const descriptor = Object.getOwnPropertyDescriptor(input, 'length');
  if (!descriptor || !('value' in descriptor)) return invalid();
  const length = integer(descriptor.value, 0, COMPANY_QUICK_ORDER_HISTORY_LIMITS.lines);
  if (Reflect.ownKeys(input).length !== length + 1) return invalid();
  const result: unknown[] = [];
  for (let index = 0; index < length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
    if (!descriptor?.enumerable || !('value' in descriptor)) return invalid();
    result.push(descriptor.value);
  }
  return Object.freeze(result);
}
function identity(input: unknown): CompanyQuickOrderIdentity | null {
  if (input === null) return null;
  const row = record(input, ['productId', 'variantId']);
  return Object.freeze({ productId: integer(row.productId, 1, COMPANY_QUICK_ORDER_LIMITS.productId), variantId: integer(row.variantId) });
}
function normalizeBaseFields(input: unknown) {
  try { return defineCompanyQuickOrderList(input); }
  catch (error) {
    let duplicate = false;
    try {
      if (error instanceof CompanyQuickOrderContractError) {
        const descriptor = Object.getOwnPropertyDescriptor(error, 'reason');
        duplicate = !!descriptor && 'value' in descriptor && descriptor.value === 'duplicate_line_id';
      }
    } catch { /* Redactar incluso un error cuyo descriptor no se puede leer. */ }
    return invalid(duplicate ? 'duplicate_line_id' : 'invalid_data');
  }
}

export function defineCompanyQuickOrderHistory(input: unknown): CompanyQuickOrderHistory {
  return boundary(() => {
    const row = record(input, ['schemaVersion', 'source', 'profile', 'id', 'version', 'originCatalogRef', 'originCatalog', 'lines']);
    if (row.schemaVersion !== 1 || row.source !== 'fixture' || row.profile !== PROFILE) return invalid();
    const originCatalog = defineCompanyQuickOrderCatalog(row.originCatalog);
    const captured = array(row.lines).map(inputLine => {
      const line = record(inputLine, ['id', 'sku', 'quantityUnits', 'identity']);
      return Object.freeze({ id: line.id, sku: line.sku, quantityUnits: line.quantityUnits, identity: identity(line.identity) });
    });
    // Esta proyección valida los campos base en su origen; no se ofrece como lista para otro corte.
    const base = normalizeBaseFields({ schemaVersion: 1, source: 'fixture', profile: 'company-quick-order-identity-v1',
      id: row.id, version: row.version, origin: 'structured', catalogRef: row.originCatalogRef,
      lines: captured.map(line => ({ id: line.id, sku: line.sku, quantityUnits: line.quantityUnits })) });
    if (base.catalogRef.ref !== originCatalog.ref || base.catalogRef.capturedAt !== originCatalog.capturedAt) return invalid('origin_reference_mismatch');
    const products = new Set(originCatalog.products.map(product => product.id));
    const variants = new Map(originCatalog.products.flatMap(product => product.variants.map(variant => [variant.id, variant] as const)));
    const lines = base.lines.map((line, index): CompanyQuickOrderHistoryLine => {
      const declared = captured[index]!.identity;
      if (declared !== null) {
        const variant = variants.get(declared.variantId);
        if (!products.has(declared.productId) || !variant) return invalid('unknown_origin_identity');
        if (variant.productId !== declared.productId) return invalid('cross_product_reference');
        if (variant.sku !== line.sku) return invalid('origin_sku_mismatch');
      }
      return Object.freeze({ ...line, identity: declared });
    });
    return Object.freeze({ schemaVersion: 1, source: 'fixture', profile: PROFILE, id: base.id, version: base.version,
      originCatalogRef: base.catalogRef, originCatalog, lines: Object.freeze(lines) });
  });
}
function compareIdentity(line: CompanyQuickOrderHistoryLine, variants: ReadonlyMap<number, CompanyQuickOrderCatalogVariant>): CompanyQuickOrderHistoricalIdentityComparison {
  if (line.identity === null) return Object.freeze({ outcome: 'not_provided', comparedSku: null, skuRelation: null });
  const variant = variants.get(line.identity.variantId);
  if (!variant || variant.productId !== line.identity.productId) return Object.freeze({ outcome: 'not_found', comparedSku: null, skuRelation: null });
  return Object.freeze({ outcome: 'found', comparedSku: variant.sku, skuRelation: variant.sku === line.sku ? 'same' : 'different' });
}
function compareSku(line: CompanyQuickOrderHistoryLine, matches: readonly CompanyQuickOrderIdentity[] | undefined): CompanyQuickOrderHistoricalSkuComparison {
  if (!matches) return Object.freeze({ outcome: 'unresolved', reason: 'sku_not_found', matchCount: 0, identity: null, relationToHistoricalIdentity: null });
  if (matches.length > 1) return Object.freeze({ outcome: 'unresolved', reason: 'sku_ambiguous', matchCount: matches.length, identity: null, relationToHistoricalIdentity: null });
  const found = matches[0]!;
  const relationToHistoricalIdentity = line.identity === null ? 'not_provided'
    : line.identity.productId === found.productId && line.identity.variantId === found.variantId ? 'same' : 'different';
  return Object.freeze({ outcome: 'resolved', reason: null, matchCount: 1, identity: found, relationToHistoricalIdentity });
}

export function previewCompanyQuickOrderHistory(input: unknown): CompanyQuickOrderHistoryPreview {
  return boundary(() => {
    const row = record(input, ['history', 'comparedCatalog', 'identityRelation']);
    if (row.identityRelation !== 'same_declared_space') return invalid();
    const history = defineCompanyQuickOrderHistory(row.history);
    const comparedCatalog = defineCompanyQuickOrderCatalog(row.comparedCatalog);
    const variants = new Map<number, CompanyQuickOrderCatalogVariant>();
    const skus = new Map<string, CompanyQuickOrderIdentity[]>();
    for (const product of comparedCatalog.products) for (const variant of product.variants) {
      variants.set(variant.id, variant);
      const matches = skus.get(variant.sku) ?? [];
      matches.push(Object.freeze({ productId: product.id, variantId: variant.id }));
      skus.set(variant.sku, matches);
    }
    const lines = history.lines.map((line, index): CompanyQuickOrderHistoryLinePreview => Object.freeze({
      position: index + 1, line, identityComparison: compareIdentity(line, variants), skuComparison: compareSku(line, skus.get(line.sku)),
    }));
    return Object.freeze({ source: 'fixture', profile: PROFILE, identityRelation: 'same_declared_space', history, comparedCatalog, lines: Object.freeze(lines) });
  });
}
