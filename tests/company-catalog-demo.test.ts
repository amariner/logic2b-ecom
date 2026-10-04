import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canShowCompanyCatalogDemo, createCompanyCatalogDemo, configureCompanyCatalogDemo,
  selectCompanyCatalogDemoVariant, getCompanyCatalogDemoView,
  type CompanyCatalogDemoSelection, type CompanyCatalogDemoState,
} from '../src/composition/company-catalog-demo';
import { createPlatform } from '../src/composition/create-platform';
import { createPresetManifest, createPublicDemoManifest } from '../src/platform/configuration';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const create = createCompanyCatalogDemo;
const configure = configureCompanyCatalogDemo;
const select = selectCompanyCatalogDemoVariant;
const view = getCompanyCatalogDemoView;
const COMPANIES = ['company.workshop', 'company.studio', 'company.unbound', 'company.closed'] as const;
const CASES = COMPANIES.flatMap(companyId => (['ES', 'FR'] as const).flatMap(marketId => [11, 12].flatMap(pack =>
  [21, 22].map(box => ({ companyId, marketId, pack, box })))));
function stateFor(companyId: CompanyCatalogDemoSelection['companyId'], marketId: CompanyCatalogDemoSelection['marketId'], pack = 11, box = 21) {
  return select(select(configure(create(), { companyId, marketId }), { productId: 1, variantId: pack }), { productId: 2, variantId: box });
}
function frozen(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) frozen(child);
}

describe('aislamiento y peticiones explícitas del ejemplo B2B', () => {
  it.each(['demo', 'client'] as const)('gate requiere modo %s y DEMO_MODE literal true sin bindings operativos', mode => {
    const deployment = { id: 'company-catalog-demo-isolation', environment: 'development' as const };
    const platform = createPlatform(mode === 'demo' ? createPublicDemoManifest(deployment)
      : createPresetManifest('standard', { ...deployment, mode }));
    for (const DEMO_MODE of ['true', 'TRUE', 'false', '', undefined]) {
      const env = { DEMO_MODE, get DB(): never { throw new Error('Unexpected database'); } };
      expect(canShowCompanyCatalogDemo(env, platform))
        .toBe(mode === 'demo' && DEMO_MODE === 'true');
    }
    expect(canShowCompanyCatalogDemo(undefined, platform)).toBe(false);
  });

  it('mostrar los fixtures no activa B2B, delegación ni trabajos programados', () => {
    const platform = createPlatform(createPublicDemoManifest({ id: 'company-catalog-demo-isolation', environment: 'development' }));
    expect(canShowCompanyCatalogDemo({ DEMO_MODE: 'true' }, platform)).toBe(true);
    for (const capability of ['B2B-001', 'B2B-002'] as const) {
      expect(platform.capabilityState(capability)).toBe('installed');
      expect(platform.isCapabilityActive(capability)).toBe(false);
      expect(platform.hasCapabilityFlag(capability, 'routes')).toBe(false);
    }
    expect(platform.manifest.capabilities).not.toHaveProperty('B2B-009');
    expect(platform.scheduledJobs('*/1 * * * *')).toEqual([]);
  });

  it('inicia tres tuplas literales con los niveles empresa, general y catálogo', () => {
    const initial = create(); const current = view(initial);
    expect(initial.selection).toEqual({ companyId: 'company.workshop', marketId: 'ES' });
    expect(initial.selectedVariants).toEqual([{ productId: 1, variantId: 11 }, { productId: 2, variantId: 21 }, { productId: 3, variantId: 31 }]);
    expect(current.companyOptions.map(({ id }) => id)).toEqual(COMPANIES);
    expect(current.marketOptions.map(({ id }) => id)).toEqual(['ES', 'FR']);
    expect(current.channelLabel).toBe('Canal profesional · ejemplo');
    expect(current.at).toBe('2026-10-03T12:00:00.000Z');
    expect(current.products.map(product => product.pricing.price)).toEqual([
      { catalogUnitPriceCents: 1000, baseUnitPriceCents: 800, originType: 'company', originLabel: 'Tarifa de Taller (ejemplo)', fallbackDepth: 0 },
      { catalogUnitPriceCents: 2000, baseUnitPriceCents: 1800, originType: 'general', originLabel: 'Tarifa general (ejemplo)', fallbackDepth: 1 },
      { catalogUnitPriceCents: 3000, baseUnitPriceCents: 3000, originType: 'catalog', originLabel: 'Precio de catálogo (ejemplo)', fallbackDepth: 2 },
    ]);
    expect(current.products[2]!.variantOptions).toEqual([{ id: 31, label: 'Único' }]);
    expect(current.products[2]!.selectedVariantId).toBe(31);
    expect(current.feedback.code).toBe('initial');
  });
});

