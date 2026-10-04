import type { Platform } from './create-platform';
import {
  defineCompanyDirectory, defineCompanyCatalogSnapshot, defineCompanyCatalogPolicy, defineVariantQuantityPolicy,
  type VariantQuantityBlockingReason, type CompanyCatalogVariantRestrictionReason,
} from '../modules/companies';
import { defineMarketCatalog, defineMarketPublicationPolicy, type MarketPublicationVariantExclusion } from '../modules/markets';
import { previewCompanyQuantities, type CompanyQuantityBlockingReason } from './company-quantity-context';

export type VariantQuantityDemoSelection = Readonly<{ marketId: 'ES' | 'FR'; variantId: 11 | 12 | 21 }>;
export type VariantQuantityDemoFeedback = Readonly<{
  tone: 'info'; code: 'initial' | 'context_changed' | 'count_changed'; message: string;
}>;
export type VariantQuantityDemoState = Readonly<{
  selection: VariantQuantityDemoSelection;
  countByVariant: readonly Readonly<{ variantId: VariantQuantityDemoSelection['variantId']; requestedCount: number }>[];
  feedback: VariantQuantityDemoFeedback;
}>;
export type VariantQuantityDemoView = Readonly<{
  selection: VariantQuantityDemoSelection;
  marketOptions: readonly Readonly<{ id: VariantQuantityDemoSelection['marketId']; label: string }>[];
  variantOptions: readonly Readonly<{ id: VariantQuantityDemoSelection['variantId']; label: string }>[];
  countOptions: readonly Readonly<{ id: number; label: string }>[];
  companyLabel: string; channelLabel: string;
  selectedProduct: Readonly<{ id: number; label: string }>;
  selectedVariant: Readonly<{ id: number; label: string; sku: string }>;
  requestedCount: number; requestedCountLabel: string;
  rule: Readonly<{ orderUnit: 'unit' | 'box'; orderUnitLabel: string; unitsPerBox: number; unitsPerBoxLabel: string;
    minUnits: number; maxUnits: number; multipleUnits: number }> | null;
  quantity: Readonly<{ outcome: 'satisfied' | 'blocked'; label: string; quantityUnits: number | null; conversionLabel: string | null;
    reasonLabels: readonly Readonly<{ reason: VariantQuantityBlockingReason; label: string }>[] }>;
  visibility: Readonly<{ visible: boolean; label: string; companyReasonLabels: readonly string[]; marketReasonLabels: readonly string[] }>;
  result: Readonly<{ outcome: 'satisfied' | 'blocked'; label: string;
    reasonLabels: readonly Readonly<{ reason: CompanyQuantityBlockingReason; label: string }>[] }>;
  feedback: VariantQuantityDemoFeedback;
}>;

/** Presentación de fixtures; no activa autorización, precios ni superficies operativas. */
export function canShowVariantQuantityDemo(
  env: Readonly<{ DEMO_MODE?: string | undefined }> | undefined, platform: Pick<Platform, 'manifest'>,
): boolean { return platform.manifest.deployment.mode === 'demo' && env?.DEMO_MODE === 'true'; }

const FIXTURE_AT = '2026-10-03T12:00:00.000Z';
const MARKET_OPTIONS = Object.freeze([
  Object.freeze({ id: 'ES' as const, label: 'España' }), Object.freeze({ id: 'FR' as const, label: 'Francia' }),
]);
const VARIANTS = Object.freeze([
  Object.freeze({ id: 11 as const, productId: 1, productLabel: 'Muestra de cerámica', label: 'Natural', sku: 'DEMO-CER-N',
    counts: Object.freeze([0, 2, 4, 5, 8, 12, 16, 17, 19, 20]) }),
  Object.freeze({ id: 12 as const, productId: 1, productLabel: 'Muestra de cerámica', label: 'Azul', sku: 'DEMO-CER-A',
    counts: Object.freeze([0, 1, 2, 3, 4]) }),
  Object.freeze({ id: 21 as const, productId: 2, productLabel: 'Soporte de muestra', label: 'Único', sku: 'DEMO-SOP-U',
    counts: Object.freeze([0, 1, 2]) }),
]);
const VARIANT_OPTIONS = Object.freeze(VARIANTS.map(variant => Object.freeze({ id: variant.id, label: `${variant.productLabel} · ${variant.label}` })));
const DIRECTORY = defineCompanyDirectory({ schemaVersion: 1, source: 'fixture', id: 'demo.variant-quantity.directory', version: 1,
  capturedAt: FIXTURE_AT, companies: [{ id: 'company.workshop', displayName: 'Taller de ejemplo', state: 'active', vatId: null }],
  sites: [], contacts: [], roles: [], assignments: [] });
