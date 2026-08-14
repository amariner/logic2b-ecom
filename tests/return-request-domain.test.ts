import { describe, expect, it } from 'vitest';
import {
  assertReturnInspection,
  assertReturnReceipt,
  assertReturnTransition,
  planReturnRequest,
} from '../src/modules/fulfillment';

describe('dominio RMA R3.10', () => {
  const eligibility = [{ orderItemId: 11, variantId: 1, unitAmountCents: 1200,
    deliveredQuantity: 3, claimedQuantity: 1, lastDeliveredAt: '2026-08-10T10:00:00.000Z' }] as const;

  it('solo admite unidades entregadas, no reclamadas y dentro de ventana', () => {
    expect(planReturnRequest({ now: '2026-08-14T10:00:00.000Z',
      lines: [{ orderItemId: 11, quantity: 2 }], eligibility })[0])
      .toMatchObject({ requestedQuantity: 2, variantId: 1 });
    expect(() => planReturnRequest({ now: '2026-08-14T10:00:00.000Z',
      lines: [{ orderItemId: 11, quantity: 3 }], eligibility })).toThrow(/supera/);
    expect(() => planReturnRequest({ now: '2026-09-20T10:00:00.000Z',
      lines: [{ orderItemId: 11, quantity: 1 }], eligibility })).toThrow(/ventana/);
  });

  it('separa recepción e inspección y prohíbe mezclar cambio con reembolso', () => {
    expect(() => assertReturnReceipt({ expectedLines: [{ id: 'line-0001', requestedQuantity: 2 }],
      lines: [{ returnLineId: 'line-0001', receivedQuantity: 3 }] })).toThrow(/supera/);
    expect(() => assertReturnInspection({
      expectedLines: [{ id: 'line-0001', receivedQuantity: 1 }, { id: 'line-0002', receivedQuantity: 1 }],
      lines: [
        { returnLineId: 'line-0001', inspection: 'restock', resolution: 'refund' },
        { returnLineId: 'line-0002', inspection: 'damaged', resolution: 'exchange', exchangeVariantId: 2 },
      ],
    })).toThrow(/mezclar/);
  });

  it('expone solo las transiciones operativas explícitas', () => {
    expect(() => assertReturnTransition('requested', 'authorized')).not.toThrow();
    expect(() => assertReturnTransition('authorized', 'inspected')).toThrow(/inválida/);
    expect(() => assertReturnTransition('resolved', 'received')).toThrow(/inválida/);
  });
});
