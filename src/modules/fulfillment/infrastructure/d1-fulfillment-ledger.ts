import {
  normalizeFulfillmentIdempotencyKey,
  normalizeFulfillmentTracking,
  type FulfillmentAllocation,
  type FulfillmentLineBalance,
  type FulfillmentStatus,
  type FulfillmentTracking,
} from '../domain/fulfillment';

export type FulfillmentRecord = Readonly<{
  id: number;
  order_id: number;
  status: FulfillmentStatus;
  carrier: string | null;
  tracking_number: string | null;
  idempotency_key: string;
  version: number;
  ready_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  total_quantity: number;
  line_count: number;
}>;

export type ShipmentWriteInput = Readonly<{
  orderId: number;
  expectedOrderStatus: 'paid';
  eventId: string;
  idempotencyKey: string;
  tracking: FulfillmentTracking;
  occurredAt: string;
  allocations: readonly FulfillmentAllocation[];
}>;

function assertId(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${field} debe ser un entero seguro positivo.`);
  }
}

export function createD1FulfillmentLedger(db: D1Database) {
  return Object.freeze({
    async listForOrder(orderId: number): Promise<readonly FulfillmentRecord[]> {
      assertId(orderId, 'order_id');
      const { results } = await db.prepare(`
        SELECT f.*,
               COALESCE(sum(fi.quantity), 0) AS total_quantity,
               count(fi.order_item_id) AS line_count
        FROM fulfillments f
        LEFT JOIN fulfillment_items fi ON fi.fulfillment_id = f.id
        WHERE f.order_id = ?
        GROUP BY f.id
        ORDER BY f.id
      `).bind(orderId).all<FulfillmentRecord>();
      return results;
    },

    async lineBalances(orderId: number): Promise<readonly FulfillmentLineBalance[]> {
      assertId(orderId, 'order_id');
      const { results } = await db.prepare(`
        SELECT oi.id AS order_item_id,
               oi.qty AS ordered_quantity,
               0 AS cancelled_quantity,
               COALESCE(sum(CASE WHEN f.status <> 'cancelled' THEN fi.quantity ELSE 0 END), 0)
                 AS fulfilled_quantity
        FROM order_items oi
        LEFT JOIN fulfillment_items fi ON fi.order_item_id = oi.id
        LEFT JOIN fulfillments f ON f.id = fi.fulfillment_id
        WHERE oi.order_id = ?
        GROUP BY oi.id, oi.qty
        ORDER BY oi.id
      `).bind(orderId).all<FulfillmentLineBalance>();
      return results;
    },

    shipmentStatements(input: ShipmentWriteInput): readonly D1PreparedStatement[] {
      assertId(input.orderId, 'order_id');
      const key = normalizeFulfillmentIdempotencyKey(input.idempotencyKey);
      const tracking = normalizeFulfillmentTracking(input.tracking);
      if (input.allocations.length === 0) {
        throw new RangeError('el fulfillment exige al menos una asignacion.');
      }
      const header = db.prepare(`
        INSERT INTO fulfillments (
          order_id, status, carrier, tracking_number, idempotency_key,
          version, shipped_at, created_at, updated_at
        )
        SELECT ?, 'shipped', ?, ?, ?, 1, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM event_outbox_events WHERE event_id = ?
        ) AND EXISTS (
          SELECT 1 FROM orders WHERE id = ? AND status = ?
        ) AND NOT EXISTS (
          SELECT 1 FROM fulfillments
          WHERE order_id = ? AND status <> 'cancelled'
        )
      `).bind(
        input.orderId,
        tracking.carrier,
        tracking.number,
        key,
        input.occurredAt,
        input.occurredAt,
        input.occurredAt,
        input.eventId,
        input.orderId,
        input.expectedOrderStatus,
        input.orderId,
      );
      const lines = input.allocations.map((allocation) => {
        assertId(allocation.order_item_id, 'order_item_id');
        assertId(allocation.quantity, 'quantity');
        return db.prepare(`
          INSERT INTO fulfillment_items (
            fulfillment_id, order_id, order_item_id, quantity, created_at
          )
          SELECT f.id, f.order_id, ?, ?, ?
          FROM fulfillments f
          WHERE f.idempotency_key = ? AND f.order_id = ?
            AND EXISTS (SELECT 1 FROM event_outbox_events WHERE event_id = ?)
        `).bind(
          allocation.order_item_id,
          allocation.quantity,
          input.occurredAt,
          key,
          input.orderId,
          input.eventId,
        );
      });
      return Object.freeze([header, ...lines]);
    },

    guardedDeliveryStatement(input: Readonly<{
      fulfillment: FulfillmentRecord;
      eventId: string;
      occurredAt: string;
    }>): D1PreparedStatement {
      if (input.fulfillment.status !== 'shipped') {
        throw new RangeError('solo un fulfillment enviado puede marcarse entregado.');
      }
      return db.prepare(`
        UPDATE fulfillments
        SET status = 'delivered', delivered_at = ?, updated_at = ?, version = version + 1
        WHERE id = ? AND order_id = ? AND status = 'shipped' AND version = ?
          AND EXISTS (SELECT 1 FROM event_outbox_events WHERE event_id = ?)
      `).bind(
        input.occurredAt,
        input.occurredAt,
        input.fulfillment.id,
        input.fulfillment.order_id,
        input.fulfillment.version,
        input.eventId,
      );
    },

    guardedShipmentProjectionStatement(input: Readonly<{
      orderId: number;
      expectedOrderStatus: 'paid';
      eventId: string;
      idempotencyKey: string;
      tracking: FulfillmentTracking;
    }>): D1PreparedStatement {
      const key = normalizeFulfillmentIdempotencyKey(input.idempotencyKey);
      const tracking = normalizeFulfillmentTracking(input.tracking);
      return db.prepare(`
        UPDATE orders
        SET status = 'shipped', tracking_carrier = ?, tracking_number = ?,
            updated_at = datetime('now')
        WHERE id = ? AND status = ?
          AND EXISTS (SELECT 1 FROM event_outbox_events WHERE event_id = ?)
          AND EXISTS (
            SELECT 1 FROM fulfillments f
            WHERE f.order_id = orders.id AND f.idempotency_key = ? AND f.status = 'shipped'
          )
      `).bind(
        tracking.carrier,
        tracking.number,
        input.orderId,
        input.expectedOrderStatus,
        input.eventId,
        key,
      );
    },

    guardedDeliveryProjectionStatement(input: Readonly<{
      orderId: number;
      expectedOrderStatus: 'shipped';
      eventId: string;
      fulfillmentId: number;
    }>): D1PreparedStatement {
      return db.prepare(`
        UPDATE orders SET status = 'delivered', updated_at = datetime('now')
        WHERE id = ? AND status = ?
          AND EXISTS (SELECT 1 FROM event_outbox_events WHERE event_id = ?)
          AND EXISTS (
            SELECT 1 FROM fulfillments f
            WHERE f.id = ? AND f.order_id = orders.id AND f.status = 'delivered'
          )
      `).bind(
        input.orderId,
        input.expectedOrderStatus,
        input.eventId,
        input.fulfillmentId,
      );
    },
  });
}

export type D1FulfillmentLedger = ReturnType<typeof createD1FulfillmentLedger>;