// El contexto empresarial requiere su snapshot completo. Los valores monetarios sintéticos
// no intervienen en cantidades y no se proyectan al DTO de esta pantalla.
const CATALOG = defineCompanyCatalogSnapshot({ schemaVersion: 1, source: 'fixture', ref: 'demo.variant-quantity.catalog',
  capturedAt: FIXTURE_AT, currency: 'EUR', products: [
    { id: 1, active: true, variants: [{ id: 11, productId: 1, status: 'active', priceCents: 0 }, { id: 12, productId: 1, status: 'active', priceCents: 0 }] },
    { id: 2, active: true, variants: [{ id: 21, productId: 2, status: 'active', priceCents: 0 }] },
  ] });
const CATALOG_REF = Object.freeze({ ref: CATALOG.ref, capturedAt: CATALOG.capturedAt });
const MARKETS = defineMarketCatalog({ schemaVersion: 1, id: 'demo.variant-quantity.markets', version: 1, markets: [
  { id: 'ES', countryCodes: ['ES'], defaultLocale: 'es-ES', currency: 'EUR', domains: [] },
  { id: 'FR', countryCodes: ['FR'], defaultLocale: 'fr-FR', currency: 'EUR', domains: [] },
], fallback: { strategy: 'none' } });
const COMPANY_POLICY = defineCompanyCatalogPolicy({ schemaVersion: 1, source: 'fixture', id: 'demo.variant-quantity.company-policy', version: 1,
  directoryRef: { id: DIRECTORY.id, version: DIRECTORY.version, capturedAt: DIRECTORY.capturedAt }, catalogRef: CATALOG_REF,
  rules: [{ companyId: 'company.workshop', productId: 1, state: 'included', variantIds: [11, 12] },
    { companyId: 'company.workshop', productId: 2, state: 'included', variantIds: [21] }] });
const PUBLICATION_POLICY = defineMarketPublicationPolicy({ schemaVersion: 1, id: 'demo.variant-quantity.publication', version: 1,
  channels: ['professional'], rules: [
    { marketId: 'ES', channel: 'professional', productId: 1, state: 'published', variantIds: [11, 12] },
    { marketId: 'ES', channel: 'professional', productId: 2, state: 'published', variantIds: [21] },
    { marketId: 'FR', channel: 'professional', productId: 1, state: 'published', variantIds: [12] },
    { marketId: 'FR', channel: 'professional', productId: 2, state: 'published', variantIds: [21] },
  ] });
const POLICY = defineVariantQuantityPolicy({ schemaVersion: 1, source: 'fixture', id: 'demo.variant-quantity.policy', version: 1,
  catalogRef: CATALOG_REF, rules: [
    { productId: 1, variantId: 11, orderUnit: 'unit', unitsPerBox: 1, minUnits: 5, maxUnits: 17, multipleUnits: 4 },
    { productId: 1, variantId: 12, orderUnit: 'box', unitsPerBox: 6, minUnits: 6, maxUnits: 18, multipleUnits: 4 },
  ] });
const REASON_LABELS: Readonly<Record<CompanyQuantityBlockingReason, string>> = Object.freeze({
  unconfigured: 'No hay una regla de cantidad para esta variante.', below_minimum: 'La cantidad está por debajo del mínimo.',
  above_maximum: 'La cantidad supera el máximo.', not_multiple: 'La cantidad no es un múltiplo permitido.',
  variant_not_visible: 'La variante no está visible en este contexto de empresa y mercado.',
});
const COMPANY_REASON_LABELS: Readonly<Record<CompanyCatalogVariantRestrictionReason, string>> = Object.freeze({
  company_inactive: 'La empresa está inactiva.', company_unconfigured: 'La empresa no tiene configurado este producto.',
  company_excluded: 'La empresa excluye este producto.', company_variant_not_selected: 'La empresa no incluye esta variante.',
});
const MARKET_REASON_LABELS: Readonly<Record<MarketPublicationVariantExclusion, string>> = Object.freeze({
  product_inactive: 'El producto está inactivo.', unconfigured: 'No hay publicación para este mercado y canal.',
  unpublished: 'La publicación está retirada en este mercado y canal.', variant_not_selected: 'El mercado no publica esta variante.',
  variant_draft: 'La variante está en borrador.', variant_archived: 'La variante está archivada.',
});
const FEEDBACK = Object.freeze({
  initial: Object.freeze({ tone: 'info' as const, code: 'initial' as const,
    message: 'Explora reglas de cantidad ficticias. El resultado no autoriza compras.' }),
  context_changed: Object.freeze({ tone: 'info' as const, code: 'context_changed' as const,
    message: 'Contexto actualizado. Cada variante conserva su valor solicitado, sin reinterpretarlo ni corregirlo.' }),
  count_changed: Object.freeze({ tone: 'info' as const, code: 'count_changed' as const,
    message: 'Valor solicitado actualizado. Los límites y múltiplos se comprueban sin ajustar la cantidad.' }),
});

