import {
  canonicalSegmentJson, CustomerSegmentationContractError, segmentFingerprint,
  segmentInteger, segmentOpaqueId, segmentRecord, segmentTimestamp,
  MAX_CUSTOMER_SEGMENT_CANDIDATES,
} from '../application/customer-segmentation-contract';
import { defineCustomerSegmentFactsPolicy } from '../application/customer-segmentation-facts';
import {
  CUSTOMER_SEGMENT_STEP_JOB_ID,
  type CustomerSegmentExecutionPlan, type CustomerSegmentExecutionStore,
  type CustomerSegmentJobIntent, type RegisteredCustomerSegmentFactsPolicy,
} from '../application/customer-segment-execution-store';
import type { SegmentCommandContext, SegmentWrite } from '../application/customer-segmentation-repository';
import { CustomerSegmentationConflictError } from './d1-customer-segmentation-repository';

type Row = Record<string, unknown>;
const POLICIES = 'customer_segment_facts_policies';
const PLANS = 'customer_segment_execution_plans';
const INTENTS = 'customer_segment_job_intents';
const LAST_CANONICAL_TIMESTAMP = 253_402_300_799_999;

function invalid(message: string): never { throw new CustomerSegmentationContractError(message); }
function conflict(): never { throw new CustomerSegmentationConflictError(); }
function policyName(value: unknown): string {
  const parsed = segmentOpaqueId(value, 'policyId');
  if (!/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u.test(parsed)) invalid('policyId no es canónico.');
  return parsed;
}
function jobId(value: unknown): string {
  const parsed = segmentOpaqueId(value, 'jobRunId');
  if (parsed.length > 128) invalid('jobRunId supera el límite de la plataforma.');
  return parsed;
}
function digest(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value)) invalid('Huella persistida inválida.');
  return value;
}
function scheduled(value: unknown): string {
  // Una programación explícita puede ser futura o estar atrasada.
  return segmentTimestamp(value, LAST_CANONICAL_TIMESTAMP, 'scheduledFor');
}
function storageConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : '';
  return /customer_segment_(?:policy_conflict|plan_conflict|intent_conflict|job_conflict)/u.test(message) ||
    /UNIQUE constraint failed: (?:customer_segment_(?:facts_policies|execution_plans|job_intents)|platform_job_runs)\./u.test(message);
}

