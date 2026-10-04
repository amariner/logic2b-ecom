import type { Platform } from './create-platform';
import { createCatalogEntry, type CatalogEntry, type ProductVariantStatus } from '../modules/catalog';
import { defineCompanyDirectory, defineCompanyCatalogPolicy, defineCompanyPricingBindings,
  type CompanyDirectoryState, type CompanyCatalogRestrictionState, type CompanyCatalogVariantRestrictionReason } from '../modules/companies';
import { defineMarketCatalog, defineMarketPublicationPolicy, type MarketPublicationState,
  type MarketPublicationProductExclusion, type MarketPublicationVariantExclusion } from '../modules/markets';
import type { PriceList } from '../modules/pricing';
import { projectCompanyCatalogSnapshot } from './company-catalog-snapshot';
import { previewCompanyPrices, type CompanyPriceBlockingReason } from './company-pricing-context';

export type CompanyCatalogDemoSelection = Readonly<{
  companyId: 'company.workshop' | 'company.studio' | 'company.unbound' | 'company.closed'; marketId: 'ES' | 'FR';
}>;
export type CompanyCatalogDemoVariantSelection = Readonly<{ productId: number; variantId: number }>;
export type CompanyCatalogDemoFeedback = Readonly<{
  tone: 'info'; code: 'initial' | 'context_changed' | 'variant_changed'; message: string;
}>;
export type CompanyCatalogDemoState = Readonly<{
  selection: CompanyCatalogDemoSelection; selectedVariants: readonly CompanyCatalogDemoVariantSelection[];
  feedback: CompanyCatalogDemoFeedback;
}>;
export type CompanyCatalogDemoVariantView = Readonly<{
  id: number; label: string; sku: string; status: ProductVariantStatus; statusLabel: string;
  companySelected: boolean; marketSelected: boolean; companyEligible: boolean; marketVisible: boolean; visible: boolean;
  companyReasonLabels: readonly string[]; marketReasonLabels: readonly string[];
}>;
export type CompanyCatalogDemoProductView = Readonly<{
  productId: number; label: string; active: boolean; stateLabel: string;
  publication: MarketPublicationState; restriction: CompanyCatalogRestrictionState; visible: boolean;
  intersectionReason: 'no_common_variants' | null; companyReasonLabels: readonly string[]; marketReasonLabels: readonly string[];
  selectedVariantId: number; variantOptions: readonly Readonly<{ id: number; label: string }>[];
  selectedVariant: Readonly<{ id: number; label: string; sku: string; status: ProductVariantStatus; statusLabel: string; visible: boolean }>;
  variants: readonly CompanyCatalogDemoVariantView[];
  pricing: Readonly<{
    outcome: 'priced' | 'blocked'; reasonLabels: readonly Readonly<{ reason: CompanyPriceBlockingReason; label: string }>[];
    price: Readonly<{ catalogUnitPriceCents: number; baseUnitPriceCents: number;
      originType: 'company' | 'general' | 'catalog'; originLabel: string; fallbackDepth: number }> | null;
  }>;
}>;
export type CompanyCatalogDemoView = Readonly<{
  selection: CompanyCatalogDemoSelection;
  companyOptions: readonly Readonly<{ id: CompanyCatalogDemoSelection['companyId']; label: string }>[];
  marketOptions: readonly Readonly<{ id: CompanyCatalogDemoSelection['marketId']; label: string }>[];
  company: Readonly<{ id: string; label: string; state: CompanyDirectoryState; stateLabel: string }>;
  marketLabel: string; channelLabel: string; at: string; products: readonly CompanyCatalogDemoProductView[];
  feedback: CompanyCatalogDemoFeedback;
}>;

/** Gate de presentación; no activa autorización comercial ni consume bindings operativos. */
export function canShowCompanyCatalogDemo(
  env: Readonly<{ DEMO_MODE?: string | undefined }> | undefined, platform: Pick<Platform, 'manifest'>,
): boolean { return platform.manifest.deployment.mode === 'demo' && env?.DEMO_MODE === 'true'; }

