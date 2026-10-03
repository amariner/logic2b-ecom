import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyMarketPublicationDemo, canShowMarketPublicationDemo, configureMarketPublicationDemo,
  createMarketPublicationDemo, editMarketPublicationDemo, getMarketPublicationDemoView,
  selectMarketPublicationDemoDetail,
  type MarketPublicationDemoSelection, type MarketPublicationDemoState,
} from '../src/composition/market-publication-demo';
import { createPlatform } from '../src/composition/create-platform';
import { createPresetManifest, createPublicDemoManifest } from '../src/platform/configuration';
import { defineMarketPublicationPolicy, type MarketPublicationState } from '../src/modules/markets';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const view = getMarketPublicationDemoView;
const configure = configureMarketPublicationDemo;
const edit = editMarketPublicationDemo;
const apply = applyMarketPublicationDemo;
const detail = selectMarketPublicationDemoDetail;
const tupleKey = (selection: MarketPublicationDemoSelection) => `${selection.marketId}/${selection.channel}/${selection.productId}`;
const selectedRule = (state: MarketPublicationDemoState) => state.policy.rules.find((rule) =>
  rule.marketId === state.selection.marketId && rule.channel === state.selection.channel && rule.productId === state.selection.productId);

function assertFrozen(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) assertFrozen(child);
}

describe('gate e aislamiento de la demo de publicación', () => {
  it.each(['demo', 'client'] as const)('exige manifest %s y DEMO_MODE exacto, sin leer otros bindings', (mode) => {
    const deployment = { id: 'publication-demo-isolation', environment: 'development' as const };
    const platform = createPlatform(mode === 'demo' ? createPublicDemoManifest(deployment)
      : createPresetManifest('standard', { ...deployment, mode }));
    for (const DEMO_MODE of ['true', 'TRUE', 'false', '', undefined]) {
      const env = { DEMO_MODE, get DB(): never { throw new Error('Unexpected D1 access'); } };
      expect(canShowMarketPublicationDemo(env, platform)).toBe(mode === 'demo' && DEMO_MODE === 'true');
    }
    expect(canShowMarketPublicationDemo(undefined, platform)).toBe(false);
  });

  it('mostrar fixtures no activa publicación ni rutas o trabajos operativos', () => {
    const platform = createPlatform(createPublicDemoManifest({ id: 'publication-demo-isolation', environment: 'development' }));
    expect(canShowMarketPublicationDemo({ DEMO_MODE: 'true' }, platform)).toBe(true);
    for (const id of ['MKT-003', 'MKT-004'] as const) {
      expect(platform.capabilityState(id)).toBe('installed');
      expect(platform.isCapabilityActive(id)).toBe(false);
      expect(platform.hasCapabilityFlag(id, 'routes')).toBe(false);
    }
    expect(platform.scheduledJobs('*/1 * * * *')).toEqual([]);
    expect(platform.scheduledJobs('*/5 * * * *')).toEqual([]);
  });
});

