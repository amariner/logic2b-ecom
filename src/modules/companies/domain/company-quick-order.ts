import { isCompanyQuickOrderSku, MAX_COMPANY_QUICK_ORDER_SKU_LENGTH } from './company-quick-order-sku';

export const COMPANY_QUICK_ORDER_LIMITS = /* @__PURE__ */ Object.freeze({
  idLength: 100, skuLength: MAX_COMPANY_QUICK_ORDER_SKU_LENGTH, products: 1000, perProductVariants: 100, variants: 10000,
  lines: 100, productId: 2_147_483_647, quantityUnits: Number.MAX_SAFE_INTEGER, version: Number.MAX_SAFE_INTEGER,
});
const PROFILE = 'company-quick-order-identity-v1';
export type CompanyQuickOrderCatalogRef = Readonly<{ ref: string; capturedAt: string }>;
export type CompanyQuickOrderCatalogVariant = Readonly<{ id: number; productId: number; sku: string }>;
export type CompanyQuickOrderCatalogProduct = Readonly<{
  id: number; variants: readonly CompanyQuickOrderCatalogVariant[];
}>;
/** Captura declarada de identidad: no acredita visibilidad, stock ni exhaustividad de otro catálogo. */
export type CompanyQuickOrderCatalog = CompanyQuickOrderCatalogRef & Readonly<{
  schemaVersion: 1; source: 'fixture'; profile: typeof PROFILE;
  products: readonly CompanyQuickOrderCatalogProduct[];
}>;
export type CompanyQuickOrderListLine = Readonly<{ id: string; sku: string; quantityUnits: number }>;
/** La versión es metadata declarada; las cantidades y el orden expresan intención, sin agregación. */
export type CompanyQuickOrderList = Readonly<{
  schemaVersion: 1; source: 'fixture'; profile: typeof PROFILE; id: string; version: number;
  origin: 'structured'; catalogRef: CompanyQuickOrderCatalogRef; lines: readonly CompanyQuickOrderListLine[];
}>;
export type CompanyQuickOrderIdentity = Readonly<{ productId: number; variantId: number }>;
export type CompanyQuickOrderLineDiagnostic = Readonly<{
  code: 'repeated_sku' | 'multiple_variants_for_product'; relatedLineIds: readonly string[];
}>;
type CompanyQuickOrderLineResolutionBase = Readonly<{
  position: number; line: CompanyQuickOrderListLine; diagnostics: readonly CompanyQuickOrderLineDiagnostic[];
}>;
export type CompanyQuickOrderLineResolution = CompanyQuickOrderLineResolutionBase & (
  | Readonly<{ outcome: 'resolved'; reason: null; matchCount: 1; identity: CompanyQuickOrderIdentity }>
  | Readonly<{ outcome: 'unresolved'; reason: 'sku_not_found'; matchCount: 0; identity: null }>
  | Readonly<{ outcome: 'unresolved'; reason: 'sku_ambiguous'; matchCount: number; identity: null }>
);
/** Resolved solo identifica un SKU literal en este corte; nunca significa apto para compra. */
export type CompanyQuickOrderPreview = Readonly<{
  source: 'fixture'; profile: typeof PROFILE; catalog: CompanyQuickOrderCatalog; list: CompanyQuickOrderList;
  lines: readonly CompanyQuickOrderLineResolution[];
}>;
export type CompanyQuickOrderContractReason = 'invalid_data' | 'duplicate_product' | 'duplicate_variant'
  | 'cross_product_reference' | 'duplicate_line_id' | 'reference_mismatch';
