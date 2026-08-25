export type CustomerReturnReason = 'damaged' | 'defective' | 'wrong_item' | 'not_as_expected' | 'other';
export type CustomerReturnEligibilityLine = Readonly<{
  orderItemId: number;
  variantId: number;
  unitAmountCents: number;
  deliveredQuantity: number;
  claimedQuantity: number;
  lastDeliveredAt: string;
}>;
export type CustomerReturnEligibilityView = Readonly<{
  orderPublicRef: string;
  orderNumber: string;
  ownershipVersion: number;
  lines: readonly Readonly<{
    orderItemId: number;
    name: string;
    availableQuantity: number;
    lastDeliveredAt: string;
  }>[];
}>;

export type CustomerReturnLineView = Readonly<{
  orderItemId: number;
  name: string;
  requestedQuantity: number;
}>;

export type CustomerReturnRequestView = Readonly<{
  publicRef: string;
  orderPublicRef: string;
  status: string;
  reason: CustomerReturnReason;
  version: number;
  requestedAt: string;
  lines: readonly CustomerReturnLineView[];
}>;

export type CustomerReturnRequestOutcome =
  | Readonly<{ outcome: 'applied' | 'replayed'; request: CustomerReturnRequestView }>
  | Readonly<{ outcome: 'conflict'; request: null }>;

export interface CustomerReturnRequestRepository {
  eligibilityOwned(input: Readonly<{
    orderPublicRef: string;
    ownerProfileId: string;
    expectedOwnershipVersion: number;
  }>): Promise<readonly CustomerReturnEligibilityLine[]>;
  listOwned(ownerProfileId: string): Promise<readonly CustomerReturnRequestView[]>;
  readOwned(ownerProfileId: string, publicRef: string): Promise<CustomerReturnRequestView | null>;
  listEligibilityOwned(ownerProfileId: string, observedAt: string): Promise<readonly CustomerReturnEligibilityView[]>;
  createOwned(input: Readonly<{
    id: string;
    returnNumber: string;
    lineIds: readonly string[];
    orderPublicRef: string;
    ownerProfileId: string;
    expectedOwnershipVersion: number;
    reason: CustomerReturnReason;
    plannedLines: readonly Readonly<CustomerReturnEligibilityLine & { requestedQuantity: number }>[];
    idempotencyKey: string;
    payloadFingerprint: string;
    occurredAt: string;
  }>): Promise<CustomerReturnRequestOutcome>;
}