function invalid(): never { throw new RangeError('Selección del ejemplo de cantidades inválida.'); }
function record(input: unknown, keys: readonly string[], partial = false): Readonly<Record<string, unknown>> {
  try {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) return invalid();
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return invalid();
    const actual = Reflect.ownKeys(input);
    if ((!partial && actual.length !== keys.length) || (partial && actual.length === 0)) return invalid();
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of actual) {
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (typeof key !== 'string' || !keys.includes(key) || !descriptor?.enumerable || !('value' in descriptor)) return invalid();
      result[key] = descriptor.value;
    }
    return Object.freeze(result);
  } catch { return invalid(); }
}
function variantFor(input: unknown) {
  const variant = VARIANTS.find(variant => variant.id === input);
  if (!variant) return invalid();
  return variant;
}
function countFor(variantId: VariantQuantityDemoSelection['variantId'], input: unknown): number {
  if (typeof input !== 'number' || Object.is(input, -0) || !variantFor(variantId).counts.includes(input)) return invalid();
  return input;
}
function selection(input: unknown): VariantQuantityDemoSelection {
  const row = record(input, ['marketId', 'variantId']);
  if (!MARKET_OPTIONS.some(market => market.id === row.marketId)) return invalid();
  return Object.freeze({ marketId: row.marketId as VariantQuantityDemoSelection['marketId'], variantId: variantFor(row.variantId).id });
}
function counts(input: unknown): VariantQuantityDemoState['countByVariant'] {
  try {
    if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) return invalid();
    const length = Object.getOwnPropertyDescriptor(input, 'length');
    if (!length || !('value' in length) || length.value !== 3 || Reflect.ownKeys(input).length !== 4) return invalid();
    const result: Array<VariantQuantityDemoState['countByVariant'][number]> = [];
    for (let index = 0; index < 3; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
      if (!descriptor?.enumerable || !('value' in descriptor)) return invalid();
      const row = record(descriptor.value, ['variantId', 'requestedCount']); const variant = variantFor(row.variantId);
      result.push(Object.freeze({ variantId: variant.id, requestedCount: countFor(variant.id, row.requestedCount) }));
    }
    if (new Set(result.map(row => row.variantId)).size !== 3) return invalid();
    return Object.freeze(result.sort((a, b) => a.variantId - b.variantId));
  } catch { return invalid(); }
}
function state(input: unknown): VariantQuantityDemoState {
  const row = record(input, ['selection', 'countByVariant', 'feedback']);
  const current = selection(row.selection); const countByVariant = counts(row.countByVariant);
  const feedback = record(row.feedback, ['tone', 'code', 'message']);
  if ((feedback.code !== 'initial' && feedback.code !== 'context_changed' && feedback.code !== 'count_changed') ||
    feedback.tone !== 'info' || feedback.message !== FEEDBACK[feedback.code].message) return invalid();
  return Object.freeze({ selection: current, countByVariant, feedback: FEEDBACK[feedback.code] });
}

export function createVariantQuantityDemo(): VariantQuantityDemoState {
  return Object.freeze({ selection: Object.freeze({ marketId: 'ES', variantId: 11 }), countByVariant: Object.freeze([
    Object.freeze({ variantId: 11, requestedCount: 8 }), Object.freeze({ variantId: 12, requestedCount: 2 }),
    Object.freeze({ variantId: 21, requestedCount: 1 }),
  ]), feedback: FEEDBACK.initial });
}
export function configureVariantQuantityDemo(
  stateInput: VariantQuantityDemoState, input: Readonly<Partial<VariantQuantityDemoSelection>>,
): VariantQuantityDemoState {
  const current = state(stateInput); const patch = record(input, ['marketId', 'variantId'], true);
  return Object.freeze({ selection: selection({ ...current.selection, ...patch }), countByVariant: current.countByVariant, feedback: FEEDBACK.context_changed });
}
export function selectVariantQuantityDemoCount(stateInput: VariantQuantityDemoState, input: Readonly<{ requestedCount: number }>): VariantQuantityDemoState {
  const current = state(stateInput); const row = record(input, ['requestedCount']);
  const requestedCount = countFor(current.selection.variantId, row.requestedCount);
  return Object.freeze({ selection: current.selection,
    countByVariant: Object.freeze(current.countByVariant.map(row => row.variantId === current.selection.variantId
      ? Object.freeze({ variantId: row.variantId, requestedCount }) : row)), feedback: FEEDBACK.count_changed });
}

