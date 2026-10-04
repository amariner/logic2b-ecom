import { defineCompanyDirectory, type CompanyDirectory, type CompanyDirectoryRef, type CompanyDirectoryState } from './company-directory';

export const COMPANY_CATALOG_LIMITS = /* @__PURE__ */ Object.freeze({
  products: 1000, perProductVariants: 100, variants: 10000, rules: 10000, ruleVariantRefs: 100000, bindings: 100,
});
export type CompanyCatalogRef = Readonly<{ ref: string; capturedAt: string }>;
export type CompanyCatalogVariant = Readonly<{
  id: number; productId: number; status: 'draft' | 'active' | 'archived'; priceCents: number;
}>;
export type CompanyCatalogProduct = Readonly<{ id: number; active: boolean; variants: readonly CompanyCatalogVariant[] }>;
/** Proyección completa aportada por el llamador: no acredita lectura D1, stock ni precio de compra. */
export type CompanyCatalogSnapshot = CompanyCatalogRef & Readonly<{
  schemaVersion: 1; source: 'fixture'; currency: 'EUR'; products: readonly CompanyCatalogProduct[];
}>;
export type CompanyCatalogRule = Readonly<{
  companyId: string; productId: number; state: 'included' | 'excluded'; variantIds: readonly number[];
}>;
/** Restricción global por empresa/producto; mercado y canal pertenecen a la publicación de mercados. */
export type CompanyCatalogPolicy = Readonly<{
  schemaVersion: 1; source: 'fixture'; id: string; version: number;
  directoryRef: CompanyDirectoryRef; catalogRef: CompanyCatalogRef; rules: readonly CompanyCatalogRule[];
}>;
export type CompanyPricingBinding = Readonly<{ companyId: string; companyKeyHash: string }>;
/** Una clave compartida declara una cohorte de listas; nunca identidad, pertenencia o catálogo compartido. */
export type CompanyPricingBindings = Readonly<{
  schemaVersion: 1; source: 'fixture'; id: string; version: number;
  directoryRef: CompanyDirectoryRef; bindings: readonly CompanyPricingBinding[];
}>;
export type CompanyCatalogRestrictionState = 'included' | 'excluded' | 'unconfigured';
export type CompanyCatalogProductRestrictionReason = 'company_inactive' | 'company_unconfigured' | 'company_excluded';
export type CompanyCatalogVariantRestrictionReason = CompanyCatalogProductRestrictionReason | 'company_variant_not_selected';
export type CompanyCatalogVariantRestriction = Readonly<{
  variantId: number; selected: boolean; eligible: boolean; reasons: readonly CompanyCatalogVariantRestrictionReason[];
}>;
export type CompanyCatalogProductRestriction = Readonly<{
  productId: number; restriction: CompanyCatalogRestrictionState; eligible: boolean;
  reasons: readonly CompanyCatalogProductRestrictionReason[]; selectedVariantIds: readonly number[];
  variants: readonly CompanyCatalogVariantRestriction[];
}>;
/** Elegibilidad de la restricción empresarial, todavía sin intersección con publicación ni lifecycle. */
export type CompanyCatalogRestrictionPreview = Readonly<{
  source: 'fixture'; directoryRef: CompanyDirectoryRef; catalogRef: CompanyCatalogRef;
  policyRef: Readonly<{ id: string; version: number }>; company: Readonly<{ id: string; state: CompanyDirectoryState }>;
  products: readonly CompanyCatalogProductRestriction[];
}>;
export type CompanyPricingBindingSelection = Readonly<{
  source: 'fixture'; directoryRef: CompanyDirectoryRef; bindingsRef: Readonly<{ id: string; version: number }>;
  companyId: string; binding: CompanyPricingBinding | null;
}>;
export type CompanyCatalogContractReason = 'invalid_data' | 'duplicate_id' | 'duplicate_rule' | 'unknown_reference'
  | 'cross_product_reference' | 'reference_mismatch' | 'unknown_company';
