import type { Platform } from './create-platform';
import { createCatalogEntry, type CatalogEntry, type ProductVariantStatus } from '../modules/catalog';
import {
  defineMarketCatalog, defineMarketPublicationPolicy, previewMarketPublication,
  type MarketPublicationPolicy, type MarketPublicationPreview, type MarketPublicationState,
  type MarketPublicationProductExclusion, type MarketPublicationVariantExclusion,
} from '../modules/markets';
import { projectMarketPublicationSnapshot } from './market-publication-snapshot';

export type MarketPublicationDemoSelection = Readonly<{
  marketId: 'ES' | 'FR';
  channel: 'storefront' | 'professional';
  productId: number;
  variantId: number | null;
}>;
export type MarketPublicationDemoFeedback = Readonly<{
  tone: 'info' | 'success' | 'error';
  code: string;
  message: string;
}>;
type PublicationBuffer = Readonly<{ publication: MarketPublicationState; variantIds: readonly number[] }>;
export type MarketPublicationDemoState = Readonly<{
  selection: MarketPublicationDemoSelection;
  policy: MarketPublicationPolicy;
  buffers: Readonly<Record<string, PublicationBuffer>>;
  feedback: MarketPublicationDemoFeedback;
}>;
export type MarketPublicationDemoView = Readonly<{
  selection: MarketPublicationDemoSelection;
  marketOptions: readonly Readonly<{ id: MarketPublicationDemoSelection['marketId']; label: string }>[];
  channelOptions: readonly Readonly<{ id: MarketPublicationDemoSelection['channel']; label: string }>[];
  productOptions: readonly Readonly<{ id: number; label: string }>[];
  selectedProduct: Readonly<{ id: number; name: string; active: boolean }>;
  editor: Readonly<{
    publication: MarketPublicationState;
    variantIds: readonly number[];
    dirty: boolean;
    canApply: boolean;
    blockedReason: string | null;
    variants: readonly Readonly<{
      id: number; name: string; sku: string; status: ProductVariantStatus; isDefault: boolean;
      checked: boolean; appliedSelected: boolean; visible: boolean;
      reasons: readonly MarketPublicationVariantExclusion[]; reasonLabels: readonly string[];
    }>[];
  }>;
  catalog: Readonly<{
    visibleProductCount: number;
    visibleVariantCount: number;
    products: readonly Readonly<{
      id: number; name: string; publication: MarketPublicationState; visible: boolean;
      reasons: readonly MarketPublicationProductExclusion[]; reasonLabels: readonly string[];
      variants: readonly Readonly<{ id: number; name: string; sku: string }>[];
    }>[];
  }>;
  detail: Readonly<{
    productId: number; productName: string; variantId: number; variantName: string; sku: string;
    isDefault: boolean; status: ProductVariantStatus; publication: MarketPublicationState;
    visible: boolean; reasons: readonly MarketPublicationVariantExclusion[]; reasonLabels: readonly string[];
  }> | null;
  appliedPreview: MarketPublicationPreview;
  feedback: MarketPublicationDemoFeedback;
}>;

/** Gate de presentación; no activa capacidades ni consulta otros bindings. */
export function canShowMarketPublicationDemo(
  env: Readonly<{ DEMO_MODE?: string | undefined }> | undefined,
  platform: Pick<Platform, 'manifest'>,
): boolean {
  return platform.manifest.deployment.mode === 'demo' && env?.DEMO_MODE === 'true';
}

const FIXTURE_AT = '2026-10-03T12:00:00.000Z';
const MARKET_OPTIONS = Object.freeze([
  Object.freeze({ id: 'ES' as const, label: 'España' }), Object.freeze({ id: 'FR' as const, label: 'Francia' }),
]);
const CHANNEL_OPTIONS = Object.freeze([
  Object.freeze({ id: 'storefront' as const, label: 'Tienda online' }),
  Object.freeze({ id: 'professional' as const, label: 'Catálogo profesional' }),
]);
const MARKETS = defineMarketCatalog({ schemaVersion: 1, id: 'demo.publication.markets', version: 1,
  markets: [
    { id: 'ES', countryCodes: ['ES'], defaultLocale: 'es-ES', currency: 'EUR', domains: ['es.example.test'] },
    { id: 'FR', countryCodes: ['FR'], defaultLocale: 'fr-FR', currency: 'EUR', domains: ['fr.example.test'] },
  ], fallback: { strategy: 'none' } });