/** Convierte únicamente el resultado del contrato real a texto; no recalcula límites, múltiplos o cajas. */
export function getVariantQuantityDemoView(stateInput: VariantQuantityDemoState): VariantQuantityDemoView {
  const current = state(stateInput); const selected = variantFor(current.selection.variantId);
  const requestedCount = current.countByVariant.find(row => row.variantId === selected.id)!.requestedCount;
  const preview = previewCompanyQuantities({ catalogContext: { directory: DIRECTORY, markets: MARKETS, catalog: CATALOG,
    companyPolicy: COMPANY_POLICY, publicationPolicy: PUBLICATION_POLICY,
    context: { companyId: 'company.workshop', marketId: current.selection.marketId, channel: 'professional' } },
    policy: POLICY, request: { schemaVersion: 1, id: 'demo.variant-quantity.request', catalogRef: CATALOG_REF,
      policyRef: { id: POLICY.id, version: POLICY.version }, lines: [{ productId: selected.productId, variantId: selected.id, requestedCount }] } });
  const result = preview.lines[0]!; const quantity = result.quantity; const rule = quantity.rule;
  const ruleView = rule === null ? null : Object.freeze({ orderUnit: rule.orderUnit,
    orderUnitLabel: rule.orderUnit === 'unit' ? 'Unidades sueltas' : 'Cajas', unitsPerBox: rule.unitsPerBox,
    unitsPerBoxLabel: rule.orderUnit === 'unit' ? 'Cada valor equivale a 1 unidad.' : `${rule.unitsPerBox} unidades por caja.`,
    minUnits: rule.minUnits, maxUnits: rule.maxUnits, multipleUnits: rule.multipleUnits });
  const conversionLabel = rule === null ? null : rule.orderUnit === 'unit'
    ? `${quantity.requestedCount} unidades solicitadas → ${quantity.quantityUnits} unidades.`
    : `${quantity.requestedCount} ${quantity.requestedCount === 1 ? 'caja' : 'cajas'} de ${rule.unitsPerBox} unidades → ${quantity.quantityUnits} unidades.`;
  return Object.freeze({ selection: current.selection, marketOptions: MARKET_OPTIONS, variantOptions: VARIANT_OPTIONS,
    countOptions: Object.freeze(selected.counts.map(id => Object.freeze({ id, label: String(id) }))),
    companyLabel: 'Taller de ejemplo', channelLabel: 'Canal profesional · ejemplo',
    selectedProduct: Object.freeze({ id: selected.productId, label: selected.productLabel }),
    selectedVariant: Object.freeze({ id: selected.id, label: selected.label, sku: selected.sku }),
    requestedCount: quantity.requestedCount,
    requestedCountLabel: rule === null ? 'Valor solicitado' : rule.orderUnit === 'unit' ? 'Unidades solicitadas' : 'Cajas solicitadas', rule: ruleView,
    quantity: Object.freeze({ outcome: quantity.outcome,
      label: rule === null ? 'Sin regla de cantidad' : quantity.outcome === 'satisfied' ? 'Cumple la regla de cantidad' : 'No cumple la regla de cantidad',
      quantityUnits: quantity.quantityUnits, conversionLabel,
      reasonLabels: Object.freeze(quantity.reasons.map(reason => Object.freeze({ reason, label: REASON_LABELS[reason] }))) }),
    visibility: Object.freeze({ visible: result.visibility.visible,
      label: result.visibility.visible ? 'Visible en empresa y mercado' : 'No visible en este contexto',
      companyReasonLabels: Object.freeze(result.visibility.companyReasons.map(reason => COMPANY_REASON_LABELS[reason])),
      marketReasonLabels: Object.freeze(result.visibility.marketReasons.map(reason => MARKET_REASON_LABELS[reason])) }),
    result: Object.freeze({ outcome: result.outcome,
      label: result.outcome === 'satisfied' ? 'Cantidad y visibilidad compatibles en este ejemplo' : 'Resultado bloqueado en este ejemplo',
      reasonLabels: Object.freeze(result.reasons.map(reason => Object.freeze({ reason, label: REASON_LABELS[reason] }))) }),
    feedback: current.feedback });
}