const ERROR_MESSAGES: Readonly<Record<CompanyCatalogContractReason, string>> = /* @__PURE__ */ Object.freeze({
  invalid_data: 'Los datos no cumplen el contrato de catálogo de empresa.',
  duplicate_id: 'El artefacto contiene un identificador duplicado.',
  duplicate_rule: 'La política contiene una regla de empresa y producto duplicada.',
  unknown_reference: 'El artefacto contiene una referencia ausente.',
  cross_product_reference: 'La variante pertenece a otro producto.',
  reference_mismatch: 'Las referencias del artefacto no coinciden con los datos recibidos.',
  unknown_company: 'La empresa solicitada no está presente en el directorio.',
});
export class CompanyCatalogContractError extends Error {
  readonly code = 'company_catalog_contract_invalid';
  readonly reason: CompanyCatalogContractReason;
  constructor(reason: CompanyCatalogContractReason) {
    const safeReason = typeof reason === 'string' && Object.hasOwn(ERROR_MESSAGES, reason) ? reason : 'invalid_data';
    super(ERROR_MESSAGES[safeReason]); this.name = 'CompanyCatalogContractError'; this.reason = safeReason;
  }
}
function invalid(reason: CompanyCatalogContractReason = 'invalid_data'): never { throw new CompanyCatalogContractError(reason); }
/** No conserva mensajes ni causas de dependencias o trampas de introspección de datos hostiles. */
function boundary<T>(operation: () => T): T {
  try { return operation(); }
  catch (error) {
    let reason: CompanyCatalogContractReason = 'invalid_data';
    try {
      if (error instanceof CompanyCatalogContractError) {
        const descriptor = Object.getOwnPropertyDescriptor(error, 'reason');
        if (descriptor && 'value' in descriptor && typeof descriptor.value === 'string' && Object.hasOwn(ERROR_MESSAGES, descriptor.value)) {
          reason = descriptor.value as CompanyCatalogContractReason;
        }
      }
    } catch { /* También el propio error puede ser hostil. */ }
    throw new CompanyCatalogContractError(reason);
  }
}
function record(input: unknown, keys: readonly string[]): Readonly<Record<string, unknown>> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return invalid();
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return invalid();
  const actual = Reflect.ownKeys(input);
  if (actual.length !== keys.length) return invalid();
  const copy: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of actual) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (typeof key !== 'string' || !keys.includes(key) || !descriptor?.enumerable || !('value' in descriptor)) return invalid();
    copy[key] = descriptor.value;
  }
  return Object.freeze(copy);
}
function array(input: unknown, maximum: number, minimum = 0): readonly unknown[] {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) return invalid();
  const lengthDescriptor = Object.getOwnPropertyDescriptor(input, 'length');
  if (!lengthDescriptor || !('value' in lengthDescriptor)) return invalid();
  const length = integer(lengthDescriptor.value, minimum, maximum);
  if (Reflect.ownKeys(input).length !== length + 1) return invalid();
  const copy: unknown[] = [];
  for (let index = 0; index < length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
    if (!descriptor?.enumerable || !('value' in descriptor)) return invalid();
    copy.push(descriptor.value);
  }
  return Object.freeze(copy);
}
function integer(input: unknown, minimum = 1, maximum = Number.MAX_SAFE_INTEGER): number {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || Object.is(input, -0) || input < minimum || input > maximum) return invalid();
  return input;
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
function directoryRef(input: unknown): CompanyDirectoryRef {
  const row = record(input, ['id', 'version', 'capturedAt']);
  return Object.freeze({ id: id(row.id), version: integer(row.version), capturedAt: instant(row.capturedAt) });
}
function catalogRef(input: unknown): CompanyCatalogRef {
  const row = record(input, ['ref', 'capturedAt']);
  return Object.freeze({ ref: id(row.ref), capturedAt: instant(row.capturedAt) });
}
function header(row: Readonly<Record<string, unknown>>): void { if (row.schemaVersion !== 1 || row.source !== 'fixture') return invalid(); }
function compare(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }

export function defineCompanyCatalogSnapshot(input: unknown): CompanyCatalogSnapshot {
  return boundary(() => {
    const row = record(input, ['schemaVersion', 'source', 'ref', 'capturedAt', 'currency', 'products']);
    header(row);
    if (row.currency !== 'EUR') return invalid();
    const ref = id(row.ref); const capturedAt = instant(row.capturedAt);
    const productsSeen = new Set<number>(); const variantsSeen = new Set<number>();
    const products = array(row.products, COMPANY_CATALOG_LIMITS.products).map((inputProduct): CompanyCatalogProduct => {
      const product = record(inputProduct, ['id', 'active', 'variants']);
      const productId = integer(product.id, 1, 2_147_483_647);
      if (productsSeen.has(productId)) return invalid('duplicate_id');
      productsSeen.add(productId);
      if (typeof product.active !== 'boolean') return invalid();
      const variants = array(product.variants, COMPANY_CATALOG_LIMITS.perProductVariants, 1).map((inputVariant): CompanyCatalogVariant => {
        const variant = record(inputVariant, ['id', 'productId', 'status', 'priceCents']);
        const variantId = integer(variant.id); const owner = integer(variant.productId, 1, 2_147_483_647);
        if (owner !== productId) return invalid('cross_product_reference');
        if (variantsSeen.has(variantId)) return invalid('duplicate_id');
        variantsSeen.add(variantId);
        if (variantsSeen.size > COMPANY_CATALOG_LIMITS.variants) return invalid();
        if (variant.status !== 'draft' && variant.status !== 'active' && variant.status !== 'archived') return invalid();
        return Object.freeze({ id: variantId, productId: owner, status: variant.status, priceCents: integer(variant.priceCents, 0, 10_000_000) });
      });
      return Object.freeze({ id: productId, active: product.active, variants: Object.freeze(variants.sort((a, b) => a.id - b.id)) });
    });
    return Object.freeze({ schemaVersion: 1, source: 'fixture', ref, capturedAt, currency: 'EUR',
      products: Object.freeze(products.sort((a, b) => a.id - b.id)) });
  });
}

