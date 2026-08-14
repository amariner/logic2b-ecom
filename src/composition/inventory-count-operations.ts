import {
  assertInventoryCountDraft,
  assertInventoryCountReviewer,
  createD1InventoryCounts,
  createD1InventoryLedger,
  planInventoryMovement,
  type InventoryCountDetail,
  type InventoryCountLineDraft,
  type InventoryCountReason,
} from '../modules/inventory';
import { createAuditDiff, createAuditEntry, serializeAuditDiff } from '../shared-kernel/audit';

const ACTOR = Object.freeze({ kind: 'admin', id: 'admin-panel', label: 'Panel de administración' } as const);

type Location = Readonly<{ id: number; is_primary: number }>;
type LocationBalance = Readonly<{
  variant_id: number;
  on_hand: number;
  reserved: number;
  movement_version: number;
}>;
type VariantRow = Readonly<{ id: number; product_id: number; is_default: number }>;

export type CreateInventoryCountInput = Readonly<{
  locationId: number;
  reason: InventoryCountReason;
  requiresApproval: boolean;
  countedBy: string;
  lines: readonly InventoryCountLineDraft[];
  idempotencyKey: string;
  note?: string;
}>;

export type InventoryCountMutation = Readonly<{
  outcome: 'applied' | 'idempotent' | 'conflict' | 'not-found';
  detail: InventoryCountDetail | null;
}>;

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function countNumber(now: string, value: string): string {
  return `CNT-${now.slice(0, 10).replaceAll('-', '')}-${value.slice(-8).toUpperCase()}`;
}

function assertIdempotencyKey(value: string): void {
  if (value.trim() !== value || value.length < 8 || value.length > 160) {
    throw new RangeError('Idempotency key inválida.');
  }
}

function auditValues(entry: ReturnType<typeof createAuditEntry>): readonly unknown[] {
  return [entry.audit_id, entry.occurred_at, entry.actor.kind, entry.actor.id,
    entry.actor.label ?? null, entry.action, entry.entity.type, entry.entity.id,
    entry.entity.reference ?? null, entry.correlation_id, entry.source_event_id,
    serializeAuditDiff(entry.diff), entry.occurred_at];
}

function directMovementStatements(db: D1Database, input: Readonly<{
  countId: string;
  countLineId: string;
  locationId: number;
  balance: LocationBalance;
  variant: VariantRow;
  delta: number;
  reason: InventoryCountReason;
  movementKey: string;
  occurredAt: string;
  auditId: string;
}>): readonly D1PreparedStatement[] {
  const movementReason = input.reason === 'damage' ? 'damage' : 'reconciliation_correction';
  const planned = planInventoryMovement({
    variant_id: input.balance.variant_id,
    on_hand: input.balance.on_hand,
    reserved: input.balance.reserved,
    version: input.balance.movement_version,
  }, {
    delta: input.delta,
    reason: movementReason,
    actor_kind: 'admin',
    actor_id: ACTOR.id,
    reference_type: 'inventory_count',
    reference_id: input.countId,
    idempotency_key: input.movementKey,
    correlation_id: input.countId,
  });
  return [
    db.prepare(`UPDATE inventory_location_balances
      SET on_hand = ?, movement_version = ?, updated_at = ?
      WHERE location_id = ? AND variant_id = ? AND movement_version = ?
        AND on_hand + ? >= reserved
        AND EXISTS (SELECT 1 FROM audit_log WHERE audit_id = ?)
        AND NOT EXISTS (SELECT 1 FROM inventory_location_movements WHERE idempotency_key = ?)`)
      .bind(planned.on_hand, planned.version_after, input.occurredAt, input.locationId,
        input.variant.id, input.balance.movement_version, input.delta, input.auditId, input.movementKey),
    db.prepare(`INSERT INTO inventory_location_movements (
      location_id, variant_id, source_movement_id, delta, reason, balance_after,
      version_after, actor_kind, actor_id, reference_type, reference_id,
      idempotency_key, correlation_id, occurred_at, created_at
    ) SELECT ?, ?, NULL, ?, ?, ?, ?, 'admin', ?, 'inventory_count', ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM audit_log WHERE audit_id = ?)`)
      .bind(input.locationId, input.variant.id, input.delta, movementReason,
        planned.balance_after, planned.version_after, ACTOR.id, input.countId,
        input.movementKey, input.countId, input.occurredAt, input.occurredAt, input.auditId),
    db.prepare(`INSERT INTO inventory_count_movements (
      count_line_id, count_id, location_movement_id, delta, created_at
    ) SELECT ?, ?, id, ?, ? FROM inventory_location_movements
      WHERE idempotency_key = ? AND EXISTS (SELECT 1 FROM audit_log WHERE audit_id = ?)`)
      .bind(input.countLineId, input.countId, input.delta, input.occurredAt,
        input.movementKey, input.auditId),
  ];
}

