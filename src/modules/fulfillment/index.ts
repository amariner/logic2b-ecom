import { createFulfillmentAdminService } from './application/fulfillment-admin';
import { createD1FulfillmentAdminRepository } from './infrastructure/d1-fulfillment-admin';

export type { PendingShipmentRow, ShippingRatePatch, ShippingRateRow } from './application/fulfillment-admin';
export {
  FULFILLMENT_POLICY,
  FULFILLMENT_STATUSES,
  canTransitionFulfillment,
  normalizeFulfillmentIdempotencyKey,
  normalizeFulfillmentTracking,
  planOutstandingFulfillment,
  remainingFulfillableQuantity,
  trackingRequiredForFulfillment,
} from './domain/fulfillment';
export type {
  FulfillmentAllocation,
  FulfillmentLineBalance,
  FulfillmentStatus,
  FulfillmentTracking,
} from './domain/fulfillment';
export { fulfillmentBackfillSql } from './infrastructure/fulfillment-backfill';
export { createD1FulfillmentLedger } from './infrastructure/d1-fulfillment-ledger';
export type {
  D1FulfillmentLedger,
  FulfillmentRecord,
  ShipmentWriteInput,
} from './infrastructure/d1-fulfillment-ledger';

export const createFulfillmentAdmin = (db: D1Database) =>
  createFulfillmentAdminService(createD1FulfillmentAdminRepository(db));