export function defineCompanyCatalogPolicy(input: unknown): CompanyCatalogPolicy {
  return boundary(() => {
    const row = record(input, ['schemaVersion', 'source', 'id', 'version', 'directoryRef', 'catalogRef', 'rules']);
    header(row);
    const policyId = id(row.id); const version = integer(row.version);
    const directory = directoryRef(row.directoryRef); const catalog = catalogRef(row.catalogRef);
    const tuples = new Set<string>(); let variantRefs = 0;
    const rules = array(row.rules, COMPANY_CATALOG_LIMITS.rules).map((inputRule): CompanyCatalogRule => {
      const rule = record(inputRule, ['companyId', 'productId', 'state', 'variantIds']);
      const companyId = id(rule.companyId); const productId = integer(rule.productId, 1, 2_147_483_647);
      const tuple = `${companyId}/${productId}`;
      if (tuples.has(tuple)) return invalid('duplicate_rule');
      tuples.add(tuple);
      if (rule.state !== 'included' && rule.state !== 'excluded') return invalid();
      const variantIds = array(rule.variantIds, rule.state === 'included' ? COMPANY_CATALOG_LIMITS.perProductVariants : 0,
        rule.state === 'included' ? 1 : 0).map(value => integer(value));
      if (new Set(variantIds).size !== variantIds.length) return invalid('duplicate_id');
      variantRefs += variantIds.length;
      if (variantRefs > COMPANY_CATALOG_LIMITS.ruleVariantRefs) return invalid();
      return Object.freeze({ companyId, productId, state: rule.state, variantIds: Object.freeze(variantIds.sort((a, b) => a - b)) });
    });
    return Object.freeze({ schemaVersion: 1, source: 'fixture', id: policyId, version, directoryRef: directory, catalogRef: catalog,
      rules: Object.freeze(rules.sort((a, b) => compare(a.companyId, b.companyId) || a.productId - b.productId)) });
  });
}

export function defineCompanyPricingBindings(input: unknown): CompanyPricingBindings {
  return boundary(() => {
    const row = record(input, ['schemaVersion', 'source', 'id', 'version', 'directoryRef', 'bindings']);
    header(row);
    const bindingsId = id(row.id); const version = integer(row.version); const directory = directoryRef(row.directoryRef);
    const companies = new Set<string>();
    const bindings = array(row.bindings, COMPANY_CATALOG_LIMITS.bindings).map((inputBinding): CompanyPricingBinding => {
      const binding = record(inputBinding, ['companyId', 'companyKeyHash']);
      const companyId = id(binding.companyId);
      if (companies.has(companyId)) return invalid('duplicate_id');
      companies.add(companyId);
      if (typeof binding.companyKeyHash !== 'string' || !/^[a-f0-9]{64}$/.test(binding.companyKeyHash)) return invalid();
      return Object.freeze({ companyId, companyKeyHash: binding.companyKeyHash });
    });
    return Object.freeze({ schemaVersion: 1, source: 'fixture', id: bindingsId, version, directoryRef: directory,
      bindings: Object.freeze(bindings.sort((a, b) => compare(a.companyId, b.companyId))) });
  });
}
function assertDirectoryRef(actual: CompanyDirectoryRef, expected: CompanyDirectoryRef): void {
  if (actual.id !== expected.id || actual.version !== expected.version || actual.capturedAt !== expected.capturedAt) return invalid('reference_mismatch');
}
function selectedCompany(directory: CompanyDirectory, companyId: string) {
  const company = directory.companies.find(item => item.id === companyId);
  if (!company) return invalid('unknown_company');
  return company;
}

