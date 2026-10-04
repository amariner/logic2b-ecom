import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canShowVariantQuantityDemo, createVariantQuantityDemo, configureVariantQuantityDemo,
  selectVariantQuantityDemoCount, getVariantQuantityDemoView, type VariantQuantityDemoState,
} from '../src/composition/variant-quantity-demo';
import { createPlatform } from '../src/composition/create-platform';
import { createPresetManifest, createPublicDemoManifest } from '../src/platform/configuration';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const create = createVariantQuantityDemo;
const configure = configureVariantQuantityDemo;
const select = selectVariantQuantityDemoCount;
const view = getVariantQuantityDemoView;
const UNIT = [
  [0, ['below_minimum']], [2, ['below_minimum', 'not_multiple']], [4, ['below_minimum']], [5, ['not_multiple']],
  [8, []], [12, []], [16, []], [17, ['not_multiple']], [19, ['above_maximum', 'not_multiple']], [20, ['above_maximum']],
] as const;
const BOX = [[0, 0, ['below_minimum']], [1, 6, ['not_multiple']], [2, 12, []], [3, 18, ['not_multiple']], [4, 24, ['above_maximum']]] as const;
const CASES = (['ES', 'FR'] as const).flatMap(marketId => [
  ...UNIT.map(([count, reasons]) => ({ marketId, variantId: 11 as const, count, units: count as number | null, reasons: [...reasons] as string[] })),
  ...BOX.map(([count, units, reasons]) => ({ marketId, variantId: 12 as const, count, units: units as number | null, reasons: [...reasons] as string[] })),
  ...[0, 1, 2].map(count => ({ marketId, variantId: 21 as const, count, units: null as number | null, reasons: ['unconfigured'] })),
]);
function frozen(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) frozen(child);
}

describe('aislamiento y selección inicial explícita', () => {
  it.each(['demo', 'client'] as const)('gate AND con manifest %s y DEMO_MODE literal sin tocar D1', mode => {
    const deployment = { id: 'variant-quantity-demo-isolation', environment: 'development' as const };
    const platform = createPlatform(mode === 'demo' ? createPublicDemoManifest(deployment)
      : createPresetManifest('standard', { ...deployment, mode }));
    for (const DEMO_MODE of ['true', 'TRUE', 'false', '', undefined]) {
      const env = { DEMO_MODE, get DB(): never { throw new Error('Unexpected database'); } };
      expect(canShowVariantQuantityDemo(env, platform)).toBe(mode === 'demo' && DEMO_MODE === 'true');
    }
    expect(canShowVariantQuantityDemo(undefined, platform)).toBe(false);
  });

  it('la presentación deja B2B instalado e inactivo, sin rutas ni trabajos', () => {
    const platform = createPlatform(createPublicDemoManifest({ id: 'variant-quantity-demo-isolation', environment: 'development' }));
    expect(canShowVariantQuantityDemo({ DEMO_MODE: 'true' }, platform)).toBe(true);
    for (const id of ['B2B-001', 'B2B-002', 'B2B-005'] as const) {
      expect(platform.capabilityState(id)).toBe('installed'); expect(platform.isCapabilityActive(id)).toBe(false);
      expect(platform.hasCapabilityFlag(id, 'routes')).toBe(false);
    }
    expect(platform.scheduledJobs('*/1 * * * *')).toEqual([]);
    expect(platform.manifest.capabilities).not.toHaveProperty('B2B-009');
  });

  it('inicia ES/11 y el mapa literal 11→8, 12→2, 21→1', () => {
    const initial = create(); const current = view(initial);
    expect(initial.selection).toEqual({ marketId: 'ES', variantId: 11 });
    expect(initial.countByVariant).toEqual([{ variantId: 11, requestedCount: 8 }, { variantId: 12, requestedCount: 2 }, { variantId: 21, requestedCount: 1 }]);
    expect(current.companyLabel).toBe('Taller de ejemplo'); expect(current.channelLabel).toBe('Canal profesional · ejemplo');
    expect(current.selectedProduct).toEqual({ id: 1, label: 'Muestra de cerámica' });
    expect(current.selectedVariant).toEqual({ id: 11, label: 'Natural', sku: 'DEMO-CER-N' });
    expect(current.countOptions.map(option => option.id)).toEqual([0, 2, 4, 5, 8, 12, 16, 17, 19, 20]);
    expect(current.variantOptions.map(option => option.id)).toEqual([11, 12, 21]);
    expect(current.requestedCountLabel).toBe('Unidades solicitadas');
    expect(current.rule).toMatchObject({ orderUnit: 'unit', unitsPerBox: 1, minUnits: 5, maxUnits: 17, multipleUnits: 4 });
    expect(current.quantity).toMatchObject({ outcome: 'satisfied', quantityUnits: 8, reasonLabels: [] });
    expect(current.visibility.visible).toBe(true); expect(current.result.outcome).toBe('satisfied');
    expect(current.feedback.code).toBe('initial');
  });
});