function primaryMappingStatement(db: D1Database, input: Readonly<{
  countId: string;
  countLineId: string;
  delta: number;
  movementKey: string;
  occurredAt: string;
  auditId: string;
}>): D1PreparedStatement {
  return db.prepare(`INSERT INTO inventory_count_movements (
    count_line_id, count_id, location_movement_id, delta, created_at
  ) SELECT ?, ?, id, ?, ? FROM inventory_location_movements
    WHERE idempotency_key = ? AND EXISTS (SELECT 1 FROM audit_log WHERE audit_id = ?)`)
    .bind(input.countLineId, input.countId, input.delta, input.occurredAt,
      `location:principal:${input.movementKey}`, input.auditId);
}

export function createInventoryCountOperations(db: D1Database, now = () => new Date().toISOString()) {
  const counts = createD1InventoryCounts(db);
  const ledger = createD1InventoryLedger(db);

  async function activeLocation(locationId: number): Promise<Location | null> {
    return db.prepare(`SELECT id, is_primary FROM inventory_locations WHERE id = ? AND status = 'active'`)
      .bind(locationId).first<Location>();
  }

  async function locationBalances(locationId: number, variantIds: readonly number[]): Promise<ReadonlyMap<number, LocationBalance>> {
    if (variantIds.length === 0) return new Map();
    const { results } = await db.prepare(`SELECT variant_id, on_hand, reserved, movement_version
      FROM inventory_location_balances WHERE location_id = ?
        AND variant_id IN (${variantIds.map(() => '?').join(',')})`)
      .bind(locationId, ...variantIds).all<LocationBalance>();
    return new Map(results.map((row) => [row.variant_id, row]));
  }

  async function variants(variantIds: readonly number[]): Promise<ReadonlyMap<number, VariantRow>> {
    if (variantIds.length === 0) return new Map();
    const { results } = await db.prepare(`SELECT id, product_id, is_default FROM product_variants
      WHERE status = 'active' AND id IN (${variantIds.map(() => '?').join(',')})`)
      .bind(...variantIds).all<VariantRow>();
    return new Map(results.map((row) => [row.id, row]));
  }

  async function applyStatements(detail: InventoryCountDetail, location: Location, reviewerId: string | null,
    operationKey: string, occurredAt: string, auditId: string): Promise<readonly D1PreparedStatement[]> {
    const ids = detail.lines.map((line) => line.variant_id);
    const [balances, variantMap] = await Promise.all([locationBalances(location.id, ids), variants(ids)]);
    for (const line of detail.lines) {
      const balance = balances.get(line.variant_id);
      if (!balance || balance.movement_version !== line.expected_movement_version || balance.on_hand !== line.expected_quantity) {
        throw new RangeError('El stock cambió desde el conteo; crea una sesión nueva.');
      }
      if (line.delta < 0 && line.counted_quantity < balance.reserved) {
        throw new RangeError(`El conteo no puede dejar menos unidades que las reservadas para ${line.sku}.`);
      }
      if (detail.count.reason === 'damage' && line.delta > 0) {
        throw new RangeError('Un conteo por daño no puede aumentar stock.');
      }
    }
    if (variantMap.size !== detail.lines.length) throw new RangeError('Una variante del conteo ya no está activa.');

    const audit = createAuditEntry({ event_id: auditId, occurred_at: occurredAt }, {
      actor: ACTOR,
      action: 'inventory.count_applied',
      entity: { type: 'inventory_count', id: detail.count.id, reference: detail.count.count_number },
      diff: createAuditDiff(
        { status: detail.count.status, absolute_delta: 0, reviewed_by: null },
        { status: 'applied', absolute_delta: detail.count.absolute_delta, reviewed_by: reviewerId },
        ['status', 'absolute_delta', 'reviewed_by'],
      ),
    });
    const statements: D1PreparedStatement[] = [db.prepare(`INSERT INTO audit_log (
      audit_id, occurred_at, actor_kind, actor_id, actor_label, action,
      entity_type, entity_id, entity_reference, correlation_id,
      source_event_id, diff_json, created_at
    ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM inventory_counts
      WHERE id = ? AND status = ? AND version = ?`)
      .bind(...auditValues(audit), detail.count.id, detail.count.status, detail.count.version)];

    const primaryBalances = location.is_primary === 1 ? await ledger.balances(ids) : null;
    for (const line of detail.lines) {
      if (line.delta === 0) continue;
      const variant = variantMap.get(line.variant_id)!;
      const movementKey = `count:${detail.count.id}:line:${line.id}`;
      if (location.is_primary === 1) {
        const balance = primaryBalances!.get(line.variant_id);
        if (!balance || balance.version !== line.expected_movement_version || balance.on_hand !== line.expected_quantity) {
          throw new RangeError('El ledger principal cambió desde el conteo; crea una sesión nueva.');
        }
        const movementReason = detail.count.reason === 'damage' ? 'damage' : 'reconciliation_correction';
        statements.push(...ledger.movementStatements(balance, {
          variant_id: variant.id,
          product_id: variant.product_id,
          is_default: variant.is_default === 1,
          delta: line.delta,
        }, {
          delta: line.delta,
          reason: movementReason,
          actor_kind: 'admin',
          actor_id: ACTOR.id,
          reference_type: 'inventory_count',
          reference_id: detail.count.id,
          idempotency_key: movementKey,
          correlation_id: detail.count.id,
        }, occurredAt, { kind: 'audit', id: auditId }));
        statements.push(primaryMappingStatement(db, {
          countId: detail.count.id, countLineId: line.id, delta: line.delta,
          movementKey, occurredAt, auditId,
        }));
      } else {
        statements.push(...directMovementStatements(db, {
          countId: detail.count.id, countLineId: line.id, locationId: location.id,
          balance: balances.get(line.variant_id)!, variant, delta: line.delta,
          reason: detail.count.reason, movementKey, occurredAt, auditId,
        }));
      }
    }
    const isApproval = detail.count.status === 'pending_approval';
    statements.push(db.prepare(`UPDATE inventory_counts SET status = 'applied',
      version = version + 1, submit_idempotency_key = COALESCE(submit_idempotency_key, ?),
      submitted_at = COALESCE(submitted_at, ?), reviewed_by = ?, approve_idempotency_key = ?,
      applied_at = ?, updated_at = ?
      WHERE id = ? AND status = ? AND version = ?
        AND EXISTS (SELECT 1 FROM audit_log WHERE audit_id = ?)`)
      .bind(isApproval ? null : operationKey, isApproval ? null : occurredAt,
        reviewerId, isApproval ? operationKey : null, occurredAt, occurredAt,
        detail.count.id, detail.count.status, detail.count.version, auditId));
    return statements;
  }

  return Object.freeze({
    list: counts.list,
    find: counts.find,
    stockOptions: counts.stockOptions,

    async create(input: CreateInventoryCountInput): Promise<InventoryCountMutation> {
      assertIdempotencyKey(input.idempotencyKey);
      assertInventoryCountDraft(input);
      const existing = await counts.findByCreateKey(input.idempotencyKey);
      if (existing) return { outcome: 'idempotent', detail: existing };
      const location = await activeLocation(input.locationId);
      if (!location) throw new RangeError('La ubicación debe estar activa.');
      const variantIds = input.lines.map((line) => line.variantId);
      const [balances, variantMap] = await Promise.all([
        locationBalances(location.id, variantIds), variants(variantIds),
      ]);
      if (balances.size !== input.lines.length) throw new RangeError('Una variante no pertenece a la ubicación.');
      if (variantMap.size !== input.lines.length) throw new RangeError('Una variante no está activa.');
      if (input.reason === 'damage' && input.lines.some((line) => line.countedQuantity > balances.get(line.variantId)!.on_hand)) {
        throw new RangeError('Un conteo por daño no puede aumentar stock.');
      }
      const occurredAt = now();
      const countId = id('cnt');
      const number = countNumber(occurredAt, countId);
      const auditId = id('ica');
      const audit = createAuditEntry({ event_id: auditId, occurred_at: occurredAt }, {
        actor: ACTOR,
        action: 'inventory.count_created',
        entity: { type: 'inventory_count', id: countId, reference: number },
        diff: createAuditDiff({ status: null, line_count: 0 }, { status: 'draft', line_count: input.lines.length }, ['status', 'line_count']),
      });
      const statements: D1PreparedStatement[] = [
        db.prepare(`INSERT INTO audit_log (
          audit_id, occurred_at, actor_kind, actor_id, actor_label, action,
          entity_type, entity_id, entity_reference, correlation_id,
          source_event_id, diff_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(...auditValues(audit)),
        db.prepare(`INSERT INTO inventory_counts (
          id, count_number, location_id, status, reason, requires_approval,
          counted_by, version, create_idempotency_key, note, created_at, updated_at
        ) SELECT ?, ?, ?, 'draft', ?, ?, ?, 1, ?, ?, ?, ?
          WHERE EXISTS (SELECT 1 FROM audit_log WHERE audit_id = ?)`)
          .bind(countId, number, location.id, input.reason, input.requiresApproval ? 1 : 0,
            input.countedBy, input.idempotencyKey, input.note?.trim() || null,
            occurredAt, occurredAt, auditId),
      ];
      for (const line of input.lines) {
        const balance = balances.get(line.variantId)!;
        statements.push(db.prepare(`INSERT INTO inventory_count_lines (
          id, count_id, variant_id, expected_quantity, counted_quantity, delta,
          expected_movement_version, created_at
        ) SELECT ?, ?, ?, ?, ?, ?, ?, ?
          WHERE EXISTS (SELECT 1 FROM inventory_counts WHERE id = ?)`)
          .bind(id('icl'), countId, line.variantId, balance.on_hand, line.countedQuantity,
            line.countedQuantity - balance.on_hand, balance.movement_version, occurredAt, countId));
      }
      try {
        await db.batch(statements);
      } catch (error) {
        const raced = await counts.findByCreateKey(input.idempotencyKey);
        if (raced) return { outcome: 'idempotent', detail: raced };
        throw error;
      }
      return { outcome: 'applied', detail: await counts.find(countId) };
    },

    async submit(countId: string, expectedVersion: number, operationKey: string): Promise<InventoryCountMutation> {
      assertIdempotencyKey(operationKey);
      const duplicate = await db.prepare('SELECT id FROM inventory_counts WHERE submit_idempotency_key = ?')
        .bind(operationKey).first<{ id: string }>('id');
      if (typeof duplicate === 'string') return { outcome: 'idempotent', detail: await counts.find(duplicate) };
      const detail = await counts.find(countId);
      if (!detail) return { outcome: 'not-found', detail: null };
      if (detail.count.status !== 'draft' || detail.count.version !== expectedVersion) return { outcome: 'conflict', detail };
      const location = await activeLocation(detail.count.location_id);
      if (!location) throw new RangeError('La ubicación ya no está activa.');
      const occurredAt = now();
      const auditId = id('ica');
      let statements: readonly D1PreparedStatement[];
      if (detail.count.requires_approval === 1) {
        const audit = createAuditEntry({ event_id: auditId, occurred_at: occurredAt }, {
          actor: ACTOR,
          action: 'inventory.count_submitted',
          entity: { type: 'inventory_count', id: countId, reference: detail.count.count_number },
          diff: createAuditDiff({ status: 'draft' }, { status: 'pending_approval' }, ['status']),
        });
        statements = [
          db.prepare(`INSERT INTO audit_log (
            audit_id, occurred_at, actor_kind, actor_id, actor_label, action,
            entity_type, entity_id, entity_reference, correlation_id,
            source_event_id, diff_json, created_at
          ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM inventory_counts
            WHERE id = ? AND status = 'draft' AND version = ?`)
            .bind(...auditValues(audit), countId, expectedVersion),
          db.prepare(`UPDATE inventory_counts SET status = 'pending_approval',
            version = version + 1, submit_idempotency_key = ?, submitted_at = ?, updated_at = ?
            WHERE id = ? AND status = 'draft' AND version = ?
              AND EXISTS (SELECT 1 FROM audit_log WHERE audit_id = ?)`)
            .bind(operationKey, occurredAt, occurredAt, countId, expectedVersion, auditId),
        ];
      } else {
        statements = await applyStatements(detail, location, null, operationKey, occurredAt, auditId);
      }
      try {
        const results = await db.batch([...statements]);
        if ((results.at(-1)?.meta.changes ?? 0) === 1) return { outcome: 'applied', detail: await counts.find(countId) };
      } catch (error) {
        const raced = await db.prepare('SELECT id FROM inventory_counts WHERE submit_idempotency_key = ?')
          .bind(operationKey).first<{ id: string }>('id');
        if (typeof raced === 'string') return { outcome: 'idempotent', detail: await counts.find(raced) };
        if ((await counts.find(countId))?.count.version !== expectedVersion) return { outcome: 'conflict', detail: await counts.find(countId) };
        throw error;
      }
      return { outcome: 'conflict', detail: await counts.find(countId) };
    },

    async approve(countId: string, expectedVersion: number, reviewerId: string, operationKey: string): Promise<InventoryCountMutation> {
      assertIdempotencyKey(operationKey);
      const duplicate = await db.prepare('SELECT id FROM inventory_counts WHERE approve_idempotency_key = ?')
        .bind(operationKey).first<{ id: string }>('id');
      if (typeof duplicate === 'string') return { outcome: 'idempotent', detail: await counts.find(duplicate) };
      const detail = await counts.find(countId);
      if (!detail) return { outcome: 'not-found', detail: null };
      if (detail.count.status !== 'pending_approval' || detail.count.version !== expectedVersion) return { outcome: 'conflict', detail };
      assertInventoryCountReviewer(detail.count.counted_by, reviewerId);
      const location = await activeLocation(detail.count.location_id);
      if (!location) throw new RangeError('La ubicación ya no está activa.');
      const occurredAt = now();
      const statements = await applyStatements(detail, location, reviewerId, operationKey, occurredAt, id('ica'));
      try {
        const results = await db.batch([...statements]);
        if ((results.at(-1)?.meta.changes ?? 0) === 1) return { outcome: 'applied', detail: await counts.find(countId) };
      } catch (error) {
        const raced = await db.prepare('SELECT id FROM inventory_counts WHERE approve_idempotency_key = ?')
          .bind(operationKey).first<{ id: string }>('id');
        if (typeof raced === 'string') return { outcome: 'idempotent', detail: await counts.find(raced) };
        if ((await counts.find(countId))?.count.version !== expectedVersion) return { outcome: 'conflict', detail: await counts.find(countId) };
        throw error;
      }
      return { outcome: 'conflict', detail: await counts.find(countId) };
    },
  });
}

export type InventoryCountOperations = ReturnType<typeof createInventoryCountOperations>;
