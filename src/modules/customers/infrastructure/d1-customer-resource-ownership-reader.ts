import type {
  CustomerOrderAccessView,
  CustomerOrderListCursor,
  CustomerOwnedOrderReader,
  CustomerOwnedOrderListReader,
  CustomerResourceOwnershipReader,
} from '../application/resource-ownership-ports';
import {
  customerResourceTarget,
  type CustomerResourceOwnership,
  type CustomerResourceTarget,
} from '../domain/resource-ownership';

type OrderOwnershipRow = Readonly<{
  public_ref: string;
  ownership_version: number;
  customer_profile_id: string | null;
  profile_status: 'active' | 'merged' | null;
}>;

type OwnedOrderRow = Readonly<{
  public_ref: string;
  order_number: string;
  status: string;
  total_cents: number;
  currency: string;
  created_at: string;
  updated_at: string;
  tracking_carrier: string | null;
  tracking_number: string | null;
}>;

function orderView(row: OwnedOrderRow): CustomerOrderAccessView {
  const tracking = row.tracking_carrier !== null && row.tracking_number !== null
    ? Object.freeze({ carrier: row.tracking_carrier, number: row.tracking_number })
    : null;
  return Object.freeze({
    publicRef: row.public_ref,
    orderNumber: row.order_number,
    status: row.status,
    totalCents: row.total_cents,
    currency: row.currency,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tracking,
  });
}

/**
 * Reader R5.5b: solo acepta el selector público opaco y resuelve el owner en
 * servidor. No conoce email, order_number, dirección, tracking ni otra PII.
 */
export function createD1CustomerOrderOwnershipReader(
  db: D1Database,
): CustomerResourceOwnershipReader {
  return Object.freeze({
    async resolve(target: CustomerResourceTarget): Promise<CustomerResourceOwnership | null> {
      if (target.kind !== 'order') return null;
      let normalized: CustomerResourceTarget;
      try {
        normalized = customerResourceTarget(target.kind, target.publicRef);
      } catch {
        return null;
      }
      const row = await db.prepare(`
        SELECT access.public_ref, access.ownership_version,
          orders.customer_profile_id, profile.status AS profile_status
        FROM customer_order_access_refs access
        JOIN orders ON orders.id = access.order_id
        LEFT JOIN customer_profiles profile ON profile.id = orders.customer_profile_id
        WHERE access.public_ref = ?
      `).bind(normalized.publicRef).first<OrderOwnershipRow>();
      if (row === null) return null;
      const state = row.customer_profile_id === null
        ? 'guest'
        : row.profile_status === 'active'
          ? 'owned'
          : 'incoherent';
      return Object.freeze({
        target: normalized,
        ownerProfileId: row.customer_profile_id,
        state,
        version: row.ownership_version,
      });
    },
  });
}

/** DTO de autoservicio sin PII ni referencias internas/financieras. */
export function createD1CustomerOwnedOrderReader(db: D1Database): CustomerOwnedOrderReader {
  return Object.freeze({
    async readOwned(
      input: Parameters<CustomerOwnedOrderReader['readOwned']>[0],
    ): Promise<CustomerOrderAccessView | null> {
      if (input.target.kind !== 'order') return null;
      let target: CustomerResourceTarget;
      try {
        target = customerResourceTarget('order', input.target.publicRef);
      } catch {
        return null;
      }
      const row = await db.prepare(`
        SELECT access.public_ref, orders.order_number, orders.status,
          orders.total_cents, orders.currency, orders.created_at, orders.updated_at,
          orders.tracking_carrier, orders.tracking_number
        FROM customer_order_access_refs access
        JOIN orders ON orders.id = access.order_id
        WHERE access.public_ref = ? AND access.ownership_version = ?
          AND orders.customer_profile_id = ?
      `).bind(
        target.publicRef,
        input.expectedOwnershipVersion,
        input.ownerProfileId,
      ).first<OwnedOrderRow>();
      if (row === null) return null;
      return orderView(row);
    },
  });
}

/** Índice estable newest-first, filtrado por owner activo dentro del SQL. */
export function createD1CustomerOwnedOrderListReader(db: D1Database): CustomerOwnedOrderListReader {
  return Object.freeze({
    async listOwned(
      input: Parameters<CustomerOwnedOrderListReader['listOwned']>[0],
    ): Promise<Readonly<{
      orders: readonly CustomerOrderAccessView[];
      nextCursor: CustomerOrderListCursor | null;
    }>> {
      const limit = Math.max(1, Math.min(50, Math.trunc(input.limit)));
      const cursorClause = input.cursor === null
        ? ''
        : `AND (orders.created_at < ? OR
          (orders.created_at = ? AND access.public_ref < ?))`;
      const bindings: unknown[] = [input.ownerProfileId];
      if (input.cursor !== null) {
        bindings.push(input.cursor.createdAt, input.cursor.createdAt, input.cursor.publicRef);
      }
      bindings.push(limit + 1);
      const result = await db.prepare(`
        SELECT access.public_ref, orders.order_number, orders.status,
          orders.total_cents, orders.currency, orders.created_at, orders.updated_at,
          orders.tracking_carrier, orders.tracking_number
        FROM customer_order_access_refs access
        JOIN orders ON orders.id = access.order_id
        JOIN customer_profiles profile ON profile.id = orders.customer_profile_id
        WHERE orders.customer_profile_id = ?
          AND profile.status = 'active' AND profile.merged_into_profile_id IS NULL
          ${cursorClause}
        ORDER BY orders.created_at DESC, access.public_ref DESC
        LIMIT ?
      `).bind(...bindings).all<OwnedOrderRow>();
      const selected = result.results.slice(0, limit);
      const last = selected.at(-1);
      return Object.freeze({
        orders: Object.freeze(selected.map(orderView)),
        nextCursor: result.results.length > limit && last !== undefined
          ? Object.freeze({ createdAt: last.created_at, publicRef: last.public_ref })
          : null,
      });
    },
  });
}