describe('36 estados con cantidad separada de visibilidad', () => {
  it('cierra la matriz en 36 estados, 8 cantidades satisfechas y 5 resultados conjuntos satisfechos', () => {
    expect(CASES).toHaveLength(36);
    expect(CASES.filter(row => row.reasons.length === 0)).toHaveLength(8);
    expect(CASES.filter(row => row.reasons.length === 0 && !(row.marketId === 'FR' && row.variantId === 11))).toHaveLength(5);
  });

  it.each(CASES)('$marketId / variante $variantId / valor $count', ({ marketId, variantId, count, units, reasons }) => {
    const current = view(select(configure(create(), { marketId, variantId }), { requestedCount: count }));
    const visible = marketId !== 'FR' || variantId !== 11;
    const finalReasons = [...reasons, ...(visible ? [] : ['variant_not_visible'])];
    expect(current.selection).toEqual({ marketId, variantId }); expect(current.requestedCount).toBe(count);
    expect(current.quantity.quantityUnits).toBe(units);
    expect(current.quantity.reasonLabels.map(({ reason }) => reason)).toEqual(reasons);
    expect(current.quantity.outcome).toBe(reasons.length ? 'blocked' : 'satisfied');
    expect(current.visibility.visible).toBe(visible);
    expect(current.visibility.companyReasonLabels).toEqual([]);
    expect(current.visibility.marketReasonLabels).toEqual(visible ? [] : ['El mercado no publica esta variante.']);
    expect(current.result.outcome).toBe(finalReasons.length ? 'blocked' : 'satisfied');
    expect(current.result.reasonLabels.map(({ reason }) => reason)).toEqual(finalReasons);
    expect(current.selectedProduct.id).toBe(variantId === 21 ? 2 : 1);
    if (variantId === 21) {
      expect(current.rule).toBeNull(); expect(current.quantity.conversionLabel).toBeNull();
      expect(current.requestedCountLabel).toBe('Valor solicitado'); expect(current.quantity.label).toBe('Sin regla de cantidad');
      expect(current.countOptions.map(option => option.id)).toEqual([0, 1, 2]);
    } else if (variantId === 12) {
      expect(current.rule).toMatchObject({ orderUnit: 'box', unitsPerBox: 6, minUnits: 6, maxUnits: 18, multipleUnits: 4 });
      expect(current.requestedCountLabel).toBe('Cajas solicitadas');
      expect(current.quantity.conversionLabel).toContain(`→ ${units} unidades`);
      expect(current.countOptions.map(option => option.id)).toEqual([0, 1, 2, 3, 4]);
    } else {
      expect(current.rule).toMatchObject({ orderUnit: 'unit', unitsPerBox: 1, minUnits: 5, maxUnits: 17, multipleUnits: 4 });
      expect(current.quantity.conversionLabel).toContain(`→ ${units} unidades`);
    }
    frozen(current);
  });

  it('cero es conocido con regla y permanece desconocido sin regla, sin eliminar la solicitud', () => {
    for (const variantId of [11, 12, 21] as const) {
      const selected = select(configure(create(), { variantId }), { requestedCount: 0 }); const current = view(selected);
      expect(selected.countByVariant.find(row => row.variantId === variantId)?.requestedCount).toBe(0);
      expect(current.requestedCount).toBe(0);
      expect(current.quantity.quantityUnits).toBe(variantId === 21 ? null : 0);
      expect(current.quantity.reasonLabels.map(({ reason }) => reason)).toEqual([variantId === 21 ? 'unconfigured' : 'below_minimum']);
    }
  });

  it('cambiar mercado afecta solo a visibilidad, no a regla, cuenta o conversión', () => {
    const initial = select(create(), { requestedCount: 19 }); const before = view(initial);
    const after = view(configure(initial, { marketId: 'FR' }));
    expect(after.quantity).toEqual(before.quantity); expect(after.rule).toEqual(before.rule);
    expect(after.requestedCount).toBe(19);
    expect(after.result.reasonLabels.map(({ reason }) => reason)).toEqual(['above_maximum', 'not_multiple', 'variant_not_visible']);
    const satisfiedHidden = view(configure(create(), { marketId: 'FR' }));
    expect(satisfiedHidden.quantity.outcome).toBe('satisfied'); expect(satisfiedHidden.result.outcome).toBe('blocked');
  });
});

