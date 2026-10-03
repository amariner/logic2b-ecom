import { describe, expect, it, vi } from 'vitest';
import { BACKUP_TABLES, buildBackupSql as buildUncomposedBackupSql, type Row } from '../src/lib/backup';
import {
  buildComposedBackupSql as buildBackupSql, createComposedD1BackupReader as createD1BackupReader,
  exportComposedBackup as exportBackup,
} from '../src/composition/backup';
import {
  CUSTOMER_SEGMENT_BACKUP_COLUMNS,
  CUSTOMER_SEGMENT_BACKUP_TABLES,
  buildCustomerSegmentRestoreSql,
} from '../src/modules/customers';
import { createD1CustomerSegmentationRepository } from '../src/modules/customers/infrastructure/d1-customer-segmentation-repository';
import { createCustomerSegmentFacts, defineCustomerSegmentTemplate } from '../src/modules/customers/domain/customer-segmentation';
import type { SegmentCommandContext } from '../src/modules/customers/application/customer-segmentation-repository';
import { createD1CustomerSegmentExecutionStore } from '../src/modules/customers/infrastructure/d1-customer-segment-execution-store';
import { defineCustomerSegmentFactsPolicy } from '../src/modules/customers/application/customer-segmentation-facts';
import { canonicalSegmentJson, segmentFingerprint } from '../src/modules/customers/application/customer-segmentation-contract';
import { SqliteD1 } from './sqlite-d1';

const TEMPLATE = defineCustomerSegmentTemplate({
  id: 'orders.minimum', version: 1,
  parameters: [{ name: 'minimum', min: 1, max: 20 }],
  conditions: [{ fact: 'orders.count', operator: 'gte', parameter: 'minimum' }],
});
const BASE = Date.parse('2026-08-20T00:00:00.000Z');
const NOW = Date.parse('2026-08-21T00:00:00.000Z');

