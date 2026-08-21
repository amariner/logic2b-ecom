import type { CustomerResourceOwnershipReader } from '../application/resource-ownership-ports';
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