describe('fixtures completos proyectados al preview real', () => {
  it('inicia dos productos y dos variantes visibles con Azul explícita, sin elegir Arena por ser default', () => {
    const initial = createMarketPublicationDemo();
    const current = view(initial);
    expect(initial.selection).toEqual({ marketId: 'ES', channel: 'storefront', productId: 1, variantId: 12 });
    expect(initial.policy.version).toBe(1);
    expect(Object.keys(initial.buffers)).toHaveLength(12);
    expect(defineMarketPublicationPolicy(initial.policy)).toEqual(initial.policy);
    expect(current.marketOptions.map(({ id }) => id)).toEqual(['ES', 'FR']);
    expect(current.channelOptions.map(({ id }) => id)).toEqual(['storefront', 'professional']);
    expect(current.productOptions).toEqual([{ id: 1, label: 'Cuenco' }, { id: 2, label: 'Bolsa' }, { id: 3, label: 'Jarrón' }]);
    expect(current.editor).toMatchObject({ publication: 'published', variantIds: [12, 13, 14], dirty: false, canApply: false });
    expect(current.catalog).toMatchObject({ visibleProductCount: 2, visibleVariantCount: 2 });
    expect(current.catalog.products.map(({ id, visible, variants }) => ({ id, visible, variants: variants.map((variant) => variant.id) })))
      .toEqual([{ id: 1, visible: true, variants: [12] }, { id: 2, visible: true, variants: [21] }, { id: 3, visible: false, variants: [] }]);
    expect(current.editor.variants[0]).toMatchObject({ id: 11, name: 'Arena', isDefault: true, status: 'active',
      checked: false, appliedSelected: false, visible: false, reasons: ['variant_not_selected'] });
    expect(current.detail).toEqual({ productId: 1, productName: 'Cuenco', variantId: 12, variantName: 'Azul',
      sku: 'DEMO-CUENCO-AZUL', isDefault: false, status: 'active', publication: 'published', visible: true, reasons: [], reasonLabels: [] });
  });

  it('explica las variantes seleccionadas draft/archived y el producto inactivo sin volverlos visibles', () => {
    const initial = createMarketPublicationDemo();
    const draft = view(detail(initial, { productId: 1, variantId: 13 }));
    expect(draft.detail).toMatchObject({ variantName: 'Terracota', visible: false, reasons: ['variant_draft'] });
    expect(draft.editor.variants.find(({ id }) => id === 13)).toMatchObject({ checked: true, appliedSelected: true, visible: false });
    expect(draft.detail!.reasonLabels).toEqual(['La variante está en borrador.']);
    expect(view(detail(initial, { productId: 1, variantId: 14 })).detail).toMatchObject({ variantName: 'Verde', visible: false, reasons: ['variant_archived'] });
    const inactive = view(detail(initial, { productId: 3, variantId: 31 }));
    expect(inactive.selectedProduct).toEqual({ id: 3, name: 'Jarrón', active: false });
    expect(inactive.detail).toMatchObject({ variantName: 'Marfil', status: 'active', visible: false, reasons: ['product_inactive'] });
    expect(inactive.editor.variants[0]).toMatchObject({ checked: true, appliedSelected: true, visible: false });
  });

  it('FR/storefront conserva un catálogo vacío con decisiones diferentes y no hereda ES', () => {
    const state = configure(createMarketPublicationDemo(), { marketId: 'FR' });
    const current = view(state);
    expect(current.catalog).toMatchObject({ visibleProductCount: 0, visibleVariantCount: 0 });
    expect(current.catalog.products.map(({ id, publication, reasons }) => ({ id, publication, reasons }))).toEqual([
      { id: 1, publication: 'unpublished', reasons: ['unpublished'] },
      { id: 2, publication: 'unconfigured', reasons: ['unconfigured'] },
      { id: 3, publication: 'published', reasons: ['product_inactive'] },
    ]);
    expect(current.detail).toMatchObject({ productId: 1, variantId: 12, visible: false, reasons: ['unpublished'] });
  });

  it('cada canal tiene su propia selección exacta sin convertir default en publicación automática', () => {
    const initial = createMarketPublicationDemo();
    const es = view(configure(initial, { channel: 'professional' }));
    expect(es.catalog).toMatchObject({ visibleProductCount: 1, visibleVariantCount: 1 });
    expect(es.catalog.products[0]!.variants.map(({ id }) => id)).toEqual([11]);
    expect(es.detail).toMatchObject({ variantId: 12, visible: false, reasons: ['variant_not_selected'] });
    const fr = view(configure(initial, { marketId: 'FR', channel: 'professional' }));
    expect(fr.catalog).toMatchObject({ visibleProductCount: 2, visibleVariantCount: 3 });
    expect(fr.catalog.products[1]!.variants.map(({ id }) => id)).toEqual([21, 22]);
    expect(es.appliedPreview.catalog).toEqual(fr.appliedPreview.catalog);
    expect(es.appliedPreview.context).toEqual({ marketId: 'ES', channel: 'professional' });
  });

  it('la vista pública no ofrece precio, stock ni autorización de compra', () => {
    const serialized = JSON.stringify(view(createMarketPublicationDemo()));
    for (const field of ['price_cents', 'available_stock', 'purchasable', 'currency', 'defaultLocale']) expect(serialized).not.toContain(field);
  });
});

