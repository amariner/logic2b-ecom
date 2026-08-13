import {
  createD1OrderHolds,
  createOrderWriter,
  orderHoldAssignedEvent,
  orderHoldCreatedEvent,
  orderHoldResolvedEvent,
  orderHoldSnapshot,
  planOrderHold,
  planOrderHoldAssignment,
  planOrderHoldResolution,
  type OrderHoldOwner,
  type OrderHoldReasonCode,
  type OrderHoldRecord,
  type OrderHoldResolutionCode,
  type OrderHoldSource,
} from '../modules/orders';
import { createD1EventOutboxWriter } from '../platform/events';
import { createD1AuditLogWriter, type AuditEventProjection } from '../platform/operations';
import { createAuditDiff } from '../shared-kernel/audit';
import type { EmitEvent } from '../shared-kernel/events';
import { emitPlatformEvent } from './event-context';

export type CreateOrderHoldInput = Readonly<{
  orderId: number;
  source: OrderHoldSource;
  reasonCode: OrderHoldReasonCode;
  owner: OrderHoldOwner;
  dueAt: string;
  idempotencyKey: string;
}>;

export type AssignOrderHoldInput = Readonly<{
  holdId: string;
  expectedVersion: number;
  owner: OrderHoldOwner;
}>;

export type ResolveOrderHoldInput = Readonly<{
  holdId: string;
  expectedVersion: number;
  resolutionCode: OrderHoldResolutionCode;
}>;

export type OrderHoldMutationResult = Readonly<{
  outcome: 'applied' | 'replayed' | 'conflict' | 'not-found';
  hold: OrderHoldRecord | null;
}>;

type Dependencies = Readonly<{
  emit?: EmitEvent;
  now?: () => string;
  nextHoldId?: () => string;
}>;

function committed(results: readonly D1Result[]): boolean {
  const changes = results.map((result) => result.meta.changes ?? 0);
  if (changes.every((change) => change === 1)) return true;
  if (changes.every((change) => change === 0)) return false;
  throw new Error(`Unidad de hold inconsistente: ${changes.join(',')}.`);
}

function sameCreation(record: OrderHoldRecord, input: CreateOrderHoldInput): boolean {
  return record.order_id === input.orderId && record.source === input.source &&
    record.reason_code === input.reasonCode && record.due_at === input.dueAt &&
    record.owner_kind === input.owner.kind && record.owner_id === input.owner.id.trim() &&
    record.owner_label === input.owner.label.trim();
}

function isUniqueConflict(error: unknown): boolean {
  return (error instanceof Error ? error.message : String(error)).includes('UNIQUE constraint failed');
}

function createdAudit(): AuditEventProjection {
  return {
    action: 'orders.hold_created',
    diff: createAuditDiff(
      { active: false, version: null },
      { active: true, version: 1 },
      ['active', 'version'],
    ),
  };
}

function assignedAudit(beforeVersion: number, afterVersion: number): AuditEventProjection {
  return {
    action: 'orders.hold_assigned',
    diff: createAuditDiff(
      { owner_changed: false, version: beforeVersion },
      { owner_changed: true, version: afterVersion },
      ['owner_changed', 'version'],
    ),
  };
}

function resolvedAudit(beforeVersion: number, afterVersion: number): AuditEventProjection {
  return {
    action: 'orders.hold_resolved',
    diff: createAuditDiff(
      { active: true, version: beforeVersion },
      { active: false, version: afterVersion },
      ['active', 'version'],
    ),
  };
}

