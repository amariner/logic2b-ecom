import { defineMarketCatalog, MarketContextContractError } from './market-context';

export const MARKET_PUBLICATION_LIMITS = Object.freeze({
  products: 1000,
  perProductVariants: 100,
  variants: 10000,
  channels: 20,
  rules: 10000,
});

export type MarketPublicationVariant = Readonly<{
  id: number;
  productId: number;
  status: 'draft' | 'active' | 'archived';
}>;

export type MarketPublicationProduct = Readonly<{
  id: number;
  active: boolean;
  variants: readonly MarketPublicationVariant[];
}>;

/** Metadatos aportados por el llamador; no acreditan procedencia ni consistencia D1. */
export type MarketPublicationSnapshot = Readonly<{
  schemaVersion: 1;
  ref: string;
  capturedAt: string;
  products: readonly MarketPublicationProduct[];
}>;

export type MarketPublicationRule = Readonly<{
  marketId: string;
  channel: string;
  productId: number;
  state: 'published' | 'unpublished';
  variantIds: readonly number[];
}>;

/** Una versión del artefacto completo, sin prioridades ni herencia entre tuplas. */
export type MarketPublicationPolicy = Readonly<{
  schemaVersion: 1;
  id: string;
  version: number;
  channels: readonly string[];
  rules: readonly MarketPublicationRule[];
}>;

export type MarketPublicationContext = Readonly<{ marketId: string; channel: string }>;
export type MarketPublicationState = 'published' | 'unpublished' | 'unconfigured';
export type MarketPublicationProductExclusion =
  | 'product_inactive' | 'unconfigured' | 'unpublished' | 'no_visible_variants';
export type MarketPublicationVariantExclusion =
  | 'product_inactive' | 'unconfigured' | 'unpublished'
  | 'variant_not_selected' | 'variant_draft' | 'variant_archived';

export type MarketPublicationVariantPreview = Readonly<{
  variantId: number;
  selected: boolean;
  visible: boolean;
  reasons: readonly MarketPublicationVariantExclusion[];
}>;

export type MarketPublicationProductPreview = Readonly<{
  productId: number;
  publication: MarketPublicationState;
  visible: boolean;
  reasons: readonly MarketPublicationProductExclusion[];
  visibleVariantIds: readonly number[];
  variants: readonly MarketPublicationVariantPreview[];
}>;

/** Visibilidad configurada: no acredita precio, existencias ni posibilidad de compra. */
export type MarketPublicationPreview = Readonly<{
  markets: Readonly<{ id: string; version: number }>;
  catalog: Readonly<{ ref: string; capturedAt: string }>;
  policy: Readonly<{ id: string; version: number }>;
  context: MarketPublicationContext;
  products: readonly MarketPublicationProductPreview[];
}>;

export class MarketPublicationContractError extends Error {
  readonly code = 'market_publication_contract_invalid';

  constructor(message: string) {
    super(message);
    this.name = 'MarketPublicationContractError';
  }
}

function invalid(field: string, explanation: string): never {
  throw new MarketPublicationContractError(`${field}: ${explanation}`);
}

function exactRecord(value: unknown, expected: readonly string[], field: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return invalid(field, 'debe ser un objeto de datos.');
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return invalid(field, 'debe contener datos propios.');
  }
  const keys = Reflect.ownKeys(value);
  if (keys.length !== expected.length || keys.some((key) => typeof key !== 'string' || !expected.includes(key))) {
    return invalid(field, 'contiene campos ausentes o desconocidos.');
  }
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!descriptor.enumerable || !('value' in descriptor)) {
      return invalid(field, 'solo admite datos propios enumerables, sin accesores.');
    }
  }
  return value as Record<string, unknown>;
}

function dataArray(value: unknown, min: number, max: number, field: string): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    return invalid(field, 'debe ser un array de datos.');
  }
  if (value.length < min || value.length > max) {
    return invalid(field, `debe contener entre ${min} y ${max} elementos.`);
  }
  if (Reflect.ownKeys(value).length !== value.length + 1) {
    return invalid(field, 'no admite huecos ni propiedades adicionales.');
  }
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
      return invalid(field, 'solo admite elementos propios enumerables, sin accesores.');
    }
  }
  return value;
}

function positiveInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    return invalid(field, 'debe ser un entero positivo seguro.');
  }
  return value;
}

function opaqueId(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length > 100 || !/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/.test(value)) {
    return invalid(field, 'debe ser un identificador opaco canónico de hasta 100 caracteres.');
  }
  return value;
}

function marketId(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length < 2 || value.length > 40 ||
    !/^[A-Z][A-Z0-9]*(?:[._-][A-Z0-9]+)*$/.test(value)) {
    return invalid(field, 'debe ser un identificador canónico en mayúsculas de 2 a 40 caracteres.');
  }
  return value;
}