describe('buffers por tupla y aplicación explícita', () => {
  it('editar cambia solo el buffer: los resultados del catálogo, detalle y selección aplicada siguen iguales', () => {
    const initial = createMarketPublicationDemo();
    const before = view(initial);
    const edited = edit(initial, { publication: 'published', variantIds: [11, 12] });
    const after = view(edited);
    expect(edited.policy).toBe(initial.policy);
    expect(after.editor).toMatchObject({ variantIds: [11, 12], dirty: true, canApply: true, blockedReason: null });
    expect(after.editor.variants[0]).toMatchObject({ checked: true, appliedSelected: false, visible: false });
    expect(after.editor.variants[2]).toMatchObject({ checked: false, appliedSelected: true, visible: false });
    expect(after.appliedPreview).toEqual(before.appliedPreview);
    expect(after.catalog).toEqual(before.catalog);
    expect(after.detail).toEqual(before.detail);
    expect(edited.feedback.code).toBe('buffer_edited');
  });

  it('aplicar selecciona Arena además de Azul en esa tupla y aumenta una sola versión', () => {
    const initial = createMarketPublicationDemo();
    const next = apply(edit(initial, { publication: 'published', variantIds: [12, 11] }));
    expect(next.policy.version).toBe(2);
    expect(selectedRule(next)?.variantIds).toEqual([11, 12]);
    expect(next.policy.rules.filter((rule) => !(rule.marketId === 'ES' && rule.channel === 'storefront' && rule.productId === 1)))
      .toEqual(initial.policy.rules.filter((rule) => !(rule.marketId === 'ES' && rule.channel === 'storefront' && rule.productId === 1)));
    expect(view(next).catalog).toMatchObject({ visibleProductCount: 2, visibleVariantCount: 3 });
    expect(view(next).editor).toMatchObject({ dirty: false, canApply: false });
    expect(view(detail(next, { productId: 1, variantId: 11 })).detail).toMatchObject({ visible: true, isDefault: true, reasons: [] });
    expect(next.feedback).toMatchObject({ tone: 'success', code: 'applied' });
    const repeated = apply(next);
    expect(repeated.policy).toBe(next.policy);
    expect(repeated.feedback.code).toBe('no_changes');
    expect(view(initial).catalog.visibleVariantCount).toBe(2);
  });

  it('published vacío puede quedar pendiente, pero aplicar no modifica la publicación anterior', () => {
    const initial = createMarketPublicationDemo();
    const pending = edit(initial, { publication: 'published', variantIds: [] });
    expect(view(pending).editor).toMatchObject({ dirty: true, canApply: false, variantIds: [] });
    expect(view(pending).editor.blockedReason).toContain('Selecciona al menos una variante');
    expect(view(pending).catalog).toEqual(view(initial).catalog);
    const blocked = apply(pending);
    expect(blocked.policy).toBe(initial.policy);
    expect(blocked.buffers).toBe(pending.buffers);
    expect(blocked.feedback).toMatchObject({ tone: 'error', code: 'selection_required' });
    expect(apply(edit(blocked, { publication: 'published', variantIds: [11] })).policy.version).toBe(2);
  });

  it('retirar mantiene una regla explícita; dejar sin configurar elimina la tupla', () => {
    const initial = createMarketPublicationDemo();
    const pending = edit(initial, { publication: 'unpublished', variantIds: [12, 13, 14] });
    expect(view(pending).editor.variantIds).toEqual([]);
    expect(view(pending).appliedPreview).toEqual(view(initial).appliedPreview);
    const unpublished = apply(pending);
    expect(selectedRule(unpublished)).toMatchObject({ state: 'unpublished', variantIds: [] });
    expect(view(unpublished).catalog.products[0]).toMatchObject({ publication: 'unpublished', visible: false, reasons: ['unpublished'] });
    const unconfigured = apply(edit(unpublished, { publication: 'unconfigured', variantIds: [] }));
    expect(selectedRule(unconfigured)).toBeUndefined();
    expect(unconfigured.policy.version).toBe(3);
    expect(unconfigured.policy.rules).toHaveLength(initial.policy.rules.length - 1);
    expect(view(unconfigured).catalog.products[0]).toMatchObject({ publication: 'unconfigured', visible: false, reasons: ['unconfigured'] });
    const restored = apply(edit(unconfigured, { publication: 'published', variantIds: [12] }));
    expect(restored.policy.version).toBe(4);
    expect(view(restored).catalog.products[0]!.variants.map(({ id }) => id)).toEqual([12]);
  });

  it('volver a published no recupera variantes descartadas ni elige la predeterminada', () => {
    const initial = createMarketPublicationDemo();
    const withoutSelection = edit(initial, { publication: 'unconfigured', variantIds: [12] });
    const published = edit(withoutSelection, { publication: 'published', variantIds: view(withoutSelection).editor.variantIds });
    expect(view(published).editor).toMatchObject({ publication: 'published', variantIds: [], canApply: false });
    expect(published.policy).toBe(initial.policy);
  });

  it('aplicar solo variantes excluidas conserva published pero muestra el motivo sin sustituirlas', () => {
    const initial = createMarketPublicationDemo();
    const next = apply(edit(initial, { publication: 'published', variantIds: [13, 14] }));
    expect(selectedRule(next)).toMatchObject({ state: 'published', variantIds: [13, 14] });
    expect(view(next).catalog.products[0]).toMatchObject({ visible: false, reasons: ['no_visible_variants'], variants: [] });
    expect(view(next).catalog).toMatchObject({ visibleProductCount: 1, visibleVariantCount: 1 });
    expect(view(next).editor.variants[0]).toMatchObject({ checked: false, visible: false });
  });

  it('conserva doce buffers independientes, incluso tras aplicar uno de ellos', () => {
    const initial = createMarketPublicationDemo();
    let state = initial;
    const expected = new Map<string, { publication: MarketPublicationState; variantIds: readonly number[] }>();
    for (const marketId of ['ES', 'FR'] as const) {
      for (const channel of ['storefront', 'professional'] as const) {
        for (const productId of [1, 2, 3]) {
          state = configure(state, { marketId, channel, productId });
          const publication = view(state).editor.publication === 'published' ? 'unpublished' : 'published';
          const buffer = { publication, variantIds: publication === 'published' ? [productId * 10 + 1] : [] } as const;
          state = edit(state, buffer);
          expected.set(tupleKey(state.selection), buffer);
          expect(view(state).editor.dirty).toBe(true);
          expect(state.policy).toBe(initial.policy);
        }
      }
    }
    state = configure(state, { marketId: 'ES', channel: 'storefront', productId: 1 });
    state = apply(state);
    expect(state.policy.version).toBe(2);
    for (const marketId of ['ES', 'FR'] as const) {
      for (const channel of ['storefront', 'professional'] as const) {
        for (const productId of [1, 2, 3]) {
          state = configure(state, { marketId, channel, productId });
          expect(view(state).editor).toMatchObject(expected.get(tupleKey(state.selection))!);
          expect(view(state).editor.dirty).toBe(!(marketId === 'ES' && channel === 'storefront' && productId === 1));
        }
      }
    }
  });

  it('revertir el buffer recupera el estado limpio, sin incrementar la versión', () => {
    const initial = createMarketPublicationDemo();
    const changed = edit(initial, { publication: 'unpublished', variantIds: [] });
    const reverted = edit(changed, { publication: 'published', variantIds: [14, 12, 13] });
    expect(view(reverted).editor).toMatchObject({ dirty: false, canApply: false, variantIds: [12, 13, 14] });
    expect(apply(reverted).policy).toBe(initial.policy);
    expect(reverted.feedback.code).toBe('no_changes');
  });
});