const AT = '2026-10-03T12:00:00.000Z';
const COMPANY_OPTIONS = Object.freeze([
  Object.freeze({ id: 'company.workshop' as const, label: 'Taller de ejemplo' }),
  Object.freeze({ id: 'company.studio' as const, label: 'Estudio de ejemplo' }),
  Object.freeze({ id: 'company.unbound' as const, label: 'Empresa sin tarifa vinculada' }),
  Object.freeze({ id: 'company.closed' as const, label: 'Empresa inactiva de ejemplo' }),
]);
const MARKET_OPTIONS = Object.freeze([
  Object.freeze({ id: 'ES' as const, label: 'España' }), Object.freeze({ id: 'FR' as const, label: 'Francia' }),
]);
const DIRECTORY = defineCompanyDirectory({ schemaVersion: 1, source: 'fixture', id: 'demo.company-catalog.directory', version: 1, capturedAt: AT,
  companies: COMPANY_OPTIONS.map(company => ({ id: company.id, displayName: company.label,
    state: company.id === 'company.closed' ? 'inactive' : 'active', vatId: null })), sites: [], contacts: [], roles: [], assignments: [] });
const DIRECTORY_REF = Object.freeze({ id: DIRECTORY.id, version: DIRECTORY.version, capturedAt: DIRECTORY.capturedAt });

function fixtureEntry(id: number, label: string, variants: readonly Readonly<{ id: number; label: string; sku: string; priceCents: number }>[]): CatalogEntry {
  return createCatalogEntry({ product: { id, slug: `demo-company-product-${id}`, name: label,
    description: 'Producto ficticio para explorar catálogos y precios por empresa.', image: '/favicon.svg', category: 'Ejemplos',
    collection: 'demo-company-catalog', active: true, subtitle: null, specs_json: null, created_at: AT },
    variants: variants.map((variant, index) => ({ id: variant.id, product_id: id, sku: variant.sku, gtin: null, mpn: null,
      title: variant.label, price_cents: variant.priceCents, compare_at_price_cents: null, status: 'active',
      // El agregado exige esta propiedad; ni la proyección ni la selección de precio la consultan.
      is_default: index === 0, option_signature: JSON.stringify([variant.id]),
      options: [{ option_id: id, option_name: 'Formato', option_position: 0, value_id: variant.id, value: variant.label, value_position: index }],
      created_at: AT, updated_at: AT })), available_stock: 0 });
}
const ENTRIES = Object.freeze([
  fixtureEntry(1, 'Pack de muestras', [
    { id: 11, label: 'Esencial', sku: 'DEMO-PACK-E', priceCents: 1000 },
    { id: 12, label: 'Ampliado', sku: 'DEMO-PACK-A', priceCents: 1500 },
  ]),
  fixtureEntry(2, 'Caja de exposición', [
    { id: 21, label: 'Compacta', sku: 'DEMO-CAJA-C', priceCents: 2000 },
    { id: 22, label: 'Grande', sku: 'DEMO-CAJA-G', priceCents: 2500 },
  ]),
  fixtureEntry(3, 'Soporte de muestra', [{ id: 31, label: 'Único', sku: 'DEMO-SOPORTE', priceCents: 3000 }]),
]);
const CATALOG = projectCompanyCatalogSnapshot({ ref: 'demo.company-catalog.snapshot', capturedAt: AT, currency: 'EUR', entries: ENTRIES });
const CATALOG_REF = Object.freeze({ ref: CATALOG.ref, capturedAt: CATALOG.capturedAt });
const MARKETS = defineMarketCatalog({ schemaVersion: 1, id: 'demo.company-catalog.markets', version: 1,
  markets: [{ id: 'ES', countryCodes: ['ES'], defaultLocale: 'es-ES', currency: 'EUR', domains: [] },
    { id: 'FR', countryCodes: ['FR'], defaultLocale: 'fr-FR', currency: 'EUR', domains: [] }], fallback: { strategy: 'none' } });
const COMPANY_POLICY = defineCompanyCatalogPolicy({ schemaVersion: 1, source: 'fixture', id: 'demo.company-catalog.policy', version: 1,
  directoryRef: DIRECTORY_REF, catalogRef: CATALOG_REF,
  rules: [
    ...['company.workshop', 'company.unbound', 'company.closed'].flatMap(companyId => CATALOG.products.map(product => ({
      companyId, productId: product.id, state: 'included', variantIds: product.variants.map(variant => variant.id),
    }))),
    { companyId: 'company.studio', productId: 1, state: 'included', variantIds: [11] },
    { companyId: 'company.studio', productId: 2, state: 'excluded', variantIds: [] },
  ] });
