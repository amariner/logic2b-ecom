import { describe, expect, it } from 'vitest';
import { evaluatePriceRules, type PriceRuleCandidate } from '../src/modules/pricing';

const context = {
  at: '2026-08-14T15:00:00.000Z', currency: 'EUR', market: 'ES', channel: 'storefront',
} as const;

function rule(overrides: Partial<PriceRuleCandidate> = {}): PriceRuleCandidate {
  return {
    id: 'rule-standard', version: 1, label: 'Regla estándar', priority: 100,
    activeFrom: null, activeUntil: null, markets: ['*'], channels: ['*'], currency: 'EUR',
    effect: { type: 'percentage_off', basisPoints: 1000 },
    ...overrides,
  };
}

describe('motor puro de reglas de precio R4.1', () => {
  it('conserva el precio base cuando no hay candidatas', () => {
    expect(evaluatePriceRules({ baseUnitPriceCents: 1999, quantity: 2, context }))
      .toEqual({
        schema: 1, context, currency: 'EUR', base_unit_price_cents: 1999,
        unit_price_cents: 1999, quantity: 2, base_subtotal_cents: 3998,
        discount_cents: 0, subtotal_cents: 3998, applied_rule: null, evaluations: [],
      });
  });

  it('elige prioridad menor, desempata por id y nunca combina accidentalmente', () => {
    const result = evaluatePriceRules({
      baseUnitPriceCents: 2000, quantity: 3, context,
      candidates: [
        rule({ id: 'rule-z', priority: 10, effect: { type: 'amount_off', amountCents: 300 } }),
        rule({ id: 'rule-a', priority: 10, effect: { type: 'percentage_off', basisPoints: 2500 } }),
        rule({ id: 'rule-priority-20', priority: 20 }),
      ],
    });
    expect(result).toMatchObject({
      unit_price_cents: 1500, discount_cents: 1500, subtotal_cents: 4500,
      applied_rule: { id: 'rule-a', discount_per_unit_cents: 500 },
    });
    expect(result.evaluations).toEqual([
      { ruleId: 'rule-a', version: 1, priority: 10, status: 'applied' },
      { ruleId: 'rule-z', version: 1, priority: 10, status: 'superseded_priority' },
      { ruleId: 'rule-priority-20', version: 1, priority: 20, status: 'superseded_priority' },
    ]);
  });

  it('explica vigencia, mercado, canal y moneda sin depender del orden de entrada', () => {
    const result = evaluatePriceRules({
      baseUnitPriceCents: 1000, quantity: 1, context,
      candidates: [
        rule({ id: 'expired', priority: 5, activeUntil: context.at }),
        rule({ id: 'future', priority: 6, activeFrom: '2026-08-15T00:00:00.000Z' }),
        rule({ id: 'market', priority: 7, markets: ['PT'] }),
        rule({ id: 'channel', priority: 8, channels: ['admin'] }),
        rule({ id: 'currency', priority: 9, currency: 'USD' }),
      ],
    });
    expect(result.applied_rule).toBeNull();
    expect(Object.fromEntries(result.evaluations.map((item) => [item.ruleId, item.status]))).toEqual({
      expired: 'excluded_expired', future: 'excluded_not_started', market: 'excluded_market',
      channel: 'excluded_channel', currency: 'excluded_currency',
    });
  });

  it('usa enteros, limita el descuento al precio y rechaza contratos ambiguos', () => {
    expect(evaluatePriceRules({
      baseUnitPriceCents: 999, quantity: 2, context,
      candidates: [rule({ effect: { type: 'percentage_off', basisPoints: 3333 } })],
    })).toMatchObject({ unit_price_cents: 667, discount_cents: 664, subtotal_cents: 1334 });
    expect(evaluatePriceRules({
      baseUnitPriceCents: 500, quantity: 1, context,
      candidates: [rule({ effect: { type: 'amount_off', amountCents: 900 } })],
    }).unit_price_cents).toBe(0);
    expect(() => evaluatePriceRules({
      baseUnitPriceCents: 1000, quantity: 1, context,
      candidates: [rule(), rule()],
    })).toThrow(/duplicada/);
    expect(() => evaluatePriceRules({
      baseUnitPriceCents: 10.5, quantity: 1, context,
    })).toThrow(/entero/);
    expect(() => evaluatePriceRules({
      baseUnitPriceCents: 1000, quantity: 1, context,
      candidates: [rule({ id: ' rule-with-spaces ' })],
    })).toThrow(/id inválido/);
    expect(() => evaluatePriceRules({
      baseUnitPriceCents: 1000, quantity: 1,
      context: { ...context, at: '2026-02-30T00:00:00.000Z' },
    })).toThrow(/UTC ISO-8601/);
  });
});
