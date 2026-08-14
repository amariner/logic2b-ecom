import {
  assertReturnInspection,
  assertReturnReceipt,
  assertReturnTransition,
  createD1ReturnRequests,
  planReturnRequest,
  returnResolvedEvent,
  type ReturnInspectionDraft,
  type ReturnReason,
  type ReturnReceiptDraft,
  type ReturnRequestDetail,
  type ReturnRequestLineDraft,
  type ReturnResolution,
} from '../modules/fulfillment';
import {
  createD1PaymentLedger,
  planRefundCaptureAllocations,
  type PaymentLedgerEntry,
  type PaymentRefundGateway,
  type PaymentRefundGatewayResolver,
  type RefundLedgerEntry,
  type RefundPaymentAllocationRecord,
} from '../modules/payments';
import {
  createD1InventoryLedger,
  planInventoryMovement,
  type InventoryStockChange,
} from '../modules/inventory';
import { createD1EventOutboxWriter } from '../platform/events';
import { createD1AuditLogWriter } from '../platform/operations';
import { createAuditDiff, createAuditEntry, serializeAuditDiff } from '../shared-kernel/audit';
import type { EmitEvent } from '../shared-kernel/events';
import { emitPlatformEvent } from './event-context';
import { runtimePlatform } from './runtime-platform';

const ACTOR = Object.freeze({ kind: 'admin', id: 'admin-panel', label: 'Panel de administración' } as const);

export type ReturnMutation = Readonly<{
  outcome: 'applied' | 'idempotent' | 'processing' | 'failed' | 'requires_review' |
    'conflict' | 'not-found' | 'invalid-state' | 'gateway-unavailable';
  detail: ReturnRequestDetail | null;
}>;

export type CreateReturnInput = Readonly<{
  orderId: number;
  receiveLocationId: number;
  reason: ReturnReason;
  requestedByKind: 'customer' | 'admin';
  requestedById: string;
  idempotencyKey: string;
  note?: string;
  lines: readonly ReturnRequestLineDraft[];
}>;

type Location = Readonly<{ id: number; is_primary: number }>;
type LocationBalance = Readonly<{
  variant_id: number; on_hand: number; reserved: number; movement_version: number;
}>;
type Variant = Readonly<{ id: number; product_id: number; is_default: number }>;

function newId(prefix: string): string { return `${prefix}_${crypto.randomUUID()}`; }
function returnNumber(at: string, id: string): string {
  return `RMA-${at.slice(0, 10).replaceAll('-', '')}-${id.slice(-8).toUpperCase()}`;
}
function assertKey(value: string): void {
  if (value.trim() !== value || value.length < 8 || value.length > 160) {
    throw new RangeError('Idempotency key inválida.');
  }
}
function consumersFor(eventType: string): readonly string[] {
  return runtimePlatform.modules
    .filter((module) => module.descriptor.subscriptions.includes(eventType))
    .map((module) => module.descriptor.id);
}
function auditValues(entry: ReturnType<typeof createAuditEntry>): readonly unknown[] {
  return [entry.audit_id, entry.occurred_at, entry.actor.kind, entry.actor.id,
    entry.actor.label ?? null, entry.action, entry.entity.type, entry.entity.id,
    entry.entity.reference ?? null, entry.correlation_id, entry.source_event_id,
    serializeAuditDiff(entry.diff), entry.occurred_at];
}