describe('detalle explícito y validación de acciones locales', () => {
  it('cambiar producto limpia el detalle y cambiar contexto conserva la identidad exacta', () => {
    const initial = createMarketPublicationDemo();
    const changed = configure(initial, { productId: 2 });
    expect(changed.selection.variantId).toBeNull();
    expect(view(changed).detail).toBeNull();
    const chosen = detail(changed, { productId: 2, variantId: 22 });
    expect(view(chosen).detail).toMatchObject({ productId: 2, variantId: 22, visible: false, reasons: ['variant_not_selected'] });
    const other = configure(chosen, { marketId: 'FR', channel: 'professional' });
    expect(other.selection.variantId).toBe(22);
    expect(view(other).detail).toMatchObject({ productId: 2, variantId: 22, visible: true });
    expect(configure(other, { productId: 2 }).selection.variantId).toBe(22);
    expect(configure(other, { productId: 1 }).selection.variantId).toBeNull();
  });

  it('seleccionar un detalle de otro producto requiere ambos IDs exactos y conserva los buffers', () => {
    const state = edit(createMarketPublicationDemo(), { publication: 'published', variantIds: [11] });
    const next = detail(state, { productId: 2, variantId: 21 });
    expect(next.selection).toMatchObject({ productId: 2, variantId: 21 });
    expect(next.buffers).toBe(state.buffers);
    expect(next.policy).toBe(state.policy);
    expect(view(detail(next, { productId: 1, variantId: 11 })).editor).toMatchObject({ dirty: true, variantIds: [11] });
    expect(view(detail(next, { productId: 1, variantId: 11 })).detail?.visible).toBe(false);
  });

  it.each([
    {}, { marketId: 'US' }, { marketId: 'es' }, { channel: 'online' }, { channel: 'STOREFRONT' },
    { productId: 99 }, { productId: '1' }, { productId: undefined }, { variantId: 11 }, { marketId: 'ES', extra: true },
  ])('rechaza una selección fuera de los fixtures: %j', (input) => {
    expect(() => configure(createMarketPublicationDemo(), input as never)).toThrow(RangeError);
  });

  it.each([
    { productId: 1, variantId: 21 }, { productId: 2, variantId: 11 }, { productId: 1, variantId: 999 },
    { productId: 1, variantId: null }, { productId: 1, variantId: '11' }, { productId: 999, variantId: 11 },
    { variantId: 11 }, { productId: 1, variantId: 11, fallback: true },
  ])('rechaza detalle ajeno o incompleto sin retarget: %j', (input) => {
    expect(() => detail(createMarketPublicationDemo(), input as never)).toThrow(RangeError);
  });

  it.each([
    { publication: 'automatic', variantIds: [] }, { publication: 'published', variantIds: [21] },
    { publication: 'published', variantIds: [11, 11] }, { publication: 'published', variantIds: ['11'] },
    { publication: 'unpublished', variantIds: [21] }, { publication: 'published' },
    { publication: 'published', variantIds: [11], productId: 2 },
  ])('rechaza buffer inválido, también referencias ajenas que un modo sin selección descartaría: %j', (input) => {
    expect(() => edit(createMarketPublicationDemo(), input as never)).toThrow(RangeError);
  });

  it('rechaza getters, prototipos, símbolos y arrays dispersos sin ejecutar accesores', () => {
    const initial = createMarketPublicationDemo();
    const getter = vi.fn(() => 11);
    const ids = [11];
    Object.defineProperty(ids, '0', { enumerable: true, get: getter });
    for (const input of [
      Object.defineProperty({}, 'productId', { enumerable: true, get: getter }),
      Object.assign(Object.create({ inherited: true }), { productId: 1 }),
      { productId: 1, [Symbol('unknown')]: 1 },
      Object.defineProperty({}, 'productId', { enumerable: false, value: 1 }),
    ]) expect(() => configure(initial, input as never)).toThrow(RangeError);
    expect(() => detail(initial, Object.defineProperty({ productId: 1 }, 'variantId', { enumerable: true, get: getter }) as never)).toThrow(RangeError);
    for (const variantIds of [ids, new Array(1), Object.assign([11], { extra: 1 })]) {
      expect(() => edit(initial, { publication: 'published', variantIds })).toThrow(RangeError);
    }
    expect(() => edit(initial, Object.defineProperty({ variantIds: [11] }, 'publication', { enumerable: true, get: getter }) as never)).toThrow(RangeError);
    expect(getter).not.toHaveBeenCalled();
  });

  it('copia la selección de entrada y no conserva un array mutable externo', () => {
    const ids = [12, 11];
    const state = edit(createMarketPublicationDemo(), { publication: 'published', variantIds: ids });
    ids.push(13);
    expect(view(state).editor.variantIds).toEqual([11, 12]);
    expect(apply(state).policy.rules.find((rule) => rule.marketId === 'ES' && rule.channel === 'storefront' && rule.productId === 1)?.variantIds).toEqual([11, 12]);
  });
});

