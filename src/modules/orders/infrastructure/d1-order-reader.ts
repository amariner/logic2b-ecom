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
    async list(query) {
      const clauses: string[] = [];
      const bindings: unknown[] = [];
      if (query.status) {
        clauses.push('status = ?');
        bindings.push(query.status);
      }
      const search = query.search?.trim();
      if (search) {
        clauses.push("(order_number LIKE ? ESCAPE '\\' OR customer_name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\')");
        const pattern = `%${search.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
        bindings.push(pattern, pattern, pattern);
      }
      const where = clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';
      const statement = db.prepare(
        `SELECT id, order_number, customer_name, email, total_cents, status, created_at
         FROM orders${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
      ).bind(...bindings, query.limit, query.offset ?? 0);
      return (await statement.all<OrderListRow>()).results;
    },
    async matchingCount(status, searchValue) {
      const clauses: string[] = [];
      const bindings: unknown[] = [];
      if (status) {
        clauses.push('status = ?');
        bindings.push(status);
      }
      const search = searchValue?.trim();
      if (search) {
        clauses.push("(order_number LIKE ? ESCAPE '\\' OR customer_name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\')");
        const pattern = `%${search.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
        bindings.push(pattern, pattern, pattern);
      }
      const where = clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';
      const row = await db.prepare(`SELECT count(*) AS n FROM orders${where}`).bind(...bindings).first<{ n: number }>();
      return row?.n ?? 0;
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