function fixtureEntry(
  id: number, name: string, active: boolean,
  variants: readonly Readonly<{ id: number; name: string; sku: string; status: ProductVariantStatus; isDefault: boolean }>[],
): CatalogEntry {
  return createCatalogEntry({
    product: { id, slug: `demo-product-${id}`, name, description: 'Producto ficticio para explorar publicación.',
      image: '/favicon.svg', category: 'Ejemplos', collection: 'demo-publication', active,
      subtitle: null, specs_json: null, created_at: FIXTURE_AT },
    variants: variants.map((variant, index) => ({ id: variant.id, product_id: id, sku: variant.sku,
      gtin: null, mpn: null, title: variant.name, price_cents: 0, compare_at_price_cents: null,
      status: variant.status, is_default: variant.isDefault, option_signature: JSON.stringify([variant.id]),
      options: [{ option_id: id, option_name: 'Acabado', option_position: 0, value_id: variant.id,
        value: variant.name, value_position: index }], created_at: FIXTURE_AT, updated_at: FIXTURE_AT })),
    available_stock: 0,
  });
}

// Agregados completos y sintéticos. Los campos comerciales no se proyectan ni se muestran.
const ENTRIES = Object.freeze([
  fixtureEntry(1, 'Cuenco', true, [
    { id: 11, name: 'Arena', sku: 'DEMO-CUENCO-ARENA', status: 'active', isDefault: true },
    { id: 12, name: 'Azul', sku: 'DEMO-CUENCO-AZUL', status: 'active', isDefault: false },
    { id: 13, name: 'Terracota', sku: 'DEMO-CUENCO-TERRACOTA', status: 'draft', isDefault: false },
    { id: 14, name: 'Verde', sku: 'DEMO-CUENCO-VERDE', status: 'archived', isDefault: false },
  ]),
  fixtureEntry(2, 'Bolsa', true, [
    { id: 21, name: 'Natural', sku: 'DEMO-BOLSA-NATURAL', status: 'active', isDefault: true },
    { id: 22, name: 'Negra', sku: 'DEMO-BOLSA-NEGRA', status: 'active', isDefault: false },
  ]),
  fixtureEntry(3, 'Jarrón', false, [
    { id: 31, name: 'Marfil', sku: 'DEMO-JARRON-MARFIL', status: 'active', isDefault: true },
  ]),
]);
const SNAPSHOT = projectMarketPublicationSnapshot({ ref: 'demo.publication.catalog', capturedAt: FIXTURE_AT, entries: ENTRIES });
const PRODUCT_OPTIONS = Object.freeze(ENTRIES.map(({ product }) => Object.freeze({ id: product.id, label: product.name })));
const INITIAL_POLICY = defineMarketPublicationPolicy({ schemaVersion: 1, id: 'demo.publication.policy', version: 1,
  channels: CHANNEL_OPTIONS.map(({ id }) => id), rules: [
    { marketId: 'ES', channel: 'storefront', productId: 1, state: 'published', variantIds: [12, 13, 14] },
    { marketId: 'ES', channel: 'storefront', productId: 2, state: 'published', variantIds: [21] },
    { marketId: 'ES', channel: 'storefront', productId: 3, state: 'published', variantIds: [31] },
    { marketId: 'FR', channel: 'storefront', productId: 1, state: 'unpublished', variantIds: [] },
    { marketId: 'FR', channel: 'storefront', productId: 3, state: 'published', variantIds: [31] },
    { marketId: 'ES', channel: 'professional', productId: 1, state: 'published', variantIds: [11] },
    { marketId: 'ES', channel: 'professional', productId: 2, state: 'unpublished', variantIds: [] },
    { marketId: 'FR', channel: 'professional', productId: 1, state: 'published', variantIds: [12] },
    { marketId: 'FR', channel: 'professional', productId: 2, state: 'published', variantIds: [21, 22] },
    { marketId: 'FR', channel: 'professional', productId: 3, state: 'published', variantIds: [31] },
  ] });
