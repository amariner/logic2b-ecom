import type {
  FulfillmentAdminRepository,
  PendingShipmentRow,
  ShippingRateRow,
} from '../application/fulfillment-admin';

export function createD1FulfillmentAdminRepository(db: D1Database): FulfillmentAdminRepository {
  return {
    async listRates() {
      return (await db.prepare('SELECT * FROM shipping_rates ORDER BY price_cents').all<ShippingRateRow>()).results;
    },
    findRate(id) {
      return db.prepare(
        'SELECT id, zone, label, price_cents, free_over_cents, active FROM shipping_rates WHERE id = ?',
      ).bind(id).first<ShippingRateRow>();
    },
    async listPendingShipments() {
      const { results } = await db.prepare(
        `SELECT o.order_number, o.customer_name, o.email, o.address_json, o.total_cents, o.status,
                (SELECT group_concat(name_snapshot || ' x' || qty, '; ') FROM order_items WHERE order_id = o.id) AS items_summary
         FROM orders o WHERE o.status = 'paid' ORDER BY o.created_at`,
      ).all<PendingShipmentRow>();
      return results;
    },
  };
}