/** Evidencia real del repositorio: varias definiciones y estados entrelazados. */
async function fixture(includeLatestDefinition = true) {
  const db = new SqliteD1();
  db.sqlite.exec(`INSERT INTO customer_profiles
    (id, primary_email, email_identity_hash, status, version, created_at, updated_at)
    VALUES ('customer_one', 'one@example.test', '${'1'.repeat(64)}', 'active', 1,
      '2026-08-19T00:00:00.000Z', '2026-08-19T00:00:00.000Z'),
      ('customer_two', 'two@example.test', '${'2'.repeat(64)}', 'active', 1,
      '2026-08-19T00:00:00.000Z', '2026-08-19T00:00:00.000Z');`);
  let sequence = 0;
  let clock = 0;
  const context = (key: string): SegmentCommandContext => ({
    actorId: 'actor.backup', idempotencyKey: `backup:${key}`,
    occurredAt: new Date(BASE + (++clock * 60_000)).toISOString(),
  });
  const repo = createD1CustomerSegmentationRepository(db.asD1(), {
    now: () => NOW, newId: () => `fixture-${++sequence}`,
  });
  const segmentId = 'segment.history';
  const define = (expectedVersion: number) => repo.appendDefinition({
    ...context(`definition:${expectedVersion + 1}`), segmentId, expectedVersion,
    template: TEMPLATE, parameters: { minimum: expectedVersion + 1 },
  });
  const request = (definitionVersion: number, key: string) => repo.requestRun({
    ...context(`request:${key}`), segmentId, definitionVersion,
  });
  async function start(runId: string, key: string, empty = false) {
    const ctx = context(`start:${key}`);
    return repo.startRun({ ...ctx, runId, expectedRevision: 1,
      snapshot: {
        ref: `source:${key}`, policyId: 'facts.synthetic', policyVersion: 1,
        capturedAt: ctx.occurredAt, currency: 'EUR',
        candidates: empty ? [] : [
          { customerProfileId: 'customer_one', customerProfileVersion: 1, facts: createCustomerSegmentFacts({ 'orders.count': 5 }) },
          { customerProfileId: 'customer_two', customerProfileVersion: 1, facts: createCustomerSegmentFacts({ 'orders.count': null }) },
        ],
      },
    });
  }
  async function finish(runId: string, key: string) {
    const started = await start(runId, key);
    const first = await repo.appendProgress({
      ...context(`progress:${key}:first`), runId, expectedRevision: 2,
      cursor: started.value.cursor!, limit: 1,
    });
    await repo.appendProgress({
      ...context(`progress:${key}:last`), runId, expectedRevision: 3,
      cursor: first.value.cursor!, limit: 1,
    });
    return repo.completeRun({ ...context(`complete:${key}`), runId, expectedRevision: 4 });
  }
  await define(0);
  const first = (await request(1, 'first')).value;
  const late = (await request(1, 'late')).value;
  await finish(first.runId, 'first');
  const firstPublishCommand = { ...context('publish:first'), segmentId, runId: first.runId, expectedPublicationVersion: 0 };
  await repo.publish(firstPublishCommand);
  await define(1);
  const second = (await request(2, 'second')).value;
  await finish(second.runId, 'second');
  const secondPublishCommand = { ...context('publish:second'), segmentId, runId: second.runId, expectedPublicationVersion: 1 };
  await repo.publish(secondPublishCommand);
  // Esta ejecución de definición 1 acaba tras la publicación de definición 2.
  await finish(late.runId, 'late');
  const partial = (await request(2, 'partial')).value;
  const partialStart = await start(partial.runId, 'partial');
  const partialProgressCommand = { ...context('progress:partial'), runId: partial.runId,
    expectedRevision: 2, cursor: partialStart.value.cursor!, limit: 1 };
  await repo.appendProgress(partialProgressCommand);
  const failed = (await request(2, 'failed')).value;
  const failedStart = await start(failed.runId, 'failed');
  await repo.appendProgress({ ...context('progress:failed'), runId: failed.runId,
    expectedRevision: 2, cursor: failedStart.value.cursor!, limit: 1 });
  await repo.failRun({ ...context('fail:started'), runId: failed.runId,
    expectedRevision: 3, errorCode: 'source.unavailable' });
  const notStarted = (await request(2, 'not-started')).value;
  await repo.failRun({ ...context('fail:not-started'), runId: notStarted.runId,
    expectedRevision: 1, errorCode: 'source.unavailable' });
  const empty = (await request(2, 'empty')).value;
  await start(empty.runId, 'empty', true);
  await repo.completeRun({ ...context('complete:empty'), runId: empty.runId, expectedRevision: 2 });
  if (includeLatestDefinition) await define(2);
  const requested = (await request(includeLatestDefinition ? 3 : 2, 'requested')).value;
  db.sqlite.exec(`UPDATE customer_profiles SET status='merged', merged_into_profile_id='customer_two',
    version=2, updated_at='2026-08-20T20:00:00.000Z' WHERE id='customer_one';`);
  return { db, repo, context, firstPublishCommand, secondPublishCommand, partialProgressCommand, requested, partial, late };
}

const POLICY = defineCustomerSegmentFactsPolicy({
  schemaVersion: 1, id: 'facts.backup-synthetic', version: 3, population: 'active_profiles',
  orderStatuses: ['paid'], orderEligibility: 'successful_capture', activityBasis: 'last_successful_capture',
  amountBasis: 'captured_payments', refunds: 'subtract', storedValue: 'exclude',
  paymentAdjustments: 'reject', unsettledPayments: 'reject', missingPaymentEvidence: 'null',
  currency: 'EUR', foreignCurrency: 'reject', dayBoundary: 'utc_calendar_days',
});

