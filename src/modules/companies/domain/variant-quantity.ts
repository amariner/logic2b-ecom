export const VARIANT_QUANTITY_LIMITS = /* @__PURE__ */ Object.freeze({
  products: 1000, perProductVariants: 100, variants: 10000, rules: 10000, lines: 100,
});
export type QuantityCatalogRef = Readonly<{ ref: string; capturedAt: string }>;
export type QuantityCatalogVariant = Readonly<{ id: number; productId: number }>;
export type QuantityCatalogProduct = Readonly<{ id: number; variants: readonly QuantityCatalogVariant[] }>;
/** Identidad declarada del catálogo, sin datos monetarios, stock ni autoridad comercial. */
export type QuantityCatalogSnapshot = QuantityCatalogRef & Readonly<{
  schemaVersion: 1; source: 'fixture'; products: readonly QuantityCatalogProduct[];
}>;
type VariantQuantityRuleBase = Readonly<{
  productId: number; variantId: number; minUnits: number; maxUnits: number; multipleUnits: number;
}>;
export type VariantQuantityRule = VariantQuantityRuleBase & (
  | Readonly<{ orderUnit: 'unit'; unitsPerBox: 1 }>
  | Readonly<{ orderUnit: 'box'; unitsPerBox: number }>
);
export type VariantQuantityPolicyRef = Readonly<{ id: string; version: number }>;
/** Reglas globales por variante/línea; no mínimos agregados de pedido ni overrides de empresa. */
export type VariantQuantityPolicy = VariantQuantityPolicyRef & Readonly<{
  schemaVersion: 1; source: 'fixture'; catalogRef: QuantityCatalogRef; rules: readonly VariantQuantityRule[];
}>;
export type VariantQuantityRequestLine = Readonly<{ productId: number; variantId: number; requestedCount: number }>;
/** policyRef declara la revisión que da significado a requestedCount; no acredita autenticidad. */
export type VariantQuantityRequest = Readonly<{
  schemaVersion: 1; id: string; catalogRef: QuantityCatalogRef; policyRef: VariantQuantityPolicyRef;
  lines: readonly VariantQuantityRequestLine[];
}>;
export type VariantQuantityBlockingReason = 'unconfigured' | 'below_minimum' | 'above_maximum' | 'not_multiple';
export type VariantQuantityLinePreview = VariantQuantityRequestLine & Readonly<{
  orderUnit: 'unit' | 'box' | null; unitsPerBox: number | null; quantityUnits: number | null;
  rule: VariantQuantityRule | null; outcome: 'satisfied' | 'blocked'; reasons: readonly VariantQuantityBlockingReason[];
}>;
/** Satisface únicamente restricciones de cantidad; no precio, visibilidad, stock o permiso de compra. */
export type VariantQuantityPreview = Readonly<{
  source: 'fixture'; catalogRef: QuantityCatalogRef; policyRef: VariantQuantityPolicyRef;
  requestId: string; lines: readonly VariantQuantityLinePreview[];
}>;
export type VariantQuantityContractReason = 'invalid_data' | 'duplicate_rule' | 'duplicate_line' | 'unknown_reference'
  | 'cross_product_reference' | 'reference_mismatch' | 'infeasible_rule' | 'quantity_overflow';
