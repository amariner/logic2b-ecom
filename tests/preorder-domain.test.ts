import { describe, expect, it } from 'vitest';
import {
  allocatePreorderCommitment,
  cancelPreorderCommitment,
  confirmPreorderPayment,
  planPreorderAllocations,
  resolvePreorderLine,
  type PreorderCommitment,
  type PreorderPolicy,
} from '../src/modules/pricing';

const now = '2026-08-17T12:00:00.000Z';

function policy(overrides: Partial<PreorderPolicy> = {}): PreorderPolicy {
  return {
    id: 'summer-restock', variantId: 7, version: 2, state: 'active', kind: 'backorder',
    label: 'Disponible bajo pedido', publicMessage: 'Disponibilidad prevista en septiembre',
    saleStartsAt: '2026-08-01T00:00:00.000Z', saleEndsAt: '2026-08-31T23:59:59.000Z',
    availabilityStartsAt: '2026-09-01T00:00:00.000Z',
    availabilityEndsAt: '2026-09-15T23:59:59.000Z',
    maxDeferredQuantity: 20, committedDeferredQuantity: 5, capacityVersion: 1,
    paymentPolicy: 'charge_now',
    ...overrides,
  };
}

function commitment(overrides: Partial<PreorderCommitment> = {}): PreorderCommitment {
  return {
    id: 'commitment-01', variantId: 7, state: 'awaiting_stock', immediateQuantity: 1,
    deferredQuantity: 4, allocatedQuantity: 0, restoredQuantity: 0, cancelledQuantity: 0,
    version: 2, paidAt: '2026-08-17T12:00:00.000Z', createdAt: '2026-08-17T11:59:00.000Z',
    ...overrides,
  };
}

