/**
 * Matriz canónica R4.12. Describe fronteras entre modelos; no activa
 * capacidades ni sustituye la política de combinabilidad persistida.
 */
export const R4_MODEL_IDS = [
  'price_rule',
  'promotion_code',
  'automatic_discount',
  'quantity_offer',
  'discount_combination',
  'price_list',
  'bundle',
  'stored_value',
  'preorder',
  'subscription',
  'preliminary_order',
] as const;

export type R4ModelId = (typeof R4_MODEL_IDS)[number];

export type R4ModelInteraction =
  | 'same_model'
  | 'foundation_only'
  | 'price_origin_before_effects'
  | 'combination_policy_required'
  | 'combination_policy_governs'
  | 'compatible_snapshots'
  | 'tender_after_total'
  | 'incompatible_same_line'
  | 'separate_lifecycle';

export type R4ModelContract = Readonly<{
  id: R4ModelId;
  block: `R4.${number}`;
  capabilityIds: readonly string[];
  state: 'actual' | 'installed';
  authority: 'server' | 'verified_provider_event';
  evidence: 'price_snapshot' | 'application' | 'ledger' | 'commitment' | 'event_projection';
  evidenceTables: readonly string[];
}>;

const MODEL_CONTRACTS = [
  { id: 'price_rule', block: 'R4.1', capabilityIds: ['PRC-003'], state: 'actual',
    authority: 'server', evidence: 'price_snapshot', evidenceTables: ['order_items'] },
  { id: 'promotion_code', block: 'R4.2', capabilityIds: ['PRC-004'], state: 'actual',
    authority: 'server', evidence: 'application', evidenceTables: ['promotion_code_usages'] },
  { id: 'automatic_discount', block: 'R4.3', capabilityIds: ['PRC-005'], state: 'actual',
    authority: 'server', evidence: 'application', evidenceTables: ['automatic_discount_applications'] },
  { id: 'quantity_offer', block: 'R4.4', capabilityIds: ['PRC-006', 'PRC-007'], state: 'actual',
    authority: 'server', evidence: 'application', evidenceTables: ['quantity_offer_applications'] },
  { id: 'discount_combination', block: 'R4.5', capabilityIds: ['PRC-008'], state: 'actual',
    authority: 'server', evidence: 'application', evidenceTables: ['discount_combination_applications'] },
  { id: 'price_list', block: 'R4.6', capabilityIds: ['PRC-009'], state: 'actual',
    authority: 'server', evidence: 'price_snapshot', evidenceTables: ['price_list_applications'] },
  { id: 'bundle', block: 'R4.7', capabilityIds: ['PRC-012'], state: 'actual',
    authority: 'server', evidence: 'application', evidenceTables: ['bundle_applications', 'order_bundle_components'] },
  { id: 'stored_value', block: 'R4.8', capabilityIds: ['PRC-010', 'PRC-011'], state: 'actual',
    authority: 'server', evidence: 'ledger',
    evidenceTables: ['stored_value_applications', 'stored_value_ledger_entries'] },
  { id: 'preorder', block: 'R4.9', capabilityIds: ['PRC-014'], state: 'actual',
    authority: 'server', evidence: 'commitment',
    evidenceTables: ['preorder_commitments', 'preorder_commitment_events'] },
  { id: 'subscription', block: 'R4.10', capabilityIds: ['PRC-013'], state: 'installed',
    authority: 'verified_provider_event', evidence: 'event_projection',
    evidenceTables: ['subscription_events', 'subscription_cycles'] },
  { id: 'preliminary_order', block: 'R4.11', capabilityIds: ['ORD-008', 'CHK-011'], state: 'installed',
    authority: 'verified_provider_event', evidence: 'event_projection',
    evidenceTables: ['preliminary_order_events', 'preliminary_order_payments'] },
] as const satisfies readonly R4ModelContract[];

export const R4_MODEL_CONTRACTS: readonly R4ModelContract[] = Object.freeze(
  MODEL_CONTRACTS.map((contract): R4ModelContract => Object.freeze({ ...contract,
    capabilityIds: Object.freeze([...contract.capabilityIds]),
    evidenceTables: Object.freeze([...contract.evidenceTables]),
  })),
);

const DISCOUNT_SOURCES = new Set<R4ModelId>([
  'promotion_code', 'automatic_discount', 'quantity_offer',
]);
const SEPARATE_LIFECYCLES = new Set<R4ModelId>(['subscription', 'preliminary_order']);

export function r4ModelInteraction(left: R4ModelId, right: R4ModelId): R4ModelInteraction {
  if (left === right) return 'same_model';
  if (SEPARATE_LIFECYCLES.has(left) || SEPARATE_LIFECYCLES.has(right)) {
    return 'separate_lifecycle';
  }
  if (left === 'price_list' || right === 'price_list') return 'price_origin_before_effects';
  if (left === 'price_rule' || right === 'price_rule') return 'foundation_only';
  if (left === 'discount_combination' && DISCOUNT_SOURCES.has(right) ||
      right === 'discount_combination' && DISCOUNT_SOURCES.has(left)) {
    return 'combination_policy_governs';
  }
  if (DISCOUNT_SOURCES.has(left) && DISCOUNT_SOURCES.has(right)) {
    return 'combination_policy_required';
  }
  if (left === 'bundle' && right === 'preorder' || right === 'bundle' && left === 'preorder') {
    return 'incompatible_same_line';
  }
  if (left === 'stored_value' || right === 'stored_value') return 'tender_after_total';
  return 'compatible_snapshots';
}

export const R4_MODEL_INTERACTIONS = Object.freeze(R4_MODEL_IDS.flatMap((left, leftIndex) =>
  R4_MODEL_IDS.slice(leftIndex).map((right) => Object.freeze({
    left,
    right,
    relation: r4ModelInteraction(left, right),
  })),
));