const ERROR_MESSAGES: Readonly<Record<CompanyQuickOrderContractReason, string>> = /* @__PURE__ */ Object.freeze({
  invalid_data: 'Los datos no cumplen el contrato de lista rápida de identidad.',
  duplicate_product: 'El catálogo contiene una identidad de producto repetida.',
  duplicate_variant: 'El catálogo contiene una identidad de variante repetida.',
  cross_product_reference: 'La variante no pertenece al producto declarado.',
  duplicate_line_id: 'La lista contiene una identidad de fila repetida.',
  reference_mismatch: 'La referencia de la lista no coincide con el catálogo recibido.',
});
export class CompanyQuickOrderContractError extends Error {
  readonly code = 'company_quick_order_contract_invalid';
  readonly reason: CompanyQuickOrderContractReason;
  constructor(reason: CompanyQuickOrderContractReason) {
    const safeReason = typeof reason === 'string' && Object.hasOwn(ERROR_MESSAGES, reason) ? reason : 'invalid_data';
    super(ERROR_MESSAGES[safeReason]); this.name = 'CompanyQuickOrderContractError'; this.reason = safeReason;
  }
}
function invalid(reason: CompanyQuickOrderContractReason = 'invalid_data'): never {
  throw new CompanyQuickOrderContractError(reason);
}
function boundary<T>(operation: () => T): T {
  try { return operation(); }
  catch (error) {
    let reason: CompanyQuickOrderContractReason = 'invalid_data';
    try {
      if (error instanceof CompanyQuickOrderContractError) {
        const descriptor = Object.getOwnPropertyDescriptor(error, 'reason');
        if (descriptor && 'value' in descriptor && typeof descriptor.value === 'string' && Object.hasOwn(ERROR_MESSAGES, descriptor.value)) {
          reason = descriptor.value as CompanyQuickOrderContractReason;
        }
      }
    } catch { /* No propagar mensajes, cause ni trampas del error recibido. */ }
    throw new CompanyQuickOrderContractError(reason);
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
function array(input: unknown, maximum: number, minimum = 0): readonly unknown[] {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) return invalid();
  const lengthDescriptor = Object.getOwnPropertyDescriptor(input, 'length');
  if (!lengthDescriptor || !('value' in lengthDescriptor)) return invalid();
  const length = integer(lengthDescriptor.value, minimum, maximum);
  if (Reflect.ownKeys(input).length !== length + 1) return invalid();
  const result: unknown[] = [];
  for (let index = 0; index < length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
    if (!descriptor?.enumerable || !('value' in descriptor)) return invalid();
    result.push(descriptor.value);
  }
  return Object.freeze(result);
}
function id(input: unknown): string {
  if (typeof input !== 'string' || input.length > COMPANY_QUICK_ORDER_LIMITS.idLength
    || !/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/.test(input)) return invalid();
  return input;
}
function sku(input: unknown): string {
  // Length mide UTF-16; espacios extremos, mayúsculas y NFC/NFD conservan su identidad literal.
  if (!isCompanyQuickOrderSku(input)) return invalid();
  return input;
}
function instant(input: unknown): string {
  if (typeof input !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input)) return invalid();
  const date = new Date(input);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== input) return invalid();
  return input;
}
function catalogRef(input: unknown): CompanyQuickOrderCatalogRef {
  const row = record(input, ['ref', 'capturedAt']);
  return Object.freeze({ ref: id(row.ref), capturedAt: instant(row.capturedAt) });
}

export function defineCompanyQuickOrderCatalog(input: unknown): CompanyQuickOrderCatalog {
  return boundary(() => {
    const row = record(input, ['schemaVersion', 'source', 'profile', 'ref', 'capturedAt', 'products']);
    if (row.schemaVersion !== 1 || row.source !== 'fixture' || row.profile !== PROFILE) return invalid();
    const ref = id(row.ref); const capturedAt = instant(row.capturedAt);
    const productsSeen = new Set<number>(); const variantsSeen = new Set<number>();
    const products = array(row.products, COMPANY_QUICK_ORDER_LIMITS.products).map((inputProduct): CompanyQuickOrderCatalogProduct => {
      const product = record(inputProduct, ['id', 'variants']);
      const productId = integer(product.id, 1, COMPANY_QUICK_ORDER_LIMITS.productId);
      if (productsSeen.has(productId)) return invalid('duplicate_product');
      productsSeen.add(productId);
      const variants = array(product.variants, COMPANY_QUICK_ORDER_LIMITS.perProductVariants, 1).map((inputVariant): CompanyQuickOrderCatalogVariant => {
        const variant = record(inputVariant, ['id', 'productId', 'sku']);
        const variantId = integer(variant.id); const owner = integer(variant.productId, 1, COMPANY_QUICK_ORDER_LIMITS.productId);
        const literal = sku(variant.sku);
        if (owner !== productId) return invalid('cross_product_reference');
        if (variantsSeen.has(variantId)) return invalid('duplicate_variant');
        variantsSeen.add(variantId);
        if (variantsSeen.size > COMPANY_QUICK_ORDER_LIMITS.variants) return invalid();
        return Object.freeze({ id: variantId, productId: owner, sku: literal });
      });
      return Object.freeze({ id: productId, variants: Object.freeze(variants.sort((a, b) => a.id - b.id)) });
    });
    return Object.freeze({ schemaVersion: 1, source: 'fixture', profile: PROFILE, ref, capturedAt,
      products: Object.freeze(products.sort((a, b) => a.id - b.id)) });
  });
}

