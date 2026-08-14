import { describe, expect, it } from 'vitest';
import {
  evaluateCombinedPriceRules,
  resolveDiscountCombination,
  resolveDiscountCombinationPolicy,
  type DiscountClass,
  type DiscountCombinationCandidate,
  type DiscountCombinationPolicy,
  type DiscountSource,
} from '../src/modules/pricing';

const context = {
  at: '2026-08-14T15:00:00.000Z', currency: 'EUR', market: 'ES', channel: 'storefront',
} as const;

function policy(overrides: Partial<DiscountCombinationPolicy> = {}): DiscountCombinationPolicy {
  return {
    id: 'default-stack', version: 1, label: 'Combinación principal', state: 'active',
    priority: 100, currency: 'EUR', activeFrom: null, activeUntil: null,
    markets: ['*'], channels: ['*'], maximumDiscountBasisPoints: 7000,
    sourcePairs: [
      { left: 'promotion_code', right: 'automatic_discount' },
      { left: 'promotion_code', right: 'quantity_offer' },
      { left: 'automatic_discount', right: 'quantity_offer' },
    ],
    classPairs: [
      { left: 'product', right: 'product' },
      { left: 'product', right: 'order' },
      { left: 'product', right: 'shipping' },
      { left: 'order', right: 'shipping' },
    ],
    ...overrides,
  };
}

function candidate(source: DiscountSource, discountClass: DiscountClass, priority: number,
  basisPoints = 1000): DiscountCombinationCandidate {
  return {
    source, discountClass, eligibleProductIds: [1],
    candidate: {
      id: `${source}:${priority}`, version: 1, label: `${source} ${priority}`, priority,
      activeFrom: null, activeUntil: null, markets: ['*'], channels: ['*'], currency: 'EUR',
      effect: { type: 'percentage_off', basisPoints },
    },
  };
}

describe('combinabilidad explícita R4.5', () => {
  it('elige una política activa por contexto, prioridad e id estable', () => {
    expect(resolveDiscountCombinationPolicy({
      context,
      policies: [
        policy({ id: 'later', priority: 20 }),
        policy({ id: 'winner', priority: 10, markets: ['ES'] }),
        policy({ id: 'wrong-market', priority: 1, markets: ['PT'] }),
      ],
    })?.id).toBe('winner');
  });

  it('mantiene el código elegible primero y combina las tres fuentes si ambas matrices lo permiten', () => {
    const result = resolveDiscountCombination({
      policy: policy(),
      candidates: [
        candidate('automatic_discount', 'product', 1),
        candidate('quantity_offer', 'product', 2),
        candidate('promotion_code', 'order', 999),
      ],
    });
    expect(result.selected.map(({ source }) => source)).toEqual([
      'promotion_code', 'automatic_discount', 'quantity_offer',
    ]);
    expect(result.excluded).toEqual([]);
  });

  it('explica por separado una exclusión de fuente y otra de clase', () => {
    expect(resolveDiscountCombination({
      policy: policy({ sourcePairs: [], classPairs: [{ left: 'product', right: 'order' }] }),
      candidates: [
        candidate('promotion_code', 'order', 1),
        candidate('automatic_discount', 'product', 2),
      ],
    }).excluded).toMatchObject([{ source: 'automatic_discount', reason: 'source_pair_denied' }]);
    expect(resolveDiscountCombination({
      policy: policy({
        sourcePairs: [{ left: 'promotion_code', right: 'automatic_discount' }],
        classPairs: [],
      }),
      candidates: [
        candidate('promotion_code', 'order', 1),
        candidate('automatic_discount', 'product', 2),
      ],
    }).excluded).toMatchObject([{ source: 'automatic_discount', reason: 'class_pair_denied' }]);
  });

  it('modela producto/pedido/envío sin conceder combinaciones implícitas', () => {
    const result = resolveDiscountCombination({
      policy: policy({
        sourcePairs: [
          { left: 'promotion_code', right: 'automatic_discount' },
          { left: 'automatic_discount', right: 'quantity_offer' },
        ],
        classPairs: [
          { left: 'order', right: 'product' },
          { left: 'product', right: 'shipping' },
        ],
      }),
      candidates: [
        candidate('promotion_code', 'order', 1),
        candidate('automatic_discount', 'product', 2),
        candidate('quantity_offer', 'shipping', 3),
      ],
    });
    expect(result.selected.map(({ discountClass }) => discountClass)).toEqual(['order', 'product']);
    expect(result.excluded).toMatchObject([{ source: 'quantity_offer', reason: 'source_pair_denied' }]);
  });

  it('suma sobre precio base, reserva el tope por prioridad y deja desglose schema 2', () => {
    const result = evaluateCombinedPriceRules({
      baseUnitPriceCents: 1000, quantity: 3, context, maximumDiscountBasisPoints: 5000,
      candidates: [
        candidate('automatic_discount', 'product', 10, 4000).candidate,
        candidate('quantity_offer', 'product', 20, 3000).candidate,
      ],
    });
    expect(result).toMatchObject({
      schema: 2, base_unit_price_cents: 1000, unit_price_cents: 500,
      discount_cents: 1500, subtotal_cents: 1500,
      applied_rule: { id: 'automatic_discount:10', discount_per_unit_cents: 400 },
      applied_rules: [
        { id: 'automatic_discount:10', raw_discount_per_unit_cents: 400,
          discount_per_unit_cents: 400, capped: false },
        { id: 'quantity_offer:20', raw_discount_per_unit_cents: 300,
          discount_per_unit_cents: 100, capped: true },
      ],
      evaluations: [
        { ruleId: 'automatic_discount:10', status: 'applied' },
        { ruleId: 'quantity_offer:20', status: 'capped' },
      ],
    });
  });

  it('mantiene schema 2 en una línea sin reglas para explicar el pedido combinado completo', () => {
    expect(evaluateCombinedPriceRules({
      baseUnitPriceCents: 750, quantity: 2, context,
      maximumDiscountBasisPoints: 5000, candidates: [],
    })).toMatchObject({
      schema: 2, unit_price_cents: 750, discount_cents: 0,
      subtotal_cents: 1500, applied_rule: null, applied_rules: [], evaluations: [],
    });
  });
});
