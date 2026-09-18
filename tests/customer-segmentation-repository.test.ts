import { describe, expect, it } from 'vitest';
import { SqliteD1 } from './sqlite-d1';
import { createD1CustomerSegmentationRepository, CustomerSegmentationConflictError } from '../src/modules/customers/infrastructure/d1-customer-segmentation-repository';
import { createCustomerSegmentFacts, type CustomerSegmentTemplate } from '../src/modules/customers/domain/customer-segmentation';
import type { SegmentCommandContext } from '../src/modules/customers/application/customer-segmentation-repository';

const AT = '2026-09-18T10:00:00.000Z';
const template: CustomerSegmentTemplate = { id: 'repeat-buyers', version: 1,
  parameters: [{ name: 'minimum', min: 0, max: 100 }],
  conditions: [{ fact: 'orders.count', operator: 'gte', parameter: 'minimum' }] };
const ctx = (key: string): SegmentCommandContext => ({ actorId: 'system:test', idempotencyKey: `segment-test:${key}`, occurredAt: AT });
function fixture() {
  const db = new SqliteD1();
  for (const [index, id] of ['one', 'two', 'three'].entries()) db.sqlite.prepare(`INSERT INTO customer_profiles
    (id,primary_email,email_identity_hash,status,version,created_at,updated_at) VALUES (?,?,?,'active',1,?,?)`)
    .run(`profile:${id}`, `${id}@example.test`, String(index + 1).repeat(64), AT, AT);
  let sequence = 0;
  const repo = createD1CustomerSegmentationRepository(db.asD1(), { now: () => Date.parse(AT), newId: () => String(++sequence).padStart(10, '0') });
  const source = { ref: 'source:test', policyId: 'test-policy', policyVersion: 1, capturedAt: AT, currency: 'EUR',
    candidates: ['one', 'two', 'three'].map((id, index) => ({ customerProfileId: `profile:${id}`, customerProfileVersion: 1,
      facts: createCustomerSegmentFacts({ 'orders.count': [3, 1, null][index] ?? null }) })) };
  const definitionCommand = { ...ctx('definition'), segmentId: 'repeat', expectedVersion: 0, template, parameters: { minimum: 2 } };
  async function requested(key = 'request') {
    await repo.appendDefinition(definitionCommand);
    return (await repo.requestRun({ ...ctx(key), segmentId: 'repeat', definitionVersion: 1 })).value;
  }
  async function started() {
    const run = await requested();
    const current = (await repo.startRun({ ...ctx('start'), runId: run.runId, expectedRevision: 1, snapshot: source })).value;
    return { run, current };
  }
  return { db, repo, source, definitionCommand, requested, started };
}