const ERROR_MESSAGES: Readonly<Record<VariantQuantityContractReason, string>> = /* @__PURE__ */ Object.freeze({
  invalid_data: 'Los datos no cumplen el contrato de cantidades por variante.',
  duplicate_rule: 'La política contiene más de una regla para la misma variante.',
  duplicate_line: 'La petición contiene más de una línea para el mismo producto.',
  unknown_reference: 'El artefacto contiene una referencia ausente.',
  cross_product_reference: 'La variante pertenece a otro producto.',
  reference_mismatch: 'Las referencias no coinciden con el catálogo y la política recibidos.',
  infeasible_rule: 'La regla no admite ninguna cantidad válida en su unidad de pedido.',
  quantity_overflow: 'La conversión supera el rango de unidades enteras seguras.',
});
export class VariantQuantityContractError extends Error {
  readonly code = 'variant_quantity_contract_invalid';
  readonly reason: VariantQuantityContractReason;
  constructor(reason: VariantQuantityContractReason) {
    const safeReason = typeof reason === 'string' && Object.hasOwn(ERROR_MESSAGES, reason) ? reason : 'invalid_data';
    super(ERROR_MESSAGES[safeReason]); this.name = 'VariantQuantityContractError'; this.reason = safeReason;
  }
}
function invalid(reason: VariantQuantityContractReason = 'invalid_data'): never { throw new VariantQuantityContractError(reason); }
function boundary<T>(operation: () => T): T {
  try { return operation(); }
  catch (error) {
    let reason: VariantQuantityContractReason = 'invalid_data';
    try {
      if (error instanceof VariantQuantityContractError) {
        const descriptor = Object.getOwnPropertyDescriptor(error, 'reason');
        if (descriptor && 'value' in descriptor && typeof descriptor.value === 'string' && Object.hasOwn(ERROR_MESSAGES, descriptor.value)) {
          reason = descriptor.value as VariantQuantityContractReason;
        }
      }
    } catch { /* El propio error puede contener trampas; no se conserva mensaje, entrada ni cause. */ }
    throw new VariantQuantityContractError(reason);
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
  if (typeof input !== 'string' || input.length > 100 || !/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/.test(input)) return invalid();
  return input;
}
function instant(input: unknown): string {
  if (typeof input !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input)) return invalid();
  const date = new Date(input);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== input) return invalid();
  return input;
}
function catalogRef(input: unknown): QuantityCatalogRef {
  const row = record(input, ['ref', 'capturedAt']);
  return Object.freeze({ ref: id(row.ref), capturedAt: instant(row.capturedAt) });
}
function policyRef(input: unknown): VariantQuantityPolicyRef {
  const row = record(input, ['id', 'version']);
  return Object.freeze({ id: id(row.id), version: integer(row.version) });
}
function gcd(left: bigint, right: bigint): bigint {
  while (right !== 0n) { const remainder = left % right; left = right; right = remainder; }
  return left;
}
function assertFeasible(rule: VariantQuantityRule): void {
  const multiple = BigInt(rule.multipleUnits); const factor = BigInt(rule.unitsPerBox);
  const step = multiple / gcd(multiple, factor) * factor;
  const first = (BigInt(rule.minUnits) + step - 1n) / step * step;
  if (first > BigInt(rule.maxUnits)) return invalid('infeasible_rule');
}

export function defineQuantityCatalogSnapshot(input: unknown): QuantityCatalogSnapshot {
  return boundary(() => {
    const row = record(input, ['schemaVersion', 'source', 'ref', 'capturedAt', 'products']);
    if (row.schemaVersion !== 1 || row.source !== 'fixture') return invalid();
    const ref = id(row.ref); const capturedAt = instant(row.capturedAt);
    const productsSeen = new Set<number>(); const variantsSeen = new Set<number>();
    const products = array(row.products, VARIANT_QUANTITY_LIMITS.products).map((inputProduct): QuantityCatalogProduct => {
      const product = record(inputProduct, ['id', 'variants']); const productId = integer(product.id, 1, 2_147_483_647);
      if (productsSeen.has(productId)) return invalid();
      productsSeen.add(productId);
      const variants = array(product.variants, VARIANT_QUANTITY_LIMITS.perProductVariants, 1).map((inputVariant): QuantityCatalogVariant => {
        const variant = record(inputVariant, ['id', 'productId']); const variantId = integer(variant.id);
        const owner = integer(variant.productId, 1, 2_147_483_647);
        if (owner !== productId) return invalid('cross_product_reference');
        if (variantsSeen.has(variantId)) return invalid();
        variantsSeen.add(variantId);
        if (variantsSeen.size > VARIANT_QUANTITY_LIMITS.variants) return invalid();
        return Object.freeze({ id: variantId, productId: owner });
      });
      return Object.freeze({ id: productId, variants: Object.freeze(variants.sort((a, b) => a.id - b.id)) });
    });
    return Object.freeze({ schemaVersion: 1, source: 'fixture', ref, capturedAt, products: Object.freeze(products.sort((a, b) => a.id - b.id)) });
  });
}

export function defineVariantQuantityPolicy(input: unknown): VariantQuantityPolicy {
  return boundary(() => {
    const row = record(input, ['schemaVersion', 'source', 'id', 'version', 'catalogRef', 'rules']);
    if (row.schemaVersion !== 1 || row.source !== 'fixture') return invalid();
    const policyId = id(row.id); const version = integer(row.version); const reference = catalogRef(row.catalogRef);
    const variants = new Set<number>();
    const rules = array(row.rules, VARIANT_QUANTITY_LIMITS.rules).map((inputRule): VariantQuantityRule => {
      const row = record(inputRule, ['productId', 'variantId', 'orderUnit', 'unitsPerBox', 'minUnits', 'maxUnits', 'multipleUnits']);
      const productId = integer(row.productId, 1, 2_147_483_647); const variantId = integer(row.variantId);
      if (variants.has(variantId)) return invalid('duplicate_rule');
      variants.add(variantId);
      const unitsPerBox = integer(row.unitsPerBox); const minUnits = integer(row.minUnits);
      const maxUnits = integer(row.maxUnits); const multipleUnits = integer(row.multipleUnits);
      if (minUnits > maxUnits) return invalid();
      const base = { productId, variantId, minUnits, maxUnits, multipleUnits };
      let rule: VariantQuantityRule;
      if (row.orderUnit === 'unit' && unitsPerBox === 1) rule = Object.freeze({ ...base, orderUnit: 'unit', unitsPerBox: 1 });
      else if (row.orderUnit === 'box' && unitsPerBox >= 2) rule = Object.freeze({ ...base, orderUnit: 'box', unitsPerBox });
      else return invalid();
      assertFeasible(rule);
      return rule;
    });
    return Object.freeze({ schemaVersion: 1, source: 'fixture', id: policyId, version, catalogRef: reference,
      rules: Object.freeze(rules.sort((a, b) => a.productId - b.productId || a.variantId - b.variantId)) });
  });
}

