import {
  createD1OrderBulkActions,
  createD1OrderHolds,
  createOrderBulkPreview,
  orderHoldCreatedEvent,
  planOrderHold,
  verifyOrderBulkPreview,
  type OrderBulkBatchRecord,
  type OrderBulkBatchRowRecord,
  type OrderBulkBatchView,
  type OrderBulkPreview,
} from '../modules/orders';
import { createD1EventOutboxWriter } from '../platform/events';
import {
  createD1JobRunRepository,
  executeJob,
  JOB_DESCRIPTORS,
  type JobExecutionResult,
} from '../platform/jobs';
import { createD1AuditLogWriter } from '../platform/operations';
import { createAuditDiff, createAuditEntry, serializeAuditDiff } from '../shared-kernel/audit';
import type { EmitEvent } from '../shared-kernel/events';
import { emitPlatformEvent } from './event-context';

const ADMIN_ACTOR = Object.freeze({ kind: 'admin', id: 'admin-panel', label: 'Panel de administración' } as const);
const BULK_JOB = JOB_DESCRIPTORS.find((job) => job.id === 'orders.execute-bulk-action');

type Dependencies = Readonly<{
  emit?: EmitEvent;
  now?: () => string;
}>;

type TagState = Readonly<{
  order_id: number;
  order_number: string;
  status: 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled';
  edit_version: number;
  tag_id: number | null;
  tag_slug: string | null;
  tag_label: string | null;
  tag_active: number | null;
  assigned: number;
  same_event: number;
}>;

type HoldState = Readonly<{
  order_id: number;
  order_number: string;
  status: 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled';
  edit_version: number;
  same_reason_count: number;
}>;

function auditValues(entry: ReturnType<typeof createAuditEntry>): readonly unknown[] {
  return [
    entry.audit_id, entry.occurred_at, entry.actor.kind, entry.actor.id,
    entry.actor.label ?? null, entry.action, entry.entity.type, entry.entity.id,
    entry.entity.reference ?? null, entry.correlation_id, entry.source_event_id,
    serializeAuditDiff(entry.diff), entry.occurred_at,
  ];
}

function allOrNone(results: readonly D1Result[], label: string): boolean {
  const changes = results.map((result) => result.meta.changes ?? 0);
  if (changes.every((change) => change === 1)) return true;
  if (changes.every((change) => change === 0)) return false;
  throw new Error(`${label} inconsistente: ${changes.join(',')}.`);
}

function tagEventId(batchId: string, orderId: number): string {
  return `bulk-tag:${batchId}:${orderId}`;
}

function holdId(batchId: string, orderId: number): string {
  return `bulk-hold:${batchId}:${orderId}`;
}

function batchIdFromJobKey(key: string): string {
  const match = /^orders\.bulk:(bulk_[0-9a-f]{32}):attempt:\d+$/u.exec(key);
  if (!match?.[1]) throw new Error('bulk-job-key-invalid');
  return match[1];
}

async function tagState(
  db: D1Database,
  batch: OrderBulkBatchRecord,
  row: OrderBulkBatchRowRecord,
): Promise<TagState | null> {
  return db.prepare(`SELECT
    o.id AS order_id, o.order_number, o.status, o.edit_version,
    t.id AS tag_id, t.slug AS tag_slug, t.label AS tag_label, t.active AS tag_active,
    CASE WHEN EXISTS (SELECT 1 FROM order_tag_assignments a
      WHERE a.order_id = o.id AND a.tag_id = t.id) THEN 1 ELSE 0 END AS assigned,
    CASE WHEN EXISTS (SELECT 1 FROM order_tag_events e WHERE e.id = ?) THEN 1 ELSE 0 END AS same_event
    FROM orders o LEFT JOIN order_tags t ON t.id = ?
    WHERE o.id = ?`).bind(tagEventId(batch.id, row.order_id), batch.tag_id, row.order_id).first<TagState>();
}

async function holdState(
  db: D1Database,
  batch: OrderBulkBatchRecord,
  row: OrderBulkBatchRowRecord,
): Promise<HoldState | null> {
  return db.prepare(`SELECT o.id AS order_id, o.order_number, o.status, o.edit_version,
    (SELECT count(*) FROM order_holds h WHERE h.order_id = o.id
      AND h.status = 'active' AND h.reason_code = ?) AS same_reason_count
    FROM orders o WHERE o.id = ?`).bind(batch.hold_reason_code, row.order_id).first<HoldState>();
}