const PUBLICATION_POLICY = defineMarketPublicationPolicy({ schemaVersion: 1, id: 'demo.company-catalog.publication', version: 1,
  channels: ['professional'], rules: [
    ...CATALOG.products.map(product => ({ marketId: 'ES', channel: 'professional', productId: product.id,
      state: 'published', variantIds: product.variants.map(variant => variant.id) })),
    { marketId: 'FR', channel: 'professional', productId: 1, state: 'published', variantIds: [12] },
    { marketId: 'FR', channel: 'professional', productId: 2, state: 'unpublished', variantIds: [] },
  ] });
const BINDINGS = defineCompanyPricingBindings({ schemaVersion: 1, source: 'fixture', id: 'demo.company-catalog.bindings', version: 1,
  directoryRef: DIRECTORY_REF, bindings: [
    { companyId: 'company.workshop', companyKeyHash: 'a'.repeat(64) },
    { companyId: 'company.studio', companyKeyHash: 'b'.repeat(64) },
    { companyId: 'company.closed', companyKeyHash: 'c'.repeat(64) },
  ] });
function fixtureList(id: string, label: string, companyKeyHashes: readonly string[], prices: PriceList['prices']): PriceList {
  return Object.freeze({ id, version: 1, label, state: 'active', priority: 10, currency: 'EUR',
    activeFrom: '2026-10-03T11:00:00.000Z', activeUntil: '2026-10-03T13:00:00.000Z',
    markets: Object.freeze(['ES', 'FR']), channels: Object.freeze(['professional']), companyKeyHashes: Object.freeze([...companyKeyHashes]),
    prices: Object.freeze(prices.map(price => Object.freeze({ ...price }))) });
}
const LISTS = Object.freeze([
  fixtureList('demo-taller', 'Tarifa de Taller (ejemplo)', ['a'.repeat(64)], [{ productId: 1, priceCents: 800 }]),
  fixtureList('demo-estudio', 'Tarifa de Estudio (ejemplo)', ['b'.repeat(64)], [{ productId: 1, priceCents: 900 }]),
  fixtureList('demo-general', 'Tarifa general (ejemplo)', [], [{ productId: 1, priceCents: 950 }, { productId: 2, priceCents: 1800 }]),
]);
const COMPANY_REASON_LABELS: Readonly<Record<CompanyCatalogVariantRestrictionReason, string>> = Object.freeze({
  company_inactive: 'La empresa está inactiva.', company_unconfigured: 'No hay una selección de este producto para la empresa.',
  company_excluded: 'El producto está excluido de la selección de la empresa.',
  company_variant_not_selected: 'La empresa no incluye esta variante.',
});
const MARKET_REASON_LABELS: Readonly<Record<MarketPublicationProductExclusion | MarketPublicationVariantExclusion, string>> = Object.freeze({
  product_inactive: 'El producto está inactivo.', unconfigured: 'No hay publicación para este mercado y canal.',
  unpublished: 'La publicación está retirada en este mercado y canal.', no_visible_variants: 'No hay variantes publicadas activas.',
  variant_not_selected: 'El mercado no publica esta variante.', variant_draft: 'La variante está en borrador.', variant_archived: 'La variante está archivada.',
});
const PRICE_REASON_LABELS: Readonly<Record<CompanyPriceBlockingReason, string>> = Object.freeze({
  company_inactive: 'La empresa inactiva no tiene una consulta comercial disponible en este ejemplo.',
  pricing_binding_missing: 'La empresa no tiene una tarifa vinculada; no se aplica un precio general automáticamente.',
  currency_mismatch: 'La moneda del mercado no coincide con la base de este ejemplo.',
  variant_not_visible: 'La variante elegida no está visible en la selección común de empresa y mercado.',
});
const FEEDBACK = Object.freeze({
  initial: Object.freeze({ tone: 'info' as const, code: 'initial' as const,
    message: 'Compara selecciones y precios unitarios ficticios. Este ejemplo no autoriza compras.' }),
  context_changed: Object.freeze({ tone: 'info' as const, code: 'context_changed' as const,
    message: 'Contexto actualizado. Se conservan las variantes elegidas, también cuando su precio queda bloqueado.' }),
  variant_changed: Object.freeze({ tone: 'info' as const, code: 'variant_changed' as const,
    message: 'Variante elegida explícitamente. Su precio base cambia; una tarifa por producto puede conservar el precio resultante.' }),
});

