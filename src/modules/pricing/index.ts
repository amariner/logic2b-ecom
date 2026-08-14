export {
  PRICE_RULE_EFFECTS,
  evaluatePriceRules,
  type PriceBreakdown,
  type PriceRuleCandidate,
  type PriceRuleContext,
  type PriceRuleEffectType,
  type PriceRuleEvaluation,
  type PriceRuleEvaluationStatus,
} from './domain/price-rule';

export {
  PROMOTION_CODE_STATES,
  assertPromotionCode,
  resolvePromotionCode,
  type PromotionCode,
  type PromotionCodeExclusion,
  type PromotionCodeResolution,
  type PromotionCodeState,
} from './domain/promotion-code';

export {
  normalizePromotionCode,
  promotionCodeHash,
  promotionCodeHint,
  promotionCustomerHash,
} from './application/promotion-security';

export {
  createD1PromotionCodes,
  type PromotionLookup,
  type PromotionReservation,
} from './infrastructure/d1-promotion-codes';

export {
  AUTOMATIC_DISCOUNT_STATES,
  assertAutomaticDiscount,
  resolveAutomaticDiscounts,
  resolvePricingSourceConflict,
  type AutomaticDiscount,
  type AutomaticDiscountResolution,
  type AutomaticDiscountState,
  type PricingSource,
} from './domain/automatic-discount';

export {
  createD1AutomaticDiscounts,
  type AutomaticDiscountApplication,
} from './infrastructure/d1-automatic-discounts';