/** Valida todas las reglas, también las de otras empresas y productos, antes de evaluar restricciones. */
export function previewCompanyCatalogRestrictions(input: unknown): CompanyCatalogRestrictionPreview {
  return boundary(() => {
    const row = record(input, ['directory', 'catalog', 'policy', 'companyId']);
    const directory = defineCompanyDirectory(row.directory); const catalog = defineCompanyCatalogSnapshot(row.catalog);
    const policy = defineCompanyCatalogPolicy(row.policy); const companyId = id(row.companyId);
    assertDirectoryRef(policy.directoryRef, directory);
    if (policy.catalogRef.ref !== catalog.ref || policy.catalogRef.capturedAt !== catalog.capturedAt) return invalid('reference_mismatch');
    const companies = new Set(directory.companies.map(company => company.id));
    const products = new Map(catalog.products.map(product => [product.id, product]));
    const variants = new Map(catalog.products.flatMap(product => product.variants.map(variant => [variant.id, variant.productId] as const)));
    const selectedRules = new Map<number, CompanyCatalogRule>();
    for (const rule of policy.rules) {
      if (!companies.has(rule.companyId) || !products.has(rule.productId)) return invalid('unknown_reference');
      for (const variantId of rule.variantIds) {
        const owner = variants.get(variantId);
        if (owner === undefined) return invalid('unknown_reference');
        if (owner !== rule.productId) return invalid('cross_product_reference');
      }
      if (rule.companyId === companyId) selectedRules.set(rule.productId, rule);
    }
    const company = selectedCompany(directory, companyId);
    const restrictions = catalog.products.map((product): CompanyCatalogProductRestriction => {
      const rule = selectedRules.get(product.id); const restriction = rule?.state ?? 'unconfigured';
      const selectedIds = rule?.variantIds ?? Object.freeze([]);
      const selected = new Set(selectedIds);
      const reasons: CompanyCatalogProductRestrictionReason[] = [];
      if (company.state === 'inactive') reasons.push('company_inactive');
      if (restriction === 'unconfigured') reasons.push('company_unconfigured');
      if (restriction === 'excluded') reasons.push('company_excluded');
      const variantRestrictions = product.variants.map((variant): CompanyCatalogVariantRestriction => {
        const variantReasons: CompanyCatalogVariantRestrictionReason[] = [...reasons];
        if (restriction === 'included' && !selected.has(variant.id)) variantReasons.push('company_variant_not_selected');
        return Object.freeze({ variantId: variant.id, selected: selected.has(variant.id),
          eligible: variantReasons.length === 0, reasons: Object.freeze(variantReasons) });
      });
      return Object.freeze({ productId: product.id, restriction, eligible: reasons.length === 0,
        reasons: Object.freeze(reasons), selectedVariantIds: selectedIds, variants: Object.freeze(variantRestrictions) });
    });
    return Object.freeze({ source: 'fixture', directoryRef: directoryRefFrom(directory),
      catalogRef: catalogRef({ ref: catalog.ref, capturedAt: catalog.capturedAt }),
      policyRef: Object.freeze({ id: policy.id, version: policy.version }), company: Object.freeze({ id: company.id, state: company.state }),
      products: Object.freeze(restrictions) });
  });
}
function directoryRefFrom(directory: CompanyDirectory): CompanyDirectoryRef {
  return Object.freeze({ id: directory.id, version: directory.version, capturedAt: directory.capturedAt });
}

/** Ausencia explícita; nunca convierte una empresa sin binding en el contexto general de precios. */
export function selectCompanyPricingBinding(input: unknown): CompanyPricingBindingSelection {
  return boundary(() => {
    const row = record(input, ['directory', 'bindings', 'companyId']);
    const directory = defineCompanyDirectory(row.directory); const bindings = defineCompanyPricingBindings(row.bindings);
    const companyId = id(row.companyId);
    assertDirectoryRef(bindings.directoryRef, directory);
    const companies = new Set(directory.companies.map(company => company.id));
    for (const binding of bindings.bindings) if (!companies.has(binding.companyId)) return invalid('unknown_reference');
    selectedCompany(directory, companyId);
    return Object.freeze({ source: 'fixture', directoryRef: directoryRefFrom(directory),
      bindingsRef: Object.freeze({ id: bindings.id, version: bindings.version }), companyId,
      binding: bindings.bindings.find(binding => binding.companyId === companyId) ?? null });
  });
}
