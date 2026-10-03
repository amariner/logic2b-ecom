import { describe, expect, it, vi } from 'vitest';
import { SqliteD1 } from './sqlite-d1';
import { createD1CustomerSegmentExecutionStore } from '../src/modules/customers/infrastructure/d1-customer-segment-execution-store';
import { createD1CustomerSegmentationRepository, CustomerSegmentationConflictError } from '../src/modules/customers/infrastructure/d1-customer-segmentation-repository';
import { canonicalSegmentJson, CustomerSegmentationContractError, segmentFingerprint } from '../src/modules/customers/application/customer-segmentation-contract';
import { defineCustomerSegmentFactsPolicy, type CustomerSegmentFactsPolicy } from '../src/modules/customers/application/customer-segmentation-facts';
import { CUSTOMER_SEGMENT_STEP_JOB_ID } from '../src/modules/customers/application/customer-segment-execution-store';
import type { CustomerSegmentTemplate } from '../src/modules/customers/domain/customer-segmentation';

const AT = '2026-10-03T10:00:00.000Z';
const BEFORE = '2026-10-03T09:00:00.000Z';
const AFTER = '2026-10-03T11:00:00.000Z';
const policy: CustomerSegmentFactsPolicy = {
  schemaVersion: 1, id: 'test.only', version: 1, population: 'active_profiles',
  orderStatuses: ['paid', 'shipped', 'delivered'], orderEligibility: 'successful_capture',
  activityBasis: 'last_successful_capture', amountBasis: 'captured_payments', refunds: 'subtract',
  storedValue: 'include', paymentAdjustments: 'reject', unsettledPayments: 'reject',
  missingPaymentEvidence: 'null', currency: 'EUR', foreignCurrency: 'exclude_orders', dayBoundary: 'elapsed_24h_floor',
};
const template: CustomerSegmentTemplate = {
  id: 'synthetic-only', version: 1, parameters: [{ name: 'minimum', min: 0, max: 100 }],
  conditions: [{ fact: 'orders.count', operator: 'gte', parameter: 'minimum' }],
};
const ctx = (key: string, occurredAt = AT) => ({ actorId: 'system:test', idempotencyKey: `execution-test:${key}`, occurredAt });
function intercept(db: SqliteD1, batch: D1Database['batch']): D1Database {
  return { prepare: db.prepare.bind(db), batch } as unknown as D1Database;
}
function fixture() {
  const db = new SqliteD1();
  let sequence = 0;
  const options = { now: () => Date.parse(AFTER), newId: () => `test-${++sequence}` };
  const store = createD1CustomerSegmentExecutionStore(db.asD1(), options);
  const repo = createD1CustomerSegmentationRepository(db.asD1(), options);
  const registration = { ...ctx('policy'), policy };
  const definition = { ...ctx('definition'), segmentId: 'synthetic', expectedVersion: 0, template, parameters: { minimum: 1 } };
  async function requested(key = 'request') {
    await repo.appendDefinition(definition);
    return (await repo.requestRun({ ...ctx(key), segmentId: 'synthetic', definitionVersion: 1 })).value;
  }
  async function ready(key = 'request') {
    const registered = (await store.registerPolicy(registration)).value;
    const run = await requested(key);
    const attachment = { ...ctx(`plan-${key}`), runId: run.runId, policyId: policy.id, policyVersion: policy.version, batchSize: 2 };
    const plan = (await store.attachPlan(attachment)).value;
    const enqueue = { ...ctx(`enqueue-${key}`), runId: run.runId, expectedRevision: 1, scheduledFor: AT };
    return { registered, run, attachment, plan, enqueue };
  }
  async function start(runId: string, fingerprint: string) {
    const content = { policyId: policy.id, policyVersion: policy.version, capturedAt: AT, currency: policy.currency, candidates: [] };
    const snapshot = { ...content, ref: `source:${fingerprint}:${await segmentFingerprint(content)}` };
    return repo.startRun({ ...ctx(`start-${runId}`), runId, expectedRevision: 1, snapshot });
  }
  return { db, store, repo, options, registration, definition, requested, ready, start };
}