describe('repositorio D1 de segmentación R5.6b', () => {
  it('congela hechos, evalúa lotes y publica únicamente el resultado completo', async () => {
    const { repo, db, started } = fixture();
    const { run, current } = await started();
    expect(current).toMatchObject({ state: 'running', totalCandidates: 3, revision: 2 });
    await expect(repo.readMembership('repeat', 'profile:one')).resolves.toEqual({ state: 'unpublished' });
    const first = await repo.appendProgress({ ...ctx('progress-one'), runId: run.runId, expectedRevision: 2, cursor: current.cursor!, limit: 2 });
    expect(first.value).toMatchObject({ revision: 3, processedCandidates: 2, matchedCustomers: 1 });
    await expect(repo.completeRun({ ...ctx('premature'), runId: run.runId, expectedRevision: 3 })).rejects.toBeInstanceOf(CustomerSegmentationConflictError);
    const last = await repo.appendProgress({ ...ctx('progress-two'), runId: run.runId, expectedRevision: 3, cursor: first.value.cursor!, limit: 2 });
    expect(last.value).toMatchObject({ revision: 4, processedCandidates: 3, matchedCustomers: 1, cursor: null });
    const done = await repo.completeRun({ ...ctx('complete'), runId: run.runId, expectedRevision: 4 });
    expect(done.value.state).toBe('completed');
    await repo.publish({ ...ctx('publish'), segmentId: 'repeat', runId: run.runId, expectedPublicationVersion: 0 });
    await expect(repo.readMembership('repeat', 'profile:one')).resolves.toMatchObject({ state: 'evaluated', matches: true, missingFacts: [] });
    await expect(repo.readMembership('repeat', 'profile:two')).resolves.toMatchObject({ state: 'evaluated', matches: false, missingFacts: [] });
    await expect(repo.readMembership('repeat', 'profile:three')).resolves.toMatchObject({ state: 'evaluated', matches: false, missingFacts: ['orders.count'] });
    expect((await repo.readSnapshots(run.runId)).map((item) => item.state)).toEqual(['requested', 'running', 'running', 'running', 'completed']);
    expect(JSON.stringify(await repo.readRun(run.runId))).not.toContain('@');
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('reproduce cada comando histórico después de completar y publicar', async () => {
    const { repo, source, definitionCommand } = fixture();
    const definition = await repo.appendDefinition(definitionCommand);
    const request = { ...ctx('request'), segmentId: 'repeat', definitionVersion: 1 };
    const run = (await repo.requestRun(request)).value;
    const start = { ...ctx('start'), runId: run.runId, expectedRevision: 1, snapshot: source };
    const initial = await repo.startRun(start);
    const progress = { ...ctx('progress'), runId: run.runId, expectedRevision: 2, cursor: initial.value.cursor!, limit: 100 };
    const evaluated = await repo.appendProgress(progress);
    const complete = { ...ctx('complete'), runId: run.runId, expectedRevision: 3 };
    const completed = await repo.completeRun(complete);
    const publish = { ...ctx('publish'), segmentId: 'repeat', runId: run.runId, expectedPublicationVersion: 0 };
    await repo.publish(publish);
    await repo.appendDefinition({ ...definitionCommand, ...ctx('definition-next'), expectedVersion: 1, parameters: { minimum: 4 } });
    await expect(repo.appendDefinition(definitionCommand)).resolves.toEqual({ outcome: 'replayed', value: definition.value });
    await expect(repo.requestRun(request)).resolves.toEqual({ outcome: 'replayed', value: run });
    await expect(repo.startRun(start)).resolves.toEqual({ outcome: 'replayed', value: initial.value });
    await expect(repo.appendProgress(progress)).resolves.toEqual({ outcome: 'replayed', value: evaluated.value });
    await expect(repo.completeRun(complete)).resolves.toEqual({ outcome: 'replayed', value: completed.value });
    await expect(repo.publish(publish)).resolves.toMatchObject({ outcome: 'replayed', value: { version: 1 }, current: { version: 1 } });
    await expect(repo.appendDefinition({ ...definitionCommand, parameters: { minimum: 3 } })).rejects.toBeInstanceOf(CustomerSegmentationConflictError);
    await expect(repo.appendProgress({ ...progress, limit: 1 })).rejects.toBeInstanceOf(CustomerSegmentationConflictError);
    await expect(repo.readMembership('repeat', 'profile:one')).resolves.toEqual({ state: 'stale', reason: 'definition_changed' });
  });

  it('serializa dos definiciones con la misma versión esperada y conserva un ganador', async () => {
    const { repo, definitionCommand, db } = fixture();
    const results = await Promise.allSettled([
      repo.appendDefinition({ ...definitionCommand, ...ctx('race-left') }),
      repo.appendDefinition({ ...definitionCommand, ...ctx('race-right') }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toMatchObject([{ reason: { code: 'customer_segmentation_conflict' } }]);
    expect(db.value('SELECT count(*) AS value FROM customer_segment_definitions')).toBe(1);
  });

  it('resuelve solicitudes idénticas concurrentes y no absorbe otra huella', async () => {
    const { repo, definitionCommand, db } = fixture();
    await repo.appendDefinition(definitionCommand);
    const command = { ...ctx('race-request'), segmentId: 'repeat', definitionVersion: 1 };
    const results = await Promise.all([repo.requestRun(command), repo.requestRun(command)]);
    expect(results.map((result) => result.outcome).sort()).toEqual(['applied', 'replayed']);
    expect(results[0]!.value.runId).toBe(results[1]!.value.runId);
    await expect(repo.requestRun({ ...command, actorId: 'system:other' })).rejects.toBeInstanceOf(CustomerSegmentationConflictError);
    expect(db.value('SELECT count(*) AS value FROM customer_segment_runs')).toBe(1);
  });

  it('serializa progresos simultáneos y revierte los cambios del perdedor', async () => {
    const { repo, db, started } = fixture();
    const { run, current } = await started();
    const input = { runId: run.runId, expectedRevision: 2, cursor: current.cursor!, limit: 2 };
    const results = await Promise.allSettled([
      repo.appendProgress({ ...ctx('race-progress-left'), ...input }),
      repo.appendProgress({ ...ctx('race-progress-right'), ...input }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toMatchObject([{ reason: { code: 'customer_segmentation_conflict' } }]);
    expect(db.value('SELECT count(*) AS value FROM customer_segment_results WHERE evaluated_revision IS NOT NULL')).toBe(2);
    expect((await repo.readRun(run.runId))?.snapshot).toMatchObject({ revision: 3, processedCandidates: 2 });
  });

  it('revierte toda la importación cuando falla un candidato o la fotografía', async () => {
    const { repo, db, source, requested } = fixture();
    const run = await requested();
    const broken = { ...source, candidates: [...source.candidates, { ...source.candidates[0]!, customerProfileId: 'profile:missing' }] };
    await expect(repo.startRun({ ...ctx('bad-source'), runId: run.runId, expectedRevision: 1, snapshot: broken })).rejects.toThrow();
    expect(db.value('SELECT count(*) AS value FROM customer_segment_results')).toBe(0);
    db.sqlite.exec(`CREATE TRIGGER inject_segment_start_failure BEFORE INSERT ON customer_segment_run_snapshots WHEN NEW.state='running' BEGIN SELECT RAISE(ABORT,'injected infrastructure outage'); END;`);
    await expect(repo.startRun({ ...ctx('fail-source'), runId: run.runId, expectedRevision: 1, snapshot: source })).rejects.toThrow('injected infrastructure outage');
    expect(db.value('SELECT count(*) AS value FROM customer_segment_results')).toBe(0);
    expect((await repo.readRun(run.runId))?.snapshot.state).toBe('requested');
  });

  it('revierte todas las evaluaciones si falla la fotografía final del lote', async () => {
    const { repo, db, started } = fixture();
    const { run, current } = await started();
    db.sqlite.exec(`CREATE TRIGGER inject_segment_progress_failure BEFORE INSERT ON customer_segment_run_snapshots WHEN NEW.revision=3 BEGIN SELECT RAISE(ABORT,'injected write outage'); END;`);
    await expect(repo.appendProgress({ ...ctx('fail-progress'), runId: run.runId, expectedRevision: 2, cursor: current.cursor!, limit: 3 })).rejects.toThrow('injected write outage');
    expect(db.value('SELECT count(*) AS value FROM customer_segment_results WHERE evaluated_revision IS NOT NULL')).toBe(0);
    expect((await repo.readRun(run.runId))?.snapshot.revision).toBe(2);
  });

  it('rechaza un cursor de otra ejecución y no reinterpreta offsets del llamador', async () => {
    const { repo, source, started } = fixture();
    const { run, current } = await started();
    const other = (await repo.requestRun({ ...ctx('other-run'), segmentId: 'repeat', definitionVersion: 1 })).value;
    const otherStart = await repo.startRun({ ...ctx('other-start'), runId: other.runId, expectedRevision: 1, snapshot: source });
    await expect(repo.appendProgress({ ...ctx('wrong-cursor'), runId: run.runId, expectedRevision: 2, cursor: otherStart.value.cursor!, limit: 1 })).rejects.toBeInstanceOf(CustomerSegmentationConflictError);
    await expect(repo.appendProgress({ ...ctx('wrong-offset'), runId: run.runId, expectedRevision: 2, cursor: current.cursor!, limit: 1, offset: 2 } as never)).rejects.toThrow('desconocidos');
  });

  it('completa un conjunto vacío y observa fallos anteriores y posteriores al inicio', async () => {
    const { repo, source, requested } = fixture();
    const empty = await requested();
    await repo.startRun({ ...ctx('empty-start'), runId: empty.runId, expectedRevision: 1, snapshot: { ...source, ref: 'source:empty', candidates: [] } });
    const completed = await repo.completeRun({ ...ctx('empty-complete'), runId: empty.runId, expectedRevision: 2 });
    expect(completed.value).toMatchObject({ state: 'completed', totalCandidates: 0 });
    const before = await requested('before-fail');
    const failure = { ...ctx('fail-before'), runId: before.runId, expectedRevision: 1, errorCode: 'source.unavailable' };
    await repo.failRun(failure);
    await expect(repo.failRun(failure)).resolves.toMatchObject({ outcome: 'replayed', value: { state: 'failed', startedAt: null, totalCandidates: 0 } });
    const after = await requested('after-fail');
    await repo.startRun({ ...ctx('after-start'), runId: after.runId, expectedRevision: 1, snapshot: source });
    await expect(repo.failRun({ ...ctx('fail-after'), runId: after.runId, expectedRevision: 2, errorCode: 'worker.failed' })).resolves.toMatchObject({ value: { state: 'failed', totalCandidates: 3 } });
    await expect(repo.publish({ ...ctx('publish-failed'), segmentId: 'repeat', runId: after.runId, expectedPublicationVersion: 0 })).rejects.toBeInstanceOf(CustomerSegmentationConflictError);
  });

  it('no retrocede generaciones publicadas y distingue perfiles modificados/fusionados', async () => {
    const { repo, db, source, requested } = fixture();
    async function completed(key: string) {
      const run = await requested(key);
      const start = await repo.startRun({ ...ctx(`${key}-start`), runId: run.runId, expectedRevision: 1, snapshot: source });
      await repo.appendProgress({ ...ctx(`${key}-progress`), runId: run.runId, expectedRevision: 2, cursor: start.value.cursor!, limit: 3 });
      await repo.completeRun({ ...ctx(`${key}-complete`), runId: run.runId, expectedRevision: 3 });
      return run;
    }
    const first = await completed('first'); const second = await completed('second'); const third = await completed('third');
    const publish = { ...ctx('publish-first'), segmentId: 'repeat', runId: first.runId, expectedPublicationVersion: 0 };
    await repo.publish(publish);
    await repo.publish({ ...ctx('publish-third'), segmentId: 'repeat', runId: third.runId, expectedPublicationVersion: 1 });
    await expect(repo.publish({ ...ctx('publish-late'), segmentId: 'repeat', runId: second.runId, expectedPublicationVersion: 2 })).rejects.toBeInstanceOf(CustomerSegmentationConflictError);
    await expect(repo.publish(publish)).resolves.toMatchObject({ outcome: 'replayed', value: { generation: 1 }, current: { generation: 3 } });
    db.sqlite.exec("UPDATE customer_profiles SET version=2 WHERE id='profile:one'");
    await expect(repo.readMembership('repeat', 'profile:one')).resolves.toEqual({ state: 'stale', reason: 'profile_changed' });
    db.sqlite.exec("UPDATE customer_profiles SET version=2,status='merged',merged_into_profile_id='profile:three' WHERE id='profile:two'");
    await expect(repo.readMembership('repeat', 'profile:two')).resolves.toEqual({ state: 'stale', reason: 'profile_changed' });
  });

  it('rechaza reutilizar una referencia de captura para hechos diferentes', async () => {
    const { repo, source, started } = fixture();
    await started();
    const next = (await repo.requestRun({ ...ctx('next-request'), segmentId: 'repeat', definitionVersion: 1 })).value;
    await expect(repo.startRun({ ...ctx('changed-source'), runId: next.runId, expectedRevision: 1, snapshot: { ...source, currency: 'USD' } })).rejects.toBeInstanceOf(CustomerSegmentationConflictError);
    expect((await repo.readRun(next.runId))?.snapshot.state).toBe('requested');
  });

  it('no convierte un corte D1 incompleto en ausencia de publicación', async () => {
    const { db } = fixture();
    const broken = { prepare: db.prepare.bind(db), batch: async () => [] } as unknown as D1Database;
    const repo = createD1CustomerSegmentationRepository(broken);
    await expect(repo.readMembership('repeat', 'profile:one')).rejects.toThrow('lectura consistente');
  });
});
