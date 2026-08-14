import {
  assertInventoryLocationInput,
  createD1InventoryLocations,
  type InventoryLocationKind,
  type InventoryLocationStatus,
} from '../modules/inventory';
import { createAuditDiff, createAuditEntry, serializeAuditDiff } from '../shared-kernel/audit';

const ACTOR = Object.freeze({ kind: 'admin', id: 'admin-panel', label: 'Panel de administración' } as const);

function auditValues(entry: ReturnType<typeof createAuditEntry>): readonly unknown[] {
  return [entry.audit_id, entry.occurred_at, entry.actor.kind, entry.actor.id,
    entry.actor.label ?? null, entry.action, entry.entity.type, entry.entity.id,
    entry.entity.reference ?? null, entry.correlation_id, entry.source_event_id,
    serializeAuditDiff(entry.diff), entry.occurred_at];
}

export type InventoryLocationInput = Readonly<{
  code: string; name: string; kind: InventoryLocationKind; timezone: string;
}>;

export type InventoryLocationPatch = Readonly<{
  expectedVersion: number;
  name?: string;
  kind?: InventoryLocationKind;
  status?: InventoryLocationStatus;
  timezone?: string;
}>;

export function createInventoryLocationOperations(db: D1Database, now = () => new Date().toISOString()) {
  const locations = createD1InventoryLocations(db);
  return Object.freeze({
    list: locations.list,

    async create(input: InventoryLocationInput): Promise<'applied' | 'conflict'> {
      assertInventoryLocationInput(input);
      const occurredAt = now();
      const auditId = `inventory-location:${crypto.randomUUID()}`;
      const audit = createAuditEntry({ event_id: auditId, occurred_at: occurredAt }, {
        actor: ACTOR, action: 'inventory.location_created',
        entity: { type: 'inventory_location', id: input.code, reference: input.code },
        diff: createAuditDiff(
          { code: null, name: null, kind: null, status: null },
          { code: input.code, name: input.name, kind: input.kind, status: 'active' },
          ['code', 'name', 'kind', 'status'],
        ),
      });
      const auditInsert = db.prepare(`INSERT INTO audit_log (
        audit_id, occurred_at, actor_kind, actor_id, actor_label, action,
        entity_type, entity_id, entity_reference, correlation_id,
        source_event_id, diff_json, created_at
      ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE NOT EXISTS (SELECT 1 FROM inventory_locations WHERE code = ? COLLATE NOCASE)`)
        .bind(...auditValues(audit), input.code);
      const insert = db.prepare(`INSERT INTO inventory_locations (
        code, name, kind, status, is_primary, timezone, created_at, updated_at
      ) SELECT ?, ?, ?, 'active', 0, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM audit_log WHERE audit_id = ?)`)
        .bind(input.code, input.name.trim(), input.kind, input.timezone, occurredAt, occurredAt, auditId);
      const results = await db.batch([auditInsert, insert]);
      const changes = results.map((result) => result.meta.changes ?? 0);
      if (changes.every((value) => value === 1)) return 'applied';
      if (changes.every((value) => value === 0)) return 'conflict';
      throw new Error('Unidad de ubicación inconsistente.');
    },

    async update(id: number, patch: InventoryLocationPatch): Promise<'applied' | 'conflict' | 'not-found'> {
      const current = await locations.find(id);
      if (!current) return 'not-found';
      const next = {
        name: patch.name?.trim() ?? current.name,
        kind: patch.kind ?? current.kind,
        status: patch.status ?? current.status,
        timezone: patch.timezone ?? current.timezone,
      };
      assertInventoryLocationInput({ code: current.code, name: next.name, timezone: next.timezone });
      if (current.is_primary === 1 && next.status !== 'active') throw new RangeError('La ubicación principal no puede desactivarse.');
      const occurredAt = now();
      const auditId = `inventory-location:${id}:v${patch.expectedVersion + 1}:${crypto.randomUUID()}`;
      const audit = createAuditEntry({ event_id: auditId, occurred_at: occurredAt }, {
        actor: ACTOR, action: 'inventory.location_updated',
        entity: { type: 'inventory_location', id: String(id), reference: current.code },
        diff: createAuditDiff(current, next, ['name', 'kind', 'status', 'timezone']),
      });
      const auditInsert = db.prepare(`INSERT INTO audit_log (
        audit_id, occurred_at, actor_kind, actor_id, actor_label, action,
        entity_type, entity_id, entity_reference, correlation_id,
        source_event_id, diff_json, created_at
      ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        FROM inventory_locations WHERE id = ? AND version = ?`)
        .bind(...auditValues(audit), id, patch.expectedVersion);
      const mutation = db.prepare(`UPDATE inventory_locations SET
        name = ?, kind = ?, status = ?, timezone = ?, version = version + 1, updated_at = ?
        WHERE id = ? AND version = ?
          AND EXISTS (SELECT 1 FROM audit_log WHERE audit_id = ?)`)
        .bind(next.name, next.kind, next.status, next.timezone, occurredAt,
          id, patch.expectedVersion, auditId);
      const results = await db.batch([auditInsert, mutation]);
      const changes = results.map((result) => result.meta.changes ?? 0);
      if (changes.every((value) => value === 1)) return 'applied';
      if (changes.every((value) => value === 0)) return 'conflict';
      throw new Error('Unidad de ubicación inconsistente.');
    },
  });
}

export type InventoryLocationOperations = ReturnType<typeof createInventoryLocationOperations>;
