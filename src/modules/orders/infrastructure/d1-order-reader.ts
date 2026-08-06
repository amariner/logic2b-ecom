import type {
  OrderDetail,
  OrderEvent,
  OrderItem,
  OrderListRow,
  OrderReader,
  OrderStatusCount,
} from '../application/order-reader';

export function createD1OrderReader(db: D1Database): OrderReader {
  return {
    async list(status, limit) {
      const query = status
        ? db.prepare('SELECT id, order_number, customer_name, email, total_cents, status, created_at FROM orders WHERE status = ? ORDER BY created_at DESC LIMIT ?').bind(status, limit)
        : db.prepare('SELECT id, order_number, customer_name, email, total_cents, status, created_at FROM orders ORDER BY created_at DESC LIMIT ?').bind(limit);
      return (await query.all<OrderListRow>()).results;
    },
    async counts() {
      return (await db.prepare('SELECT status, count(*) AS n FROM orders GROUP BY status').all<OrderStatusCount>()).results;
    },
    detail(id) {
      return db.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first<OrderDetail>();
    },
    async items(id) {
      return (await db
        .prepare('SELECT name_snapshot, unit_price_cents, qty FROM order_items WHERE order_id = ?')
        .bind(id)
        .all<OrderItem>()).results;
    },
    async events(id) {
      return (await db
        .prepare('SELECT from_status, to_status, note, created_at FROM order_events WHERE order_id = ? ORDER BY id')
        .bind(id)
        .all<OrderEvent>()).results;
    },
  };
}