/** Mezcla historia anterior, políticas sin uso y planes en todos los estados. */
async function executionFixture() {
  const source = await fixture();
  const { db, repo, context } = source;
  let job = 0;
  const store = createD1CustomerSegmentExecutionStore(db.asD1(), { now: () => NOW, newId: () => `backup-job-${++job}` });
  const registerCommand = { ...context('policy'), policy: POLICY };
  await store.registerPolicy(registerCommand);
  await store.registerPolicy({ ...context('unused-policy'), policy: { ...POLICY, version: 9 } });
  const segmentId = 'segment.planned';
  await repo.appendDefinition({ ...context('planned-definition'), segmentId, expectedVersion: 0,
    template: TEMPLATE, parameters: { minimum: 1 } });
  async function request(key: string) {
    const run = (await repo.requestRun({ ...context(`planned-request:${key}`), segmentId, definitionVersion: 1 })).value;
    const planCommand = { ...context(`plan:${key}`), runId: run.runId,
      policyId: POLICY.id, policyVersion: POLICY.version, batchSize: 1 };
    await store.attachPlan(planCommand);
    return { run, planCommand };
  }
  async function enqueue(runId: string, revision: number, key: string) {
    const command = { ...context(`intent:${key}`), runId, expectedRevision: revision,
      scheduledFor: new Date(BASE).toISOString() };
    const result = await store.enqueueStep(command);
    return { command, result };
  }
  async function start(runId: string, key: string) {
    const ctx = context(`planned-start:${key}`);
    const content = { policyId: POLICY.id, policyVersion: POLICY.version,
      capturedAt: ctx.occurredAt, currency: 'EUR', candidates: [
        { customerProfileId: 'customer_one', customerProfileVersion: 2, facts: createCustomerSegmentFacts({ 'orders.count': 5 }) },
        { customerProfileId: 'customer_two', customerProfileVersion: 1, facts: createCustomerSegmentFacts({ 'orders.count': null }) },
      ] };
    const ref = `source:${await segmentFingerprint(POLICY)}:${await segmentFingerprint(content)}`;
    return repo.startRun({ ...ctx, runId, expectedRevision: 1, snapshot: { ref, ...content } });
  }
  const completed = await request('completed');
  const historicalIntent = await enqueue(completed.run.runId, 1, 'historical');
  const completedStart = await start(completed.run.runId, 'completed');
  await repo.appendProgress({ ...context('planned-progress:completed'), runId: completed.run.runId,
    expectedRevision: 2, cursor: completedStart.value.cursor!, limit: 2 });
  await repo.completeRun({ ...context('planned-complete'), runId: completed.run.runId, expectedRevision: 3 });
  const publishCommand = { ...context('planned-publish'), segmentId, runId: completed.run.runId, expectedPublicationVersion: 0 };
  await repo.publish(publishCommand);
  // La intención sobrevive aunque la cola efímera haya sido purgada.
  db.sqlite.exec(`UPDATE platform_job_runs SET status='succeeded', completed_at='2026-08-20T10:00:00.000Z';
    DELETE FROM platform_job_runs WHERE status='succeeded';`);
  const partial = await request('partial');
  const partialStart = await start(partial.run.runId, 'partial');
  await repo.appendProgress({ ...context('planned-progress:partial'), runId: partial.run.runId,
    expectedRevision: 2, cursor: partialStart.value.cursor!, limit: 1 });
  const currentIntent = await enqueue(partial.run.runId, 3, 'current');
  const requested = await request('requested');
  const failed = await request('failed');
  await start(failed.run.runId, 'failed');
  await repo.failRun({ ...context('planned-fail'), runId: failed.run.runId,
    expectedRevision: 2, errorCode: 'facts_capture_unavailable' });
  const notStarted = await request('not-started');
  await repo.failRun({ ...context('planned-fail-before-start'), runId: notStarted.run.runId,
    expectedRevision: 1, errorCode: 'facts_capture_invalid' });
  return { ...source, store, registerCommand, completed, partial, requested, failed, notStarted,
    historicalIntent, currentIntent, publishCommand };
}

function rows(db: SqliteD1): Record<string, Row[]> {
  return Object.fromEntries(BACKUP_TABLES.map((table) => [table, db.query<Row>(`SELECT * FROM ${table}`)]));
}

