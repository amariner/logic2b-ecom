import { describe, expect, it } from 'vitest';
import { applyConfirmedPreliminaryOrderPayment, approvePreliminaryOrder,
  createPreliminaryOrderDraft, issuePreliminaryOrder, nextPreliminaryOrderPayment } from '../src/modules/orders';
import { planStoredValueRefund } from '../src/modules/payments';
import { evaluateCombinedPriceRules, evaluatePriceRules, resolveQuantityOffers } from '../src/modules/pricing';
import { R4_MODEL_CONTRACTS, R4_MODEL_IDS, R4_MODEL_INTERACTIONS,
  r4ModelInteraction } from '../src/shared-kernel/r4-model-matrix';
import { BACKUP_TABLES } from '../src/lib/backup';
import { CAPABILITY_PRESETS } from '../src/platform/configuration';

const CONTEXT = Object.freeze({
  at: '2026-08-17T12:00:00.000Z', currency: 'EUR', market: 'ES', channel: 'storefront',
});

function sequence(seed: number): number {
  let value = seed >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return value >>> 0;
}

describe('R4.12 consolidación ejecutable de modelos de venta', () => {
  it('cubre cada modelo y cada pareja sin relación implícita', () => {
    expect(R4_MODEL_CONTRACTS.map((contract) => contract.id)).toEqual(R4_MODEL_IDS);
    expect(new Set(R4_MODEL_CONTRACTS.flatMap((contract) => contract.capabilityIds)).size).toBe(14);
    for (const contract of R4_MODEL_CONTRACTS) {
      for (const capabilityId of contract.capabilityIds) {
        expect(CAPABILITY_PRESETS.advanced[capabilityId as keyof typeof CAPABILITY_PRESETS.advanced]?.state,
          `${contract.id}:${capabilityId}`).toBe(contract.state === 'installed' ? 'installed' : 'active');
      }
      for (const table of contract.evidenceTables) {
        expect(BACKUP_TABLES, `${contract.id}:${table}`).toContain(table);
      }
    }
    expect(R4_MODEL_INTERACTIONS).toHaveLength(
      R4_MODEL_IDS.length * (R4_MODEL_IDS.length + 1) / 2,
    );
    for (const left of R4_MODEL_IDS) {
      for (const right of R4_MODEL_IDS) {
        expect(r4ModelInteraction(left, right), `${left} × ${right}`)
          .toBe(r4ModelInteraction(right, left));
      }
    }
    expect(r4ModelInteraction('promotion_code', 'automatic_discount'))
      .toBe('combination_policy_required');
    expect(r4ModelInteraction('discount_combination', 'quantity_offer'))
      .toBe('combination_policy_governs');
    expect(r4ModelInteraction('bundle', 'preorder')).toBe('incompatible_same_line');
    expect(r4ModelInteraction('price_list', 'promotion_code')).toBe('price_origin_before_effects');
    expect(r4ModelInteraction('stored_value', 'bundle')).toBe('tender_after_total');
    expect(r4ModelInteraction('subscription', 'price_list')).toBe('separate_lifecycle');
  });

  it('conserva céntimos y topes en 12.000 casos deterministas de precio simple/combinado', () => {
    for (let seed = 1; seed <= 6_000; seed += 1) {
      const first = sequence(seed);
      const second = sequence(first);
      const base = first % 10_000_001;
      const quantity = second % 99 + 1;
      const basisPoints = sequence(second) % 10_000 + 1;
      const simple = evaluatePriceRules({
        baseUnitPriceCents: base,
        quantity,
        context: CONTEXT,
        candidates: [{
          id: `rule-${seed}`, version: 1, label: 'Regla property', priority: 1,
          activeFrom: null, activeUntil: null, markets: ['ES'], channels: ['storefront'],
          currency: 'EUR', effect: { type: 'percentage_off', basisPoints },
        }],
      });
      expect(Number.isSafeInteger(simple.subtotal_cents)).toBe(true);
      expect(simple.subtotal_cents + simple.discount_cents).toBe(simple.base_subtotal_cents);
      expect(simple.unit_price_cents * quantity).toBe(simple.subtotal_cents);
    }

    for (let seed = 6_001; seed <= 12_000; seed += 1) {
      const first = sequence(seed);
      const base = first % 10_000_000 + 1;
      const quantity = sequence(first) % 99 + 1;
      const cap = sequence(sequence(first)) % 10_000 + 1;
      const combined = evaluateCombinedPriceRules({
        baseUnitPriceCents: base,
        quantity,
        context: CONTEXT,
        maximumDiscountBasisPoints: cap,
        candidates: [
          { id: `promotion-${seed}`, version: 1, label: 'Código property', priority: 1,
            activeFrom: null, activeUntil: null, markets: ['ES'], channels: ['storefront'],
            currency: 'EUR', effect: { type: 'percentage_off', basisPoints: 7_500 } },
          { id: `automatic-${seed}`, version: 1, label: 'Auto property', priority: 2,
            activeFrom: null, activeUntil: null, markets: ['ES'], channels: ['storefront'],
            currency: 'EUR', effect: { type: 'amount_off', amountCents: Math.max(1, base / 2 | 0) } },
        ],
      });
      expect(combined.subtotal_cents + combined.discount_cents).toBe(combined.base_subtotal_cents);
      expect(combined.discount_cents).toBeLessThanOrEqual(Math.floor(base * cap / 10_000) * quantity);
      expect((combined.applied_rules ?? []).reduce((sum, rule) =>
        sum + rule.discount_per_unit_cents * quantity, 0)).toBe(combined.discount_cents);
    }
  });

  it('prorratea X/Y sin perder dinero y devuelve valor almacenado al medio original', () => {
    for (let seed = 1; seed <= 500; seed += 1) {
      const price = sequence(seed) % 100_000 + 1;
      const quantity = sequence(sequence(seed)) % 20 + 2;
      const resolution = resolveQuantityOffers({
        context: CONTEXT,
        lines: [{ productId: 1, unitPriceCents: price, quantity }],
        offers: [{
          id: `xy-${seed}`, version: 1, label: 'Oferta property', publicReason: 'Premio property',
          state: 'active', priority: 1, currency: 'EUR', activeFrom: null, activeUntil: null,
          markets: ['ES'], channels: ['storefront'], kind: 'buy_x_get_y',
          buyQuantity: 1, rewardQuantity: 1, rewardEffect: { type: 'percentage_off', basisPoints: 10_000 },
          maxApplications: null, buyProductIds: [1], rewardProductIds: [1],
        }],
      });
      expect(resolution.status).toBe('eligible');
      if (resolution.status !== 'eligible' || resolution.evidence.kind !== 'buy_x_get_y') continue;
      const priced = evaluatePriceRules({ baseUnitPriceCents: price, quantity, context: CONTEXT,
        candidates: [resolution.candidate] });
      expect(priced.discount_cents).toBeGreaterThanOrEqual(
        resolution.evidence.theoretical_discount_cents,
      );
      expect(priced.discount_cents).toBeLessThanOrEqual(priced.base_subtotal_cents);

      const refund = (sequence(seed + 10_000) % priced.subtotal_cents) + 1;
      const storedValuePaid = sequence(seed + 20_000) % (priced.subtotal_cents + 1);
      const refundableStored = Math.min(refund, storedValuePaid);
      const plan = planStoredValueRefund(refund, refundableStored);
      expect(plan.storedValueCents + plan.externalCents).toBe(refund);
      expect(plan.storedValueCents).toBeLessThanOrEqual(refundableStored);
    }
  });

  it('conserva depósito, saldo y versión para todo importe entre 1 y 1.000 céntimos', () => {
    for (let total = 1; total <= 1_000; total += 1) {
      const deposit = sequence(total) % (total + 1);
      const gate = deposit === 0 ? 'approval' as const : 'deposit' as const;
      let order = createPreliminaryOrderDraft({
        id: `property:${total}`, currency: 'EUR', totalCents: total, depositCents: deposit,
        conversionGate: gate, expiresAt: '2027-01-01T00:00:00.000Z',
      });
      order = issuePreliminaryOrder(order, '2026-08-17T12:00:00.000Z');
      order = approvePreliminaryOrder(order, '2026-08-17T12:01:00.000Z');
      let payments = 0;
      while (order.paymentStatus !== 'paid') {
        const plan = nextPreliminaryOrderPayment(order);
        expect(plan).not.toBeNull();
        if (plan === null) break;
        payments += plan.amountCents;
        order = applyConfirmedPreliminaryOrderPayment(order, {
          confirmed: true, stage: plan.stage, amountCents: plan.amountCents,
          currency: plan.currency, expectedVersion: plan.preliminaryOrderVersion,
          paidAt: `2026-08-17T12:0${2 + payments % 7}:00.000Z`,
        });
      }
      expect(payments).toBe(total);
      expect(order.paidCents).toBe(total);
      expect(order.version).toBe(deposit > 0 && deposit < total ? 5 : 4);
    }
  });
});
