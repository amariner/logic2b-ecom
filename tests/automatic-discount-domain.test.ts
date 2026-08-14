import { describe, expect, it } from 'vitest';
import {
  resolveAutomaticDiscounts,
  resolvePricingSourceConflict,
  type AutomaticDiscount,
} from '../src/modules/pricing';

const context = {
  at: '2026-08-14T15:00:00.000Z', currency: 'EUR', market: 'ES', channel: 'storefront',
} as const;

function discount(overrides: Partial<AutomaticDiscount> = {}): AutomaticDiscount {
  return {
    id: 'summer', version: 1, label: 'Campaña verano', publicReason: 'Oferta automática de verano',
    state: 'active', priority: 100, currency: 'EUR',
    effect: { type: 'percentage_off', basisPoints: 1000 }, activeFrom: null, activeUntil: null,
    markets: ['*'], channels: ['*'], minimumSubtotalCents: 0, productIds: [],
    ...overrides,
  };
}

describe('descuentos automáticos R4.3', () => {
  it('elige una sola campaña por prioridad y conserva su motivo público', () => {
    const result = resolveAutomaticDiscounts({
      discounts: [
        discount({ id: 'second', priority: 20 }),
        discount({ id: 'first', priority: 10, publicReason: 'Mejor promoción disponible', productIds: [2] }),
      ],
      context,
      baseSubtotalCents: 3000,
      cartProductIds: [1, 2],
    });
    expect(result).toMatchObject({
      status: 'eligible',
      candidate: { id: 'automatic:first', label: 'Mejor promoción disponible' },
      eligibleProductIds: [2],
    });
  });

  it('descarta estado, mínimo, scope y contexto sin exponer una campaña', () => {
    expect(resolveAutomaticDiscounts({
      discounts: [
        discount({ id: 'disabled', state: 'disabled' }),
        discount({ id: 'minimum', minimumSubtotalCents: 5000 }),
        discount({ id: 'scope', productIds: [99] }),
        discount({ id: 'market', markets: ['PT'] }),
      ],
      context,
      baseSubtotalCents: 2000,
      cartProductIds: [1],
    })).toMatchObject({ status: 'not_eligible', reason: 'no_eligible_discount' });
  });

  it.each([
    [true, true, 'promotion_code'],
    [true, false, 'promotion_code'],
    [false, true, 'automatic_discount'],
    [false, false, 'none'],
  ] as const)('resuelve la matriz código=%s automático=%s', (promotionEligible, automaticEligible, expected) => {
    expect(resolvePricingSourceConflict({ promotionEligible, automaticEligible })).toBe(expected);
  });
});