function stableRows(values: Row[]): Row[] {
  return [...values].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

describe('backup/restore R5.6b y R5.6c.3', () => {
  it('restaura ocho tablas, política completa y planes históricos sin reconstruir la cola', async () => {
    const source = await executionFixture();
    const before = rows(source.db);
    expect(source.db.value('SELECT count(*) AS value FROM platform_job_runs')).toBe(1);
    const backup = await exportBackup(createD1BackupReader(source.db.asD1()), new Date(NOW));
    expect(backup.sql).toContain('logic2b-backup-schema: 39');
    expect(backup.sql).not.toContain('INSERT INTO platform_job_runs');
    const restored = new SqliteD1();
    restored.sqlite.exec(`BEGIN;\n${backup.sql}\nCOMMIT;`);
    for (const table of BACKUP_TABLES) {
      expect(stableRows(restored.query<Row>(`SELECT * FROM ${table}`))).toEqual(stableRows(before[table]!));
    }
    expect(restored.query('PRAGMA foreign_key_check')).toEqual([]);
    expect(restored.query('SELECT * FROM platform_job_runs')).toEqual([]);
    const store = createD1CustomerSegmentExecutionStore(restored.asD1(), { now: () => NOW });
    expect(await store.readPolicy(POLICY.id, POLICY.version)).toEqual(await source.store.readPolicy(POLICY.id, POLICY.version));
    expect(await store.readPolicy(POLICY.id, 9)).toEqual(await source.store.readPolicy(POLICY.id, 9));
    expect((await store.registerPolicy(source.registerCommand)).outcome).toBe('replayed');
    expect((await store.attachPlan(source.completed.planCommand)).outcome).toBe('replayed');
    expect((await store.enqueueStep(source.historicalIntent.command)).outcome).toBe('replayed');
    expect((await store.enqueueStep(source.currentIntent.command)).outcome).toBe('replayed');
    // Un replay del registro durable no reanuda trabajo ni recrea locks.
    expect(restored.query('SELECT * FROM platform_job_runs')).toEqual([]);
    const historicalJob = restored.query<Row>('SELECT job_run_id FROM customer_segment_job_intents WHERE run_id=?', source.completed.run.runId)[0]!;
    await expect(store.recoverStep({ jobRunId: String(historicalJob.job_run_id) })).rejects.toThrow();
    expect(restored.query('SELECT * FROM platform_job_runs')).toEqual([]);
    const currentJob = restored.query<Row>('SELECT job_run_id FROM customer_segment_job_intents WHERE run_id=?', source.partial.run.runId)[0]!;
    await store.recoverStep({ jobRunId: String(currentJob.job_run_id) });
    expect(restored.query<Row>('SELECT run_id,status,attempt_count,replay_count FROM platform_job_runs')).toEqual([
      { run_id: currentJob.job_run_id, status: 'pending', attempt_count: 0, replay_count: 0 },
    ]);
    const repo = createD1CustomerSegmentationRepository(restored.asD1(), { now: () => NOW });
    expect((await repo.publish(source.firstPublishCommand)).outcome).toBe('replayed');
    expect((await repo.publish(source.publishCommand)).outcome).toBe('replayed');
    expect((await repo.readRun(source.partial.run.runId))!.snapshot).toMatchObject({ state: 'running', processedCandidates: 1 });
    expect((await repo.readRun(source.requested.run.runId))!.snapshot.state).toBe('requested');
    const replay = backup.sql.split('\n');
    const runId = source.completed.run.runId;
    const at = (table: string, token = '') => replay.findIndex((line) => line.startsWith(`INSERT INTO ${table} `) && line.includes(`'${runId}'`) && line.includes(token));
    expect(at('customer_segment_execution_plans')).toBeGreaterThan(at('customer_segment_run_snapshots', "'requested'"));
    expect(at('customer_segment_execution_plans')).toBeLessThan(at('customer_segment_run_snapshots', "'running'"));
    expect(at('customer_segment_job_intents')).toBeGreaterThan(at('customer_segment_run_snapshots', "'completed'"));
    expect(() => restored.sqlite.exec('DELETE FROM customer_segment_facts_policies')).toThrow('immutable');
    expect(() => restored.sqlite.exec('UPDATE customer_segment_execution_plans SET batch_size=2')).toThrow('immutable');
    expect(() => restored.sqlite.exec('DELETE FROM customer_segment_job_intents')).toThrow('immutable');
  });

  it('preflight rechaza incluso una política sin uso antes de modificar datos legacy', async () => {
    const target = new SqliteD1();
    const store = createD1CustomerSegmentExecutionStore(target.asD1(), { now: () => NOW });
    await store.registerPolicy({ actorId: 'actor.backup', idempotencyKey: 'backup:unused-policy',
      occurredAt: new Date(BASE).toISOString(), policy: POLICY });
    target.sqlite.exec("INSERT INTO emails_outbox (to_addr,subject,body_html) VALUES ('keep@example.test','keep','keep')");
    expect(() => target.sqlite.exec(buildBackupSql({}, new Date(NOW).toISOString()))).toThrow('malformed JSON');
    expect(target.value('SELECT count(*) AS value FROM emails_outbox')).toBe(1);
    expect(target.value('SELECT count(*) AS value FROM customer_segment_facts_policies')).toBe(1);
  });

  it.each(['run_id', 'idempotency_key'] as const)('preflight rechaza una colisión de cola por %s antes de cualquier DELETE legacy', async (field) => {
    const source = await executionFixture();
    const backup = await exportBackup(createD1BackupReader(source.db.asD1()), new Date(NOW));
    const intent = source.db.query<Row>('SELECT * FROM customer_segment_job_intents ORDER BY job_run_id')[0]!;
    const intentJobId = intent.job_run_id;
    const intentKey = intent.idempotency_key;
    if (typeof intentJobId !== 'string' || typeof intentKey !== 'string') throw new Error('La intención del fixture debe tener identidad y clave de texto.');
    const target = new SqliteD1();
    const runId = field === 'run_id' ? intentJobId : 'qa:unrelated-job';
    const key = field === 'idempotency_key' ? intentKey : 'qa:unrelated-key';
    target.sqlite.prepare(`INSERT INTO platform_job_runs
      (run_id,job_id,trigger_kind,scheduled_for,idempotency_key,status,available_at,created_at,updated_at)
      VALUES (?,'qa.unrelated','one-off',? ,?,'pending',?,?,?)`)
      .run(runId, new Date(BASE).toISOString(), key, new Date(BASE).toISOString(), new Date(BASE).toISOString(), new Date(BASE).toISOString());
    target.sqlite.exec("INSERT INTO emails_outbox (to_addr,subject,body_html) VALUES ('keep@example.test','keep','keep')");
    const before = rows(target);
    const queueBefore = target.query('SELECT * FROM platform_job_runs');
    expect(backup.sql.indexOf('restore_target_has_segment_job_collision')).toBeLessThan(backup.sql.indexOf('DELETE FROM'));
    expect(() => target.sqlite.exec(backup.sql)).toThrow('malformed JSON');
    for (const table of BACKUP_TABLES) expect(target.query<Row>(`SELECT * FROM ${table}`)).toEqual(before[table]);
    expect(target.query('SELECT * FROM platform_job_runs')).toEqual(queueBefore);
  });

  it.each([
    ['customer_segment_facts_policies', 'created_at'],
    ['customer_segment_job_intents', 'scheduled_for'],
  ])('rechaza una fecha ISO extendida incompatible con0046 en %s.%s', async (table, field) => {
    const source = await executionFixture();
    const all = rows(source.db);
    all[table]![0]![field] = '-000001-01-01T00:00:00.000Z';
    expect(() => buildCustomerSegmentRestoreSql(all)).toThrow('fecha UTC');
  });

  it.each([
    ['tabla de políticas ausente', (all: Record<string, Row[]>) => { delete all.customer_segment_facts_policies; }],
    ['versión de política duplicada', (all: Record<string, Row[]>) => { all.customer_segment_facts_policies![1]!.policy_version = POLICY.version; }],
    ['reglas no permitidas', (all: Record<string, Row[]>) => {
      all.customer_segment_facts_policies![0]!.policy_json = canonicalSegmentJson({ ...POLICY, refunds: 'automatic' });
    }],
    ['política ajena al plan', (all: Record<string, Row[]>) => { all.customer_segment_execution_plans![0]!.policy_version = 8; }],
    ['lote excesivo', (all: Record<string, Row[]>) => { all.customer_segment_execution_plans![0]!.batch_size = 101; }],
    ['plan posterior al inicio', (all: Record<string, Row[]>) => { all.customer_segment_execution_plans![0]!.created_at = new Date(NOW).toISOString(); }],
    ['plan previo al registro de requested', (all: Record<string, Row[]>) => {
      const plan = all.customer_segment_execution_plans!.find((row) => all.customer_segment_run_snapshots!.filter((snapshot) => snapshot.run_id === row.run_id).length === 1)!;
      const snapshot = all.customer_segment_run_snapshots!.find((row) => row.run_id === plan.run_id)!;
      snapshot.recorded_at = new Date(Date.parse(String(plan.created_at)) + 1).toISOString();
    }],
    ['intención sin plan', (all: Record<string, Row[]>) => { all.customer_segment_job_intents![0]!.run_id = all.customer_segment_runs![0]!.run_id!; }],
    ['intención de revisión terminal', (all: Record<string, Row[]>) => { all.customer_segment_job_intents![0]!.expected_revision = 4; }],
    ['intención previa al plan', (all: Record<string, Row[]>) => { all.customer_segment_job_intents![0]!.created_at = new Date(BASE).toISOString(); }],
    ['fecha de job inválida', (all: Record<string, Row[]>) => { all.customer_segment_job_intents![0]!.scheduled_for = '2026-08-20'; }],
  ])('no exporta %s', async (_description, corrupt) => {
    const source = await executionFixture();
    const all = rows(source.db);
    corrupt(all);
    await expect(exportBackup({ readTables: async () => all }, new Date(NOW))).rejects.toThrow();
  });

  it.each([
    ['customer_segment_facts_policies', 'policy_fingerprint'],
    ['customer_segment_facts_policies', 'command_fingerprint'],
    ['customer_segment_execution_plans', 'command_fingerprint'],
    ['customer_segment_job_intents', 'command_fingerprint'],
  ])('acredita %s.%s antes de devolver el backup', async (table, field) => {
    const source = await executionFixture();
    const all = rows(source.db);
    // La política sin uso evita que otra guarda semántica oculte el hash corrupto.
    all[table]![table === 'customer_segment_facts_policies' ? 1 : 0]![field] = '0'.repeat(64);
    await expect(exportBackup({ readTables: async () => all }, new Date(NOW))).rejects.toThrow('huella');
  });

  it('la referencia de una captura planificada debe acreditar su contenido aunque la huella externa sea coherente', async () => {
    const source = await executionFixture();
    const all = rows(source.db);
    const snapshots = all.customer_segment_run_snapshots!.filter((row) => row.run_id === source.completed.run.runId && row.started_at !== null);
    const first = snapshots[0]!;
    const candidates = all.customer_segment_results!.filter((row) => row.run_id === source.completed.run.runId)
      .sort((a, b) => Number(a.position) - Number(b.position))
      .map((row) => ({ customerProfileId: row.customer_profile_id, customerProfileVersion: row.customer_profile_version,
        facts: JSON.parse(String(row.facts_json)) as unknown }));
    const ref = `source:${await segmentFingerprint(POLICY)}:${'0'.repeat(64)}`;
    const fingerprint = await segmentFingerprint({ ref, policyId: first.facts_policy_id,
      policyVersion: first.facts_policy_version, capturedAt: first.facts_captured_at, currency: first.currency, candidates });
    for (const snapshot of snapshots) {
      snapshot.source_snapshot_ref = ref;
      snapshot.source_snapshot_fingerprint = fingerprint;
    }
    await expect(exportBackup({ readTables: async () => all }, new Date(NOW))).rejects.toThrow('referencia');
  });

  it('restaura todo el historial con triggers activos y conserva la idempotencia antigua', async () => {
    const source = await fixture();
    const backup = await exportBackup(createD1BackupReader(source.db.asD1()), new Date(NOW));
    const restored = new SqliteD1();
    restored.sqlite.exec(`BEGIN;\n${backup.sql}\nCOMMIT;`);
    for (const table of [...CUSTOMER_SEGMENT_BACKUP_TABLES, 'customer_profiles']) {
      expect(stableRows(restored.query<Row>(`SELECT * FROM ${table}`))).toEqual(stableRows(source.db.query<Row>(`SELECT * FROM ${table}`)));
    }
    expect(restored.query('PRAGMA foreign_key_check')).toEqual([]);
    const repo = createD1CustomerSegmentationRepository(restored.asD1(), { now: () => NOW });
    expect(await repo.readMembership('segment.history', 'customer_two')).toEqual({ state: 'stale', reason: 'definition_changed' });
    expect((await repo.readRun(source.requested.runId))!.snapshot.state).toBe('requested');
    expect((await repo.readRun(source.partial.runId))!.snapshot).toMatchObject({ state: 'running', processedCandidates: 1, totalCandidates: 2 });
    const replayed = await repo.publish(source.firstPublishCommand);
    expect(replayed).toMatchObject({ outcome: 'replayed', value: { version: 1 }, current: { version: 2 } });
    expect((await repo.publish(source.secondPublishCommand)).outcome).toBe('replayed');
    expect((await repo.appendProgress(source.partialProgressCommand)).outcome).toBe('replayed');
    expect(backup.sql.indexOf('INSERT INTO customer_segment_publications')).toBeLessThan(
      backup.sql.indexOf("'segment.history', 2, 'orders.minimum'"),
    );
  });

  it('el generador genérico rechaza historia de segmentación sin su extensión de replay', async () => {
    const source = await fixture();
    expect(() => buildUncomposedBackupSql(rows(source.db), '2026-08-21')).toThrow('extensión de replay');
  });

  it('conserva el puntero vigente y distingue un perfil fusionado de una evaluación negativa', async () => {
    const source = await fixture(false);
    const backup = await exportBackup(createD1BackupReader(source.db.asD1()), new Date(NOW));
    const restored = new SqliteD1();
    restored.sqlite.exec(`BEGIN;\n${backup.sql}\nCOMMIT;`);
    const repo = createD1CustomerSegmentationRepository(restored.asD1(), { now: () => NOW });
    expect(await repo.readMembership('segment.history', 'customer_one')).toEqual({ state: 'stale', reason: 'profile_changed' });
    expect(await repo.readMembership('segment.history', 'customer_two')).toMatchObject({
      state: 'evaluated', matches: false, missingFacts: ['orders.count'], publication: { version: 2, definitionVersion: 2 },
    });
    expect(restored.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('lee las ocho tablas en el mismo batch con columnas explícitas y no oculta un resultado fallido', async () => {
    const db = new SqliteD1();
    const prepare = vi.spyOn(db, 'prepare');
    const batch = vi.spyOn(db, 'batch');
    await createD1BackupReader(db.asD1()).readTables(CUSTOMER_SEGMENT_BACKUP_TABLES);
    expect(batch).toHaveBeenCalledTimes(1);
    for (const table of CUSTOMER_SEGMENT_BACKUP_TABLES) {
      expect(prepare).toHaveBeenCalledWith(`SELECT ${CUSTOMER_SEGMENT_BACKUP_COLUMNS[table].join(', ')} FROM ${table}`);
    }
    batch.mockResolvedValueOnce([]);
    await expect(createD1BackupReader(db.asD1()).readTables(CUSTOMER_SEGMENT_BACKUP_TABLES)).rejects.toThrow('corte completo');
  });

  it('un destino sin0045 falla antes de borrar cualquier dato legacy', () => {
    const old = new SqliteD1(...Array.from({ length: 21 }, () => true), false);
    old.sqlite.exec(`INSERT INTO products (slug,name,description,price_cents,stock,image,category,active)
      VALUES ('kept','Keep','Keep',100,1,'/keep.webp','test',1);`);
    expect(() => old.sqlite.exec(buildBackupSql({}, '2026-08-21'))).toThrow('no such table: customer_segment_facts_policies');
    expect(old.value("SELECT count(*) AS value FROM products WHERE slug='kept'")).toBe(1);
  });

  it('rechaza un destino con historia antes de borrar datos legacy, incluso sin transacción exterior', async () => {
    const target = await fixture();
    target.db.sqlite.exec(`INSERT INTO emails_outbox (to_addr,subject,body_html)
      VALUES ('kept@example.test','Preservar','<p>Preservar</p>');`);
    const before = rows(target.db);
    const sql = buildBackupSql({}, '2026-08-21');
    expect(sql.indexOf('restore_target_has_segment_history')).toBeLessThan(sql.indexOf('DELETE FROM'));
    expect(() => target.db.sqlite.exec(sql)).toThrow('malformed JSON');
    for (const table of BACKUP_TABLES) {
      expect(stableRows(target.db.query<Row>(`SELECT * FROM ${table}`))).toEqual(stableRows(before[table]!));
    }
    expect(target.db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it.each([
    ['tabla ausente', (all: Record<string, Row[]>) => { delete all.customer_segment_results; }],
    ['versión saltada', (all: Record<string, Row[]>) => { all.customer_segment_definitions![1]!.definition_version = 4; }],
    ['revisión ausente', (all: Record<string, Row[]>) => { all.customer_segment_run_snapshots!.splice(1, 1); }],
    ['posición saltada', (all: Record<string, Row[]>) => { all.customer_segment_results![0]!.position = 9; }],
    ['resultado incorrecto', (all: Record<string, Row[]>) => { all.customer_segment_results![0]!.matches = 0; }],
    ['contador manipulado', (all: Record<string, Row[]>) => { all.customer_segment_run_snapshots!.find((row) => row.state === 'completed')!.matched_customers = 0; }],
    ['campo no declarado', (all: Record<string, Row[]>) => { all.customer_segment_runs![0]!.unknown = 'bad'; }],
    ['publicación parcial', (all: Record<string, Row[]>) => { all.customer_segment_publications![0]!.run_id = all.customer_segment_runs![3]!.run_id!; }],
    ['JSON no canónico', (all: Record<string, Row[]>) => { all.customer_segment_results![0]!.facts_json = ` ${all.customer_segment_results![0]!.facts_json}`; }],
  ])('rechaza %s antes de generar SQL de restore', async (_description, corrupt) => {
    const source = await fixture();
    const all = rows(source.db);
    corrupt(all);
    expect(() => buildCustomerSegmentRestoreSql(all)).toThrow();
  });

  it.each(['definition_fingerprint', 'facts_fingerprint', 'source_snapshot_fingerprint'] as const)(
    'la exportación comprueba el contenido de %s', async (field) => {
      const source = await fixture();
      const all = rows(source.db);
      if (field === 'definition_fingerprint') all.customer_segment_definitions![0]![field] = '0'.repeat(64);
      if (field === 'facts_fingerprint') all.customer_segment_results![0]![field] = '0'.repeat(64);
      if (field === 'source_snapshot_fingerprint') {
        const run = all.customer_segment_runs![0]!.run_id;
        for (const snapshot of all.customer_segment_run_snapshots!.filter((row) => row.run_id === run && row.started_at !== null)) snapshot[field] = '0'.repeat(64);
      }
      await expect(exportBackup({ readTables: async () => all }, new Date(NOW))).rejects.toThrow('huella');
    },
  );
});
