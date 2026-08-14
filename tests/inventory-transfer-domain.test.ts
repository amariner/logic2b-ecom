import { describe, expect, it } from 'vitest';
import {
  assertInventoryTransferDraft,
  assertInventoryTransferReceipt,
  transferStatusAfterReceipt,
} from '../src/modules/inventory';

describe('contrato de transferencias R3.7', () => {
  it('rechaza rutas circulares y variantes duplicadas', () => {
    expect(() => assertInventoryTransferDraft({
      sourceLocationId: 1, destinationLocationId: 1,
      lines: [{ variantId: 1, quantity: 2 }],
    })).toThrow(/distintos/);
    expect(() => assertInventoryTransferDraft({
      sourceLocationId: 1, destinationLocationId: 2,
      lines: [{ variantId: 1, quantity: 2 }, { variantId: 1, quantity: 1 }],
    })).toThrow(/una vez/);
  });

  it('acota cada recibo a lo pendiente y deriva el cierre', () => {
    const current = [{ id: 'line-0001', sentQuantity: 4, receivedQuantity: 1, discrepancyQuantity: 0 }];
    expect(() => assertInventoryTransferReceipt(current, [{
      transferLineId: 'line-0001', receivedQuantity: 3, discrepancyQuantity: 1,
    }])).toThrow(/supera/);
    expect(() => assertInventoryTransferReceipt(current, [{
      transferLineId: 'line-0001', receivedQuantity: 2, discrepancyQuantity: 1,
    }])).not.toThrow();
    expect(transferStatusAfterReceipt([{ sentQuantity: 4, receivedQuantity: 3, discrepancyQuantity: 1 }])).toBe('received');
    expect(transferStatusAfterReceipt([{ sentQuantity: 4, receivedQuantity: 2, discrepancyQuantity: 0 }])).toBe('partially_received');
  });
});