const REASON_LABELS: Readonly<Record<MarketPublicationProductExclusion | MarketPublicationVariantExclusion, string>> = Object.freeze({
  product_inactive: 'El producto está inactivo.',
  unconfigured: 'No hay una configuración para este mercado y canal.',
  unpublished: 'La publicación está retirada en este mercado y canal.',
  no_visible_variants: 'Ninguna de las variantes seleccionadas está activa.',
  variant_not_selected: 'La variante no está seleccionada en la configuración aplicada.',
  variant_draft: 'La variante está en borrador.',
  variant_archived: 'La variante está archivada.',
});

function feedback(tone: MarketPublicationDemoFeedback['tone'], code: string, message: string): MarketPublicationDemoFeedback {
  return Object.freeze({ tone, code, message });
}
function dataRecord(input: unknown, allowed: readonly string[], partial = false): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RangeError('Acción de ejemplo inválida.');
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) throw new RangeError('Acción de ejemplo inválida.');
  const keys = Reflect.ownKeys(input);
  if ((!partial && keys.length !== allowed.length) || (partial && keys.length === 0)) throw new RangeError('Acción de ejemplo incompleta.');
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key)!;
    if (typeof key !== 'string' || !allowed.includes(key) || !descriptor.enumerable || !('value' in descriptor)) {
      throw new RangeError('Acción de ejemplo inválida.');
    }
  }
  return input as Record<string, unknown>;
}
function entryFor(productId: unknown): CatalogEntry {
  const entry = ENTRIES.find(({ product }) => product.id === productId);
  if (!entry) throw new RangeError('Producto ajeno a este ejemplo.');
  return entry;
}
function variantFor(productId: unknown, variantId: unknown) {
  const variant = entryFor(productId).product.variants.find((candidate) => candidate.id === variantId);
  if (!variant) throw new RangeError('La variante no pertenece al producto del ejemplo.');
  return variant;
}
function tuple(selection: Readonly<{ marketId: string; channel: string; productId: number }>): string {
  return `${selection.marketId}/${selection.channel}/${selection.productId}`;
}
function appliedBuffer(policy: MarketPublicationPolicy, selection: MarketPublicationDemoSelection): PublicationBuffer {
  const rule = policy.rules.find((candidate) => tuple(candidate) === tuple(selection));
  return Object.freeze({ publication: rule?.state ?? 'unconfigured', variantIds: rule?.variantIds ?? Object.freeze([]) });
}
function selectedBuffer(state: MarketPublicationDemoState): PublicationBuffer {
  return state.buffers[tuple(state.selection)]!;
}
function changed(state: MarketPublicationDemoState): boolean {
  const buffer = selectedBuffer(state);
  const applied = appliedBuffer(state.policy, state.selection);
  return buffer.publication !== applied.publication || buffer.variantIds.length !== applied.variantIds.length ||
    buffer.variantIds.some((id, index) => id !== applied.variantIds[index]);
}
function preview(state: Pick<MarketPublicationDemoState, 'policy' | 'selection'>): MarketPublicationPreview {
  return previewMarketPublication({ markets: MARKETS, catalog: SNAPSHOT, policy: state.policy,
    context: { marketId: state.selection.marketId, channel: state.selection.channel } });
}
function reasonLabels(reasons: readonly (MarketPublicationProductExclusion | MarketPublicationVariantExclusion)[]): readonly string[] {
  return Object.freeze(reasons.map((reason) => REASON_LABELS[reason]));
}
function selectedIds(input: unknown, productId: number): readonly number[] {
  const variants = entryFor(productId).product.variants;
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype || input.length > variants.length ||
    Reflect.ownKeys(input).length !== input.length + 1) throw new RangeError('Selección de variantes inválida.');
  const ids: number[] = [];
  for (let index = 0; index < input.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
    if (!descriptor?.enumerable || !('value' in descriptor)) throw new RangeError('Selección de variantes inválida.');
    ids.push(variantFor(productId, descriptor.value).id);
  }
  if (new Set(ids).size !== ids.length) throw new RangeError('La selección contiene variantes duplicadas.');
  return Object.freeze(ids.sort((a, b) => a - b));
}
function blockReason(state: MarketPublicationDemoState): string | null {
  if (!changed(state)) return 'No hay cambios pendientes de aplicar.';
  const buffer = selectedBuffer(state);
  if (buffer.publication === 'published' && buffer.variantIds.length === 0) return 'Selecciona al menos una variante antes de aplicar.';
  if (state.policy.version === Number.MAX_SAFE_INTEGER) return 'Restablece el ejemplo antes de continuar.';
  return null;
}

