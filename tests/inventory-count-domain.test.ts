import { describe, expect, it } from 'vitest';
import { assertInventoryCountDraft, assertInventoryCountReviewer } from '../src/modules/inventory';

describe('contrato de conteos R3.8', () => {
  it('rechaza variantes duplicadas y cantidades inválidas', () => {
    expect(() => assertInventoryCountDraft({
      locationId: 1, reason: 'cycle_count', countedBy: 'operaciones',
      lines: [{ variantId: 2, countedQuantity: 4 }, { variantId: 2, countedQuantity: 3 }],
    })).toThrow(/una vez/);
    expect(() => assertInventoryCountDraft({
      locationId: 1, reason: 'cycle_count', countedBy: 'operaciones',
      lines: [{ variantId: 2, countedQuantity: -1 }],
    })).toThrow(/cantidad contada/);
  });

  it('exige que revisor y contador sean identidades distintas', () => {
    expect(() => assertInventoryCountReviewer('operaciones', 'operaciones')).toThrow(/distinto/);
    expect(() => assertInventoryCountReviewer('operaciones', 'responsable-almacen')).not.toThrow();
  });
});
