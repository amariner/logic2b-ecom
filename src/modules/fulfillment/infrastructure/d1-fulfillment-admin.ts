import type {
  FulfillmentAdminRepository,
  PendingShipmentRow,
  ShippingRatePatch,
  ShippingRateRow,
} from '../application/fulfillment-admin';

export function createD1FulfillmentAdminRepository(db: D1Database): FulfillmentAdminRepository {
  return {
    async listRates() {
      return (await db.prepare('SELECT * FROM shipping_rates ORDER BY price_cents').all<ShippingRateRow>()).results;
    },
    async updateRate(id: number, patch: ShippingRatePatch) {
      const sets: string[] = [];
      const binds: (number | null)[] = [];
      if (patch.price_cents !== undefined) { sets.push('price_cents = ?'); binds.push(patch.price_cents); }
      if (patch.free_over_cents !== undefined) { sets.push('free_over_cents = ?'); binds.push(patch.free_over_cents); }
      if (patch.active !== undefined) { sets.push('active = ?'); binds.push(patch.active ? 1 : 0); }
      binds.push(id);
      const result = await db.prepare(`UPDATE shipping_rates SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
      return result.meta.changes > 0;
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