describe('32 estados de empresa, mercado y variantes explícitas', () => {
  it('la matriz contiene exactamente 32 estados', () => expect(CASES).toHaveLength(32));

  it.each(CASES)('$companyId / $marketId / variantes $pack y $box', ({ companyId, marketId, pack, box }) => {
    const current = view(stateFor(companyId, marketId, pack, box));
    expect(current.products).toHaveLength(3);
    expect(current.products.map(product => product.selectedVariantId)).toEqual([pack, box, 31]);
    const inactive = companyId === 'company.closed'; const studio = companyId === 'company.studio';
    const unbound = companyId === 'company.unbound';
    const expectedVisible = [!inactive && (marketId === 'ES' || !studio), !inactive && !studio && marketId === 'ES', !inactive && !studio && marketId === 'ES'];
    expect(current.products.map(product => product.visible)).toEqual(expectedVisible);
    const chosenVisible = [!inactive && (!studio || pack === 11) && (marketId === 'ES' || pack === 12), expectedVisible[1], expectedVisible[2]];
    expect(current.products.map(product => product.selectedVariant.visible)).toEqual(chosenVisible);
    const originals = [pack === 11 ? 1000 : 1500, box === 21 ? 2000 : 2500, 3000];
    const results = [studio ? 900 : 800, 1800, 3000];
    for (const [index, product] of current.products.entries()) {
      expect(product.active).toBe(true);
      expect(product.variants.every(variant => variant.status === 'active')).toBe(true);
      const reasons = [];
      if (inactive) reasons.push('company_inactive');
      if (unbound) reasons.push('pricing_binding_missing');
      if (!chosenVisible[index]) reasons.push('variant_not_visible');
      expect(product.pricing.reasonLabels.map(({ reason }) => reason)).toEqual(reasons);
      if (reasons.length) {
        expect(product.pricing.outcome).toBe('blocked'); expect(product.pricing.price).toBeNull();
      } else {
        expect(product.pricing.outcome).toBe('priced');
        expect(product.pricing.price).toMatchObject({ catalogUnitPriceCents: originals[index], baseUnitPriceCents: results[index],
          originType: ['company', 'general', 'catalog'][index], fallbackDepth: index });
      }
      expect(product.selectedVariant.id).toBe(product.selectedVariantId);
      expect(product.variants.find(variant => variant.id === product.selectedVariantId)?.sku).toBe(product.selectedVariant.sku);
    }
    expect(current.products[0]!.intersectionReason).toBe(studio && marketId === 'FR' ? 'no_common_variants' : null);
    frozen(current);
  });

  it('una variante distinta cambia la base propia pero conserva el override por producto y el catálogo completo', () => {
    const first = view(create()); const changed = view(stateFor('company.workshop', 'ES', 12, 22));
    expect(changed.products[0]!.pricing.price).toMatchObject({ catalogUnitPriceCents: 1500, baseUnitPriceCents: 800 });
    expect(changed.products[1]!.pricing.price).toMatchObject({ catalogUnitPriceCents: 2500, baseUnitPriceCents: 1800 });
    expect(changed.products[2]).toEqual(first.products[2]);
    for (let index = 0; index < 3; index++) {
      expect(changed.products[index]!.variants).toEqual(first.products[index]!.variants);
      expect(changed.products[index]!.visible).toBe(first.products[index]!.visible);
    }
  });

  it('la otra empresa tiene tarifa propia sin obtener productos excluidos ni configuraciones ausentes', () => {
    const current = view(configure(create(), { companyId: 'company.studio' }));
    expect(current.products[0]!.pricing.price).toMatchObject({ baseUnitPriceCents: 900, originLabel: 'Tarifa de Estudio (ejemplo)' });
    expect(current.products[1]).toMatchObject({ restriction: 'excluded', publication: 'published', visible: false });
    expect(current.products[2]).toMatchObject({ restriction: 'unconfigured', publication: 'published', visible: false });
    expect(current.products[1]!.companyReasonLabels).toEqual(['El producto está excluido de la selección de la empresa.']);
    expect(current.products[2]!.companyReasonLabels).toEqual(['No hay una selección de este producto para la empresa.']);
    expect(current.products.slice(1).every(product => product.pricing.price === null)).toBe(true);
  });

  it('FR conserva una variante pedida oculta aunque otra esté visible, sin seleccionar por defecto', () => {
    const france = configure(create(), { marketId: 'FR' }); const current = view(france);
    expect(france.selectedVariants).toEqual(create().selectedVariants);
    expect(current.products[0]).toMatchObject({ visible: true, selectedVariantId: 11, selectedVariant: { visible: false }, pricing: { price: null } });
    expect(current.products[0]!.variants.map(variant => ({ id: variant.id, visible: variant.visible }))).toEqual([{ id: 11, visible: false }, { id: 12, visible: true }]);
    const explicit = view(select(france, { productId: 1, variantId: 12 }));
    expect(explicit.products[0]!.pricing.price).toMatchObject({ catalogUnitPriceCents: 1500, baseUnitPriceCents: 800 });
    expect(explicit.products[1]!.publication).toBe('unpublished'); expect(explicit.products[2]!.publication).toBe('unconfigured');
  });

  it('listas disjuntas no producen un producto visible ni siquiera al seleccionar su otra variante', () => {
    const current = view(stateFor('company.studio', 'FR', 12));
    expect(current.products[0]!.intersectionReason).toBe('no_common_variants');
    expect(current.products[0]!.variants.map(({ companyEligible, marketVisible, visible }) => ({ companyEligible, marketVisible, visible }))).toEqual([
      { companyEligible: true, marketVisible: false, visible: false }, { companyEligible: false, marketVisible: true, visible: false },
    ]);
    expect(current.products[0]!.pricing.price).toBeNull();
  });

  it('la empresa sin binding mantiene el catálogo pero nunca usa listas generales ni precios base como resultado', () => {
    const baseline = view(create()); const missing = view(configure(create(), { companyId: 'company.unbound' }));
    expect(missing.company.state).toBe('active');
    expect(missing.products.map(product => product.variants)).toEqual(baseline.products.map(product => product.variants));
    for (const product of missing.products) {
      expect(product.visible).toBe(true); expect(product.pricing.price).toBeNull();
      expect(product.pricing.reasonLabels.map(({ reason }) => reason)).toEqual(['pricing_binding_missing']);
    }
  });
});

