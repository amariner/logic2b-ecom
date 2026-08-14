import { describe, expect, it } from 'vitest';
import {
  resolvePricingSourceConflict,
  resolveQuantityOffers,
  type PriceRuleCandidate,
  type QuantityOffer,
} from '../src/modules/pricing';

const context = {
  at: '2026-08-14T15:00:00.000Z', currency: 'EUR', market: 'ES', channel: 'storefront',
} as const;

function tier(overrides: Partial<Extract<QuantityOffer, { kind: 'quantity_tier' }>> = {}): QuantityOffer {
  return {
    id: 'volume', version: 1, label: 'Precio por volumen', publicReason: 'Ahorro por cantidad',
    state: 'active', priority: 100, currency: 'EUR', activeFrom: null, activeUntil: null,
    markets: ['*'], channels: ['*'], kind: 'quantity_tier', tierBasis: 'quantity',
    tiers: [
      { threshold: 3, effect: { type: 'percentage_off', basisPoints: 1000 } },
      { threshold: 5, effect: { type: 'percentage_off', basisPoints: 2000 } },
    ],
    productIds: [],
    ...overrides,
  };
}

function xy(overrides: Partial<Extract<QuantityOffer, { kind: 'buy_x_get_y' }>> = {}): QuantityOffer {
  return {
    id: 'three-for-two', version: 1, label: 'Tres por dos', publicReason: 'Compra 2 y consigue 1',
    state: 'active', priority: 100, currency: 'EUR', activeFrom: null, activeUntil: null,
    markets: ['*'], channels: ['*'], kind: 'buy_x_get_y', buyQuantity: 2, rewardQuantity: 1,
    rewardEffect: { type: 'percentage_off', basisPoints: 10_000 }, maxApplications: null,
    buyProductIds: [1], rewardProductIds: [1],
    ...overrides,
  };
}

describe('ofertas por cantidad y X/Y R4.4', () => {
  it('elige el tramo más alto alcanzado y limita el efecto al scope', () => {
    expect(resolveQuantityOffers({
      offers: [tier({ productIds: [1] })], context,
      lines: [
        { productId: 1, unitPriceCents: 1000, quantity: 5 },
        { productId: 2, unitPriceCents: 2000, quantity: 9 },
      ],
    })).toMatchObject({
      status: 'eligible', eligibleProductIds: [1],
      candidate: { id: 'quantity:volume', effect: { type: 'percentage_off', basisPoints: 2000 } },
      evidence: { kind: 'quantity_tier', tier_basis: 'quantity', measured_value: 5, threshold: 5 },
    });
  });

  it('admite tramos por importe sin usar precios del cliente', () => {
    const result = resolveQuantityOffers({
      offers: [tier({
        tierBasis: 'subtotal',
        tiers: [{ threshold: 2500, effect: { type: 'amount_off', amountCents: 100 } }],
      })],
      context,
      lines: [{ productId: 1, unitPriceCents: 900, quantity: 3 }],
    });
    expect(result).toMatchObject({
      status: 'eligible', candidate: { effect: { type: 'amount_off', amountCents: 100 } },
      evidence: { measured_value: 2700, threshold: 2500 },
    });
  });

  it('resuelve B2C/B2B mediante el canal de contexto sin confiar en el navegador', () => {
    const offer = tier({ channels: ['b2b'] });
    const lines = [{ productId: 1, unitPriceCents: 1000, quantity: 3 }];
    expect(resolveQuantityOffers({ offers: [offer], context, lines }))
      .toMatchObject({ status: 'not_eligible' });
    expect(resolveQuantityOffers({ offers: [offer], context: { ...context, channel: 'b2b' }, lines }))
      .toMatchObject({ status: 'eligible', offer: { id: 'volume' } });
  });

  it('resuelve múltiplos X/Y y prorratea el premio sobre unidades participantes', () => {
    const result = resolveQuantityOffers({
      offers: [xy()], context,
      lines: [{ productId: 1, unitPriceCents: 1000, quantity: 6 }],
    });
    expect(result).toMatchObject({
      status: 'eligible', eligibleProductIds: [1],
      candidate: { effect: { type: 'percentage_off', basisPoints: 3340 } },
      evidence: {
        kind: 'buy_x_get_y', applications: 2,
        selected_reward_units: [{ product_id: 1, quantity: 2 }],
        theoretical_discount_cents: 2000,
        proportional_basis_points: 3340,
      },
    });
  });

  it('selecciona primero la recompensa más barata y respeta el máximo de grupos', () => {
    const result = resolveQuantityOffers({
      offers: [xy({
        buyProductIds: [1], rewardProductIds: [2, 3], maxApplications: 1,
      })],
      context,
      lines: [
        { productId: 1, unitPriceCents: 1000, quantity: 4 },
        { productId: 2, unitPriceCents: 800, quantity: 1 },
        { productId: 3, unitPriceCents: 500, quantity: 2 },
      ],
    });
    expect(result).toMatchObject({
      status: 'eligible',
      evidence: {
        applications: 1,
        selected_reward_units: [{ product_id: 3, quantity: 1 }],
        theoretical_discount_cents: 500,
      },
    });
  });

  it('rechaza scopes parcialmente solapados porque contarían una unidad dos veces', () => {
    expect(() => resolveQuantityOffers({
      offers: [xy({ buyProductIds: [1, 2], rewardProductIds: [2, 3] })], context,
      lines: [{ productId: 2, unitPriceCents: 1000, quantity: 3 }],
    })).toThrow(/disjuntos o idénticos/);
  });

  it('mantiene precedencia del código y desempata campañas por prioridad e id', () => {
    const automatic: PriceRuleCandidate = {
      id: 'automatic:a', version: 1, label: 'Auto', priority: 20, activeFrom: null,
      activeUntil: null, markets: ['*'], channels: ['*'], currency: 'EUR',
      effect: { type: 'percentage_off', basisPoints: 1000 },
    };
    const quantity: PriceRuleCandidate = { ...automatic, id: 'quantity:q', priority: 10 };
    expect(resolvePricingSourceConflict({
      promotionEligible: true, automaticEligible: true, quantityOfferEligible: true,
      automaticCandidate: automatic, quantityOfferCandidate: quantity,
    })).toBe('promotion_code');
    expect(resolvePricingSourceConflict({
      promotionEligible: false, automaticEligible: true, quantityOfferEligible: true,
      automaticCandidate: automatic, quantityOfferCandidate: quantity,
    })).toBe('quantity_offer');
  });
});