function invalid(): never { throw new RangeError('Selección del ejemplo de catálogos de empresa inválida.'); }
function record(input: unknown, fields: readonly string[], partial = false): Readonly<Record<string, unknown>> {
  try {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) return invalid();
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return invalid();
    const keys = Reflect.ownKeys(input);
    if ((!partial && keys.length !== fields.length) || (partial && keys.length === 0)) return invalid();
    const copy: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (typeof key !== 'string' || !fields.includes(key) || !descriptor?.enumerable || !('value' in descriptor)) return invalid();
      copy[key] = descriptor.value;
    }
    return Object.freeze(copy);
  } catch { return invalid(); }
}
function variantSelection(input: unknown): CompanyCatalogDemoVariantSelection {
  const row = record(input, ['productId', 'variantId']);
  const product = CATALOG.products.find(product => product.id === row.productId);
  if (!product || !product.variants.some(variant => variant.id === row.variantId)) return invalid();
  return Object.freeze({ productId: product.id, variantId: row.variantId as number });
}
function selections(input: unknown): readonly CompanyCatalogDemoVariantSelection[] {
  try {
    if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) return invalid();
    const descriptor = Object.getOwnPropertyDescriptor(input, 'length');
    if (!descriptor || !('value' in descriptor) || descriptor.value !== 3 || Reflect.ownKeys(input).length !== 4) return invalid();
    const result: CompanyCatalogDemoVariantSelection[] = [];
    for (let index = 0; index < 3; index++) {
      const field = Object.getOwnPropertyDescriptor(input, String(index));
      if (!field?.enumerable || !('value' in field)) return invalid();
      result.push(variantSelection(field.value));
    }
    if (new Set(result.map(item => item.productId)).size !== 3) return invalid();
    return Object.freeze(result.sort((a, b) => a.productId - b.productId));
  } catch { return invalid(); }
}
function selection(input: unknown): CompanyCatalogDemoSelection {
  const row = record(input, ['companyId', 'marketId']);
  if (!COMPANY_OPTIONS.some(company => company.id === row.companyId) || !MARKET_OPTIONS.some(market => market.id === row.marketId)) return invalid();
  return Object.freeze({ companyId: row.companyId as CompanyCatalogDemoSelection['companyId'], marketId: row.marketId as CompanyCatalogDemoSelection['marketId'] });
}
function state(input: unknown): CompanyCatalogDemoState {
  const row = record(input, ['selection', 'selectedVariants', 'feedback']);
  const current = selection(row.selection); const selectedVariants = selections(row.selectedVariants);
  const feedback = record(row.feedback, ['tone', 'code', 'message']);
  if ((feedback.code !== 'initial' && feedback.code !== 'context_changed' && feedback.code !== 'variant_changed') ||
    feedback.tone !== 'info' || feedback.message !== FEEDBACK[feedback.code].message) return invalid();
  return Object.freeze({ selection: current, selectedVariants, feedback: FEEDBACK[feedback.code] });
}

export function createCompanyCatalogDemo(): CompanyCatalogDemoState {
  return Object.freeze({ selection: Object.freeze({ companyId: 'company.workshop', marketId: 'ES' }),
    // Tres peticiones iniciales literales; no se elige una variante desde metadatos del catálogo.
    selectedVariants: Object.freeze([Object.freeze({ productId: 1, variantId: 11 }), Object.freeze({ productId: 2, variantId: 21 }),
      Object.freeze({ productId: 3, variantId: 31 })]), feedback: FEEDBACK.initial });
}
export function configureCompanyCatalogDemo(
  stateInput: CompanyCatalogDemoState, input: Readonly<Partial<CompanyCatalogDemoSelection>>,
): CompanyCatalogDemoState {
  const current = state(stateInput); const patch = record(input, ['companyId', 'marketId'], true);
  return Object.freeze({ selection: selection({ ...current.selection, ...patch }), selectedVariants: current.selectedVariants, feedback: FEEDBACK.context_changed });
}
export function selectCompanyCatalogDemoVariant(stateInput: CompanyCatalogDemoState, input: CompanyCatalogDemoVariantSelection): CompanyCatalogDemoState {
  const current = state(stateInput); const selected = variantSelection(input);
  return Object.freeze({ selection: current.selection,
    selectedVariants: Object.freeze(current.selectedVariants.map(item => item.productId === selected.productId ? selected : item)), feedback: FEEDBACK.variant_changed });
}
function statusLabel(status: ProductVariantStatus): string {
  return status === 'active' ? 'Activa' : status === 'draft' ? 'Borrador' : 'Archivada';
}