export function defineCompanyQuickOrderList(input: unknown): CompanyQuickOrderList {
  return boundary(() => {
    const row = record(input, ['schemaVersion', 'source', 'profile', 'id', 'version', 'origin', 'catalogRef', 'lines']);
    if (row.schemaVersion !== 1 || row.source !== 'fixture' || row.profile !== PROFILE || row.origin !== 'structured') return invalid();
    const listId = id(row.id); const version = integer(row.version, 1, COMPANY_QUICK_ORDER_LIMITS.version);
    const reference = catalogRef(row.catalogRef); const linesSeen = new Set<string>();
    const lines = array(row.lines, COMPANY_QUICK_ORDER_LIMITS.lines).map((inputLine): CompanyQuickOrderListLine => {
      const line = record(inputLine, ['id', 'sku', 'quantityUnits']);
      const lineId = id(line.id); const literal = sku(line.sku);
      const quantityUnits = integer(line.quantityUnits, 0, COMPANY_QUICK_ORDER_LIMITS.quantityUnits);
      if (linesSeen.has(lineId)) return invalid('duplicate_line_id');
      linesSeen.add(lineId);
      return Object.freeze({ id: lineId, sku: literal, quantityUnits });
    });
    return Object.freeze({ schemaVersion: 1, source: 'fixture', profile: PROFILE, id: listId, version, origin: 'structured',
      catalogRef: reference, lines: Object.freeze(lines) });
  });
}

export function previewCompanyQuickOrderList(input: unknown): CompanyQuickOrderPreview {
  return boundary(() => {
    const row = record(input, ['catalog', 'list']);
    const catalog = defineCompanyQuickOrderCatalog(row.catalog);
    const list = defineCompanyQuickOrderList(row.list);
    if (list.catalogRef.ref !== catalog.ref || list.catalogRef.capturedAt !== catalog.capturedAt) return invalid('reference_mismatch');

    // Map conserva igualdad literal, incluso claves como __proto__. Nunca elegir un candidato ambiguo.
    const identities = new Map<string, CompanyQuickOrderIdentity[]>();
    for (const product of catalog.products) for (const variant of product.variants) {
      const matches = identities.get(variant.sku) ?? [];
      matches.push(Object.freeze({ productId: product.id, variantId: variant.id }));
      identities.set(variant.sku, matches);
    }
    const resolved = list.lines.map((line, index): CompanyQuickOrderLineResolution => {
      const common = { position: index + 1, line, diagnostics: Object.freeze([]) };
      const matches = identities.get(line.sku);
      if (!matches) return Object.freeze({ ...common, outcome: 'unresolved', reason: 'sku_not_found', matchCount: 0, identity: null });
      if (matches.length === 1) return Object.freeze({ ...common, outcome: 'resolved', reason: null, matchCount: 1, identity: matches[0]! });
      return Object.freeze({ ...common, outcome: 'unresolved', reason: 'sku_ambiguous', matchCount: matches.length, identity: null });
    });
    const lines = resolved.map((resolution): CompanyQuickOrderLineResolution => {
      const diagnostics: CompanyQuickOrderLineDiagnostic[] = [];
      const repeated = list.lines.filter(line => line.id !== resolution.line.id && line.sku === resolution.line.sku);
      if (repeated.length > 0) diagnostics.push(Object.freeze({ code: 'repeated_sku',
        relatedLineIds: Object.freeze(repeated.map(line => line.id)) }));
      if (resolution.identity !== null) {
        const peers = resolved.filter(other => other.identity?.productId === resolution.identity!.productId);
        if (peers.some(other => other.identity!.variantId !== resolution.identity!.variantId)) {
          diagnostics.push(Object.freeze({ code: 'multiple_variants_for_product',
            relatedLineIds: Object.freeze(peers.filter(other => other.line.id !== resolution.line.id).map(other => other.line.id)) }));
        }
      }
      return Object.freeze({ ...resolution, diagnostics: Object.freeze(diagnostics) });
    });
    return Object.freeze({ source: 'fixture', profile: PROFILE, catalog, list, lines: Object.freeze(lines) });
  });
}