/** Solo fixtures en memoria. Crear otro estado restablece selección, política y buffers. */
export function createMarketPublicationDemo(): MarketPublicationDemoState {
  const buffers: Record<string, PublicationBuffer> = {};
  for (const { id: marketId } of MARKET_OPTIONS) {
    for (const { id: channel } of CHANNEL_OPTIONS) {
      for (const { id: productId } of PRODUCT_OPTIONS) {
        const selection = { marketId, channel, productId, variantId: null };
        buffers[tuple(selection)] = appliedBuffer(INITIAL_POLICY, selection);
      }
    }
  }
  return Object.freeze({ selection: Object.freeze({ marketId: 'ES', channel: 'storefront', productId: 1, variantId: 12 }),
    policy: INITIAL_POLICY, buffers: Object.freeze(buffers),
    feedback: feedback('info', 'initial', 'Explora estos productos ficticios. Los cambios solo duran mientras mantengas abierto el ejemplo.') });
}

export function configureMarketPublicationDemo(
  state: MarketPublicationDemoState,
  input: Readonly<Partial<Pick<MarketPublicationDemoSelection, 'marketId' | 'channel' | 'productId'>>>,
): MarketPublicationDemoState {
  const row = dataRecord(input, ['marketId', 'channel', 'productId'], true);
  if (Object.hasOwn(row, 'marketId') && !MARKET_OPTIONS.some(({ id }) => id === row.marketId)) throw new RangeError('Mercado ajeno a este ejemplo.');
  if (Object.hasOwn(row, 'channel') && !CHANNEL_OPTIONS.some(({ id }) => id === row.channel)) throw new RangeError('Canal ajeno a este ejemplo.');
  if (Object.hasOwn(row, 'productId')) entryFor(row.productId);
  const selection = { ...state.selection, ...input };
  // Cambiar producto nunca arrastra una variante anterior ni elige la predeterminada.
  if (selection.productId !== state.selection.productId) selection.variantId = null;
  return Object.freeze({ ...state, selection: Object.freeze(selection),
    feedback: feedback('info', 'selection_changed', 'Vista del ejemplo actualizada. Los cambios pendientes de cada contexto se conservan.') });
}

export function selectMarketPublicationDemoDetail(
  state: MarketPublicationDemoState, input: Readonly<{ productId: number; variantId: number }>,
): MarketPublicationDemoState {
  const row = dataRecord(input, ['productId', 'variantId']);
  const variant = variantFor(row.productId, row.variantId);
  return Object.freeze({ ...state, selection: Object.freeze({ ...state.selection, productId: variant.product_id, variantId: variant.id }),
    feedback: feedback('info', 'detail_selected', 'Detalle de la variante seleccionada. Su visibilidad procede de la configuración aplicada.') });
}

export function editMarketPublicationDemo(
  state: MarketPublicationDemoState, input: Readonly<{ publication: MarketPublicationState; variantIds: readonly number[] }>,
): MarketPublicationDemoState {
  const row = dataRecord(input, ['publication', 'variantIds']);
  if (row.publication !== 'published' && row.publication !== 'unpublished' && row.publication !== 'unconfigured') {
    throw new RangeError('Modo de publicación inválido.');
  }
  const ids = selectedIds(row.variantIds, state.selection.productId);
  // Los dos modos sin selección descartan los checks; volver a publicar exige elegir explícitamente.
  const buffer = Object.freeze({ publication: row.publication,
    variantIds: row.publication === 'published' ? ids : Object.freeze([]) });
  const updated = Object.freeze({ ...state, buffers: Object.freeze({ ...state.buffers, [tuple(state.selection)]: buffer }) });
  const empty = buffer.publication === 'published' && buffer.variantIds.length === 0;
  return Object.freeze({ ...updated, feedback: empty
    ? feedback('error', 'selection_required', 'Selecciona al menos una variante antes de aplicar. La configuración aplicada se conserva.')
    : feedback('info', changed(updated) ? 'buffer_edited' : 'no_changes', changed(updated)
      ? 'Tienes cambios pendientes. La vista del catálogo se actualizará al aplicar al ejemplo.'
      : 'La selección vuelve a la configuración aplicada.') });
}

