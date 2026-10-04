import {
  CompanyCatalogContractError, defineCompanyDirectory, defineCompanyCatalogSnapshot,
  defineCompanyCatalogPolicy, defineCompanyPricingBindings, selectCompanyPricingBinding,
} from '../modules/companies';
import { defineMarketCatalog, defineMarketPublicationPolicy } from '../modules/markets';
import { assertPriceList, resolvePriceLists, type PriceList, type PriceListResolution, type PriceOrigin } from '../modules/pricing';
import { previewCompanyCatalogContext, type CompanyCatalogContextPreview } from './company-catalog-context';

export const COMPANY_PRICING_LIMITS = Object.freeze({
  lines: 100, lists: 100, pricesPerList: 1000, totalPrices: 10_000, marketsPerList: 100,
  channelsPerList: 20, hashesPerList: 100,
});

export type CompanyPriceBlockingReason = 'company_inactive' | 'pricing_binding_missing' |
  'currency_mismatch' | 'variant_not_visible';
type CompanyPriceLineBase = Readonly<{
  productId: number;
  variantId: number;
  evaluations: PriceListResolution['evaluations'];
}>;
export type CompanyPriceLinePreview = CompanyPriceLineBase & (
  | Readonly<{ outcome: 'priced'; reasons: readonly []; price: Readonly<{
    catalogUnitPriceCents: number; baseUnitPriceCents: number; origin: PriceOrigin;
  }> }>
  | Readonly<{ outcome: 'blocked'; reasons: readonly CompanyPriceBlockingReason[]; price: null }>
);
export type CompanyPricesPreview = Readonly<{
  source: 'fixture';
  catalog: CompanyCatalogContextPreview;
  bindingsRef: Readonly<{ id: string; version: number }>;
  at: string;
  lines: readonly CompanyPriceLinePreview[];
}>;

type ContractReason = ConstructorParameters<typeof CompanyCatalogContractError>[0];
const REASONS: readonly ContractReason[] = Object.freeze([
  'invalid_data', 'duplicate_id', 'duplicate_rule', 'unknown_reference', 'cross_product_reference',
  'reference_mismatch', 'unknown_company',
]);
function fail(reason: ContractReason = 'invalid_data'): never { throw new CompanyCatalogContractError(reason); }

function record(input: unknown, expected: readonly string[]): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return fail();
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return fail();
  const keys = Reflect.ownKeys(input);
  if (keys.length !== expected.length) return fail();
  const copy: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (typeof key !== 'string' || !expected.includes(key) || !descriptor?.enumerable || !('value' in descriptor)) return fail();
    copy[key] = descriptor.value;
  }
  return Object.freeze(copy);
}

function array(input: unknown, min: number, max: number): readonly unknown[] {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) return fail();
  const lengthDescriptor = Object.getOwnPropertyDescriptor(input, 'length');
  if (!lengthDescriptor || !('value' in lengthDescriptor)) return fail();
  const length: unknown = lengthDescriptor.value;
  if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < min || length > max ||
    Reflect.ownKeys(input).length !== length + 1) return fail();
  const copy: unknown[] = [];
  for (let index = 0; index < length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
    if (!descriptor?.enumerable || !('value' in descriptor)) return fail();
    copy.push(descriptor.value);
  }
  return Object.freeze(copy);
}

function text(input: unknown, max: number): string {
  if (typeof input !== 'string' || input.length === 0 || input.length > max) return fail();
  return input;
}
function integer(input: unknown, min: number, max: number): number {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || Object.is(input, -0) || input < min || input > max) return fail();
  return input;
}
function instant(input: unknown): string {
  if (typeof input !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(input)) return fail();
  const timestamp = Date.parse(input);
  if (!Number.isFinite(timestamp)) return fail();
  const canonical = new Date(timestamp).toISOString();
  if (input !== canonical && input !== canonical.replace('.000Z', 'Z')) return fail();
  return input;
}