function channel(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length < 2 || value.length > 40 ||
    !/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/.test(value)) {
    return invalid(field, 'debe ser un canal canónico en minúsculas de 2 a 40 caracteres.');
  }
  return value;
}

function utcTimestamp(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return invalid(field, 'debe ser una fecha UTC canónica de 24 caracteres.');
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) {
    return invalid(field, 'debe ser una fecha UTC válida.');
  }
  return value;
}

function compareTokens(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function defineMarketPublicationSnapshot(input: unknown): MarketPublicationSnapshot {
  const record = exactRecord(input, ['schemaVersion', 'ref', 'capturedAt', 'products'], 'catalog');
  if (record.schemaVersion !== 1) return invalid('catalog.schemaVersion', 'debe ser 1.');
  const ref = opaqueId(record.ref, 'catalog.ref');
  const capturedAt = utcTimestamp(record.capturedAt, 'catalog.capturedAt');
  const productIds = new Set<number>();
  const variantIds = new Set<number>();
  const products = dataArray(record.products, 0, MARKET_PUBLICATION_LIMITS.products, 'catalog.products')
    .map((inputProduct, productIndex): MarketPublicationProduct => {
      const field = `catalog.products.${productIndex}`;
      const product = exactRecord(inputProduct, ['id', 'active', 'variants'], field);
      const id = positiveInteger(product.id, `${field}.id`);
      if (productIds.has(id)) return invalid(`${field}.id`, 'producto duplicado.');
      productIds.add(id);
      if (typeof product.active !== 'boolean') return invalid(`${field}.active`, 'debe ser booleano.');
      const variants = dataArray(product.variants, 1, MARKET_PUBLICATION_LIMITS.perProductVariants, `${field}.variants`)
        .map((inputVariant, variantIndex): MarketPublicationVariant => {
          const variantField = `${field}.variants.${variantIndex}`;
          const variant = exactRecord(inputVariant, ['id', 'productId', 'status'], variantField);
          const variantId = positiveInteger(variant.id, `${variantField}.id`);
          const productId = positiveInteger(variant.productId, `${variantField}.productId`);
          if (productId !== id) return invalid(`${variantField}.productId`, 'la variante pertenece a otro producto.');
          if (variantIds.has(variantId)) return invalid(`${variantField}.id`, 'variante duplicada en el catálogo.');
          variantIds.add(variantId);
          if (variantIds.size > MARKET_PUBLICATION_LIMITS.variants) return invalid('catalog.products', 'supera el límite total de variantes.');
          if (variant.status !== 'draft' && variant.status !== 'active' && variant.status !== 'archived') {
            return invalid(`${variantField}.status`, 'debe ser draft, active o archived.');
          }
          return Object.freeze({ id: variantId, productId, status: variant.status });
        });
      return Object.freeze({ id, active: product.active, variants: Object.freeze(variants.sort((a, b) => a.id - b.id)) });
    });
  return Object.freeze({ schemaVersion: 1, ref, capturedAt, products: Object.freeze(products.sort((a, b) => a.id - b.id)) });
}

export function defineMarketPublicationPolicy(input: unknown): MarketPublicationPolicy {
  const record = exactRecord(input, ['schemaVersion', 'id', 'version', 'channels', 'rules'], 'policy');
  if (record.schemaVersion !== 1) return invalid('policy.schemaVersion', 'debe ser 1.');
  const id = opaqueId(record.id, 'policy.id');
  const version = positiveInteger(record.version, 'policy.version');
  const channels = dataArray(record.channels, 1, MARKET_PUBLICATION_LIMITS.channels, 'policy.channels')
    .map((value, index) => channel(value, `policy.channels.${index}`));
  const declaredChannels = new Set(channels);
  if (declaredChannels.size !== channels.length) return invalid('policy.channels', 'contiene canales duplicados.');
  const tuples = new Set<string>();
  const rules = dataArray(record.rules, 0, MARKET_PUBLICATION_LIMITS.rules, 'policy.rules')
    .map((inputRule, index): MarketPublicationRule => {
      const field = `policy.rules.${index}`;
      const rule = exactRecord(inputRule, ['marketId', 'channel', 'productId', 'state', 'variantIds'], field);
      const selectedMarket = marketId(rule.marketId, `${field}.marketId`);
      const selectedChannel = channel(rule.channel, `${field}.channel`);
      if (!declaredChannels.has(selectedChannel)) return invalid(`${field}.channel`, 'el canal no está declarado en la política.');
      const productId = positiveInteger(rule.productId, `${field}.productId`);
      const tuple = `${selectedMarket}/${selectedChannel}/${productId}`;
      if (tuples.has(tuple)) return invalid(field, 'la tupla mercado/canal/producto está duplicada.');
      tuples.add(tuple);
      if (rule.state !== 'published' && rule.state !== 'unpublished') return invalid(`${field}.state`, 'debe ser published o unpublished.');
      const variantIds = dataArray(rule.variantIds, rule.state === 'published' ? 1 : 0,
        rule.state === 'published' ? MARKET_PUBLICATION_LIMITS.perProductVariants : 0, `${field}.variantIds`)
        .map((value, variantIndex) => positiveInteger(value, `${field}.variantIds.${variantIndex}`));
      if (new Set(variantIds).size !== variantIds.length) return invalid(`${field}.variantIds`, 'contiene variantes duplicadas.');
      return Object.freeze({ marketId: selectedMarket, channel: selectedChannel, productId, state: rule.state,
        variantIds: Object.freeze(variantIds.sort((a, b) => a - b)) });
    });
  rules.sort((a, b) => compareTokens(a.marketId, b.marketId) || compareTokens(a.channel, b.channel) || a.productId - b.productId);
  return Object.freeze({ schemaVersion: 1, id, version, channels: Object.freeze(channels.sort(compareTokens)), rules: Object.freeze(rules) });
}

/** Revalida el artefacto completo antes de evaluar un contexto exacto; nunca usa fallback. */
export function previewMarketPublication(input: unknown): MarketPublicationPreview {
  const record = exactRecord(input, ['markets', 'catalog', 'policy', 'context'], 'preview');
  const markets = (() => {
    try { return defineMarketCatalog(record.markets); }
    catch (error) {
      if (error instanceof MarketContextContractError) return invalid('preview.markets', error.message);
      throw error;
    }
  })();
  const catalog = defineMarketPublicationSnapshot(record.catalog);
  const policy = defineMarketPublicationPolicy(record.policy);
  const contextRecord = exactRecord(record.context, ['marketId', 'channel'], 'context');
  const context = Object.freeze({ marketId: marketId(contextRecord.marketId, 'context.marketId'),
    channel: channel(contextRecord.channel, 'context.channel') });
  const marketsById = new Set(markets.markets.map((market) => market.id));
  if (!marketsById.has(context.marketId)) return invalid('context.marketId', 'mercado desconocido.');
  if (!policy.channels.includes(context.channel)) return invalid('context.channel', 'canal no declarado.');
  const variantsByProduct = new Map(catalog.products.map((product) => [product.id, new Set(product.variants.map((variant) => variant.id))]));
  const selectedRules = new Map<number, MarketPublicationRule>();
  for (const rule of policy.rules) {
    if (!marketsById.has(rule.marketId)) return invalid('policy.rules.marketId', 'mercado desconocido.');
    const variantIds = variantsByProduct.get(rule.productId);
    if (!variantIds) return invalid('policy.rules.productId', 'producto desconocido.');
    if (rule.variantIds.some((id) => !variantIds.has(id))) {
      return invalid('policy.rules.variantIds', 'variante desconocida o perteneciente a otro producto.');
    }
    if (rule.marketId === context.marketId && rule.channel === context.channel) selectedRules.set(rule.productId, rule);
  }
  const products = catalog.products.map((product): MarketPublicationProductPreview => {
    const rule = selectedRules.get(product.id);
    const publication = rule?.state ?? 'unconfigured';
    const selectedIds = new Set(rule?.variantIds ?? []);
    const variants = product.variants.map((variant): MarketPublicationVariantPreview => {
      const selected = selectedIds.has(variant.id);
      // Bloqueos independientes, ordenados: producto, configuración, estado de variante.
      const reasons: MarketPublicationVariantExclusion[] = [];
      if (!product.active) reasons.push('product_inactive');
      if (publication === 'unconfigured' || publication === 'unpublished') reasons.push(publication);
      else if (!selected) reasons.push('variant_not_selected');
      if (variant.status === 'draft') reasons.push('variant_draft');
      if (variant.status === 'archived') reasons.push('variant_archived');
      return Object.freeze({ variantId: variant.id, selected, visible: reasons.length === 0, reasons: Object.freeze(reasons) });
    });
    const visibleVariantIds = Object.freeze(variants.filter((variant) => variant.visible).map((variant) => variant.variantId));
    const reasons: MarketPublicationProductExclusion[] = [];
    if (!product.active) reasons.push('product_inactive');
    if (publication === 'unconfigured' || publication === 'unpublished') reasons.push(publication);
    if (reasons.length === 0 && visibleVariantIds.length === 0) reasons.push('no_visible_variants');
    return Object.freeze({ productId: product.id, publication, visible: visibleVariantIds.length > 0,
      reasons: Object.freeze(reasons), visibleVariantIds, variants: Object.freeze(variants) });
  });
  return Object.freeze({
    markets: Object.freeze({ id: markets.id, version: markets.version }),
    catalog: Object.freeze({ ref: catalog.ref, capturedAt: catalog.capturedAt }),
    policy: Object.freeze({ id: policy.id, version: policy.version }),
    context,
    products: Object.freeze(products),
  });
}