/** Persistencia R5.6c.3. No compone jobs, rutas, cron, publicación ni políticas reales. */
export function createD1CustomerSegmentExecutionStore(
  db: D1Database,
  options: Readonly<{ now?: () => number; newId?: () => string }> = {},
): CustomerSegmentExecutionStore {
  const now = options.now ?? Date.now;
  const newId = options.newId ?? (() => crypto.randomUUID());
  const clock = () => {
    const value = now();
    if (typeof value !== 'number' || !Number.isFinite(new Date(value).getTime())) invalid('Reloj inválido.');
    return value;
  };
  const at = (value: unknown, field: string) => segmentTimestamp(value, clock(), field);
  function context(row: Row): SegmentCommandContext {
    const idempotencyKey = segmentOpaqueId(row.idempotencyKey, 'idempotencyKey');
    if (idempotencyKey.length < 8) invalid('idempotencyKey debe tener al menos ocho caracteres.');
    return Object.freeze({ actorId: segmentOpaqueId(row.actorId, 'actorId'), idempotencyKey,
      occurredAt: at(row.occurredAt, 'occurredAt') });
  }
  function storedContext(row: Row): SegmentCommandContext {
    return context({ actorId: row.created_by, idempotencyKey: row.idempotency_key, occurredAt: row.created_at });
  }
  function evidence(ctx: SegmentCommandContext, fingerprint: string) {
    return { createdAt: ctx.occurredAt, createdBy: ctx.actorId,
      idempotencyKey: ctx.idempotencyKey, commandFingerprint: fingerprint };
  }
  function columns(ctx: SegmentCommandContext, fingerprint: string): Row {
    return { created_at: ctx.occurredAt, created_by: ctx.actorId,
      idempotency_key: ctx.idempotencyKey, command_fingerprint: fingerprint };
  }
  function insert(table: string, row: Row): D1PreparedStatement {
    const names = Object.keys(row);
    return db.prepare(`INSERT INTO ${table} (${names.join(',')}) VALUES (${names.map(() => '?').join(',')})`)
      .bind(...names.map((name) => row[name]));
  }
  const byKey = (table: string, key: string, scope?: string) => db.prepare(
    `SELECT * FROM ${table} WHERE idempotency_key=?${scope === undefined ? '' : ' AND policy_id=?'}`,
  ).bind(...(scope === undefined ? [key] : [key, scope])).first<Row>();
  async function replay<T>(table: string, ctx: SegmentCommandContext, fingerprint: string,
    view: (row: Row) => Promise<T>, scope?: string): Promise<T | null> {
    const row = await byKey(table, ctx.idempotencyKey, scope);
    if (!row) return null;
    if (row.command_fingerprint !== fingerprint) conflict();
    return view(row);
  }
  async function write<T>(table: string, ctx: SegmentCommandContext, fingerprint: string,
    statements: D1PreparedStatement[], view: (row: Row) => Promise<T>, scope?: string): Promise<SegmentWrite<T>> {
    try {
      const results = await db.batch(statements);
      if (results.length !== statements.length || results.some((result) => !result.success || result.meta.changes !== 1)) {
        throw new Error('La escritura de ejecución no confirmó todas sus filas.');
      }
    } catch (error) {
      // Ni una lectura posterior prueba qué ocurrió durante un fallo de transporte.
      if (!storageConflict(error)) throw error;
      const previous = await replay(table, ctx, fingerprint, view, scope);
      if (previous) return Object.freeze({ outcome: 'replayed', value: previous });
      return conflict();
    }
    const value = await replay(table, ctx, fingerprint, view, scope);
    if (!value) throw new Error('Falta la evidencia durable de ejecución.');
    return Object.freeze({ outcome: 'applied', value });
  }
  async function policyView(row: Row): Promise<RegisteredCustomerSegmentFactsPolicy> {
    if (typeof row.policy_json !== 'string') invalid('La política persistida no contiene JSON.');
    let parsed: unknown;
    try { parsed = JSON.parse(row.policy_json); } catch { return invalid('JSON persistido de política inválido.'); }
    const policy = defineCustomerSegmentFactsPolicy(parsed);
    const fingerprint = digest(row.policy_fingerprint);
    const ctx = storedContext(row);
    const commandFingerprint = digest(row.command_fingerprint);
    if (policy.id !== policyName(row.policy_id) || policy.version !== segmentInteger(row.policy_version, 1, 'policyVersion') ||
      canonicalSegmentJson(policy) !== row.policy_json || await segmentFingerprint(policy) !== fingerprint ||
      await segmentFingerprint({ operation: 'register_policy', policy, ...ctx }) !== commandFingerprint) {
      invalid('La política persistida no acredita su contenido o comando.');
    }
    return Object.freeze({ policy, fingerprint, ...evidence(ctx, commandFingerprint) });
  }
  async function readPolicy(policyId: string, policyVersion: number) {
    policyId = policyName(policyId); policyVersion = segmentInteger(policyVersion, 1, 'policyVersion');
    const row = await db.prepare(`SELECT * FROM ${POLICIES} WHERE policy_id=? AND policy_version=?`)
      .bind(policyId, policyVersion).first<Row>();
    return row ? policyView(row) : null;
  }
  const runState = (runId: string, revision?: number) => db.prepare(`
    SELECT r.requested_at, s.revision, s.state, s.recorded_at
    FROM customer_segment_runs r JOIN customer_segment_run_snapshots s ON s.run_id=r.run_id
    WHERE r.run_id=? ${revision === undefined ? '' : 'AND s.revision=?'} ORDER BY s.revision DESC LIMIT 1
  `).bind(...(revision === undefined ? [runId] : [runId, revision])).first<Row>();
  async function planView(row: Row): Promise<CustomerSegmentExecutionPlan> {
    const runId = segmentOpaqueId(row.run_id, 'runId');
    const policyId = policyName(row.policy_id);
    const policyVersion = segmentInteger(row.policy_version, 1, 'policyVersion');
    const batchSize = segmentInteger(row.batch_size, 1, 'batchSize');
    if (batchSize > MAX_CUSTOMER_SEGMENT_CANDIDATES) invalid('Lote persistido fuera del límite.');
    const ctx = storedContext(row);
    const commandFingerprint = digest(row.command_fingerprint);
    const policy = await readPolicy(policyId, policyVersion);
    const initial = await runState(runId, 1);
    if (!policy || !initial || initial.state !== 'requested' ||
      ctx.occurredAt < at(initial.requested_at, 'requestedAt') ||
      ctx.occurredAt < at(initial.recorded_at, 'recordedAt') || ctx.occurredAt < policy.createdAt) {
      invalid('El plan persistido no acredita su solicitud y política.');
    }
    const value = { runId, policyId, policyVersion, policyFingerprint: policy.fingerprint, batchSize };
    if (await segmentFingerprint({ operation: 'attach_plan', ...value, ...ctx }) !== commandFingerprint) {
      invalid('El plan persistido no acredita su comando.');
    }
    return Object.freeze({ ...value, ...evidence(ctx, commandFingerprint) });
  }
  async function readPlan(runId: string) {
    runId = segmentOpaqueId(runId, 'runId');
    const row = await db.prepare(`SELECT * FROM ${PLANS} WHERE run_id=?`).bind(runId).first<Row>();
    return row ? planView(row) : null;
  }
  async function intentView(row: Row): Promise<CustomerSegmentJobIntent> {
    const jobRunId = jobId(row.job_run_id);
    const runId = segmentOpaqueId(row.run_id, 'runId');
    const expectedRevision = segmentInteger(row.expected_revision, 1, 'expectedRevision');
    const scheduledFor = scheduled(row.scheduled_for);
    const ctx = storedContext(row);
    const commandFingerprint = digest(row.command_fingerprint);
    const plan = await readPlan(runId);
    const revision = await runState(runId, expectedRevision);
    if (!plan || !revision || (revision.state !== 'requested' && revision.state !== 'running') ||
      ctx.occurredAt < plan.createdAt || ctx.occurredAt < at(revision.recorded_at, 'recordedAt') ||
      await segmentFingerprint({ operation: 'enqueue_step', runId, expectedRevision, scheduledFor, ...ctx }) !== commandFingerprint) {
      invalid('La intención persistida no acredita su plan, revisión o comando.');
    }
    return Object.freeze({ jobRunId, runId, expectedRevision, scheduledFor, ...evidence(ctx, commandFingerprint) });
  }
  async function readJobIntent(jobRunId: string) {
    jobRunId = jobId(jobRunId);
    const row = await db.prepare(`SELECT * FROM ${INTENTS} WHERE job_run_id=?`).bind(jobRunId).first<Row>();
    return row ? intentView(row) : null;
  }
  function queueInsert(intent: CustomerSegmentJobIntent): D1PreparedStatement {
    return insert('platform_job_runs', { run_id: intent.jobRunId, job_id: CUSTOMER_SEGMENT_STEP_JOB_ID,
      trigger_kind: 'one-off', scheduled_for: intent.scheduledFor, idempotency_key: intent.idempotencyKey,
      status: 'pending', attempt_count: 0, replay_count: 0, available_at: intent.scheduledFor,
      created_at: intent.createdAt, updated_at: intent.createdAt });
  }
  async function assertCurrent(intent: Pick<CustomerSegmentJobIntent, 'runId' | 'expectedRevision'>) {
    const current = await runState(intent.runId);
    if (!current || current.revision !== intent.expectedRevision || (current.state !== 'requested' && current.state !== 'running')) conflict();
    return current;
  }
  async function existingQueue(intent: CustomerSegmentJobIntent): Promise<boolean> {
    const row = await db.prepare(`SELECT run_id, job_id, trigger_kind, scheduled_for, idempotency_key, created_at
      FROM platform_job_runs WHERE run_id=? OR idempotency_key=?`)
      .bind(intent.jobRunId, intent.idempotencyKey).all<Row>();
    if (!row.results.length) return false;
    if (row.results.length !== 1) conflict();
    const job = row.results[0]!;
    if (job.run_id !== intent.jobRunId || job.job_id !== CUSTOMER_SEGMENT_STEP_JOB_ID || job.trigger_kind !== 'one-off' ||
      job.scheduled_for !== intent.scheduledFor || job.idempotency_key !== intent.idempotencyKey || job.created_at !== intent.createdAt) conflict();
    return true;
  }

  return {
    readPolicy, readPlan, readJobIntent,
    async registerPolicy(input) {
      const row = segmentRecord(input, ['actorId', 'idempotencyKey', 'occurredAt', 'policy'], 'command');
      const ctx = context(row);
      const policy = defineCustomerSegmentFactsPolicy(row.policy);
      // Todos los datos del llamador quedan copiados antes del primer await.
      const [fingerprint, commandFingerprint] = await Promise.all([
        segmentFingerprint(policy), segmentFingerprint({ operation: 'register_policy', policy, ...ctx }),
      ]);
      const previous = await replay(POLICIES, ctx, commandFingerprint, policyView, policy.id);
      if (previous) return Object.freeze({ outcome: 'replayed', value: previous });
      return write(POLICIES, ctx, commandFingerprint, [insert(POLICIES, {
        policy_id: policy.id, policy_version: policy.version, policy_json: canonicalSegmentJson(policy),
        policy_fingerprint: fingerprint, ...columns(ctx, commandFingerprint),
      })], policyView, policy.id);
    },
    async attachPlan(input) {
      const row = segmentRecord(input, ['actorId', 'idempotencyKey', 'occurredAt', 'runId', 'policyId', 'policyVersion', 'batchSize'], 'command');
      const ctx = context(row);
      const runId = segmentOpaqueId(row.runId, 'runId');
      const policyId = policyName(row.policyId);
      const policyVersion = segmentInteger(row.policyVersion, 1, 'policyVersion');
      const batchSize = segmentInteger(row.batchSize, 1, 'batchSize');
      if (batchSize > MAX_CUSTOMER_SEGMENT_CANDIDATES) invalid('batchSize supera el límite técnico.');
      const policy = await readPolicy(policyId, policyVersion);
      if (!policy) return conflict();
      const fingerprint = await segmentFingerprint({ operation: 'attach_plan', runId, policyId, policyVersion,
        policyFingerprint: policy.fingerprint, batchSize, ...ctx });
      const previous = await replay(PLANS, ctx, fingerprint, planView);
      if (previous) return Object.freeze({ outcome: 'replayed', value: previous });
      const current = await runState(runId);
      if (!current || current.state !== 'requested') return conflict();
      if (ctx.occurredAt < at(current.requested_at, 'requestedAt') ||
        ctx.occurredAt < at(current.recorded_at, 'recordedAt') || ctx.occurredAt < policy.createdAt) {
        invalid('El plan precede a su solicitud, fotografía inicial o política.');
      }
      return write(PLANS, ctx, fingerprint, [insert(PLANS, {
        run_id: runId, policy_id: policyId, policy_version: policyVersion, batch_size: batchSize, ...columns(ctx, fingerprint),
      })], planView);
    },
    async enqueueStep(input) {
      const row = segmentRecord(input, ['actorId', 'idempotencyKey', 'occurredAt', 'runId', 'expectedRevision', 'scheduledFor'], 'command');
      const ctx = context(row);
      const runId = segmentOpaqueId(row.runId, 'runId');
      const expectedRevision = segmentInteger(row.expectedRevision, 1, 'expectedRevision');
      const scheduledFor = scheduled(row.scheduledFor);
      const fingerprint = await segmentFingerprint({ operation: 'enqueue_step', runId, expectedRevision, scheduledFor, ...ctx });
      const previous = await replay(INTENTS, ctx, fingerprint, intentView);
      // El replay devuelve evidencia histórica, sin recrear una cola purgada.
      if (previous) return Object.freeze({ outcome: 'replayed', value: previous });
      const plan = await readPlan(runId);
      if (!plan) return conflict();
      const current = await assertCurrent({ runId, expectedRevision });
      if (ctx.occurredAt < plan.createdAt || ctx.occurredAt < at(current.recorded_at, 'recordedAt')) invalid('La intención precede a su plan o revisión.');
      const intent = Object.freeze({ jobRunId: jobId(`segment-job:${newId()}`), runId, expectedRevision,
        scheduledFor, ...evidence(ctx, fingerprint) });
      return write(INTENTS, ctx, fingerprint, [insert(INTENTS, {
        job_run_id: intent.jobRunId, run_id: runId, expected_revision: expectedRevision, scheduled_for: scheduledFor,
        ...columns(ctx, fingerprint),
      }), queueInsert(intent)], intentView);
    },
    async recoverStep(input) {
      const row = segmentRecord(input, ['jobRunId'], 'recovery');
      const jobRunId = jobId(row.jobRunId);
      clock();
      const intent = await readJobIntent(jobRunId);
      if (!intent) return conflict();
      if (await existingQueue(intent)) return Object.freeze({ outcome: 'replayed', value: intent });
      await assertCurrent(intent);
      try {
        const results = await db.batch([queueInsert(intent)]);
        if (results.length !== 1 || !results[0]!.success || results[0]!.meta.changes !== 1) {
          throw new Error('La recuperación de ejecución no confirmó su fila.');
        }
      } catch (error) {
        if (!storageConflict(error)) throw error;
        if (await existingQueue(intent)) return Object.freeze({ outcome: 'replayed', value: intent });
        return conflict();
      }
      if (!await existingQueue(intent)) throw new Error('Falta la evidencia de recuperación de ejecución.');
      return Object.freeze({ outcome: 'applied', value: intent });
    },
  };
}