describe('estado estricto, transiciones y DTO reducido', () => {
  it('conserva todas las selecciones entre contextos y reset restaura las tres tuplas iniciales', () => {
    const initial = create(); let current = select(initial, { productId: 1, variantId: 12 });
    current = select(current, { productId: 2, variantId: 22 }); const selected = current.selectedVariants;
    for (const companyId of COMPANIES) for (const marketId of ['ES', 'FR'] as const) {
      current = configure(current, { companyId, marketId }); expect(current.selectedVariants).toEqual(selected);
    }
    expect(initial.selectedVariants).toEqual([{ productId: 1, variantId: 11 }, { productId: 2, variantId: 21 }, { productId: 3, variantId: 31 }]);
    expect(view(create())).toEqual(view(initial)); expect(current.selectedVariants).not.toEqual(initial.selectedVariants);
    expect(current.feedback.code).toBe('context_changed');
    expect(select(current, { productId: 3, variantId: 31 }).feedback.code).toBe('variant_changed');
  });

  it('rechaza contextos y acciones desconocidos o contradictorios sin valores implícitos', () => {
    for (const patch of [null, {}, [], { companyId: 'company.alpha' }, { marketId: 'DE' }, { companyId: undefined },
      { marketId: undefined }, { companyId: 'company.workshop', extra: true }, { channel: 'storefront' }, { at: '2026-10-04T12:00:00.000Z' }]) {
      expect(() => configure(create(), patch as never)).toThrow(RangeError);
    }
    for (const patch of [null, {}, { productId: 1, variantId: 21 }, { productId: 99, variantId: 11 },
      { productId: '1', variantId: 11 }, { productId: 1, variantId: null }, { productId: 1, variantId: 11, extra: true }]) {
      expect(() => select(create(), patch as never)).toThrow(RangeError);
    }
  });

  it('revalida estado, propiedad, tres peticiones únicas y feedback en cada entrada pública', () => {
    const initial = create();
    for (const value of [null, {}, { ...initial, extra: true }, { ...initial, selection: { ...initial.selection, companyId: 'other' } },
      { ...initial, feedback: { ...initial.feedback, message: 'Injected' } }, { ...initial, selectedVariants: [] },
      { ...initial, selectedVariants: [{ productId: 1, variantId: 11 }, { productId: 1, variantId: 12 }, { productId: 3, variantId: 31 }] },
      { ...initial, selectedVariants: [{ productId: 1, variantId: 21 }, { productId: 2, variantId: 22 }, { productId: 3, variantId: 31 }] },
    ]) {
      expect(() => view(value as CompanyCatalogDemoState)).toThrow(RangeError);
      expect(() => configure(value as CompanyCatalogDemoState, { marketId: 'ES' })).toThrow(RangeError);
      expect(() => select(value as CompanyCatalogDemoState, { productId: 1, variantId: 11 })).toThrow(RangeError);
    }
  });

  it('no ejecuta getters y redacta fallos arbitrarios de introspección', () => {
    const getter = vi.fn(() => 'FR');
    const patch = Object.defineProperty({}, 'marketId', { enumerable: true, get: getter });
    expect(() => configure(create(), patch)).toThrow(RangeError);
    const selected = structuredClone(create()); Object.defineProperty(selected.selectedVariants, '0', { enumerable: true, get: getter });
    expect(() => view(selected)).toThrow(RangeError);
    for (const value of [Object.assign(Object.create({ inherited: true }), { marketId: 'FR' }),
      { marketId: 'FR', [Symbol('hidden')]: true }, Object.defineProperty({}, 'marketId', { value: 'FR' })]) {
      expect(() => configure(create(), value as never)).toThrow(RangeError);
    }
    const sparse = structuredClone(create()); delete (sparse.selectedVariants as Array<unknown>)[0];
    expect(() => view(sparse)).toThrow(RangeError);
    const proxy = new Proxy({}, { ownKeys() { throw new Error('private:person@example.test'); } });
    for (const call of [() => view(proxy as CompanyCatalogDemoState), () => configure(create(), proxy), () => select(create(), proxy as never)]) {
      expect(call).toThrow('Selección del ejemplo de catálogos de empresa inválida.');
      try { call(); } catch (error) { expect(String(error)).not.toContain('person@example.test'); }
    }
    expect(getter).not.toHaveBeenCalled();
  });

  it('no expone hashes, referencias de políticas, defaults, totales ni precios de variantes fuera del resultado permitido', () => {
    const forbidden = new Set(['companyKeyHash', 'companyKeyHashes', 'directoryRef', 'catalogRef', 'policyRef', 'bindingsRef',
      'companyPolicyRef', 'publicationPolicyRef', 'marketsRef', 'price_list_id', 'isDefault', 'is_default', 'totals', 'quantity', 'priceCents']);
    function walk(value: unknown): void {
      if (value === null || typeof value !== 'object') return;
      for (const [key, child] of Object.entries(value)) { expect(forbidden.has(key)).toBe(false); walk(child); }
    }
    for (const scenario of CASES) {
      const current = view(stateFor(scenario.companyId, scenario.marketId, scenario.pack, scenario.box)); walk(current);
      const serialized = JSON.stringify(current);
      for (const token of ['a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64), 'demo-taller', 'demo-estudio', 'demo-general', 'demo.company-catalog']) {
        expect(serialized).not.toContain(token);
      }
      for (const product of current.products) {
        expect(product.selectedVariant).not.toHaveProperty('catalogUnitPriceCents');
        for (const variant of product.variants) expect(variant).not.toHaveProperty('price');
        if (product.pricing.outcome === 'blocked') expect(product.pricing.price).toBeNull();
      }
    }
  });

  it('copia los datos del estado y permite records sin prototipo sin compartir mutaciones', () => {
    const source = structuredClone(create()); const result = view(source);
    const selected = source.selectedVariants as Array<{ productId: number; variantId: number }>;
    selected[0]!.variantId = 12;
    expect(result.products[0]!.selectedVariantId).toBe(11);
    const patch = Object.assign(Object.create(null), { marketId: 'FR' }); const changed = configure(create(), patch);
    patch.marketId = 'ES'; expect(changed.selection.marketId).toBe('FR');
    frozen(changed); frozen(view(changed));
    expect(view(Object.assign(Object.create(null), create()))).toEqual(view(create()));
  });

  it('recorre la matriz sin reloj implícito, red, almacenamiento ni temporizadores', () => {
    class ExplicitDate extends Date {
      constructor(value?: string | number) { if (value === undefined) throw new Error('Implicit clock'); super(value); }
      static override now(): never { throw new Error('Implicit clock'); }
    }
    const forbidden = vi.fn(() => { throw new Error('Unexpected effect'); });
    vi.stubGlobal('Date', ExplicitDate);
    for (const name of ['fetch', 'setTimeout', 'setInterval']) vi.stubGlobal(name, forbidden);
    for (const name of ['localStorage', 'sessionStorage']) vi.stubGlobal(name, { getItem: forbidden, setItem: forbidden });
    for (const scenario of CASES) {
      const current = view(stateFor(scenario.companyId, scenario.marketId, scenario.pack, scenario.box));
      expect(current.at).toBe('2026-10-03T12:00:00.000Z');
      expect(current.products).toHaveLength(3);
    }
    expect(forbidden).not.toHaveBeenCalled();
  });
});