export function createOrderBulkActionOperations(db: D1Database, dependencies: Dependencies = {}) {
  const bulk = createD1OrderBulkActions(db);
  const holds = createD1OrderHolds(db);
  const outbox = createD1EventOutboxWriter(db);
  const audit = createD1AuditLogWriter(db);
  const jobRuns = createD1JobRunRepository(db);
  const emit = dependencies.emit ?? emitPlatformEvent;
  const now = dependencies.now ?? (() => new Date().toISOString());

  const classifyTagNoop = async (
    batch: OrderBulkBatchRecord,
    row: OrderBulkBatchRowRecord,
  ): Promise<boolean> => {
    const state = await tagState(db, batch, row);
    const observedAt = now();
    if (!state) return bulk.markOutcome({
      batchId: batch.id, orderId: row.order_id, outcome: 'conflict',
      resultCode: 'order_not_found', now: observedAt,
    });
    if (state.same_event === 1) return bulk.markOutcome({
      batchId: batch.id, orderId: row.order_id, outcome: 'replayed',
      resultCode: 'replayed_same_batch', now: observedAt,
      evidence: { type: 'order_tag_event', id: tagEventId(batch.id, row.order_id) },
    });
    if (state.tag_id === null || state.tag_active !== 1) return bulk.markOutcome({
      batchId: batch.id, orderId: row.order_id, outcome: 'conflict',
      resultCode: 'tag_not_found', now: observedAt,
    });
    const desired = batch.action_type === 'add_tag' ? state.assigned === 1 : state.assigned === 0;
    if (desired) return bulk.markOutcome({
      batchId: batch.id, orderId: row.order_id, outcome: 'skipped',
      resultCode: batch.action_type === 'add_tag' ? 'already_applied' : 'already_absent', now: observedAt,
    });
    return false;
  };

  const processTag = async (batch: OrderBulkBatchRecord, row: OrderBulkBatchRowRecord): Promise<void> => {
    if (await classifyTagNoop(batch, row)) return;
    const state = await tagState(db, batch, row);
    if (!state || !state.tag_id || !state.tag_slug || !state.tag_label) {
      await bulk.markOutcome({
        batchId: batch.id, orderId: row.order_id, outcome: 'conflict',
        resultCode: 'precondition_changed', now: now(),
      });
      return;
    }
    const occurredAt = now();
    const eventId = tagEventId(batch.id, row.order_id);
    const assigning = batch.action_type === 'add_tag';
    const entry = createAuditEntry({ event_id: eventId, occurred_at: occurredAt }, {
      actor: ADMIN_ACTOR,
      action: assigning ? 'orders.tag_assigned' : 'orders.tag_removed',
      entity: { type: 'order', id: String(row.order_id), reference: state.order_number },
      correlation_id: batch.id,
      diff: createAuditDiff(
        { tag: assigning ? null : state.tag_slug },
        { tag: assigning ? state.tag_slug : null },
        ['tag'],
      ),
    });
    const existence = assigning ? 'NOT EXISTS' : 'EXISTS';
    const auditStatement = db.prepare(`INSERT INTO audit_log (
      audit_id, occurred_at, actor_kind, actor_id, actor_label, action,
      entity_type, entity_id, entity_reference, correlation_id,
      source_event_id, diff_json, created_at
    ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      FROM orders o JOIN order_tags t ON t.id = ? AND t.active = 1
      WHERE o.id = ? AND ${existence} (
        SELECT 1 FROM order_tag_assignments a WHERE a.order_id = o.id AND a.tag_id = t.id
      ) AND EXISTS (SELECT 1 FROM order_bulk_batch_rows r
        WHERE r.batch_id = ? AND r.order_id = o.id
          AND r.outcome IN ('pending', 'retryable_failure'))
      AND NOT EXISTS (SELECT 1 FROM audit_log WHERE audit_id = ?)`)
      .bind(...auditValues(entry), state.tag_id, row.order_id, batch.id, eventId);
    const assignment = assigning
      ? db.prepare(`INSERT INTO order_tag_assignments (
          order_id, tag_id, actor_kind, actor_id, actor_label, created_at
        ) SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM audit_log WHERE audit_id = ?)`)
          .bind(row.order_id, state.tag_id, ADMIN_ACTOR.kind, ADMIN_ACTOR.id, ADMIN_ACTOR.label, occurredAt, eventId)
      : db.prepare(`DELETE FROM order_tag_assignments WHERE order_id = ? AND tag_id = ?
          AND EXISTS (SELECT 1 FROM audit_log WHERE audit_id = ?)`)
          .bind(row.order_id, state.tag_id, eventId);
    const tagEvent = db.prepare(`INSERT INTO order_tag_events (
      id, order_id, tag_id, action, tag_slug_snapshot, tag_label_snapshot,
      actor_kind, actor_id, actor_label, created_at
    ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM audit_log WHERE audit_id = ?)`)
      .bind(
        eventId, row.order_id, state.tag_id, assigning ? 'assigned' : 'removed',
        state.tag_slug, state.tag_label, ADMIN_ACTOR.kind, ADMIN_ACTOR.id,
        ADMIN_ACTOR.label, occurredAt, eventId,
      );
    const rowResult = bulk.outcomeStatement({
      batchId: batch.id, orderId: row.order_id, outcome: 'applied',
      resultCode: 'applied', now: occurredAt,
      evidence: { type: 'order_tag_event', id: eventId },
      guardSql: 'AND EXISTS (SELECT 1 FROM order_tag_events WHERE id = ?)',
      guardValues: [eventId],
    });
    const applied = allOrNone(await db.batch([auditStatement, assignment, tagEvent, rowResult]), 'bulk-tag');
    if (!applied && !await classifyTagNoop(batch, row)) {
      await bulk.markOutcome({
        batchId: batch.id, orderId: row.order_id, outcome: 'conflict',
        resultCode: 'precondition_changed', now: now(),
      });
    }
  };

  const classifyHoldNoop = async (
    batch: OrderBulkBatchRecord,
    row: OrderBulkBatchRowRecord,
  ): Promise<boolean> => {
    const evidence = await holds.findByIdempotencyKey(row.idempotency_key);
    const observedAt = now();
    if (evidence) return bulk.markOutcome({
      batchId: batch.id, orderId: row.order_id,
      outcome: evidence.id === holdId(batch.id, row.order_id) ? 'replayed' : 'conflict',
      resultCode: evidence.id === holdId(batch.id, row.order_id) ? 'replayed_same_batch' : 'precondition_changed',
      now: observedAt,
      ...(evidence.id === holdId(batch.id, row.order_id)
        ? { evidence: { type: 'order_hold' as const, id: evidence.id } }
        : {}),
    });
    const state = await holdState(db, batch, row);
    if (!state) return bulk.markOutcome({
      batchId: batch.id, orderId: row.order_id, outcome: 'conflict',
      resultCode: 'order_not_found', now: observedAt,
    });
    if (!['pending', 'paid', 'shipped'].includes(state.status)) return bulk.markOutcome({
      batchId: batch.id, orderId: row.order_id, outcome: 'conflict',
      resultCode: 'status_not_supported', now: observedAt,
    });
    if (state.same_reason_count > 0) return bulk.markOutcome({
      batchId: batch.id, orderId: row.order_id, outcome: 'skipped',
      resultCode: 'active_hold_same_reason', now: observedAt,
    });
    if (!batch.hold_due_at || Date.parse(batch.hold_due_at) <= Date.parse(observedAt)) return bulk.markOutcome({
      batchId: batch.id, orderId: row.order_id, outcome: 'conflict',
      resultCode: 'hold_due_elapsed', now: observedAt,
    });
    return false;
  };

  const processHold = async (batch: OrderBulkBatchRecord, row: OrderBulkBatchRowRecord): Promise<void> => {
    if (await classifyHoldNoop(batch, row)) return;
    const state = await holdState(db, batch, row);
    if (!state || !batch.hold_reason_code || !batch.hold_owner_kind ||
        !batch.hold_owner_id || !batch.hold_owner_label || !batch.hold_due_at) {
      await bulk.markOutcome({
        batchId: batch.id, orderId: row.order_id, outcome: 'conflict',
        resultCode: 'precondition_changed', now: now(),
      });
      return;
    }
    const occurredAt = now();
    const id = holdId(batch.id, row.order_id);
    const plan = planOrderHold({
      source: 'manual',
      reasonCode: batch.hold_reason_code,
      owner: {
        kind: batch.hold_owner_kind,
        id: batch.hold_owner_id,
        label: batch.hold_owner_label,
      },
      createdAt: occurredAt,
      dueAt: batch.hold_due_at,
      idempotencyKey: row.idempotency_key,
    });
    const event = orderHoldCreatedEvent(emit, {
      order_id: state.order_id,
      order_number: state.order_number,
      hold_id: id,
      source: plan.source,
      reason_code: plan.reason_code,
      due_at: plan.due_at,
      hold_version: 1,
    });
    const rowResult = bulk.outcomeStatement({
      batchId: batch.id, orderId: row.order_id, outcome: 'applied',
      resultCode: 'applied', now: occurredAt,
      evidence: { type: 'order_hold', id },
      guardSql: 'AND EXISTS (SELECT 1 FROM order_holds WHERE id = ? AND idempotency_key = ?)',
      guardValues: [id, row.idempotency_key],
    });
    const statements = [
      outbox.guardedEventStatement(event, {
        orderId: state.order_id,
        expectedStatus: state.status,
        forbidActiveHoldReason: plan.reason_code,
        ignoreExistingIdempotencyKey: true,
      }),
      audit.eventStatement(event.event_id, {
        action: 'orders.hold_created',
        diff: createAuditDiff(
          { active: false, version: null },
          { active: true, version: 1 },
          ['active', 'version'],
        ),
      }),
      ...holds.createStatements({ id, orderId: state.order_id, plan, eventId: event.event_id }),
      rowResult,
    ];
    try {
      const applied = allOrNone(await db.batch(statements), 'bulk-hold');
      if (!applied && !await classifyHoldNoop(batch, row)) {
        await bulk.markOutcome({
          batchId: batch.id, orderId: row.order_id, outcome: 'conflict',
          resultCode: 'precondition_changed', now: now(),
        });
      }
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('UNIQUE constraint failed')) throw error;
      if (!await classifyHoldNoop(batch, row)) throw error;
    }
  };

  const processRow = async (batch: OrderBulkBatchRecord, row: OrderBulkBatchRowRecord): Promise<void> => {
    try {
      if (batch.action_type === 'create_hold') await processHold(batch, row);
      else await processTag(batch, row);
    } catch {
      await bulk.markFailure(batch.id, row.order_id, now());
    }
  };

  return Object.freeze({
    async preview(input: Readonly<{ orderIds: readonly number[]; action: OrderBulkPreview['action'] }>): Promise<OrderBulkPreview> {
      const observedAt = now();
      const expiresAt = new Date(Date.parse(observedAt) + 15 * 60_000).toISOString();
      return createOrderBulkPreview({
        orderIds: input.orderIds,
        candidates: await bulk.candidates(input.orderIds),
        action: input.action,
        observedAt,
        expiresAt,
      });
    },

    async confirm(previewInput: OrderBulkPreview): Promise<Readonly<{
      view: OrderBulkBatchView;
      created: boolean;
    }>> {
      const preview = await verifyOrderBulkPreview(previewInput);
      const observedAt = now();
      if (Date.parse(observedAt) >= Date.parse(preview.expiresAt)) throw new Error('El preview ha caducado.');
      const result = await bulk.createBatch(preview, observedAt);
      const view = await bulk.view(result.batch.id);
      if (!view) throw new Error('No se pudo leer el lote confirmado.');
      return Object.freeze({ view, created: result.created });
    },

    get(batchId: string): Promise<OrderBulkBatchView | null> {
      return bulk.view(batchId);
    },

    async executeBatch(batchId: string, runId: string, signal: AbortSignal): Promise<void> {
      if (!await bulk.claim(batchId, runId, now())) {
        const existing = await bulk.findBatch(batchId);
        if (existing?.status === 'completed' || existing?.status === 'completed_with_errors') return;
        throw new Error('bulk-batch-locked');
      }
      const batch = await bulk.findBatch(batchId);
      if (!batch) throw new Error('bulk-batch-not-found');
      while (!signal.aborted) {
        const rows = await bulk.pendingRows(batchId);
        if (rows.length === 0) break;
        await Promise.all(rows.map((row) => processRow(batch, row)));
      }
      if (signal.aborted) throw new Error('bulk-job-aborted');
      await bulk.finish(batchId, runId, now());
    },

    async prepareReplay(batchId: string): Promise<boolean> {
      const view = await bulk.view(batchId);
      if (!view) return false;
      if (view.batch.status === 'completed_with_errors') {
        return bulk.prepareReplay(batchId, now());
      }
      if (view.batch.status !== 'running' || !view.batch.execution_run_id || view.progress.pending === 0) {
        return false;
      }
      const run = await db.prepare(`SELECT status FROM platform_job_runs WHERE run_id = ?`)
        .bind(view.batch.execution_run_id)
        .first<{ status: 'pending' | 'running' | 'succeeded' | 'dead' }>();
      if (run?.status === 'pending') return true;
      if (run?.status === 'dead') return jobRuns.replayDead(view.batch.execution_run_id, now());
      return false;
    },

    purgeTerminal(cutoff: string, limit?: number): Promise<number> {
      return bulk.purgeTerminal(cutoff, limit);
    },
  });
}

export async function runOrderBulkActionJob(
  db: D1Database,
  batchId: string,
  dependencies: Dependencies = {},
): Promise<JobExecutionResult> {
  if (!BULK_JOB) throw new Error('orders.execute-bulk-action no está registrado.');
  const operations = createOrderBulkActionOperations(db, dependencies);
  const batch = await operations.get(batchId);
  if (!batch) throw new Error('Lote no encontrado.');
  const scheduledFor = dependencies.now?.() ?? new Date().toISOString();
  return executeJob(
    db,
    BULK_JOB,
    {
      triggerKind: 'one-off',
      scheduledFor,
      idempotencyKey: `orders.bulk:${batchId}:attempt:${batch.batch.replay_count}`,
    },
    async (run, signal) => {
      await operations.executeBatch(batchIdFromJobKey(run.idempotencyKey), run.runId, signal);
    },
    { now: scheduledFor, clock: () => new Date(dependencies.now?.() ?? new Date().toISOString()) },
  );
}

export type OrderBulkActionOperations = ReturnType<typeof createOrderBulkActionOperations>;
