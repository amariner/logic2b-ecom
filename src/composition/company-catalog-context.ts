import {
  CompanyCatalogContractError, defineCompanyCatalogSnapshot, previewCompanyCatalogRestrictions,
  type CompanyCatalogContractReason, type CompanyCatalogSnapshot,
} from '../modules/companies';
import {
  defineMarketCatalog, defineMarketPublicationPolicy, previewMarketPublication,
  type MarketPublicationPreview,
} from '../modules/markets';

type CompanyPreview = ReturnType<typeof previewCompanyCatalogRestrictions>;
type CompanyProduct = CompanyPreview['products'][number];
type MarketProduct = MarketPublicationPreview['products'][number];

export type CompanyCatalogContextVariant = CompanyCatalogSnapshot['products'][number]['variants'][number] & Readonly<{
  companySelected: boolean; marketSelected: boolean;
  companyEligible: boolean; marketVisible: boolean; visible: boolean;
  companyReasons: CompanyProduct['variants'][number]['reasons'];
  marketReasons: MarketProduct['variants'][number]['reasons'];
}>;
export type CompanyCatalogContextProduct = Readonly<{
  productId: number; active: boolean;
  restriction: CompanyProduct['restriction']; publication: MarketProduct['publication'];
  companyEligible: boolean; marketVisible: boolean; visible: boolean;
  companyReasons: CompanyProduct['reasons']; marketReasons: MarketProduct['reasons'];
  intersectionReason: 'no_common_variants' | null;
  visibleVariantIds: readonly number[]; variants: readonly CompanyCatalogContextVariant[];
}>;
export type CompanyCatalogContextPreview = Readonly<{
  source: 'fixture'; currency: 'EUR';
  directoryRef: CompanyPreview['directoryRef']; catalogRef: CompanyPreview['catalogRef'];
  companyPolicyRef: CompanyPreview['policyRef']; publicationPolicyRef: MarketPublicationPreview['policy'];
  marketsRef: MarketPublicationPreview['markets'];
  context: Readonly<{ companyId: string; marketId: string; channel: string }>;
  company: CompanyPreview['company']; market: Readonly<{ id: string; currency: string }>;
  products: readonly CompanyCatalogContextProduct[];
}>;

function invalid(reason: CompanyCatalogContractReason = 'invalid_data'): never { throw new CompanyCatalogContractError(reason); }
function record(input: unknown, expected: readonly string[]): Readonly<Record<string, unknown>> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return invalid();
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return invalid();
  const keys = Reflect.ownKeys(input);
  if (keys.length !== expected.length) return invalid();
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (typeof key !== 'string' || !expected.includes(key) || !descriptor?.enumerable || !('value' in descriptor)) return invalid();
    result[key] = descriptor.value;
  }
  return Object.freeze(result);
}

/**
 * Intersección de restricciones descriptivas de empresa y publicación vigente
 * en el snapshot. No autentica al visitante ni decide compra, stock o impuestos.
 * El catálogo de mercado se deriva del MISMO artefacto EUR; no admite un segundo
 * snapshot, un default implícito ni una conversión de su precio por el mercado.
 */
export function previewCompanyCatalogContext(input: unknown): CompanyCatalogContextPreview {
  try {
    const row = record(input, ['directory', 'markets', 'catalog', 'companyPolicy', 'publicationPolicy', 'context']);
    const context = record(row.context, ['companyId', 'marketId', 'channel']);
    const catalog = defineCompanyCatalogSnapshot(row.catalog);
    const company = previewCompanyCatalogRestrictions({ directory: row.directory, catalog, policy: row.companyPolicy, companyId: context.companyId });
    const markets = defineMarketCatalog(row.markets);
    const publicationPolicy = defineMarketPublicationPolicy(row.publicationPolicy);
    if (typeof context.marketId !== 'string' || typeof context.channel !== 'string') return invalid();
    const market = markets.markets.find(item => item.id === context.marketId);
    if (!market || !publicationPolicy.channels.includes(context.channel)) return invalid('unknown_reference');
    let publication: MarketPublicationPreview;
    try {
      publication = previewMarketPublication({ markets,
        catalog: { schemaVersion: 1, ref: catalog.ref, capturedAt: catalog.capturedAt,
          products: catalog.products.map(product => ({ id: product.id, active: product.active,
            variants: product.variants.map(variant => ({ id: variant.id, productId: variant.productId, status: variant.status })) })) },
        policy: publicationPolicy, context: { marketId: context.marketId, channel: context.channel } });
    } catch { return invalid('unknown_reference'); }
    const companyProducts = new Map(company.products.map(product => [product.productId, product]));
    const marketProducts = new Map(publication.products.map(product => [product.productId, product]));
    const products = catalog.products.map((product): CompanyCatalogContextProduct => {
      const restricted = companyProducts.get(product.id);
      const published = marketProducts.get(product.id);
      if (!restricted || !published) return invalid('unknown_reference');
      const companyVariants = new Map(restricted.variants.map(variant => [variant.variantId, variant]));
      const marketVariants = new Map(published.variants.map(variant => [variant.variantId, variant]));
      const variants = product.variants.map((variant): CompanyCatalogContextVariant => {
        const companyVariant = companyVariants.get(variant.id);
        const marketVariant = marketVariants.get(variant.id);
        if (!companyVariant || !marketVariant) return invalid('unknown_reference');
        return Object.freeze({ ...variant, companySelected: companyVariant.selected, marketSelected: marketVariant.selected,
          companyEligible: companyVariant.eligible, marketVisible: marketVariant.visible,
          visible: companyVariant.eligible && marketVariant.visible,
          companyReasons: companyVariant.reasons, marketReasons: marketVariant.reasons });
      });
      const visibleVariantIds = Object.freeze(variants.filter(variant => variant.visible).map(variant => variant.id));
      return Object.freeze({ productId: product.id, active: product.active, restriction: restricted.restriction,
        publication: published.publication, companyEligible: restricted.eligible, marketVisible: published.visible,
        visible: visibleVariantIds.length > 0, companyReasons: restricted.reasons, marketReasons: published.reasons,
        intersectionReason: restricted.eligible && published.visible && visibleVariantIds.length === 0 ? 'no_common_variants' : null,
        visibleVariantIds, variants: Object.freeze(variants) });
    });
    return Object.freeze({ source: 'fixture', currency: catalog.currency,
      directoryRef: company.directoryRef, catalogRef: company.catalogRef, companyPolicyRef: company.policyRef,
      publicationPolicyRef: publication.policy, marketsRef: publication.markets,
      context: Object.freeze({ companyId: company.company.id, marketId: publication.context.marketId, channel: publication.context.channel }),
      company: company.company, market: Object.freeze({ id: market.id, currency: market.currency }), products: Object.freeze(products) });
  } catch (error) {
    let reason: CompanyCatalogContractReason = 'invalid_data';
    try {
      if (error instanceof CompanyCatalogContractError) {
        const descriptor = Object.getOwnPropertyDescriptor(error, 'reason');
        if (descriptor && 'value' in descriptor && typeof descriptor.value === 'string') reason = descriptor.value as CompanyCatalogContractReason;
      }
    } catch { /* Ningún error ajeno aporta mensajes ni causas al contrato. */ }
    throw new CompanyCatalogContractError(reason);
  }
}