function priceLists(input: unknown, products: ReadonlySet<number>, markets: ReadonlySet<string>, channels: ReadonlySet<string>): readonly PriceList[] {
  let totalPrices = 0;
  const ids = new Set<string>();
  const lists = array(input, 0, COMPANY_PRICING_LIMITS.lists).map(value => {
    const row = record(value, ['id', 'version', 'label', 'state', 'priority', 'currency', 'activeFrom',
      'activeUntil', 'markets', 'channels', 'companyKeyHashes', 'prices']);
    const id = text(row.id, 100);
    if (ids.has(id)) return fail('duplicate_id');
    ids.add(id);
    const state = row.state;
    // Vocabulario cerrado propio: PRICE_LIST_STATES legacy es mutable en JS.
    if (state !== 'active' && state !== 'disabled' && state !== 'archived') return fail();
    // El contrato legacy permite espacios alrededor de una etiqueta de 2..120 caracteres.
    if (typeof row.label !== 'string') return fail();
    const currency = text(row.currency, 3);
    if (!/^[A-Z]{3}$/u.test(currency)) return fail();
    const listMarkets = array(row.markets, 1, COMPANY_PRICING_LIMITS.marketsPerList).map(value => text(value, 40));
    const listChannels = array(row.channels, 1, COMPANY_PRICING_LIMITS.channelsPerList).map(value => text(value, 40));
    for (const market of listMarkets) if (market !== '*' && !markets.has(market)) return fail('unknown_reference');
    for (const channel of listChannels) if (channel !== '*' && !channels.has(channel)) return fail('unknown_reference');
    const hashes = array(row.companyKeyHashes, 0, COMPANY_PRICING_LIMITS.hashesPerList).map(value => {
      const hash = text(value, 64);
      if (!/^[a-f0-9]{64}$/u.test(hash)) return fail();
      return hash;
    });
    const prices = array(row.prices, 1, COMPANY_PRICING_LIMITS.pricesPerList).map(value => {
      const row = record(value, ['productId', 'priceCents']);
      const productId = integer(row.productId, 1, 2_147_483_647);
      if (!products.has(productId)) return fail('unknown_reference');
      return Object.freeze({ productId, priceCents: integer(row.priceCents, 1, 10_000_000) });
    });
    totalPrices += prices.length;
    if (totalPrices > COMPANY_PRICING_LIMITS.totalPrices) return fail();
    const list: PriceList = Object.freeze({ id, version: integer(row.version, 1, 1_000_000),
      label: row.label, state, priority: integer(row.priority, 0, 100_000), currency,
      activeFrom: row.activeFrom === null ? null : instant(row.activeFrom),
      activeUntil: row.activeUntil === null ? null : instant(row.activeUntil),
      markets: Object.freeze(listMarkets), channels: Object.freeze(listChannels),
      companyKeyHashes: Object.freeze(hashes), prices: Object.freeze(prices) });
    assertPriceList(list);
    return list;
  });
  return Object.freeze(lists);
}

/**
 * Precios unitarios de fixtures sobre una variante explícita y visible.
 * Valida también listas ajenas al contexto antes de cualquier bloqueo. El hash
 * se utiliza solo con el motor existente; una vinculación ausente nunca se
 * convierte en identidad general. Las etiquetas suministradas sí se conservan
 * en PriceOrigin; eliminar campos de claves no sanea texto arbitrario de etiquetas.
 */