describe('reset, artefactos inmutables y ausencia de efectos', () => {
  it('reset restablece selección, doce buffers y política sin mutar la simulación anterior', () => {
    const initial = createMarketPublicationDemo();
    let changed = apply(edit(initial, { publication: 'published', variantIds: [11, 12] }));
    changed = configure(changed, { marketId: 'FR', productId: 2 });
    changed = edit(changed, { publication: 'published', variantIds: [22] });
    const reset = createMarketPublicationDemo();
    expect(reset).toEqual(initial);
    expect(view(reset)).toEqual(view(initial));
    expect(changed.policy.version).toBe(2);
    expect(view(changed).editor).toMatchObject({ dirty: true, variantIds: [22] });
    expect(view(configure(changed, { marketId: 'ES', productId: 1 })).catalog.visibleVariantCount).toBe(3);
    expect(view(reset).catalog.visibleVariantCount).toBe(2);
  });

  it('devuelve estados y vistas congeladas y no consulta reloj implícito, red, storage o temporizadores', () => {
    const unexpected = () => { throw new Error('Unexpected external effect'); };
    class ExplicitDate extends Date {
      constructor(value?: string | number) {
        if (value === undefined) throw new Error('Unexpected implicit clock');
        super(value);
      }
      static override now(): number { return unexpected(); }
    }
    vi.stubGlobal('Date', ExplicitDate);
    vi.stubGlobal('fetch', unexpected);
    vi.stubGlobal('localStorage', { getItem: unexpected, setItem: unexpected });
    vi.stubGlobal('sessionStorage', { getItem: unexpected, setItem: unexpected });
    vi.stubGlobal('setTimeout', unexpected);
    vi.stubGlobal('setInterval', unexpected);
    let state = apply(edit(createMarketPublicationDemo(), { publication: 'published', variantIds: [11, 12] }));
    state = configure(state, { marketId: 'FR', channel: 'professional' });
    state = detail(state, { productId: 2, variantId: 22 });
    const current = view(state);
    expect(current.detail?.visible).toBe(true);
    assertFrozen(state);
    assertFrozen(current);
    expect(() => { (current.detail as { visible: boolean }).visible = false; }).toThrow();
    expect(current.appliedPreview.catalog.capturedAt).toBe('2026-10-03T12:00:00.000Z');
  });
});
