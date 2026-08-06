export type ShippingRateRow = Readonly<{
  id: number;
  zone: string;
  label: string;
  price_cents: number;
  free_over_cents: number | null;
  active: number;
}>;

export type ShippingRatePatch = Readonly<{
  price_cents?: number | undefined;
  free_over_cents?: number | null | undefined;
  active?: boolean | undefined;
}>;

export type PendingShipmentRow = Readonly<{
  order_number: string;
  customer_name: string;
  email: string;
  address_json: string;
  total_cents: number;
  status: string;
  items_summary: string | null;
}>;

export interface FulfillmentAdminRepository {
  listRates(): Promise<readonly ShippingRateRow[]>;
  updateRate(id: number, patch: ShippingRatePatch): Promise<boolean>;
  listPendingShipments(): Promise<readonly PendingShipmentRow[]>;
}

export function createFulfillmentAdminService(repository: FulfillmentAdminRepository) {
  return Object.freeze({
    listRates: () => repository.listRates(),
    updateRate: (id: number, patch: ShippingRatePatch) => repository.updateRate(id, patch),
    listPendingShipments: () => repository.listPendingShipments(),
  });
}
