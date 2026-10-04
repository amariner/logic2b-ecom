import {
  CompanyCatalogContractError, VariantQuantityContractError, previewVariantQuantities,
  type VariantQuantityBlockingReason, type VariantQuantityContractReason,
  type VariantQuantityLinePreview, type VariantQuantityPreview,
} from '../modules/companies';
import {
  previewCompanyCatalogContext, type CompanyCatalogContextPreview,
  type CompanyCatalogContextProduct, type CompanyCatalogContextVariant,
} from './company-catalog-context';

export type CompanyQuantityBlockingReason = VariantQuantityBlockingReason | 'variant_not_visible';
export type CompanyQuantityVisibility = Readonly<{
  visible: boolean;
  companyReasons: CompanyCatalogContextVariant['companyReasons'];
  marketReasons: CompanyCatalogContextVariant['marketReasons'];
  intersectionReason: CompanyCatalogContextProduct['intersectionReason'];
}>;
export type CompanyQuantityLinePreview = Readonly<{
  productId: number; variantId: number; quantity: VariantQuantityLinePreview;
  visibility: CompanyQuantityVisibility; outcome: 'satisfied' | 'blocked';
  reasons: readonly CompanyQuantityBlockingReason[];
}>;
export type CompanyQuantityContextPreview = Readonly<{
  source: 'fixture';
  directoryRef: CompanyCatalogContextPreview['directoryRef'];
  catalogRef: CompanyCatalogContextPreview['catalogRef'];
  companyPolicyRef: CompanyCatalogContextPreview['companyPolicyRef'];
  publicationPolicyRef: CompanyCatalogContextPreview['publicationPolicyRef'];
  marketsRef: CompanyCatalogContextPreview['marketsRef'];
  policyRef: VariantQuantityPreview['policyRef']; requestId: string;
  context: CompanyCatalogContextPreview['context']; company: CompanyCatalogContextPreview['company'];
  lines: readonly CompanyQuantityLinePreview[];
}>;

function invalid(reason: VariantQuantityContractReason = 'invalid_data'): never {
  throw new VariantQuantityContractError(reason);
}
function record(input: unknown): Readonly<Record<string, unknown>> {
  const expected = ['catalogContext', 'policy', 'request'];
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return invalid();
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return invalid();
  const keys = Reflect.ownKeys(input);
  if (keys.length !== expected.length) return invalid();
  const copy: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (typeof key !== 'string' || !expected.includes(key) || !descriptor?.enumerable || !('value' in descriptor)) return invalid();
    copy[key] = descriptor.value;
  }
  return Object.freeze(copy);
}

/**
 * Cantidades descriptivas de fixtures sobre el mismo catálogo completo de la
 * intersección empresarial. No decide precio, stock, identidad ni compra.
 * Las referencias conservan las declaraciones recibidas, sin acreditar origen.
 */
export function previewCompanyQuantities(input: unknown): CompanyQuantityContextPreview {
  try {
    const row = record(input);
    const catalog = previewCompanyCatalogContext(row.catalogContext);
    // El preview conserva también las variantes ocultas y ya validó el único
    // snapshot recibido. La proyección neutral no transporta hechos monetarios.
    const quantities = previewVariantQuantities({
      catalog: { schemaVersion: 1, source: 'fixture', ...catalog.catalogRef,
        products: catalog.products.map(product => ({ id: product.productId,
          variants: product.variants.map(variant => ({ id: variant.id, productId: variant.productId })) })) },
      policy: row.policy, request: row.request,
    });
    const products = new Map(catalog.products.map(product => [product.productId, product]));
    // Evaluar todas las cantidades precede cualquier bloqueo de visibilidad:
    // una empresa inactiva no oculta corrupción, inviabilidad ni overflow.
    const lines = quantities.lines.map((quantity): CompanyQuantityLinePreview => {
      const product = products.get(quantity.productId);
      const variant = product?.variants.find(item => item.id === quantity.variantId);
      if (!product || !variant) return invalid('unknown_reference');
      const visibility: CompanyQuantityVisibility = Object.freeze({ visible: variant.visible,
        companyReasons: variant.companyReasons, marketReasons: variant.marketReasons,
        intersectionReason: product.intersectionReason });
      const reasons: readonly CompanyQuantityBlockingReason[] = Object.freeze([
        ...quantity.reasons, ...(variant.visible ? [] : ['variant_not_visible'] as const),
      ]);
      return Object.freeze({ productId: quantity.productId, variantId: quantity.variantId,
        quantity, visibility, outcome: quantity.outcome === 'satisfied' && variant.visible ? 'satisfied' : 'blocked', reasons });
    });
    return Object.freeze({ source: 'fixture', directoryRef: catalog.directoryRef, catalogRef: catalog.catalogRef,
      companyPolicyRef: catalog.companyPolicyRef, publicationPolicyRef: catalog.publicationPolicyRef,
      marketsRef: catalog.marketsRef, policyRef: quantities.policyRef, requestId: quantities.requestId,
      context: catalog.context, company: catalog.company, lines: Object.freeze(lines) });
  } catch (error) {
    let reason: VariantQuantityContractReason = 'invalid_data';
    try {
      if (error instanceof VariantQuantityContractError || error instanceof CompanyCatalogContractError) {
        const descriptor = Object.getOwnPropertyDescriptor(error, 'reason');
        if (descriptor && 'value' in descriptor && typeof descriptor.value === 'string') {
          if (error instanceof VariantQuantityContractError) reason = descriptor.value as VariantQuantityContractReason;
          else if (['duplicate_rule', 'unknown_reference', 'cross_product_reference', 'reference_mismatch'].includes(descriptor.value)) {
            reason = descriptor.value as VariantQuantityContractReason;
          } else if (descriptor.value === 'unknown_company') reason = 'unknown_reference';
        }
      }
    } catch { /* No conserva mensajes, causas ni trampas de errores ajenos. */ }
    throw new VariantQuantityContractError(reason);
  }
}
