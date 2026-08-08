/** Casos de uso admin con mutación y evidencia atómicas (R1.8). */

import { createProductAdmin, type ProductPatch } from '../modules/catalog';
import { createFulfillmentAdmin, type ShippingRatePatch } from '../modules/fulfillment';
import { createD1AuditLogWriter } from '../platform/operations';
import { createAuditDiff, createAuditEntry } from '../shared-kernel/audit';
import type { ReserveEventIdentity } from '../shared-kernel/events';
import { reservePlatformEventIdentity } from './event-context';

export type AdminMutationOutcome = 'applied' | 'unchanged' | 'not-found' | 'conflict' | 'invalid';

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
      const touchesVariant = [
        patch.price_cents,
        patch.compare_at_price_cents,
        patch.active,
        patch.sku,
        patch.gtin,
        patch.mpn,
        patch.variant_title,
        patch.variant_status,
      ].some((value) => value !== undefined);
      if (touchesVariant && before.default_variant_id === null) return 'conflict';
      if (
        touchesVariant &&
        (
          before.default_variant_price_cents !== before.price_cents ||
          before.default_variant_compare_at_price_cents !== before.compare_at_price_cents ||
          (before.default_variant_status === 'active') !== (before.active === 1)
        )
      ) return 'conflict';
      const effectivePrice = patch.price_cents ?? before.price_cents;
      const effectiveCompareAt = patch.compare_at_price_cents === undefined
        ? before.compare_at_price_cents
        : patch.compare_at_price_cents;
      if (effectiveCompareAt !== null && effectiveCompareAt <= effectivePrice) return 'invalid';
      const after = {
        ...before,
        ...(patch.name === undefined ? {} : { name: patch.name }),
        ...(patch.price_cents === undefined ? {} : { price_cents: patch.price_cents }),
        ...(patch.compare_at_price_cents === undefined ? {} : {
          compare_at_price_cents: patch.compare_at_price_cents,
        }),
        ...(patch.price_cents === undefined ? {} : { default_variant_price_cents: patch.price_cents }),
        ...(patch.compare_at_price_cents === undefined ? {} : {
          default_variant_compare_at_price_cents: patch.compare_at_price_cents,
        }),
        ...(patch.stock === undefined ? {} : { stock: patch.stock }),
        ...(patch.active === undefined ? {} : { active: patch.active ? 1 : 0 }),
        ...(patch.active === undefined || patch.variant_status !== undefined ? {} : {
          default_variant_status: patch.active ? 'active' : 'archived',
        }),
        ...(patch.sku === undefined ? {} : { default_sku: patch.sku }),
        ...(patch.gtin === undefined ? {} : { default_gtin: patch.gtin }),
        ...(patch.mpn === undefined ? {} : { default_mpn: patch.mpn }),
        ...(patch.variant_title === undefined ? {} : { default_variant_title: patch.variant_title }),
        ...(patch.variant_status === undefined ? {} : {
          default_variant_status: patch.variant_status,
          active: patch.active === undefined ? (patch.variant_status === 'active' ? 1 : 0) : (patch.active ? 1 : 0),
        }),
      };
      const diff = createAuditDiff(before, after, [
        'name', 'price_cents', 'compare_at_price_cents', 'stock', 'active', 'default_sku', 'default_gtin',
        'default_mpn', 'default_variant_title', 'default_variant_status',
        'default_variant_price_cents', 'default_variant_compare_at_price_cents',
      ]);
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