describe('preventa y backorder R4.9', () => {
  it('conserva la compra inmediata cuando hay stock y no aplica snapshot diferido', () => {
    expect(resolvePreorderLine({ policy: policy(), requestedQuantity: 2,
      availableQuantity: 3, at: now })).toEqual({
      status: 'available', immediateQuantity: 2, deferredQuantity: 0,
      remainingDeferredCapacity: 15, snapshot: null,
    });
  });

  it('separa stock inmediato y backorder sin venderlo de forma silenciosa', () => {
    expect(resolvePreorderLine({ policy: policy(), requestedQuantity: 4,
      availableQuantity: 1, at: now })).toMatchObject({
      status: 'deferred', immediateQuantity: 1, deferredQuantity: 3,
      remainingDeferredCapacity: 15,
      snapshot: {
        schema: 1, policy_id: 'summer-restock', policy_version: 2, kind: 'backorder',
        payment_policy: 'charge_now', allocation_policy: 'paid_fifo',
        availability_starts_at: '2026-09-01T00:00:00.000Z',
        availability_ends_at: '2026-09-15T23:59:59.000Z',
      },
    });
  });

  it('difiere toda la línea en preventa aunque exista stock físico', () => {
    expect(resolvePreorderLine({ policy: policy({ kind: 'preorder' }), requestedQuantity: 3,
      availableQuantity: 9, at: now })).toMatchObject({
      status: 'deferred', immediateQuantity: 0, deferredQuantity: 3,
      snapshot: { kind: 'preorder' },
    });
  });

  it('rechaza ventana, cupo y cobro posterior no implementado', () => {
    expect(resolvePreorderLine({ policy: policy(), requestedQuantity: 2,
      availableQuantity: 0, at: '2026-09-01T00:00:00.000Z' }))
      .toMatchObject({ status: 'rejected', reason: 'outside_sale_window' });
    expect(resolvePreorderLine({ policy: policy({ committedDeferredQuantity: 19 }),
      requestedQuantity: 2, availableQuantity: 0, at: now }))
      .toMatchObject({ status: 'rejected', reason: 'insufficient_deferred_capacity' });
    expect(resolvePreorderLine({ policy: policy({ paymentPolicy: 'charge_on_allocation' }),
      requestedQuantity: 1, availableQuantity: 0, at: now }))
      .toMatchObject({ status: 'rejected', reason: 'unsupported_payment_policy' });
  });

  it('confirma el pago, asigna parcialmente y termina al cubrir la cantidad', () => {
    const pending = commitment({ state: 'pending_payment', version: 1, paidAt: null });
    const paid = confirmPreorderPayment(pending, now).commitment;
    expect(paid).toMatchObject({ state: 'awaiting_stock', version: 2, paidAt: now });
    const partial = allocatePreorderCommitment(paid, 2).commitment;
    expect(partial).toMatchObject({ state: 'partially_allocated', allocatedQuantity: 2, version: 3 });
    expect(allocatePreorderCommitment(partial, 2).commitment)
      .toMatchObject({ state: 'allocated', allocatedQuantity: 4, version: 4 });
  });

  it('cancela primero lo no asignado y solo repone inventario físico consumido', () => {
    const partiallyAllocated = commitment({ state: 'partially_allocated', allocatedQuantity: 2 });
    const first = cancelPreorderCommitment(partiallyAllocated, 2);
    expect(first).toMatchObject({ cancelledDelta: 2, restockQuantity: 0,
      commitment: { state: 'partially_cancelled', cancelledQuantity: 2, restoredQuantity: 0 } });
    const second = cancelPreorderCommitment(first.commitment, 2);
    expect(second).toMatchObject({ cancelledDelta: 0, restockQuantity: 2,
      commitment: { state: 'cancelled', cancelledQuantity: 2, restoredQuantity: 2 } });
  });

  it('rechaza sobreasignación y sobrecancelación', () => {
    expect(() => allocatePreorderCommitment(commitment(), 5)).toThrow(/supera/);
    expect(() => cancelPreorderCommitment(commitment(), 5)).toThrow(/supera/);
  });

  it('asigna FIFO por pago, creación e id y conserva el sobrante físico', () => {
    const plan = planPreorderAllocations({ variantId: 7, availableQuantity: 5, commitments: [
      commitment({ id: 'commitment-c', deferredQuantity: 4,
        paidAt: '2026-08-17T12:02:00.000Z' }),
      commitment({ id: 'commitment-b', deferredQuantity: 3,
        paidAt: '2026-08-17T12:01:00.000Z', createdAt: '2026-08-17T12:00:00.000Z' }),
      commitment({ id: 'commitment-a', deferredQuantity: 4,
        paidAt: '2026-08-17T12:01:00.000Z', createdAt: '2026-08-17T12:00:00.000Z' }),
    ] });
    expect(plan).toEqual({
      allocations: [
        { commitmentId: 'commitment-a', quantity: 4 },
        { commitmentId: 'commitment-b', quantity: 1 },
      ],
      allocatedQuantity: 5,
      remainingQuantity: 0,
    });
  });

  it('no asigna compromisos impagados, cancelados o ya cubiertos', () => {
    expect(planPreorderAllocations({ variantId: 7, availableQuantity: 3, commitments: [
      commitment({ id: 'pending-commitment', state: 'pending_payment', paidAt: null }),
      commitment({ id: 'cancelled-commitment', state: 'cancelled', allocatedQuantity: 2,
        restoredQuantity: 2, cancelledQuantity: 2 }),
      commitment({ id: 'allocated-commitment', state: 'allocated', allocatedQuantity: 4 }),
    ] })).toEqual({ allocations: [], allocatedQuantity: 0, remainingQuantity: 3 });
  });

  it('rechaza una cola que mezcle variantes o un estado incoherente', () => {
    expect(() => planPreorderAllocations({ variantId: 7, availableQuantity: 1,
      commitments: [commitment({ variantId: 8 })] })).toThrow(/otra variante/);
    expect(() => allocatePreorderCommitment(commitment({ state: 'allocated' }), 1))
      .toThrow(/estado no coincide/);
  });
});