describe('almacén durable de ejecución R5.6c.3', () => {
  it('registra reglas explícitas inmutables sin activar consumidor, cola ni publicación', async () => {
    const { db, store, registration } = fixture();
    const registered = await store.registerPolicy(registration);
    expect(registered.outcome).toBe('applied');
    expect(registered.value).toMatchObject({ policy, fingerprint: await segmentFingerprint(defineCustomerSegmentFactsPolicy(policy)), createdAt: AT, createdBy: 'system:test' });
    expect(Object.isFrozen(registered.value)).toBe(true);
    expect(Object.isFrozen(registered.value.policy.orderStatuses)).toBe(true);
    expect(db.value('SELECT policy_json AS value FROM customer_segment_facts_policies')).toBe(canonicalSegmentJson(policy));
    await expect(store.readPolicy(policy.id, policy.version)).resolves.toEqual(registered.value);
    await expect(store.registerPolicy(registration)).resolves.toEqual({ outcome: 'replayed', value: registered.value });
    for (const table of ['customer_segment_execution_plans', 'customer_segment_job_intents', 'platform_job_runs', 'customer_segment_publications']) {
      expect(db.value(`SELECT count(*) AS value FROM ${table}`)).toBe(0);
    }
    expect(JSON.stringify(registered.value)).not.toContain('@');
  });

  it('admite versiones explícitas no consecutivas y claves de registro acotadas a cada política', async () => {
    const { store, registration } = fixture();
    await store.registerPolicy(registration);
    await expect(store.registerPolicy({ ...registration, ...ctx('version-seven'), policy: { ...policy, version: 7 } })).resolves.toMatchObject({ value: { policy: { version: 7 } } });
    await expect(store.registerPolicy({ ...registration, policy: { ...policy, id: 'another.only' } })).resolves.toMatchObject({ outcome: 'applied' });
    await expect(store.readPolicy(policy.id, 2)).resolves.toBeNull();
  });

  it('rechaza cambios de reglas, contexto o versión bajo identidades y claves utilizadas', async () => {
    const { store, registration } = fixture();
    await store.registerPolicy(registration);
    for (const command of [
      { ...registration, policy: { ...policy, refunds: 'ignore' as const } },
      { ...registration, policy: { ...policy, version: 2 } },
      { ...registration, ...ctx('different-command') },
      { ...registration, actorId: 'system:other' },
      { ...registration, occurredAt: AFTER },
    ]) await expect(store.registerPolicy(command)).rejects.toBeInstanceOf(CustomerSegmentationConflictError);
  });

  it('serializa registros idénticos concurrentes y conserva un ganador ante políticas incompatibles', async () => {
    const { store, registration, db } = fixture();
    const identical = await Promise.all([store.registerPolicy(registration), store.registerPolicy(registration)]);
    expect(identical.map((write) => write.outcome).sort()).toEqual(['applied', 'replayed']);
    const competing = await Promise.allSettled([
      store.registerPolicy({ ...ctx('race-left'), policy: { ...policy, version: 2 } }),
      store.registerPolicy({ ...ctx('race-right'), policy: { ...policy, version: 2, refunds: 'ignore' } }),
    ]);
    expect(competing.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(competing.filter((result) => result.status === 'rejected')).toMatchObject([{ reason: { code: 'customer_segmentation_conflict' } }]);
    expect(db.value('SELECT count(*) AS value FROM customer_segment_facts_policies')).toBe(2);
  });

  it('congela política, plan e intención antes de cualquier continuación asíncrona', async () => {
    const { store, requested, db } = fixture();
    const input = { ...ctx('mutable-policy'), policy: { ...policy, orderStatuses: [...policy.orderStatuses] } };
    const registering = store.registerPolicy(input);
    input.actorId = 'system:changed'; input.policy.currency = 'USD'; input.policy.orderStatuses.length = 0;
    const registered = (await registering).value;
    expect(registered.policy).toEqual(policy);
    expect(registered.createdBy).toBe('system:test');
    const run = await requested();
    const attachment = { ...ctx('mutable-plan'), runId: run.runId, policyId: policy.id, policyVersion: 1, batchSize: 2 };
    const attaching = store.attachPlan(attachment);
    attachment.batchSize = 100; attachment.policyId = 'changed'; attachment.runId = 'changed'; attachment.actorId = 'system:changed';
    expect((await attaching).value).toMatchObject({ runId: run.runId, policyId: policy.id, batchSize: 2, createdBy: 'system:test' });
    const enqueue = { ...ctx('mutable-intent'), runId: run.runId, expectedRevision: 1, scheduledFor: AT };
    const enqueuing = store.enqueueStep(enqueue);
    enqueue.runId = 'changed'; enqueue.expectedRevision = 5; enqueue.scheduledFor = AFTER; enqueue.actorId = 'system:changed';
    expect((await enqueuing).value).toMatchObject({ runId: run.runId, expectedRevision: 1, scheduledFor: AT, createdBy: 'system:test' });
    expect(db.value('SELECT scheduled_for AS value FROM platform_job_runs')).toBe(AT);
  });

  it('fija plan antes de capturar y conserva replay histórico tras completar', async () => {
    const { store, repo, ready, start, db } = fixture();
    const { run, registered, attachment, plan, enqueue } = await ready();
    const intent = await store.enqueueStep(enqueue);
    await start(run.runId, registered.fingerprint);
    await repo.completeRun({ ...ctx('complete'), runId: run.runId, expectedRevision: 2 });
    await expect(store.attachPlan(attachment)).resolves.toEqual({ outcome: 'replayed', value: plan });
    await expect(store.enqueueStep(enqueue)).resolves.toEqual({ outcome: 'replayed', value: intent.value });
    await expect(store.readPlan(run.runId)).resolves.toEqual(plan);
    await expect(store.readJobIntent(intent.value.jobRunId)).resolves.toEqual(intent.value);
    await expect(store.attachPlan({ ...attachment, batchSize: 3 })).rejects.toBeInstanceOf(CustomerSegmentationConflictError);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
    expect(db.value('SELECT count(*) AS value FROM customer_segment_publications')).toBe(0);
  });

  it('rechaza plan sin política o solicitud y no atribuye reglas después del inicio', async () => {
    const { store, repo, requested, registration } = fixture();
    const run = await requested();
    const command = { ...ctx('plan'), runId: run.runId, policyId: policy.id, policyVersion: 1, batchSize: 1 };
    await expect(store.attachPlan(command)).rejects.toBeInstanceOf(CustomerSegmentationConflictError);
    await store.registerPolicy(registration);
    await expect(store.attachPlan({ ...command, runId: 'segment-run:missing' })).rejects.toBeInstanceOf(CustomerSegmentationConflictError);
    await repo.startRun({ ...ctx('historic-start'), runId: run.runId, expectedRevision: 1,
      snapshot: { ref: 'source:historic', policyId: policy.id, policyVersion: 1, capturedAt: AT, currency: 'EUR', candidates: [] } });
    await expect(store.attachPlan(command)).rejects.toBeInstanceOf(CustomerSegmentationConflictError);
  });

  it('no acepta planes ni intenciones anteriores a sus dependencias', async () => {
    const { store, requested, registration, ready } = fixture();
    await store.registerPolicy(registration);
    const run = await requested('late-request');
    await expect(store.attachPlan({ ...ctx('early-plan', BEFORE), runId: run.runId, policyId: policy.id, policyVersion: 1, batchSize: 1 })).rejects.toBeInstanceOf(CustomerSegmentationContractError);
    const { enqueue } = await ready();
    await expect(store.enqueueStep({ ...enqueue, occurredAt: BEFORE })).rejects.toBeInstanceOf(CustomerSegmentationContractError);
  });

  it('serializa planes del mismo run sin sobrescribir la decisión ganadora', async () => {
    const { store, registration, requested } = fixture();
    await store.registerPolicy(registration);
    const run = await requested();
    const command = { ...ctx('plan-race'), runId: run.runId, policyId: policy.id, policyVersion: 1, batchSize: 1 };
    const exact = await Promise.all([store.attachPlan(command), store.attachPlan(command)]);
    expect(exact.map((write) => write.outcome).sort()).toEqual(['applied', 'replayed']);
    await expect(store.attachPlan({ ...command, ...ctx('other-plan'), batchSize: 2 })).rejects.toBeInstanceOf(CustomerSegmentationConflictError);
  });

  it('comprueba la fecha de la fotografía inicial al escribir y al leer un plan', async () => {
    const first = fixture();
    await first.store.registerPolicy(first.registration);
    const requested = await first.requested();
    // Simula una fotografía histórica cuya grabación fue posterior a la solicitud.
    first.db.sqlite.exec('DROP TRIGGER customer_segment_run_snapshots_update_guard');
    first.db.sqlite.prepare('UPDATE customer_segment_run_snapshots SET recorded_at=? WHERE run_id=?').run(AFTER, requested.runId);
    const command = { ...ctx('recorded-plan'), runId: requested.runId, policyId: policy.id, policyVersion: 1, batchSize: 1 };
    await expect(first.store.attachPlan(command)).rejects.toBeInstanceOf(CustomerSegmentationContractError);
    await expect(first.store.attachPlan({ ...command, occurredAt: AFTER })).resolves.toMatchObject({ outcome: 'applied' });

    const second = fixture();
    const { run } = await second.ready();
    second.db.sqlite.exec('DROP TRIGGER customer_segment_run_snapshots_update_guard');
    second.db.sqlite.prepare('UPDATE customer_segment_run_snapshots SET recorded_at=? WHERE run_id=?').run(AFTER, run.runId);
    await expect(second.store.readPlan(run.runId)).rejects.toBeInstanceOf(CustomerSegmentationContractError);
  });

  it('encola intención y pending limpio en un único batch y acepta programación futura o atrasada', async () => {
    const { ready, db, options } = fixture();
    const { enqueue } = await ready();
    const batches: number[] = [];
    const database = intercept(db, async (statements) => { batches.push(statements.length); return db.batch(statements); });
    const store = createD1CustomerSegmentExecutionStore(database, options);
    const intent = (await store.enqueueStep({ ...enqueue, scheduledFor: '2027-01-01T00:00:00.000Z' })).value;
    expect(batches).toEqual([2]);
    expect(db.query('SELECT * FROM platform_job_runs')).toMatchObject([{
      run_id: intent.jobRunId, job_id: CUSTOMER_SEGMENT_STEP_JOB_ID, trigger_kind: 'one-off',
      idempotency_key: intent.idempotencyKey, scheduled_for: intent.scheduledFor, available_at: intent.scheduledFor,
      status: 'pending', attempt_count: 0, replay_count: 0, locked_at: null, lock_expires_at: null,
      locked_by: null, completed_at: null, dead_at: null, last_error_code: null, last_error_message: null,
      created_at: AT, updated_at: AT,
    }]);
    const second = await ready('another-request');
    await expect(store.enqueueStep({ ...second.enqueue, scheduledFor: BEFORE })).resolves.toMatchObject({ outcome: 'applied' });
  });

  it('serializa encolados idénticos y rechaza distinto comando para la misma revisión', async () => {
    const { store, ready, db } = fixture();
    const { enqueue } = await ready();
    const writes = await Promise.all([store.enqueueStep(enqueue), store.enqueueStep(enqueue)]);
    expect(writes.map((write) => write.outcome).sort()).toEqual(['applied', 'replayed']);
    expect(writes[0]!.value).toEqual(writes[1]!.value);
    for (const command of [
      { ...enqueue, ...ctx('different-intent') }, { ...enqueue, scheduledFor: AFTER },
      { ...enqueue, actorId: 'system:other' }, { ...enqueue, expectedRevision: 2 },
    ]) await expect(store.enqueueStep(command)).rejects.toBeInstanceOf(CustomerSegmentationConflictError);
    expect(db.value('SELECT count(*) AS value FROM customer_segment_job_intents')).toBe(1);
    expect(db.value('SELECT count(*) AS value FROM platform_job_runs')).toBe(1);
  });

  it('conserva una sola intención cuando compiten claves diferentes', async () => {
    const { store, ready, db } = fixture();
    const { enqueue } = await ready();
    const writes = await Promise.allSettled([
      store.enqueueStep({ ...enqueue, ...ctx('left') }), store.enqueueStep({ ...enqueue, ...ctx('right') }),
    ]);
    expect(writes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(writes.filter((result) => result.status === 'rejected')).toMatchObject([{ reason: { code: 'customer_segmentation_conflict' } }]);
    expect(db.value('SELECT count(*) AS value FROM customer_segment_job_intents')).toBe(1);
    expect(db.value('SELECT count(*) AS value FROM platform_job_runs')).toBe(1);
  });

  it('rechaza encolar sin plan, con revisión superada o después de terminar', async () => {
    const { store, repo, requested, ready, start } = fixture();
    const unplanned = await requested('unplanned');
    await expect(store.enqueueStep({ ...ctx('unplanned'), runId: unplanned.runId, expectedRevision: 1, scheduledFor: AT })).rejects.toBeInstanceOf(CustomerSegmentationConflictError);
    const { run, registered, enqueue } = await ready();
    await start(run.runId, registered.fingerprint);
    await expect(store.enqueueStep(enqueue)).rejects.toBeInstanceOf(CustomerSegmentationConflictError);
    await repo.completeRun({ ...ctx('complete'), runId: run.runId, expectedRevision: 2 });
    await expect(store.enqueueStep({ ...enqueue, expectedRevision: 3 })).rejects.toBeInstanceOf(CustomerSegmentationConflictError);
  });

  it('revierte la intención si falla la segunda sentencia de alta en la cola', async () => {
    const { store, ready, db } = fixture();
    const { enqueue } = await ready();
    db.sqlite.exec(`CREATE TRIGGER injected_queue_failure BEFORE INSERT ON platform_job_runs
      BEGIN SELECT RAISE(ABORT,'injected storage failure'); END`);
    await expect(store.enqueueStep(enqueue)).rejects.toThrow('injected storage failure');
    expect(db.value('SELECT count(*) AS value FROM customer_segment_job_intents')).toBe(0);
    expect(db.value('SELECT count(*) AS value FROM platform_job_runs')).toBe(0);
    db.sqlite.exec('DROP TRIGGER injected_queue_failure');
    await expect(store.enqueueStep(enqueue)).resolves.toMatchObject({ outcome: 'applied' });
  });

  it('no secuestra la clave de un job distinto y revierte la nueva intención', async () => {
    const { store, ready, db } = fixture();
    const { enqueue } = await ready();
    db.sqlite.prepare(`INSERT INTO platform_job_runs
      (run_id,job_id,trigger_kind,scheduled_for,idempotency_key,status,available_at,created_at,updated_at)
      VALUES ('unrelated-job','other.work','one-off',?,?,'pending',?,?,?)`)
      .run(AT, enqueue.idempotencyKey, AT, AT, AT);
    await expect(store.enqueueStep(enqueue)).rejects.toBeInstanceOf(CustomerSegmentationConflictError);
    expect(db.value('SELECT count(*) AS value FROM customer_segment_job_intents')).toBe(0);
    expect(db.value('SELECT job_id AS value FROM platform_job_runs')).toBe('other.work');
  });

  it('la guarda CAS revierte el batch si la ejecución avanza después de la lectura', async () => {
    const { ready, start, db, options } = fixture();
    const { enqueue, run, registered } = await ready();
    let intercepted = false;
    const database = intercept(db, async (statements) => {
      if (!intercepted) { intercepted = true; await start(run.runId, registered.fingerprint); }
      return db.batch(statements);
    });
    await expect(createD1CustomerSegmentExecutionStore(database, options).enqueueStep(enqueue)).rejects.toBeInstanceOf(CustomerSegmentationConflictError);
    expect(db.value('SELECT count(*) AS value FROM customer_segment_job_intents')).toBe(0);
    expect(db.value('SELECT count(*) AS value FROM platform_job_runs')).toBe(0);
  });

  it('un fallo de transporte posterior al commit sigue siendo ambiguo hasta reintentar explícitamente', async () => {
    const { ready, store, db, options } = fixture();
    const { enqueue } = await ready();
    const database = intercept(db, async (statements) => {
      await db.batch(statements);
      throw new Error('connection lost after commit');
    });
    await expect(createD1CustomerSegmentExecutionStore(database, options).enqueueStep(enqueue)).rejects.toThrow('connection lost after commit');
    expect(db.value('SELECT count(*) AS value FROM customer_segment_job_intents')).toBe(1);
    expect(db.value('SELECT count(*) AS value FROM platform_job_runs')).toBe(1);
    await expect(store.enqueueStep(enqueue)).resolves.toMatchObject({ outcome: 'replayed' });
  });

  it('no transforma un resultado parcial sin confirmación en éxito', async () => {
    const { ready, db, options } = fixture();
    const { enqueue } = await ready();
    const database = intercept(db, async <T>(statements: D1PreparedStatement[]) => (await db.batch<T>(statements)).slice(0, 1));
    await expect(createD1CustomerSegmentExecutionStore(database, options).enqueueStep(enqueue)).rejects.toThrow('no confirmó todas sus filas');
  });

  it('replay tras restaurar conserva intención y no recrea automáticamente la cola', async () => {
    const { ready, store, db } = fixture();
    const { enqueue } = await ready();
    const intent = (await store.enqueueStep(enqueue)).value;
    db.sqlite.exec('DELETE FROM platform_job_runs');
    await expect(store.enqueueStep(enqueue)).resolves.toEqual({ outcome: 'replayed', value: intent });
    expect(db.value('SELECT count(*) AS value FROM platform_job_runs')).toBe(0);
    await expect(store.recoverStep({ jobRunId: intent.jobRunId })).resolves.toEqual({ outcome: 'applied', value: intent });
    expect(db.query('SELECT * FROM platform_job_runs')).toMatchObject([{
      run_id: intent.jobRunId, scheduled_for: AT, available_at: AT, created_at: AT, updated_at: AT,
      idempotency_key: intent.idempotencyKey, status: 'pending', attempt_count: 0, replay_count: 0,
    }]);
    await expect(store.recoverStep({ jobRunId: intent.jobRunId })).resolves.toEqual({ outcome: 'replayed', value: intent });
  });

  it('recovery concurrente conserva identidad y no duplica la cola restaurada', async () => {
    const { ready, store, db } = fixture();
    const { enqueue } = await ready();
    const intent = (await store.enqueueStep(enqueue)).value;
    db.sqlite.exec('DELETE FROM platform_job_runs');
    const writes = await Promise.all([store.recoverStep({ jobRunId: intent.jobRunId }), store.recoverStep({ jobRunId: intent.jobRunId })]);
    expect(writes.map((write) => write.outcome).sort()).toEqual(['applied', 'replayed']);
    expect(db.value('SELECT count(*) AS value FROM platform_job_runs')).toBe(1);
  });

  it('no vuelve a encolar una revisión superada o terminal después de perder la cola', async () => {
    const { ready, store, repo, start, db } = fixture();
    const { enqueue, run, registered } = await ready();
    const first = (await store.enqueueStep(enqueue)).value;
    await start(run.runId, registered.fingerprint);
    const second = (await store.enqueueStep({ ...enqueue, ...ctx('step-two'), expectedRevision: 2 })).value;
    db.sqlite.exec('DELETE FROM platform_job_runs');
    await expect(store.recoverStep({ jobRunId: first.jobRunId })).rejects.toBeInstanceOf(CustomerSegmentationConflictError);
    await repo.completeRun({ ...ctx('complete'), runId: run.runId, expectedRevision: 2 });
    await expect(store.recoverStep({ jobRunId: second.jobRunId })).rejects.toBeInstanceOf(CustomerSegmentationConflictError);
    expect(db.value('SELECT count(*) AS value FROM platform_job_runs')).toBe(0);
    expect(db.value('SELECT count(*) AS value FROM customer_segment_job_intents')).toBe(2);
  });

  it('la recuperación también aplica CAS cuando el run avanza después de leerlo', async () => {
    const { ready, store, start, db, options } = fixture();
    const { enqueue, run, registered } = await ready();
    const intent = (await store.enqueueStep(enqueue)).value;
    db.sqlite.exec('DELETE FROM platform_job_runs');
    const database = intercept(db, async (statements) => { await start(run.runId, registered.fingerprint); return db.batch(statements); });
    await expect(createD1CustomerSegmentExecutionStore(database, options).recoverStep({ jobRunId: intent.jobRunId })).rejects.toBeInstanceOf(CustomerSegmentationConflictError);
    expect(db.value('SELECT count(*) AS value FROM platform_job_runs')).toBe(0);
  });

  it('recuperación copia el identificador y no oculta errores ambiguos', async () => {
    const { ready, store, db, options } = fixture();
    const { enqueue } = await ready();
    const intent = (await store.enqueueStep(enqueue)).value;
    db.sqlite.exec('DELETE FROM platform_job_runs');
    const input = { jobRunId: intent.jobRunId };
    const recovery = store.recoverStep(input);
    input.jobRunId = 'segment-job:other';
    expect((await recovery).value.jobRunId).toBe(intent.jobRunId);
    db.sqlite.exec('DELETE FROM platform_job_runs');
    const database = intercept(db, async (statements) => { await db.batch(statements); throw new Error('ambiguous recovery commit'); });
    await expect(createD1CustomerSegmentExecutionStore(database, options).recoverStep({ jobRunId: intent.jobRunId })).rejects.toThrow('ambiguous recovery commit');
    await expect(store.recoverStep({ jobRunId: intent.jobRunId })).resolves.toMatchObject({ outcome: 'replayed' });
  });

  it('recuperar una fila existente conserva sus intentos y estados operativos', async () => {
    const { ready, store, db } = fixture();
    const { enqueue } = await ready();
    const intent = (await store.enqueueStep(enqueue)).value;
    db.sqlite.prepare(`UPDATE platform_job_runs SET status='running',attempt_count=2,replay_count=1,
      locked_at=?,lock_expires_at=?,locked_by='worker:test',updated_at=? WHERE run_id=?`).run(AT, AFTER, AT, intent.jobRunId);
    const before = db.query('SELECT * FROM platform_job_runs');
    await expect(store.recoverStep({ jobRunId: intent.jobRunId })).resolves.toMatchObject({ outcome: 'replayed' });
    expect(db.query('SELECT * FROM platform_job_runs')).toEqual(before);
  });

  it.each([
    ['policy', 'DROP TRIGGER customer_segment_policy_no_update', "UPDATE customer_segment_facts_policies SET policy_fingerprint='" + 'a'.repeat(64) + "'"],
    ['policy-command', 'DROP TRIGGER customer_segment_policy_no_update', "UPDATE customer_segment_facts_policies SET command_fingerprint='" + 'a'.repeat(64) + "'"],
    ['plan', 'DROP TRIGGER customer_segment_plan_no_update', 'UPDATE customer_segment_execution_plans SET batch_size=3'],
    ['intent', 'DROP TRIGGER customer_segment_intent_no_update', "UPDATE customer_segment_job_intents SET scheduled_for='2026-10-03T11:00:00.000Z'"],
  ])('detecta evidencia persistida corrupta de %s antes de devolver o reactivar datos', async (kind, dropGuard, corruption) => {
    const { ready, store, db } = fixture();
    const { enqueue, run } = await ready();
    const intent = (await store.enqueueStep(enqueue)).value;
    // Simula corrupción externa en una base de prueba; no forma parte del restore.
    db.sqlite.exec(dropGuard); db.sqlite.exec(corruption);
    if (kind.startsWith('policy')) await expect(store.readPolicy(policy.id, 1)).rejects.toBeInstanceOf(CustomerSegmentationContractError);
    else if (kind === 'plan') await expect(store.readPlan(run.runId)).rejects.toBeInstanceOf(CustomerSegmentationContractError);
    else await expect(store.readJobIntent(intent.jobRunId)).rejects.toBeInstanceOf(CustomerSegmentationContractError);
    db.sqlite.exec('DELETE FROM platform_job_runs');
    await expect(store.recoverStep({ jobRunId: intent.jobRunId })).rejects.toBeInstanceOf(CustomerSegmentationContractError);
    expect(db.value('SELECT count(*) AS value FROM platform_job_runs')).toBe(0);
  });

  it('rechaza datos no canónicos, campos extra y getters antes de preparar SQL', async () => {
    const prepare = vi.fn(() => { throw new Error('unexpected I/O'); });
    const store = createD1CustomerSegmentExecutionStore({ prepare } as unknown as D1Database, { now: () => Date.parse(AT) });
    const getter = vi.fn(() => policy);
    const accessor = { ...ctx('getter'), get policy() { return getter(); } };
    for (const command of [
      { ...ctx('invalid-policy'), policy: { ...policy, customerEmail: 'unwanted@example.test' } },
      { ...ctx('future', AFTER), policy }, { ...ctx('short'), idempotencyKey: 'tiny', policy }, accessor,
      { ...ctx('unknown'), policy, activate: true },
    ]) await expect(store.registerPolicy(command as never)).rejects.toBeInstanceOf(CustomerSegmentationContractError);
    for (const batchSize of [0, 101, 1.5, NaN]) await expect(store.attachPlan({ ...ctx('invalid-plan'), runId: 'segment-run:test', policyId: policy.id, policyVersion: 1, batchSize })).rejects.toBeInstanceOf(CustomerSegmentationContractError);
    await expect(store.enqueueStep({ ...ctx('invalid-intent'), runId: 'segment-run:test', expectedRevision: 1, scheduledFor: '2026-02-30T00:00:00.000Z' })).rejects.toBeInstanceOf(CustomerSegmentationContractError);
    await expect(store.recoverStep({ jobRunId: 'invalid@id' })).rejects.toBeInstanceOf(CustomerSegmentationContractError);
    await expect(store.recoverStep({ jobRunId: 'valid', force: true } as never)).rejects.toBeInstanceOf(CustomerSegmentationContractError);
    expect(getter).not.toHaveBeenCalled(); expect(prepare).not.toHaveBeenCalled();
  });

  it('un reloj inválido falla sin I/O y las lecturas ausentes son explícitas', async () => {
    const { db, store } = fixture();
    const broken = createD1CustomerSegmentExecutionStore(db.asD1(), { now: () => NaN });
    await expect(broken.registerPolicy({ ...ctx('clock'), policy })).rejects.toBeInstanceOf(CustomerSegmentationContractError);
    await expect(broken.recoverStep({ jobRunId: 'segment-job:missing' })).rejects.toBeInstanceOf(CustomerSegmentationContractError);
    await expect(store.readPolicy('missing', 1)).resolves.toBeNull();
    await expect(store.readPlan('segment-run:missing')).resolves.toBeNull();
    await expect(store.readJobIntent('segment-job:missing')).resolves.toBeNull();
    await expect(store.recoverStep({ jobRunId: 'segment-job:missing' })).rejects.toBeInstanceOf(CustomerSegmentationConflictError);
  });
});