/** Presentación cerrada: sin hashes, referencias técnicas, totales ni importes de resultado en líneas bloqueadas. */
export function getCompanyCatalogDemoView(stateInput: CompanyCatalogDemoState): CompanyCatalogDemoView {
  const current = state(stateInput);
  const result = previewCompanyPrices({ catalogContext: { directory: DIRECTORY, markets: MARKETS, catalog: CATALOG,
    companyPolicy: COMPANY_POLICY, publicationPolicy: PUBLICATION_POLICY,
    context: { ...current.selection, channel: 'professional' } }, bindings: BINDINGS, priceLists: LISTS, at: AT, lines: current.selectedVariants });
  const products = result.catalog.products.map((product): CompanyCatalogDemoProductView => {
    const metadata = ENTRIES.find(entry => entry.product.id === product.productId)!.product;
    const line = result.lines.find(line => line.productId === product.productId)!;
    const variants = Object.freeze(product.variants.map((variant): CompanyCatalogDemoVariantView => {
      const source = metadata.variants.find(source => source.id === variant.id)!;
      return Object.freeze({ id: variant.id, label: source.title, sku: source.sku, status: variant.status, statusLabel: statusLabel(variant.status),
        companySelected: variant.companySelected, marketSelected: variant.marketSelected, companyEligible: variant.companyEligible,
        marketVisible: variant.marketVisible, visible: variant.visible,
        companyReasonLabels: Object.freeze(variant.companyReasons.map(reason => COMPANY_REASON_LABELS[reason])),
        marketReasonLabels: Object.freeze(variant.marketReasons.map(reason => MARKET_REASON_LABELS[reason])) });
    }));
    const selected = variants.find(variant => variant.id === line.variantId)!;
    const origin = line.price?.origin;
    const price = line.price === null || origin === undefined ? null : Object.freeze({
      catalogUnitPriceCents: line.price.catalogUnitPriceCents, baseUnitPriceCents: line.price.baseUnitPriceCents,
      originType: origin.type === 'catalog' ? 'catalog' as const : origin.company_scoped ? 'company' as const : 'general' as const,
      originLabel: origin.type === 'catalog' ? 'Precio de catálogo (ejemplo)' : origin.label, fallbackDepth: origin.fallback_depth,
    });
    return Object.freeze({ productId: product.productId, label: metadata.name, active: product.active,
      stateLabel: product.active ? 'Activo' : 'Inactivo', publication: product.publication, restriction: product.restriction,
      visible: product.visible, intersectionReason: product.intersectionReason,
      companyReasonLabels: Object.freeze(product.companyReasons.map(reason => COMPANY_REASON_LABELS[reason])),
      marketReasonLabels: Object.freeze(product.marketReasons.map(reason => MARKET_REASON_LABELS[reason])), selectedVariantId: line.variantId,
      variantOptions: Object.freeze(variants.map(variant => Object.freeze({ id: variant.id, label: variant.label }))),
      selectedVariant: Object.freeze({ id: selected.id, label: selected.label, sku: selected.sku, status: selected.status,
        statusLabel: selected.statusLabel, visible: selected.visible }), variants,
      pricing: Object.freeze({ outcome: line.outcome,
        reasonLabels: Object.freeze(line.reasons.map(reason => Object.freeze({ reason, label: PRICE_REASON_LABELS[reason] }))), price }) });
  });
  const company = COMPANY_OPTIONS.find(company => company.id === current.selection.companyId)!;
  const market = MARKET_OPTIONS.find(market => market.id === current.selection.marketId)!;
  return Object.freeze({ selection: current.selection, companyOptions: COMPANY_OPTIONS, marketOptions: MARKET_OPTIONS,
    company: Object.freeze({ id: company.id, label: company.label, state: result.catalog.company.state,
      stateLabel: result.catalog.company.state === 'active' ? 'Activa' : 'Inactiva' }), marketLabel: market.label,
    channelLabel: 'Canal profesional · ejemplo', at: AT, products: Object.freeze(products), feedback: current.feedback });
}
