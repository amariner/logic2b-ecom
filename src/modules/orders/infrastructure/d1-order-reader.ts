import type {
  OrderDetail,
  OrderEvent,
  OrderItem,
  OrderListFilters,
  OrderListReadQuery,
  OrderListRow,
  OrderListSort,
  OrderReader,
  OrderStatusCount,
} from '../application/order-reader';

type SqlFilter = Readonly<{ where: string; bindings: readonly unknown[] }>;

const SORT_SQL: Readonly<Record<OrderListSort, Readonly<{
  column: 'created_at' | 'total_cents';
  canonical: 'ASC' | 'DESC';
}>>> = Object.freeze({
  'created-desc': { column: 'created_at', canonical: 'DESC' },
  'created-asc': { column: 'created_at', canonical: 'ASC' },
  'total-desc': { column: 'total_cents', canonical: 'DESC' },
  'total-asc': { column: 'total_cents', canonical: 'ASC' },
});

function fullTextQuery(search: string): string | null {
  const terms = search.normalize('NFKC').match(/[\p{L}\p{N}]+/gu)?.slice(0, 8) ?? [];
  if (terms.length === 0) return null;
  return terms.map((term) => `"${term.replaceAll('"', '""')}"*`).join(' AND ');
}

function buildFilter(filters: OrderListFilters): SqlFilter {
  const clauses: string[] = [];
  const bindings: unknown[] = [];
  if (filters.status) {
    clauses.push('status = ?');
    bindings.push(filters.status);
  }
  const search = filters.search?.trim();
  if (search) {
    const query = fullTextQuery(search);
    if (query) {
      clauses.push('id IN (SELECT rowid FROM orders_search WHERE orders_search MATCH ?)');
      bindings.push(query);
    } else {
      clauses.push('0 = 1');
    }
  }
  if (filters.createdFrom) {
    clauses.push('created_at >= ?');
    bindings.push(filters.createdFrom);
  }
  if (filters.createdBefore) {
    clauses.push('created_at < ?');
    bindings.push(filters.createdBefore);
  }
  if (filters.minTotalCents !== undefined) {
    clauses.push('total_cents >= ?');
    bindings.push(filters.minTotalCents);
  }
  if (filters.maxTotalCents !== undefined) {
    clauses.push('total_cents <= ?');
    bindings.push(filters.maxTotalCents);
  }
  return Object.freeze({
    where: clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '',
    bindings,
  });
}

function orderSql(query: OrderListReadQuery): Readonly<{ orderBy: string; cursorClause: string; bindings: readonly unknown[] }> {
  const sort = SORT_SQL[query.sort];
  const backwards = query.cursor?.direction === 'previous';
  const direction = backwards ? (sort.canonical === 'DESC' ? 'ASC' : 'DESC') : sort.canonical;
  if (!query.cursor) return Object.freeze({ orderBy: `${sort.column} ${direction}, id ${direction}`, cursorClause: '', bindings: [] });
  const comparator = direction === 'DESC' ? '<' : '>';
  return Object.freeze({
    orderBy: `${sort.column} ${direction}, id ${direction}`,
    cursorClause: `(${sort.column} ${comparator} ? OR (${sort.column} = ? AND id ${comparator} ?))`,
    bindings: [query.cursor.value, query.cursor.value, query.cursor.id],
  });
}

export function createD1OrderReader(db: D1Database): OrderReader {
  return {
    async list(query) {
      const filter = buildFilter(query);
      const order = orderSql(query);
      const where = order.cursorClause
        ? `${filter.where}${filter.where ? ' AND ' : ' WHERE '}${order.cursorClause}`
        : filter.where;
      const statement = db.prepare(
        `SELECT id, order_number, customer_name, email, total_cents, status, created_at
         FROM orders${where} ORDER BY ${order.orderBy} LIMIT ?`,
      ).bind(...filter.bindings, ...order.bindings, query.limit);
      return (await statement.all<OrderListRow>()).results;
    },
    async matchingCount(filters) {
      const filter = buildFilter(filters);
      const row = await db.prepare(`SELECT count(*) AS n FROM orders${filter.where}`)
        .bind(...filter.bindings)
        .first<{ n: number }>();
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
        .prepare('SELECT id AS order_item_id, name_snapshot, unit_price_cents, qty FROM order_items WHERE order_id = ?')
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