describe('memoria por variante, estado hostil y ausencia de efectos', () => {
  it('preserva cada cuenta sin reinterpretar unidades, cajas o ausencia de regla', () => {
    let current = select(create(), { requestedCount: 19 });
    current = configure(current, { variantId: 12 }); expect(view(current).requestedCount).toBe(2);
    current = select(current, { requestedCount: 1 });
    current = configure(current, { variantId: 21 }); expect(view(current).requestedCount).toBe(1);
    current = select(current, { requestedCount: 0 });
    expect(current.countByVariant).toEqual([{ variantId: 11, requestedCount: 19 }, { variantId: 12, requestedCount: 1 }, { variantId: 21, requestedCount: 0 }]);
    for (const marketId of ['FR', 'ES'] as const) for (const [variantId, requestedCount] of [[11, 19], [12, 1], [21, 0]] as const) {
      current = configure(current, { marketId, variantId }); expect(view(current).requestedCount).toBe(requestedCount);
    }
    expect(current.feedback.code).toBe('context_changed');
    expect(view(create()).requestedCount).toBe(8);
    expect(create().countByVariant).not.toEqual(current.countByVariant);
  });

  it('solo permite valores declarados para la variante actual y controles conocidos', () => {
    for (const patch of [null, {}, { marketId: 'DE' }, { marketId: undefined }, { variantId: '11' }, { variantId: 99 },
      { marketId: 'ES', extra: true }, { companyId: 'company.other' }, { orderUnit: 'box' }]) {
      expect(() => configure(create(), patch as never)).toThrow(RangeError);
    }
    for (const requestedCount of [-0, -1, 0.5, 1, NaN, Infinity, Number.MAX_SAFE_INTEGER, '8', undefined]) {
      expect(() => select(create(), { requestedCount } as never)).toThrow(RangeError);
    }
    expect(() => select(configure(create(), { variantId: 12 }), { requestedCount: 8 })).toThrow(RangeError);
    expect(() => select(configure(create(), { variantId: 21 }), { requestedCount: 4 })).toThrow(RangeError);
    expect(() => select(create(), { requestedCount: 8, variantId: 12 } as never)).toThrow(RangeError);
  });

  it('revalida también las cuentas de variantes no seleccionadas y el feedback', () => {
    const initial = create();
    for (const value of [null, {}, { ...initial, extra: true }, { ...initial, selection: { marketId: 'ES', variantId: 99 } },
      { ...initial, countByVariant: [] }, { ...initial, countByVariant: [{ variantId: 11, requestedCount: 8 }, { variantId: 12, requestedCount: 999 }, { variantId: 21, requestedCount: 1 }] },
      { ...initial, countByVariant: [{ variantId: 11, requestedCount: 8 }, { variantId: 11, requestedCount: 8 }, { variantId: 21, requestedCount: 1 }] },
      { ...initial, feedback: { ...initial.feedback, message: 'Injected' } },
    ]) {
      expect(() => view(value as VariantQuantityDemoState)).toThrow(RangeError);
      expect(() => configure(value as VariantQuantityDemoState, { marketId: 'FR' })).toThrow(RangeError);
      expect(() => select(value as VariantQuantityDemoState, { requestedCount: 8 })).toThrow(RangeError);
    }
  });

  it('rechaza getters, propiedades extra, arrays dispersos y errores de introspección sin ejecutarlos ni filtrarlos', () => {
    const getter = vi.fn(() => 8);
    const action = Object.defineProperty({}, 'requestedCount', { enumerable: true, get: getter });
    expect(() => select(create(), action as never)).toThrow(RangeError);
    const value = structuredClone(create()); Object.defineProperty(value.countByVariant, '0', { enumerable: true, get: getter });
    expect(() => view(value)).toThrow(RangeError);
    const sparse = structuredClone(create()); delete (sparse.countByVariant as Array<unknown>)[0];
    expect(() => view(sparse)).toThrow(RangeError);
    for (const patch of [Object.assign(Object.create({ inherited: true }), { marketId: 'ES' }),
      { marketId: 'ES', [Symbol('hidden')]: true }, Object.defineProperty({}, 'marketId', { value: 'ES' })]) {
      expect(() => configure(create(), patch as never)).toThrow(RangeError);
    }
    const proxy = new Proxy({}, { ownKeys() { throw new Error('private:person@example.test'); } });
    for (const operation of [() => view(proxy as VariantQuantityDemoState), () => configure(create(), proxy), () => select(create(), proxy as never)]) {
      expect(operation).toThrow('Selección del ejemplo de cantidades inválida.');
      try { operation(); } catch (error) { expect(String(error)).not.toContain('person@example.test'); }
    }
    expect(getter).not.toHaveBeenCalled();
  });

  it('copia estado y acciones, congela resultados y no modifica el origen durante reset', () => {
    const source = structuredClone(create()); const before = view(source);
    (source.countByVariant as Array<{ variantId: number; requestedCount: number }>)[0]!.requestedCount = 19;
    expect(before.requestedCount).toBe(8);
    const patch = Object.assign(Object.create(null), { variantId: 12 }); const changed = configure(create(), patch);
    patch.variantId = 21; expect(changed.selection.variantId).toBe(12);
    frozen(changed); frozen(view(changed));
    expect(view(Object.assign(Object.create(null), create()))).toEqual(view(create()));
    expect(view(create()).requestedCount).toBe(8); expect(view(source).requestedCount).toBe(19);
  });

  it('ningún estado expone referencias, identificadores técnicos de políticas, dinero o permisos', () => {
    const forbidden = new Set(['catalogRef', 'directoryRef', 'policyRef', 'requestId', 'companyPolicyRef', 'publicationPolicyRef', 'marketsRef',
      'companyId', 'currency', 'price', 'priceCents', 'totals', 'stock', 'purchasable', 'grants']);
    function walk(value: unknown): void {
      if (value === null || typeof value !== 'object') return;
      for (const [key, child] of Object.entries(value)) { expect(forbidden.has(key)).toBe(false); walk(child); }
    }
    for (const row of CASES) {
      const current = view(select(configure(create(), { marketId: row.marketId, variantId: row.variantId }), { requestedCount: row.count }));
      walk(current); expect(JSON.stringify(current)).not.toContain('demo.variant-quantity');
      expect(JSON.stringify(current)).not.toContain('company.workshop');
    }
  });

  it('evalúa la matriz y reset sin reloj implícito, red, almacenamiento o temporizadores', () => {
    class ExplicitDate extends Date {
      constructor(value?: string | number) { if (value === undefined) throw new Error('Implicit clock'); super(value); }
      static override now(): never { throw new Error('Implicit clock'); }
    }
    const forbidden = vi.fn(() => { throw new Error('Unexpected effect'); }); vi.stubGlobal('Date', ExplicitDate);
    for (const name of ['fetch', 'setTimeout', 'setInterval']) vi.stubGlobal(name, forbidden);
    for (const name of ['localStorage', 'sessionStorage']) vi.stubGlobal(name, { getItem: forbidden, setItem: forbidden });
    for (const row of CASES) {
      const current = view(select(configure(create(), { marketId: row.marketId, variantId: row.variantId }), { requestedCount: row.count }));
      expect(current.requestedCount).toBe(row.count);
    }
    expect(view(create()).result.outcome).toBe('satisfied'); expect(forbidden).not.toHaveBeenCalled();
  });
});
