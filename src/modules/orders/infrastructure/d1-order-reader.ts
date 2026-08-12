import type {
  OrderDetail,
  OrderEvent,
  OrderItem,
  OrderListFilters,
  OrderListReadQuery,
  OrderListRow,
  OrderListSort,
  OrderNote,
  OrderReader,
  OrderStatusCount,
  OrderTag,
  OrderTimelineItem,
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
  if (filters.tag) {
    clauses.push(`EXISTS (
      SELECT 1 FROM order_tag_assignments ota
      JOIN order_tags ot ON ot.id = ota.tag_id
      WHERE ota.order_id = orders.id AND ot.slug = ? AND ot.active = 1
    )`);
    bindings.push(filters.tag);
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
    async notes(id) {
      return (await db.prepare(`
        SELECT id, visibility, body, version, actor_kind, actor_label, created_at, updated_at
        FROM order_notes WHERE order_id = ? ORDER BY updated_at DESC, id DESC
      `).bind(id).all<OrderNote>()).results;
    },
    async tags(orderId) {
      const assigned = orderId === undefined
        ? ''
        : ' WHERE EXISTS (SELECT 1 FROM order_tag_assignments selected WHERE selected.tag_id = t.id AND selected.order_id = ?)';
      const statement = db.prepare(`
        SELECT t.id, t.slug, t.label, t.active, count(a.order_id) AS usage_count
        FROM order_tags t LEFT JOIN order_tag_assignments a ON a.tag_id = t.id
        ${assigned} GROUP BY t.id ORDER BY t.label COLLATE NOCASE, t.id
      `);
      return (await (orderId === undefined ? statement : statement.bind(orderId)).all<OrderTag>()).results;
    },
    async timeline(id) {
      return (await db.prepare(`
        SELECT * FROM (
          SELECT 'status:' || id AS id, 'status' AS kind, to_status AS title,
            note AS detail, 'customer' AS visibility, 'system' AS actor_kind,
            'Sistema' AS actor_label, created_at AS occurred_at, id AS sort_key
          FROM order_events WHERE order_id = ?
          UNION ALL
          SELECT 'note:' || id, 'note',
            CASE WHEN version = 1 THEN 'Nota añadida' ELSE 'Nota editada' END,
            body, visibility, actor_kind, actor_label, created_at,
            1000000000 + rowid
          FROM order_note_revisions WHERE order_id = ?
          UNION ALL
          SELECT 'tag:' || id, 'tag',
            CASE action WHEN 'assigned' THEN 'Etiqueta asignada' ELSE 'Etiqueta retirada' END,
            tag_label_snapshot, 'internal', actor_kind, actor_label, created_at,
            2000000000 + rowid
          FROM order_tag_events WHERE order_id = ?
        ) ORDER BY occurred_at DESC, sort_key DESC
      `).bind(id, id, id).all<OrderTimelineItem>()).results;
    },
  };
}