export function defineVariantQuantityRequest(input: unknown): VariantQuantityRequest {
  return boundary(() => {
    const row = record(input, ['schemaVersion', 'id', 'catalogRef', 'policyRef', 'lines']);
    if (row.schemaVersion !== 1) return invalid();
    const requestId = id(row.id); const catalog = catalogRef(row.catalogRef); const policy = policyRef(row.policyRef);
    const products = new Set<number>();
    const lines = array(row.lines, VARIANT_QUANTITY_LIMITS.lines).map((inputLine): VariantQuantityRequestLine => {
      const row = record(inputLine, ['productId', 'variantId', 'requestedCount']);
      const productId = integer(row.productId, 1, 2_147_483_647); const variantId = integer(row.variantId);
      const requestedCount = integer(row.requestedCount, 0);
      if (products.has(productId)) return invalid('duplicate_line');
      products.add(productId);
      return Object.freeze({ productId, variantId, requestedCount });
    });
    return Object.freeze({ schemaVersion: 1, id: requestId, catalogRef: catalog, policyRef: policy,
      lines: Object.freeze(lines.sort((a, b) => a.productId - b.productId)) });
  });
}
function assertCatalogRef(actual: QuantityCatalogRef, expected: QuantityCatalogRef): void {
  if (actual.ref !== expected.ref || actual.capturedAt !== expected.capturedAt) return invalid('reference_mismatch');
}

/** Valida todas las reglas y líneas antes de evaluar; una ausencia no se convierte en cantidad libre. */
export function previewVariantQuantities(input: unknown): VariantQuantityPreview {
  return boundary(() => {
    const row = record(input, ['catalog', 'policy', 'request']);
    const catalog = defineQuantityCatalogSnapshot(row.catalog); const policy = defineVariantQuantityPolicy(row.policy);
    const request = defineVariantQuantityRequest(row.request);
    assertCatalogRef(policy.catalogRef, catalog); assertCatalogRef(request.catalogRef, catalog);
    if (request.policyRef.id !== policy.id || request.policyRef.version !== policy.version) return invalid('reference_mismatch');
    const products = new Set(catalog.products.map(product => product.id));
    const variants = new Map(catalog.products.flatMap(product => product.variants.map(variant => [variant.id, variant.productId] as const)));
    const assertOwner = (productId: number, variantId: number): void => {
      if (!products.has(productId) || !variants.has(variantId)) return invalid('unknown_reference');
      if (variants.get(variantId) !== productId) return invalid('cross_product_reference');
    };
    for (const rule of policy.rules) assertOwner(rule.productId, rule.variantId);
    for (const line of request.lines) assertOwner(line.productId, line.variantId);
    const rules = new Map(policy.rules.map(rule => [rule.variantId, rule]));
    const lines = request.lines.map((line): VariantQuantityLinePreview => {
      const rule = rules.get(line.variantId);
      if (!rule) return Object.freeze({ ...line, orderUnit: null, unitsPerBox: null, quantityUnits: null, rule: null,
        outcome: 'blocked', reasons: Object.freeze(['unconfigured'] as const) });
      const units = BigInt(line.requestedCount) * BigInt(rule.unitsPerBox);
      if (units > BigInt(Number.MAX_SAFE_INTEGER)) return invalid('quantity_overflow');
      const reasons: VariantQuantityBlockingReason[] = [];
      if (units < BigInt(rule.minUnits)) reasons.push('below_minimum');
      if (units > BigInt(rule.maxUnits)) reasons.push('above_maximum');
      if (units % BigInt(rule.multipleUnits) !== 0n) reasons.push('not_multiple');
      return Object.freeze({ ...line, orderUnit: rule.orderUnit, unitsPerBox: rule.unitsPerBox,
        quantityUnits: Number(units), rule, outcome: reasons.length === 0 ? 'satisfied' : 'blocked', reasons: Object.freeze(reasons) });
    });
    return Object.freeze({ source: 'fixture', catalogRef: catalogRef({ ref: catalog.ref, capturedAt: catalog.capturedAt }),
      policyRef: Object.freeze({ id: policy.id, version: policy.version }), requestId: request.id, lines: Object.freeze(lines) });
  });
}