export function createReturnOperations(
  db: D1Database,
  resolveGateway?: PaymentRefundGatewayResolver,
  emit: EmitEvent = emitPlatformEvent,
  now = () => new Date().toISOString(),
) {
  const returns = createD1ReturnRequests(db);
  const payments = createD1PaymentLedger(db);
  const inventory = createD1InventoryLedger(db);
  const outbox = createD1EventOutboxWriter(db);
  const audit = createD1AuditLogWriter(db);

  async function duplicate(column: 'create_idempotency_key' | 'authorize_idempotency_key' |
    'transit_idempotency_key' | 'receive_idempotency_key' | 'inspect_idempotency_key' |
    'resolve_idempotency_key', key: string): Promise<ReturnRequestDetail | null> {
    const id = await db.prepare(`SELECT id FROM return_requests WHERE ${column} = ?`)
      .bind(key).first<{ id: string }>('id');
    return typeof id === 'string' ? returns.find(id) : null;
  }

  async function simpleTransition(input: Readonly<{
    id: string; expectedVersion: number; operationKey: string;
    to: 'authorized' | 'in_transit'; column: 'authorize_idempotency_key' | 'transit_idempotency_key';
    timestamp: 'authorized_at' | 'in_transit_at'; transition: 'authorized' | 'in_transit';
  }>): Promise<ReturnMutation> {
    assertKey(input.operationKey);
    const replay = await duplicate(input.column, input.operationKey);
    if (replay) return { outcome: replay.request.id === input.id ? 'idempotent' : 'conflict', detail: replay };
    const detail = await returns.find(input.id);
    if (!detail) return { outcome: 'not-found', detail: null };
    if (detail.request.version !== input.expectedVersion) return { outcome: 'conflict', detail };
    try { assertReturnTransition(detail.request.status, input.to); }
    catch { return { outcome: 'invalid-state', detail }; }
    const at = now();
    const auditId = newId('rmaudit');
    const entry = createAuditEntry({ event_id: auditId, occurred_at: at }, {
      actor: ACTOR, action: `fulfillment.return_${input.transition}`,
      entity: { type: 'return_request', id: detail.request.id, reference: detail.request.return_number },
      diff: createAuditDiff({ status: detail.request.status }, { status: input.to }, ['status']),
    });
    const statements = [
      db.prepare(`INSERT INTO audit_log (
        audit_id, occurred_at, actor_kind, actor_id, actor_label, action,
        entity_type, entity_id, entity_reference, correlation_id,
        source_event_id, diff_json, created_at
      ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM return_requests
        WHERE id=? AND status=? AND version=?
          AND NOT EXISTS (SELECT 1 FROM return_events WHERE idempotency_key=?)`)
        .bind(...auditValues(entry), input.id, detail.request.status,
          detail.request.version, input.operationKey),
      db.prepare(`INSERT INTO return_events (
        return_id, transition, from_status, to_status, version_after,
        actor_kind, actor_id, idempotency_key, detail_json, occurred_at
      ) SELECT ?, ?, ?, ?, ?, 'admin', ?, ?, '{}', ?
        WHERE EXISTS (SELECT 1 FROM audit_log WHERE audit_id = ?)`)
        .bind(input.id, input.transition, detail.request.status, input.to,
          detail.request.version + 1, ACTOR.id, input.operationKey, at, auditId),
      db.prepare(`UPDATE return_requests SET status = ?, version = version + 1,
        ${input.column} = ?, ${input.timestamp} = ?, updated_at = ?
        WHERE id = ? AND status = ? AND version = ?
          AND EXISTS (SELECT 1 FROM return_events WHERE idempotency_key = ?)`)
        .bind(input.to, input.operationKey, at, at, input.id,
          detail.request.status, detail.request.version, input.operationKey),
    ];
    try {
      const results = await db.batch(statements);
      if (results.at(-1)?.meta.changes === 1) return { outcome: 'applied', detail: await returns.find(input.id) };
    } catch (error) {
      const raced = await duplicate(input.column, input.operationKey);
      if (raced) return { outcome: raced.request.id === input.id ? 'idempotent' : 'conflict', detail: raced };
      throw error;
    }
    return { outcome: 'conflict', detail: await returns.find(input.id) };
  }

  async function reconcile(payment: PaymentLedgerEntry, refund: RefundLedgerEntry,
    gateway: PaymentRefundGateway): Promise<
      | Readonly<{ outcome: 'succeeded'; refund: RefundLedgerEntry;
          allocations: readonly RefundPaymentAllocationRecord[]; causationId: string }>
      | Readonly<{ outcome: 'processing' | 'failed' | 'requires_review' | 'conflict' }>
    > {
    const allocations = await payments.refundAllocations(refund.id);
    if (allocations.length === 0) return { outcome: 'conflict' };
    const at = now();
    const statuses: Array<'succeeded' | 'processing' | 'failed' | 'requires_review'> = [];
    const updates: D1PreparedStatement[] = [];
    for (const allocation of allocations) {
      if (allocation.status === 'succeeded') { statuses.push('succeeded'); continue; }
      const result = await gateway.refund({
        paymentReference: allocation.payment_reference,
        amountCents: allocation.amount_cents,
        currency: payment.currency,
        idempotencyKey: allocation.idempotency_key,
        existingRefundReference: allocation.provider_reference,
      });
      statuses.push(result.status);
      updates.push(payments.refundAllocationOutcomeStatement(allocation, result, at));
    }
    if (updates.length > 0) await db.batch(updates);
    if (statuses.some((status) => status !== 'succeeded')) {
      const outcome = statuses.includes('requires_review') ? 'requires_review'
        : statuses.includes('failed') ? 'failed' : 'processing';
      const current = await payments.findRefundByIdempotencyKey(refund.idempotency_key);
      if (!current) return { outcome: 'conflict' };
      const result = await db.batch([payments.refundStatusStatement(current, outcome, at)]);
      return result[0]?.meta.changes === 1 ? { outcome } : { outcome: 'conflict' };
    }
    const [current, currentAllocations] = await Promise.all([
      payments.findRefundByIdempotencyKey(refund.idempotency_key),
      payments.refundAllocations(refund.id),
    ]);
    if (!current || currentAllocations.some((allocation) =>
      allocation.status !== 'processing' && allocation.status !== 'succeeded')) return { outcome: 'conflict' };
    return { outcome: 'succeeded', refund: current, allocations: currentAllocations,
      causationId: currentAllocations.map((item) => item.provider_reference).filter(Boolean).join(',') };
  }

  async function restockStatements(detail: ReturnRequestDetail, eventId: string, at: string): Promise<readonly D1PreparedStatement[]> {
    const lines = detail.lines.filter((line) => line.inspection === 'restock');
    if (lines.length === 0) return [];
    const location = await db.prepare(`SELECT id, is_primary FROM inventory_locations
      WHERE id=? AND status='active'`).bind(detail.request.receive_location_id).first<Location>();
    if (!location) throw new RangeError('La ubicación de recepción ya no está activa.');
    const grouped = new Map<number, { quantity: number; lines: typeof lines }>();
    for (const line of lines) {
      const group = grouped.get(line.variant_id) ?? { quantity: 0, lines: [] as unknown as typeof lines };
      grouped.set(line.variant_id, { quantity: group.quantity + line.received_quantity,
        lines: [...group.lines, line] });
    }
    const ids = [...grouped.keys()];
    const { results: variantRows } = await db.prepare(`SELECT id, product_id, is_default
      FROM product_variants WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all<Variant>();
    const variants = new Map(variantRows.map((row) => [row.id, row]));
    const statements: D1PreparedStatement[] = [];
    if (location.is_primary === 1) {
      const balances = await inventory.balances(ids);
      for (const [variantId, group] of grouped) {
        const balance = balances.get(variantId); const variant = variants.get(variantId);
        if (!balance || !variant) throw new RangeError('Balance de devolución ausente.');
        const movementKey = `return:${detail.request.id}:variant:${variantId}`;
        const change: InventoryStockChange = { variant_id: variantId,
          product_id: variant.product_id, is_default: variant.is_default === 1, delta: group.quantity };
        statements.push(...inventory.movementStatements(balance, change, {
          delta: group.quantity, reason: 'return_restock', actor_kind: 'admin', actor_id: ACTOR.id,
          reference_type: 'return_request', reference_id: detail.request.id,
          idempotency_key: movementKey, correlation_id: `order:${detail.request.order_number}`,
        }, at, { kind: 'event', id: eventId }));
        for (const line of group.lines) statements.push(db.prepare(`INSERT INTO return_inventory_movements (
          return_id, return_line_id, location_movement_id, quantity, created_at
        ) SELECT ?, ?, id, ?, ? FROM inventory_location_movements
          WHERE idempotency_key=? AND EXISTS (SELECT 1 FROM event_outbox_events WHERE event_id=?)`)
          .bind(detail.request.id, line.id, line.received_quantity, at,
            `location:principal:${movementKey}`, eventId));
      }
      return statements;
    }
    const { results: rows } = await db.prepare(`SELECT variant_id, on_hand, reserved, movement_version
      FROM inventory_location_balances WHERE location_id=?
        AND variant_id IN (${ids.map(() => '?').join(',')})`)
      .bind(location.id, ...ids).all<LocationBalance>();
    const balances = new Map(rows.map((row) => [row.variant_id, row]));
    for (const [variantId, group] of grouped) {
      const balance = balances.get(variantId); if (!balance) throw new RangeError('Balance de ubicación ausente.');
      const key = `return:${detail.request.id}:location:${location.id}:variant:${variantId}`;
      const planned = planInventoryMovement({ variant_id: variantId, on_hand: balance.on_hand,
        reserved: balance.reserved, version: balance.movement_version }, {
        delta: group.quantity, reason: 'return_restock', actor_kind: 'admin', actor_id: ACTOR.id,
        reference_type: 'return_request', reference_id: detail.request.id,
        idempotency_key: key, correlation_id: `order:${detail.request.order_number}`,
      });
      statements.push(db.prepare(`UPDATE inventory_location_balances SET on_hand=?, movement_version=?, updated_at=?
        WHERE location_id=? AND variant_id=? AND movement_version=?
          AND EXISTS (SELECT 1 FROM event_outbox_events WHERE event_id=?)
          AND NOT EXISTS (SELECT 1 FROM inventory_location_movements WHERE idempotency_key=?)`)
        .bind(planned.on_hand, planned.version_after, at, location.id, variantId,
          balance.movement_version, eventId, key));
      statements.push(db.prepare(`INSERT INTO inventory_location_movements (
        location_id, variant_id, source_movement_id, delta, reason, balance_after,
        version_after, actor_kind, actor_id, reference_type, reference_id,
        idempotency_key, correlation_id, occurred_at, created_at
      ) SELECT ?, ?, NULL, ?, 'return_restock', ?, ?, 'admin', ?, 'return_request', ?, ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM event_outbox_events WHERE event_id=?)`)
        .bind(location.id, variantId, group.quantity, planned.balance_after, planned.version_after,
          ACTOR.id, detail.request.id, key, `order:${detail.request.order_number}`, at, at, eventId));
      for (const line of group.lines) statements.push(db.prepare(`INSERT INTO return_inventory_movements (
        return_id, return_line_id, location_movement_id, quantity, created_at
      ) SELECT ?, ?, id, ?, ? FROM inventory_location_movements
        WHERE idempotency_key=? AND EXISTS (SELECT 1 FROM event_outbox_events WHERE event_id=?)`)
        .bind(detail.request.id, line.id, line.received_quantity, at, key, eventId));
    }
    return statements;
  }

  return Object.freeze({
    list: returns.list,
    find: returns.find,
    eligibility: returns.eligibility,
    adminOptions: returns.adminOptions,

    async create(input: CreateReturnInput): Promise<ReturnMutation> {
      assertKey(input.idempotencyKey);
      const replay = await duplicate('create_idempotency_key', input.idempotencyKey);
      if (replay) return { outcome: 'idempotent', detail: replay };
      const requestedBy = input.requestedById.trim();
      if (requestedBy.length < 2 || requestedBy.length > 80) throw new RangeError('Actor solicitante inválido.');
      const location = await db.prepare(`SELECT id, is_primary FROM inventory_locations
        WHERE id=? AND status='active'`).bind(input.receiveLocationId).first<Location>();
      if (!location) throw new RangeError('La ubicación de recepción debe estar activa.');
      const at = now();
      const planned = planReturnRequest({ now: at, lines: input.lines,
        eligibility: await returns.eligibility(input.orderId) });
      const order = await db.prepare(`SELECT id, order_number FROM orders WHERE id=? AND status='delivered'`)
        .bind(input.orderId).first<{ id: number; order_number: string }>();
      if (!order) return { outcome: 'invalid-state', detail: null };
      const returnId = newId('rma'); const number = returnNumber(at, returnId);
      const auditId = newId('rmaudit');
      const entry = createAuditEntry({ event_id: auditId, occurred_at: at }, {
        actor: ACTOR, action: 'fulfillment.return_created',
        entity: { type: 'return_request', id: returnId, reference: number },
        diff: createAuditDiff({ status: null, line_count: 0 },
          { status: 'requested', line_count: planned.length }, ['status', 'line_count']),
      });
      const statements: D1PreparedStatement[] = [db.prepare(`INSERT INTO audit_log (
        audit_id, occurred_at, actor_kind, actor_id, actor_label, action,
        entity_type, entity_id, entity_reference, correlation_id,
        source_event_id, diff_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(...auditValues(entry)),
      db.prepare(`INSERT INTO return_requests (
        id, return_number, order_id, receive_location_id, status, reason_code,
        requested_by_kind, requested_by_id, version, create_idempotency_key,
        note, requested_at, created_at, updated_at
      ) SELECT ?, ?, ?, ?, 'requested', ?, ?, ?, 1, ?, ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM audit_log WHERE audit_id=?)
          AND EXISTS (SELECT 1 FROM orders WHERE id=? AND status='delivered')`)
        .bind(returnId, number, input.orderId, location.id, input.reason,
          input.requestedByKind, requestedBy, input.idempotencyKey,
          input.note?.trim() || null, at, at, at, auditId, input.orderId)];
      for (const line of planned) statements.push(db.prepare(`INSERT INTO return_request_lines (
        id, return_id, order_id, order_item_id, variant_id, requested_quantity,
        eligible_quantity, unit_amount_cents, created_at, updated_at
      ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM return_requests
        WHERE id=? AND order_id=?`)
        .bind(newId('rml'), returnId, input.orderId, line.orderItemId, line.variantId,
          line.requestedQuantity, line.deliveredQuantity - line.claimedQuantity,
          line.unitAmountCents, at, at, returnId, input.orderId));
      statements.push(db.prepare(`INSERT INTO return_events (
        return_id, transition, from_status, to_status, version_after,
        actor_kind, actor_id, idempotency_key, detail_json, occurred_at
      ) SELECT ?, 'created', NULL, 'requested', 1, ?, ?, ?,
        json_object('line_count', ?), ? FROM return_requests WHERE id=?`)
        .bind(returnId, input.requestedByKind, requestedBy, input.idempotencyKey,
          planned.length, at, returnId));
      try { await db.batch(statements); }
      catch (error) {
        const raced = await duplicate('create_idempotency_key', input.idempotencyKey);
        if (raced) return { outcome: 'idempotent', detail: raced };
        if ((error instanceof Error ? error.message : String(error)).includes('return_line_quantity_conflict')) {
          return { outcome: 'conflict', detail: null };
        }
        throw error;
      }
      return { outcome: 'applied', detail: await returns.find(returnId) };
    },

    authorize(id: string, expectedVersion: number, operationKey: string): Promise<ReturnMutation> {
      return simpleTransition({ id, expectedVersion, operationKey, to: 'authorized',
        column: 'authorize_idempotency_key', timestamp: 'authorized_at', transition: 'authorized' });
    },
    markInTransit(id: string, expectedVersion: number, operationKey: string): Promise<ReturnMutation> {
      return simpleTransition({ id, expectedVersion, operationKey, to: 'in_transit',
        column: 'transit_idempotency_key', timestamp: 'in_transit_at', transition: 'in_transit' });
    },

    async receive(id: string, expectedVersion: number, operationKey: string,
      lines: readonly ReturnReceiptDraft[]): Promise<ReturnMutation> {
      assertKey(operationKey);
      const replay = await duplicate('receive_idempotency_key', operationKey);
      if (replay) return { outcome: replay.request.id === id ? 'idempotent' : 'conflict', detail: replay };
      const detail = await returns.find(id); if (!detail) return { outcome: 'not-found', detail: null };
      if (detail.request.version !== expectedVersion) return { outcome: 'conflict', detail };
      try { assertReturnTransition(detail.request.status, 'received');
        assertReturnReceipt({ expectedLines: detail.lines.map((line) => ({ id: line.id,
          requestedQuantity: line.requested_quantity })), lines }); }
      catch { return { outcome: 'invalid-state', detail }; }
      const at = now(); const auditId = newId('rmaudit');
      const entry = createAuditEntry({ event_id: auditId, occurred_at: at }, {
        actor: ACTOR, action: 'fulfillment.return_received',
        entity: { type: 'return_request', id, reference: detail.request.return_number },
        diff: createAuditDiff({ status: detail.request.status, received_quantity: 0 },
          { status: 'received', received_quantity: lines.reduce((sum, line) => sum + line.receivedQuantity, 0) },
          ['status', 'received_quantity']),
      });
      const statements: D1PreparedStatement[] = [db.prepare(`INSERT INTO audit_log (
        audit_id, occurred_at, actor_kind, actor_id, actor_label, action,
        entity_type, entity_id, entity_reference, correlation_id, source_event_id, diff_json, created_at
      ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM return_requests
        WHERE id=? AND status=? AND version=?`).bind(...auditValues(entry), id,
          detail.request.status, expectedVersion)];
      for (const line of lines) statements.push(db.prepare(`UPDATE return_request_lines
        SET received_quantity=?, updated_at=? WHERE id=? AND return_id=?
          AND EXISTS (SELECT 1 FROM audit_log WHERE audit_id=?)`)
        .bind(line.receivedQuantity, at, line.returnLineId, id, auditId));
      statements.push(db.prepare(`INSERT INTO return_events (
        return_id, transition, from_status, to_status, version_after, actor_kind,
        actor_id, idempotency_key, detail_json, occurred_at
      ) SELECT ?, 'received', ?, 'received', ?, 'admin', ?, ?,
        json_object('received_quantity', ?), ? WHERE EXISTS
        (SELECT 1 FROM audit_log WHERE audit_id=?)`)
        .bind(id, detail.request.status, expectedVersion + 1, ACTOR.id, operationKey,
          lines.reduce((sum, line) => sum + line.receivedQuantity, 0), at, auditId));
      statements.push(db.prepare(`UPDATE return_requests SET status='received', version=version+1,
        receive_idempotency_key=?, received_at=?, updated_at=?
        WHERE id=? AND status=? AND version=?
          AND EXISTS (SELECT 1 FROM return_events WHERE idempotency_key=?)`)
        .bind(operationKey, at, at, id, detail.request.status, expectedVersion, operationKey));
      const results = await db.batch(statements);
      return results.at(-1)?.meta.changes === 1
        ? { outcome: 'applied', detail: await returns.find(id) }
        : { outcome: 'conflict', detail: await returns.find(id) };
    },

    async inspect(id: string, expectedVersion: number, operationKey: string,
      lines: readonly ReturnInspectionDraft[]): Promise<ReturnMutation> {
      assertKey(operationKey);
      const replay = await duplicate('inspect_idempotency_key', operationKey);
      if (replay) return { outcome: replay.request.id === id ? 'idempotent' : 'conflict', detail: replay };
      const detail = await returns.find(id); if (!detail) return { outcome: 'not-found', detail: null };
      if (detail.request.version !== expectedVersion) return { outcome: 'conflict', detail };
      try { assertReturnTransition(detail.request.status, 'inspected');
        assertReturnInspection({ expectedLines: detail.lines.map((line) => ({ id: line.id,
          receivedQuantity: line.received_quantity })), lines }); }
      catch { return { outcome: 'invalid-state', detail }; }
      const exchangeIds = [...new Set(lines.flatMap((line) =>
        line.resolution === 'exchange' && line.exchangeVariantId ? [line.exchangeVariantId] : []))];
      if (exchangeIds.length > 0) {
        const active = Number(await db.prepare(`SELECT count(*) AS value FROM product_variants
          WHERE status='active' AND id IN (${exchangeIds.map(() => '?').join(',')})`)
          .bind(...exchangeIds).first<number>('value') ?? 0);
        if (active !== exchangeIds.length) return { outcome: 'invalid-state', detail };
      }
      const at = now(); const auditId = newId('rmaudit');
      const entry = createAuditEntry({ event_id: auditId, occurred_at: at }, {
        actor: ACTOR, action: 'fulfillment.return_inspected',
        entity: { type: 'return_request', id, reference: detail.request.return_number },
        diff: createAuditDiff({ status: 'received' }, { status: 'inspected' }, ['status']),
      });
      const statements: D1PreparedStatement[] = [db.prepare(`INSERT INTO audit_log (
        audit_id, occurred_at, actor_kind, actor_id, actor_label, action,
        entity_type, entity_id, entity_reference, correlation_id, source_event_id, diff_json, created_at
      ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM return_requests
        WHERE id=? AND status='received' AND version=?`).bind(...auditValues(entry), id, expectedVersion)];
      for (const line of lines) statements.push(db.prepare(`UPDATE return_request_lines
        SET inspection=?, resolution=?, exchange_variant_id=?, updated_at=?
        WHERE id=? AND return_id=? AND EXISTS (SELECT 1 FROM audit_log WHERE audit_id=?)`)
        .bind(line.inspection, line.resolution, line.exchangeVariantId ?? null,
          at, line.returnLineId, id, auditId));
      statements.push(db.prepare(`INSERT INTO return_events (
        return_id, transition, from_status, to_status, version_after, actor_kind,
        actor_id, idempotency_key, detail_json, occurred_at
      ) SELECT ?, 'inspected', 'received', 'inspected', ?, 'admin', ?, ?, '{}', ?
        WHERE EXISTS (SELECT 1 FROM audit_log WHERE audit_id=?)`)
        .bind(id, expectedVersion + 1, ACTOR.id, operationKey, at, auditId));
      statements.push(db.prepare(`UPDATE return_requests SET status='inspected', version=version+1,
        inspect_idempotency_key=?, inspected_at=?, updated_at=?
        WHERE id=? AND status='received' AND version=?
          AND EXISTS (SELECT 1 FROM return_events WHERE idempotency_key=?)`)
        .bind(operationKey, at, at, id, expectedVersion, operationKey));
      const results = await db.batch(statements);
      return results.at(-1)?.meta.changes === 1
        ? { outcome: 'applied', detail: await returns.find(id) }
        : { outcome: 'conflict', detail: await returns.find(id) };
    },

    async resolve(id: string, expectedVersion: number, operationKey: string): Promise<ReturnMutation> {
      assertKey(operationKey);
      const replay = await duplicate('resolve_idempotency_key', operationKey);
      if (replay) return { outcome: replay.request.id === id ? 'idempotent' : 'conflict', detail: replay };
      let detail = await returns.find(id); if (!detail) return { outcome: 'not-found', detail: null };
      if (detail.request.version !== expectedVersion) return { outcome: 'conflict', detail };
      try { assertReturnTransition(detail.request.status,
        detail.lines.every((line) => line.resolution === 'reject') ? 'rejected' : 'resolved'); }
      catch { return { outcome: 'invalid-state', detail }; }
      const accepted = detail.lines.filter((line) => line.resolution !== 'reject');
      const resolution: ReturnResolution = accepted[0]?.resolution as ReturnResolution ?? 'reject';
      if (accepted.some((line) => line.resolution !== resolution)) return { outcome: 'invalid-state', detail };
      let payment: PaymentLedgerEntry | null = null;
      let refund: RefundLedgerEntry | null = null;
      let allocations: readonly RefundPaymentAllocationRecord[] = [];
      let causationId: string | null = null;
      const refundTotal = resolution === 'refund'
        ? accepted.reduce((sum, line) => sum + line.received_quantity * line.unit_amount_cents, 0) : 0;
      if (resolution === 'refund') {
        payment = await payments.findByOrderId(detail.request.order_id);
        if (!payment || (payment.status !== 'captured' && payment.status !== 'partially_refunded')) {
          return { outcome: 'invalid-state', detail };
        }
        const gateway = resolveGateway?.(payment.provider);
        if (!gateway || gateway.provider !== payment.provider || !payment.provider_reference?.trim()) {
          return { outcome: 'gateway-unavailable', detail };
        }
        const refundKey = `r3:return:${id}:refund`;
        refund = await payments.findRefundByIdempotencyKey(refundKey);
        if (!refund) {
          const plannedAllocations = planRefundCaptureAllocations(
            await payments.refundableCaptures(detail.request.order_id), refundTotal);
          await db.batch([...payments.createReturnRefundIntentStatements(payment, {
            order_id: detail.request.order_id, reason: `Devolución ${detail.request.return_number}`,
            occurred_at: now(), idempotency_key: refundKey, total_cents: refundTotal,
            lines: accepted.map((line) => ({ order_item_id: line.order_item_id,
              quantity: line.received_quantity,
              amount_cents: line.received_quantity * line.unit_amount_cents })),
            allocations: plannedAllocations,
          })]);
          refund = await payments.findRefundByIdempotencyKey(refundKey);
        }
        if (!refund || refund.operation_type !== 'return' || refund.total_cents !== refundTotal) {
          return { outcome: 'conflict', detail };
        }
        const reconciled = await reconcile(payment, refund, gateway);
        if (reconciled.outcome !== 'succeeded') return { outcome: reconciled.outcome, detail };
        refund = reconciled.refund; allocations = reconciled.allocations;
        causationId = reconciled.causationId;
        payment = await payments.findByOrderId(detail.request.order_id);
        if (!payment || payment.refunded_cents + refundTotal > payment.expected_amount_cents) {
          return { outcome: 'requires_review', detail };
        }
      }
      detail = await returns.find(id) ?? detail;
      if (detail.request.status !== 'inspected' || detail.request.version !== expectedVersion) {
        return { outcome: 'conflict', detail };
      }
      const at = now();
      const exchangeQuantity = resolution === 'exchange'
        ? accepted.reduce((sum, line) => sum + line.received_quantity, 0) : 0;
      const restockedQuantity = detail.lines.filter((line) => line.inspection === 'restock')
        .reduce((sum, line) => sum + line.received_quantity, 0);
      const event = returnResolvedEvent(emit, {
        return_id: id, return_number: detail.request.return_number,
        order_id: detail.request.order_id, order_number: detail.request.order_number,
        resolution, refund_id: refund?.id ?? null, refunded_cents: refundTotal,
        restocked_quantity: restockedQuantity, exchange_quantity: exchangeQuantity,
        idempotencyKey: operationKey, causationId,
      });
      const consumers = consumersFor(event.type);
      const targetStatus = resolution === 'reject' ? 'rejected' : 'resolved';
      const paymentStatus = payment && refund
        ? payment.refunded_cents + refund.total_cents === payment.expected_amount_cents
          ? 'refunded' : 'partially_refunded'
        : null;
      const returnGuard = {
        returnId: id, expectedStatus: 'inspected', expectedVersion,
        orderId: detail.request.order_id, expectedOrderStatus: 'delivered',
        ...(payment ? { payment: { id: payment.id, status: payment.status, version: payment.version } } : {}),
        ...(refund ? { refund: { id: refund.id, status: refund.status, version: refund.version } } : {}),
      };
      const statements: D1PreparedStatement[] = [outbox.guardedReturnEventStatement(event, returnGuard), audit.eventStatement(event.event_id, {
        action: 'fulfillment.return_resolved',
        diff: createAuditDiff({ status: 'inspected', resolution: null },
          { status: targetStatus, resolution }, ['status', 'resolution']),
      }), ...outbox.deliveryStatements(event.event_id, at, consumers)];
      if (payment && refund && paymentStatus) {
        statements.push(...allocations.flatMap((allocation) => allocation.status === 'processing'
          ? payments.refundAllocationSuccessStatements(allocation, at, { eventId: event.event_id }) : []));
        statements.push(...payments.completeAllocatedRefundStatements(
          payment, refund, paymentStatus, at, { eventId: event.event_id }));
      }
      statements.push(...await restockStatements(detail, event.event_id, at));
      if (resolution === 'exchange') for (const line of accepted) statements.push(db.prepare(`INSERT INTO return_exchange_lines (
        return_id, return_line_id, source_variant_id, exchange_variant_id, quantity, status, created_at, updated_at
      ) SELECT ?, ?, ?, ?, ?, 'pending', ?, ?
        WHERE EXISTS (SELECT 1 FROM event_outbox_events WHERE event_id=?)`)
        .bind(id, line.id, line.variant_id, line.exchange_variant_id,
          line.received_quantity, at, at, event.event_id));
      statements.push(db.prepare(`INSERT INTO return_events (
        return_id, transition, from_status, to_status, version_after, actor_kind,
        actor_id, idempotency_key, detail_json, occurred_at
      ) SELECT ?, ?, 'inspected', ?, ?, 'admin', ?, ?,
        json_object('resolution', ?, 'refund_id', ?, 'refunded_cents', ?,
          'restocked_quantity', ?, 'exchange_quantity', ?), ?
        WHERE EXISTS (SELECT 1 FROM event_outbox_events WHERE event_id=?)`)
        .bind(id, targetStatus === 'rejected' ? 'rejected' : 'resolved', targetStatus,
          expectedVersion + 1, ACTOR.id, operationKey, resolution, refund?.id ?? null,
          refundTotal, restockedQuantity, exchangeQuantity, at, event.event_id));
      statements.push(db.prepare(`UPDATE return_requests SET status=?, resolution=?, refund_id=?,
        resolve_idempotency_key=?, resolved_at=?, updated_at=?, version=version+1
        WHERE id=? AND status='inspected' AND version=?
          AND EXISTS (SELECT 1 FROM return_events WHERE idempotency_key=?)`)
        .bind(targetStatus, resolution, refund?.id ?? null, operationKey, at, at,
          id, expectedVersion, operationKey));
      try {
        const results = await db.batch(statements);
        return results.at(-1)?.meta.changes === 1
          ? { outcome: 'applied', detail: await returns.find(id) }
          : { outcome: 'conflict', detail: await returns.find(id) };
      } catch (error) {
        const raced = await duplicate('resolve_idempotency_key', operationKey);
        if (raced) return { outcome: raced.request.id === id ? 'idempotent' : 'conflict', detail: raced };
        throw error;
      }
    },
  });
}

export type ReturnOperations = ReturnType<typeof createReturnOperations>;
