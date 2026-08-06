import { createFulfillmentAdminService } from './application/fulfillment-admin';
import { createD1FulfillmentAdminRepository } from './infrastructure/d1-fulfillment-admin';

export type { PendingShipmentRow, ShippingRatePatch, ShippingRateRow } from './application/fulfillment-admin';

export const createFulfillmentAdmin = (db: D1Database) =>
  createFulfillmentAdminService(createD1FulfillmentAdminRepository(db));
