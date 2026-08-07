/** Casos de uso admin con mutación y evidencia atómicas (R1.8). */

import { createProductAdmin, type ProductPatch } from '../modules/catalog';
import { createFulfillmentAdmin, type ShippingRatePatch } from '../modules/fulfillment';
import { createD1AuditLogWriter } from '../platform/operations';
import { createAuditDiff, createAuditEntry } from '../shared-kernel/audit';
import type { ReserveEventIdentity } from '../shared-kernel/events';
import { reservePlatformEventIdentity } from './event-context';

export type AdminMutationOutcome = 'applied' | 'unchanged' | 'not-found' | 'conflict';

const ADMIN_ACTOR = Object.freeze({ kind: 'admin', id: 'admin-panel', label: 'Panel de administración' } as const);

export function createAdminOperations(
  db: D1Database,
  reserveIdentity: ReserveEventIdentity = reservePlatformEventIdentity,
) {
  const products = createProductAdmin(db);
  const fulfillment = createFulfillmentAdmin(db);
  const audit = createD1AuditLogWriter(db);

  return Object.freeze({
    async updateProduct(id: number, patch: ProductPatch): Promise<AdminMutationOutcome> {
      const before = await products.find(id);
      if (before === null) return 'not-found';
      const after = {
        ...before,
        ...(patch.name === undefined ? {} : { name: patch.name }),
        ...(patch.price_cents === undefined ? {} : { price_cents: patch.price_cents }),
        ...(patch.stock === undefined ? {} : { stock: patch.stock }),
        ...(patch.active === undefined ? {} : { active: patch.active ? 1 : 0 }),
      };
      const diff = createAuditDiff(before, after, ['name', 'price_cents', 'stock', 'active']);
      if (Object.keys(diff).length === 0) return 'unchanged';
      const entry = createAuditEntry(reserveIdentity(), {
        actor: ADMIN_ACTOR,
        action: 'catalog.product_updated',
        entity: { type: 'product', id: String(before.id), reference: before.slug },
        diff,
      });
      return audit.updateProduct(entry, before, patch);
    },

    async updateShippingRate(id: number, patch: ShippingRatePatch): Promise<AdminMutationOutcome> {
      const before = await fulfillment.findRate(id);
      if (before === null) return 'not-found';
      const after = {
        ...before,
        ...(patch.price_cents === undefined ? {} : { price_cents: patch.price_cents }),
        ...(patch.free_over_cents === undefined ? {} : { free_over_cents: patch.free_over_cents }),
        ...(patch.active === undefined ? {} : { active: patch.active ? 1 : 0 }),
      };
      const diff = createAuditDiff(before, after, ['price_cents', 'free_over_cents', 'active']);
      if (Object.keys(diff).length === 0) return 'unchanged';
      const entry = createAuditEntry(reserveIdentity(), {
        actor: ADMIN_ACTOR,
        action: 'fulfillment.shipping_rate_updated',
        entity: { type: 'shipping_rate', id: String(before.id), reference: before.label },
        diff,
      });
      return audit.updateShippingRate(entry, before, patch);
    },
  });
}

export type AdminOperations = ReturnType<typeof createAdminOperations>;