export function previewCompanyPrices(input: unknown): CompanyPricesPreview {
  try {
    const row = record(input, ['catalogContext', 'bindings', 'priceLists', 'at', 'lines']);
    const rawContext = record(row.catalogContext, ['directory', 'markets', 'catalog', 'companyPolicy', 'publicationPolicy', 'context']);
    const directory = defineCompanyDirectory(rawContext.directory);
    const markets = defineMarketCatalog(rawContext.markets);
    const catalog = defineCompanyCatalogSnapshot(rawContext.catalog);
    const companyPolicy = defineCompanyCatalogPolicy(rawContext.companyPolicy);
    const publicationPolicy = defineMarketPublicationPolicy(rawContext.publicationPolicy);
    const catalogPreview = previewCompanyCatalogContext({ directory, markets, catalog, companyPolicy,
      publicationPolicy, context: rawContext.context });
    const bindings = defineCompanyPricingBindings(row.bindings);
    const selectedBinding = selectCompanyPricingBinding({ directory, bindings, companyId: catalogPreview.company.id });
    const lists = priceLists(row.priceLists, new Set(catalog.products.map(product => product.id)),
      new Set(markets.markets.map(market => market.id)), new Set(publicationPolicy.channels));
    const at = instant(row.at);

    const products = new Map(catalogPreview.products.map(product => [product.productId, product]));
    const variants = new Map(catalogPreview.products.flatMap(product => product.variants.map(variant => [variant.id, variant] as const)));
    const seenProducts = new Set<number>();
    const selected = array(row.lines, 0, COMPANY_PRICING_LIMITS.lines).map(value => {
      const line = record(value, ['productId', 'variantId']);
      const productId = integer(line.productId, 1, 2_147_483_647);
      const variantId = integer(line.variantId, 1, Number.MAX_SAFE_INTEGER);
      if (seenProducts.has(productId)) return fail('duplicate_id');
      seenProducts.add(productId);
      const product = products.get(productId);
      const variant = variants.get(variantId);
      if (!product || !variant) return fail('unknown_reference');
      if (variant.productId !== productId) return fail('cross_product_reference');
      const reasons: CompanyPriceBlockingReason[] = [];
      if (catalogPreview.company.state !== 'active') reasons.push('company_inactive');
      if (selectedBinding.binding === null) reasons.push('pricing_binding_missing');
      if (catalogPreview.market.currency !== 'EUR') reasons.push('currency_mismatch');
      if (!variant.visible) reasons.push('variant_not_visible');
      return Object.freeze({ productId, variantId, catalogUnitPriceCents: variant.priceCents, reasons: Object.freeze(reasons) });
    });
    const eligible = selected.filter(line => line.reasons.length === 0);
    // El guard anterior impide pasar null e inferir el nivel general en ausencia de binding.
    const resolution = selectedBinding.binding === null || eligible.length === 0
      ? Object.freeze({ lines: Object.freeze([]), evaluations: Object.freeze([]) })
      : resolvePriceLists({ lists, context: { at, currency: 'EUR', market: catalogPreview.context.marketId,
        channel: catalogPreview.context.channel }, companyKeyHash: selectedBinding.binding.companyKeyHash,
      lines: eligible.map(line => ({ productId: line.productId, catalogUnitPriceCents: line.catalogUnitPriceCents })) });
    const resolved = new Map(resolution.lines.map(line => [line.productId, line]));
    const lines = selected.map((line): CompanyPriceLinePreview => {
      if (line.reasons.length > 0) return Object.freeze({ productId: line.productId, variantId: line.variantId,
        outcome: 'blocked', reasons: line.reasons, price: null, evaluations: Object.freeze([]) });
      const price = resolved.get(line.productId);
      if (!price) return fail();
      return Object.freeze({ productId: line.productId, variantId: line.variantId,
        outcome: 'priced', reasons: Object.freeze([] as const),
        price: Object.freeze({ catalogUnitPriceCents: price.catalogUnitPriceCents,
          baseUnitPriceCents: price.baseUnitPriceCents, origin: price.origin }),
        evaluations: Object.freeze(resolution.evaluations.filter(evaluation => evaluation.productId === line.productId)) });
    });
    return Object.freeze({ source: 'fixture', catalog: catalogPreview, bindingsRef: selectedBinding.bindingsRef,
      at, lines: Object.freeze(lines) });
  } catch (error) {
    let reason: ContractReason = 'invalid_data';
    try {
      const descriptor = error !== null && typeof error === 'object' ? Object.getOwnPropertyDescriptor(error, 'reason') : undefined;
      if (descriptor && 'value' in descriptor && REASONS.includes(descriptor.value as ContractReason)) reason = descriptor.value as ContractReason;
    } catch { /* Una excepción de introspección también se redacta. */ }
    throw new CompanyCatalogContractError(reason);
  }
}
