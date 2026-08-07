/**
 * Unidad de trabajo D1 del audit log (R1.8).
 *
 * No ofrece lecturas ni export HTTP. Las escrituras de admin usan una guarda
 * optimista sobre el snapshot completo: si otra petición ganó antes, ni la
 * mutación ni su evidencia se insertan. D1 ejecuta cada par en una sola batch.
 */

import { serializeAuditDiff, type AuditDiff, type AuditEntry } from '../../../shared-kernel/audit';

export type AuditEventProjection = Readonly<{ action: string; diff: AuditDiff }>;

export type AuditedProductSnapshot = Readonly<{
  id: number;
  slug: string;
  name: string;
  price_cents: number;
  stock: number;
  category: string;
  active: number;
}>;

export type AuditedProductPatch = Readonly<{
  name?: string | undefined;
  price_cents?: number | undefined;
  stock?: number | undefined;
  active?: boolean | undefined;
}>;

export type AuditedShippingRateSnapshot = Readonly<{
  id: number;
  zone: string;
  label: string;
  price_cents: number;
  free_over_cents: number | null;
  active: number;
}>;

export type AuditedShippingRatePatch = Readonly<{
  price_cents?: number | undefined;
  free_over_cents?: number | null | undefined;
  active?: boolean | undefined;
}>;

export type AuditedMutationOutcome = 'applied' | 'conflict';

function entryValues(entry: AuditEntry): readonly unknown[] {
  return [
    entry.audit_id,
    entry.occurred_at,
    entry.actor.kind,
    entry.actor.id,
    entry.actor.label ?? null,
    entry.action,
    entry.entity.type,
    entry.entity.id,
    entry.entity.reference ?? null,
    entry.correlation_id,
    entry.source_event_id,
    serializeAuditDiff(entry.diff),
    entry.occurred_at,
  ];
}

function outcomeOf(results: readonly D1Result[]): AuditedMutationOutcome {
  const auditChanges = results[0]?.meta.changes ?? 0;
  const mutationChanges = results[1]?.meta.changes ?? 0;
  if (auditChanges === 1 && mutationChanges === 1) return 'applied';
  if (auditChanges === 0 && mutationChanges === 0) return 'conflict';
  throw new Error(`Unidad de auditoría inconsistente: audit=${auditChanges}, mutation=${mutationChanges}.`);
}

export function createD1AuditLogWriter(db: D1Database) {
  return {
    /** Proyecta un hecho persistido: un reintento perdedor no crea evidencia duplicada. */
    eventStatement(sourceEventId: string, projection: AuditEventProjection): D1PreparedStatement {
      return db.prepare(`
        INSERT INTO audit_log (
          audit_id, occurred_at, actor_kind, actor_id, actor_label, action,
          entity_type, entity_id, entity_reference, correlation_id,
          source_event_id, diff_json, created_at
        )
        SELECT
          event_id, occurred_at, actor_kind, actor_id, actor_label, ?,
          entity_type, entity_id, entity_reference, correlation_id,
          event_id, ?, occurred_at
        FROM event_outbox_events
        WHERE event_id = ?
      `).bind(projection.action, serializeAuditDiff(projection.diff), sourceEventId);
    },

    async updateProduct(
      entry: AuditEntry,
      expected: AuditedProductSnapshot,
      patch: AuditedProductPatch,
    ): Promise<AuditedMutationOutcome> {
      const sets: string[] = [];
      const values: unknown[] = [];
      if (patch.name !== undefined) { sets.push('name = ?'); values.push(patch.name); }
      if (patch.price_cents !== undefined) { sets.push('price_cents = ?'); values.push(patch.price_cents); }
      if (patch.stock !== undefined) { sets.push('stock = ?'); values.push(patch.stock); }
      if (patch.active !== undefined) { sets.push('active = ?'); values.push(patch.active ? 1 : 0); }

      const guard = [
        expected.id, expected.slug, expected.name, expected.price_cents,
        expected.stock, expected.category, expected.active,
      ] as const;
      const audit = db.prepare(`
        INSERT INTO audit_log (
          audit_id, occurred_at, actor_kind, actor_id, actor_label, action,
          entity_type, entity_id, entity_reference, correlation_id,
          source_event_id, diff_json, created_at
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        FROM products
        WHERE id = ? AND slug = ? AND name = ? AND price_cents = ?
          AND stock = ? AND category = ? AND active = ?
      `).bind(...entryValues(entry), ...guard);
      const mutation = db.prepare(`
        UPDATE products SET ${sets.join(', ')}
        WHERE id = ? AND slug = ? AND name = ? AND price_cents = ?
          AND stock = ? AND category = ? AND active = ?
          AND EXISTS (SELECT 1 FROM audit_log WHERE audit_id = ?)
      `).bind(...values, ...guard, entry.audit_id);
      return outcomeOf(await db.batch([audit, mutation]));
    },

    async updateShippingRate(
      entry: AuditEntry,
      expected: AuditedShippingRateSnapshot,
      patch: AuditedShippingRatePatch,
    ): Promise<AuditedMutationOutcome> {
      const sets: string[] = [];
      const values: unknown[] = [];
      if (patch.price_cents !== undefined) { sets.push('price_cents = ?'); values.push(patch.price_cents); }
      if (patch.free_over_cents !== undefined) { sets.push('free_over_cents = ?'); values.push(patch.free_over_cents); }
      if (patch.active !== undefined) { sets.push('active = ?'); values.push(patch.active ? 1 : 0); }

      const guard = [
        expected.id, expected.zone, expected.label, expected.price_cents,
        expected.free_over_cents, expected.active,
      ] as const;
      const audit = db.prepare(`
        INSERT INTO audit_log (
          audit_id, occurred_at, actor_kind, actor_id, actor_label, action,
          entity_type, entity_id, entity_reference, correlation_id,
          source_event_id, diff_json, created_at
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        FROM shipping_rates
        WHERE id = ? AND zone = ? AND label = ? AND price_cents = ?
          AND free_over_cents IS ? AND active = ?
      `).bind(...entryValues(entry), ...guard);
      const mutation = db.prepare(`
        UPDATE shipping_rates SET ${sets.join(', ')}
        WHERE id = ? AND zone = ? AND label = ? AND price_cents = ?
          AND free_over_cents IS ? AND active = ?
          AND EXISTS (SELECT 1 FROM audit_log WHERE audit_id = ?)
      `).bind(...values, ...guard, entry.audit_id);
      return outcomeOf(await db.batch([audit, mutation]));
    },
  };
}

export type D1AuditLogWriter = ReturnType<typeof createD1AuditLogWriter>;