/** Único puente entre buffer y política aplicada; revalida todo el candidato antes de devolverlo. */
export function applyMarketPublicationDemo(state: MarketPublicationDemoState): MarketPublicationDemoState {
  const blockedReason = blockReason(state);
  if (blockedReason) return Object.freeze({ ...state, feedback: feedback(changed(state) ? 'error' : 'info',
    !changed(state) ? 'no_changes' : selectedBuffer(state).publication === 'published' && selectedBuffer(state).variantIds.length === 0
      ? 'selection_required' : 'version_exhausted', blockedReason) });
  const buffer = selectedBuffer(state);
  const rules = state.policy.rules.filter((rule) => tuple(rule) !== tuple(state.selection));
  if (buffer.publication !== 'unconfigured') rules.push({ marketId: state.selection.marketId, channel: state.selection.channel,
    productId: state.selection.productId, state: buffer.publication, variantIds: buffer.variantIds });
  const policy = defineMarketPublicationPolicy({ ...state.policy, version: state.policy.version + 1, rules });
  preview({ policy, selection: state.selection });
  return Object.freeze({ ...state, policy,
    feedback: feedback('success', 'applied', 'Configuración aplicada solo a este ejemplo. La vista del catálogo y el detalle ya reflejan el cambio.') });
}

/** Metadatos unidos por identidad exacta; toda visibilidad y sus motivos proceden del preview público. */
export function getMarketPublicationDemoView(state: MarketPublicationDemoState): MarketPublicationDemoView {
  const appliedPreview = preview(state);
  const entry = entryFor(state.selection.productId);
  const appliedProduct = appliedPreview.products.find((product) => product.productId === entry.product.id)!;
  const buffer = selectedBuffer(state);
  const dirty = changed(state);
  const blockedReason = blockReason(state);
  const variants = Object.freeze(entry.product.variants.map((variant) => {
    const applied = appliedProduct.variants.find((candidate) => candidate.variantId === variant.id)!;
    return Object.freeze({ id: variant.id, name: variant.title, sku: variant.sku, status: variant.status,
      isDefault: variant.is_default, checked: buffer.variantIds.includes(variant.id), appliedSelected: applied.selected,
      visible: applied.visible, reasons: applied.reasons, reasonLabels: reasonLabels(applied.reasons) });
  }));
  const products = Object.freeze(appliedPreview.products.map((applied) => {
    const product = entryFor(applied.productId).product;
    return Object.freeze({ id: product.id, name: product.name, publication: applied.publication, visible: applied.visible,
      reasons: applied.reasons, reasonLabels: reasonLabels(applied.reasons),
      variants: Object.freeze(applied.visibleVariantIds.map((id) => {
        const variant = variantFor(product.id, id);
        return Object.freeze({ id: variant.id, name: variant.title, sku: variant.sku });
      })) });
  }));
  let detail: MarketPublicationDemoView['detail'] = null;
  if (state.selection.variantId !== null) {
    const variant = variantFor(entry.product.id, state.selection.variantId);
    const applied = appliedProduct.variants.find((candidate) => candidate.variantId === variant.id)!;
    detail = Object.freeze({ productId: entry.product.id, productName: entry.product.name,
      variantId: variant.id, variantName: variant.title, sku: variant.sku, isDefault: variant.is_default,
      status: variant.status, publication: appliedProduct.publication, visible: applied.visible,
      reasons: applied.reasons, reasonLabels: reasonLabels(applied.reasons) });
  }
  return Object.freeze({ selection: state.selection, marketOptions: MARKET_OPTIONS, channelOptions: CHANNEL_OPTIONS,
    productOptions: PRODUCT_OPTIONS, selectedProduct: Object.freeze({ id: entry.product.id, name: entry.product.name, active: entry.product.active }),
    editor: Object.freeze({ publication: buffer.publication, variantIds: buffer.variantIds, dirty, canApply: blockedReason === null,
      blockedReason, variants }),
    catalog: Object.freeze({ visibleProductCount: products.filter((product) => product.visible).length,
      visibleVariantCount: products.reduce((count, product) => count + product.variants.length, 0), products }),
    detail, appliedPreview, feedback: state.feedback });
}
