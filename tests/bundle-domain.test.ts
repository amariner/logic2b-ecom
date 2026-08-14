import { describe, expect, it } from 'vitest';
import { resolveBundle, type BundleDefinition } from '../src/modules/pricing';

const fixed: BundleDefinition = {
  id: 'fixed-kit', version: 1, label: 'Kit fijo', state: 'active', kind: 'fixed', productId: 10,
  components: [{ productId: 1, quantity: 2 }, { productId: 2, quantity: 1 }], groups: [],
};

describe('bundles R4.7', () => {
  it('calcula stock del fijo por el componente limitante', () => {
    const result = resolveBundle({ bundle: fixed,
      availableByProduct: new Map([[1, 5], [2, 8]]) });
    expect(result).toMatchObject({ availableStock: 2, snapshot: {
      schema: 1, bundle_id: 'fixed-kit', kind: 'fixed',
      components: [{ product_id: 1, quantity_per_bundle: 2 }, { product_id: 2, quantity_per_bundle: 1 }],
    } });
  });

  it('usa defaults o selección explícita en grupos configurables', () => {
    const bundle: BundleDefinition = { ...fixed, id: 'config-kit', kind: 'configurable', components: [],
      groups: [{ id: 'seat', label: 'Asiento', minimumSelections: 1, maximumSelections: 1,
        options: [{ productId: 1, quantity: 1, isDefault: true },
          { productId: 2, quantity: 2, isDefault: false }] }] };
    expect(resolveBundle({ bundle, availableByProduct: new Map([[1, 3], [2, 8]]) }))
      .toMatchObject({ availableStock: 3, selections: [{ groupId: 'seat', productId: 1 }] });
    expect(resolveBundle({ bundle, selections: [{ groupId: 'seat', productId: 2 }],
      availableByProduct: new Map([[1, 3], [2, 8]]) }))
      .toMatchObject({ availableStock: 4, components: [{ productId: 2, quantity: 2 }] });
  });

  it('rechaza auto-componente, duplicados y selecciones ajenas', () => {
    expect(() => resolveBundle({ bundle: { ...fixed,
      components: [{ productId: 10, quantity: 1 }] }, availableByProduct: new Map() })).toThrow(/bundle/);
    expect(() => resolveBundle({ bundle: { ...fixed,
      components: [{ productId: 1, quantity: 1 }, { productId: 1, quantity: 2 }] },
      availableByProduct: new Map() })).toThrow(/repetirse/);
    const configurable: BundleDefinition = { ...fixed, kind: 'configurable', components: [],
      groups: [{ id: 'group', label: 'Grupo', minimumSelections: 1, maximumSelections: 1,
        options: [{ productId: 1, quantity: 1, isDefault: true }] }] };
    expect(() => resolveBundle({ bundle: configurable,
      selections: [{ groupId: 'group', productId: 9 }], availableByProduct: new Map() })).toThrow(/ajena/);
  });
});