export function createOrderHoldOperations(db: D1Database, dependencies: Dependencies = {}) {
  const holds = createD1OrderHolds(db);
  const orders = createOrderWriter(db);
  const outbox = createD1EventOutboxWriter(db);
  const audit = createD1AuditLogWriter(db);
  const emit = dependencies.emit ?? emitPlatformEvent;
  const now = dependencies.now ?? (() => new Date().toISOString());
  const nextHoldId = dependencies.nextHoldId ?? (() => crypto.randomUUID());

  return Object.freeze({
    async create(input: CreateOrderHoldInput): Promise<OrderHoldMutationResult> {
      const key = input.idempotencyKey.trim();
      const replay = await holds.findByIdempotencyKey(key);
      if (replay) {
        return Object.freeze({ outcome: sameCreation(replay, input) ? 'replayed' : 'conflict', hold: replay });
      }
      const order = await orders.findOrderForTransition(input.orderId);
      if (!order) return Object.freeze({ outcome: 'not-found', hold: null });
      if (!['pending', 'paid', 'shipped'].includes(order.status)) {
        return Object.freeze({ outcome: 'conflict', hold: null });
      }
      const plan = planOrderHold({
        source: input.source,
        reasonCode: input.reasonCode,
        owner: input.owner,
        createdAt: now(),
        dueAt: input.dueAt,
        idempotencyKey: key,
      });
      const holdId = nextHoldId();
      const event = orderHoldCreatedEvent(emit, {
        order_id: order.id,
        order_number: order.order_number,
        hold_id: holdId,
        source: plan.source,
        reason_code: plan.reason_code,
        due_at: plan.due_at,
        hold_version: 1,
      });
      const statements = [
        outbox.guardedEventStatement(event, {
          orderId: order.id,
          expectedStatus: order.status,
          ignoreExistingIdempotencyKey: true,
        }),
        audit.eventStatement(event.event_id, createdAudit()),
        ...holds.createStatements({ id: holdId, orderId: order.id, plan, eventId: event.event_id }),
      ];
      try {
        const applied = committed(await orders.commitResults(statements));
        if (applied) {
          return Object.freeze({ outcome: 'applied', hold: await holds.findById(holdId) });
        }
        const stored = await holds.findByIdempotencyKey(key);
        return Object.freeze({
          outcome: stored && sameCreation(stored, input) ? 'replayed' : 'conflict',
          hold: stored,
        });
      } catch (error) {
        if (!isUniqueConflict(error)) throw error;
        const stored = await holds.findByIdempotencyKey(key);
        return Object.freeze({
          outcome: stored && sameCreation(stored, input) ? 'replayed' : 'conflict',
          hold: stored,
        });
      }
    },

    async assign(input: AssignOrderHoldInput): Promise<OrderHoldMutationResult> {
      const hold = await holds.findById(input.holdId);
      if (!hold) return Object.freeze({ outcome: 'not-found', hold: null });
      let plan;
      try {
        plan = planOrderHoldAssignment(orderHoldSnapshot(hold), {
          expectedVersion: input.expectedVersion,
          owner: input.owner,
          assignedAt: now(),
        });
      } catch {
        return Object.freeze({ outcome: 'conflict', hold });
      }
      const order = await orders.findOrderForTransition(hold.order_id);
      if (!order) return Object.freeze({ outcome: 'not-found', hold: null });
      const event = orderHoldAssignedEvent(emit, {
        order_id: order.id,
        order_number: order.order_number,
        hold_id: hold.id,
        hold_version: plan.version,
      });
      const statements = [
        outbox.guardedHoldEventStatement(event, {
          orderId: order.id, holdId: hold.id, holdStatus: 'active', holdVersion: hold.version,
        }),
        audit.eventStatement(event.event_id, assignedAudit(hold.version, plan.version)),
        ...holds.assignmentStatements({ hold, plan, eventId: event.event_id }),
      ];
      const applied = committed(await orders.commitResults(statements));
      return Object.freeze({
        outcome: applied ? 'applied' : 'conflict',
        hold: await holds.findById(hold.id),
      });
    },

    async resolve(input: ResolveOrderHoldInput): Promise<OrderHoldMutationResult> {
      const hold = await holds.findById(input.holdId);
      if (!hold) return Object.freeze({ outcome: 'not-found', hold: null });
      let plan;
      try {
        plan = planOrderHoldResolution(orderHoldSnapshot(hold), {
          expectedVersion: input.expectedVersion,
          resolutionCode: input.resolutionCode,
          resolvedAt: now(),
        });
      } catch {
        return Object.freeze({ outcome: 'conflict', hold });
      }
      const order = await orders.findOrderForTransition(hold.order_id);
      if (!order) return Object.freeze({ outcome: 'not-found', hold: null });
      const event = orderHoldResolvedEvent(emit, {
        order_id: order.id,
        order_number: order.order_number,
        hold_id: hold.id,
        resolution_code: plan.resolution_code,
        hold_version: plan.version,
      });
      const statements = [
        outbox.guardedHoldEventStatement(event, {
          orderId: order.id, holdId: hold.id, holdStatus: 'active', holdVersion: hold.version,
        }),
        audit.eventStatement(event.event_id, resolvedAudit(hold.version, plan.version)),
        ...holds.resolutionStatements({ hold, plan, eventId: event.event_id }),
      ];
      const applied = committed(await orders.commitResults(statements));
      return Object.freeze({
        outcome: applied ? 'applied' : 'conflict',
        hold: await holds.findById(hold.id),
      });
    },
  });
}

export type OrderHoldOperations = ReturnType<typeof createOrderHoldOperations>;
