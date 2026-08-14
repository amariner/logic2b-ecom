import type {
  ReturnEligibilityLine,
  ReturnInspection,
  ReturnResolution,
  ReturnStatus,
} from '../domain/return-request';

export type ReturnRequestRecord = Readonly<{
  id: string;
  return_number: string;
  order_id: number;
  order_number: string;
  receive_location_id: number | null;
  receive_location_name: string | null;
  status: ReturnStatus;
  reason_code: string;
  requested_by_kind: 'customer' | 'admin';
  requested_by_id: string;
  resolution: ReturnResolution | null;
  refund_id: number | null;
  version: number;
  note: string | null;
  requested_at: string;
  authorized_at: string | null;
  in_transit_at: string | null;
  received_at: string | null;
  inspected_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  line_count: number;
  requested_quantity: number;
  received_quantity: number;
}>;

export type ReturnRequestLineRecord = Readonly<{
  id: string;
  return_id: string;
  order_id: number;
  order_item_id: number;
  variant_id: number;
  sku: string;
  name: string;
  requested_quantity: number;
  eligible_quantity: number;
  received_quantity: number;
  inspection: 'pending' | ReturnInspection;
  resolution: 'pending' | ReturnResolution;
  unit_amount_cents: number;
  exchange_variant_id: number | null;
  exchange_sku: string | null;
  created_at: string;
  updated_at: string;
}>;

export type ReturnEventRecord = Readonly<{
  id: number; return_id: string; transition: string; from_status: string | null;
  to_status: string; version_after: number; actor_kind: string; actor_id: string;
  detail_json: string; occurred_at: string;
}>;

export type ReturnRequestDetail = Readonly<{
  request: ReturnRequestRecord;
  lines: readonly ReturnRequestLineRecord[];
  events: readonly ReturnEventRecord[];
}>;

export type ReturnAdminOptions = Readonly<{
  orders: readonly Readonly<{ id: number; order_number: string }>[];
  locations: readonly Readonly<{ id: number; name: string }>[];
  variants: readonly Readonly<{ id: number; sku: string; name: string }>[];
}>;

const SELECT_HEADER = `SELECT r.*, o.order_number, l.name AS receive_location_name,
  count(rl.id) AS line_count,
  COALESCE(sum(rl.requested_quantity), 0) AS requested_quantity,
  COALESCE(sum(rl.received_quantity), 0) AS received_quantity
  FROM return_requests r JOIN orders o ON o.id=r.order_id
  LEFT JOIN inventory_locations l ON l.id=r.receive_location_id
  LEFT JOIN return_request_lines rl ON rl.return_id=r.id`;

export function createD1ReturnRequests(db: D1Database) {
  return Object.freeze({
    async list(): Promise<readonly ReturnRequestRecord[]> {
      const { results } = await db.prepare(`${SELECT_HEADER}
        GROUP BY r.id ORDER BY CASE r.status
          WHEN 'requested' THEN 0 WHEN 'authorized' THEN 1 WHEN 'in_transit' THEN 2
          WHEN 'received' THEN 3 WHEN 'inspected' THEN 4 ELSE 5 END,
          r.updated_at DESC, r.id DESC LIMIT 200`).all<ReturnRequestRecord>();
      return Object.freeze(results.map((row) => Object.freeze(row)));
    },

    async find(id: string): Promise<ReturnRequestDetail | null> {
      const request = await db.prepare(`${SELECT_HEADER} WHERE r.id=? GROUP BY r.id`)
        .bind(id).first<ReturnRequestRecord>();
      if (!request) return null;
      const [{ results: lines }, { results: events }] = await Promise.all([
        db.prepare(`SELECT rl.*, pv.sku, oi.name_snapshot AS name, exchange.sku AS exchange_sku
          FROM return_request_lines rl
          JOIN order_items oi ON oi.id=rl.order_item_id
          JOIN product_variants pv ON pv.id=rl.variant_id
          LEFT JOIN product_variants exchange ON exchange.id=rl.exchange_variant_id
          WHERE rl.return_id=? ORDER BY rl.id`).bind(id).all<ReturnRequestLineRecord>(),
        db.prepare(`SELECT * FROM return_events WHERE return_id=? ORDER BY version_after, id`)
          .bind(id).all<ReturnEventRecord>(),
      ]);
      return Object.freeze({
        request: Object.freeze(request),
        lines: Object.freeze(lines.map((row) => Object.freeze(row))),
        events: Object.freeze(events.map((row) => Object.freeze(row))),
      });
    },

    async findByCreateKey(key: string): Promise<ReturnRequestRecord | null> {
      return db.prepare(`${SELECT_HEADER} WHERE r.create_idempotency_key=? GROUP BY r.id`)
        .bind(key).first<ReturnRequestRecord>();
    },

    async eligibility(orderId: number): Promise<readonly ReturnEligibilityLine[]> {
      const { results } = await db.prepare(`SELECT oi.id AS orderItemId,
        COALESCE(oi.variant_id, pv.id) AS variantId,
        oi.unit_price_cents AS unitAmountCents,
        sum(fi.quantity) AS deliveredQuantity,
        COALESCE((SELECT sum(rl.requested_quantity)
          FROM return_request_lines rl JOIN return_requests r ON r.id=rl.return_id
          WHERE rl.order_item_id=oi.id AND r.status NOT IN ('rejected','cancelled')), 0) AS claimedQuantity,
        max(f.delivered_at) AS lastDeliveredAt
        FROM order_items oi
        JOIN fulfillment_items fi ON fi.order_item_id=oi.id
        JOIN fulfillments f ON f.id=fi.fulfillment_id AND f.status='delivered'
        JOIN product_variants pv ON pv.product_id=oi.product_id AND pv.is_default=1
        WHERE oi.order_id=?
        GROUP BY oi.id, COALESCE(oi.variant_id, pv.id), oi.unit_price_cents
        HAVING deliveredQuantity > claimedQuantity
        ORDER BY oi.id`).bind(orderId).all<ReturnEligibilityLine>();
      return Object.freeze(results.map((row) => Object.freeze(row)));
    },

    async adminOptions(): Promise<ReturnAdminOptions> {
      const [orderRows, locationRows, variantRows] = await Promise.all([
        db.prepare(`SELECT id, order_number FROM orders WHERE status='delivered'
          ORDER BY updated_at DESC, id DESC LIMIT 100`).all<{ id: number; order_number: string }>(),
        db.prepare(`SELECT id, name FROM inventory_locations WHERE status='active'
          ORDER BY is_primary DESC, name`).all<{ id: number; name: string }>(),
        db.prepare(`SELECT pv.id, pv.sku, p.name FROM product_variants pv
          JOIN products p ON p.id=pv.product_id WHERE pv.status='active'
          ORDER BY p.name, pv.sku LIMIT 1000`).all<{ id: number; sku: string; name: string }>(),
      ]);
      return Object.freeze({
        orders: Object.freeze(orderRows.results.map((row) => Object.freeze(row))),
        locations: Object.freeze(locationRows.results.map((row) => Object.freeze(row))),
        variants: Object.freeze(variantRows.results.map((row) => Object.freeze(row))),
      });
    },
  });
}

export type D1ReturnRequests = ReturnType<typeof createD1ReturnRequests>;
