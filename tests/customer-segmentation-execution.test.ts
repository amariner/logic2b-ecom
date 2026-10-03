import { describe, expect, it, vi } from 'vitest';
import { SqliteD1 } from './sqlite-d1';
import { createD1CustomerSegmentFactsSource } from '../src/composition/customer-segmentation-facts';
import {
  createD1CustomerSegmentationRepository, CustomerSegmentationConflictError,
} from '../src/modules/customers/infrastructure/d1-customer-segmentation-repository';
import {
  createCustomerSegmentExecution, type CustomerSegmentAdvance,
} from '../src/modules/customers/application/customer-segmentation-execution';
import {
  CustomerSegmentationContractError, segmentFingerprint,
  type CustomerSegmentFactsSnapshot,
} from '../src/modules/customers/application/customer-segmentation-contract';
import type { CustomerSegmentFactsPolicy } from '../src/modules/customers/application/customer-segmentation-facts';
import type { CustomerSegmentationRepository } from '../src/modules/customers/application/customer-segmentation-repository';

const CREATED = '2026-09-01T10:00:00.000Z';
const AT = '2099-01-01T00:00:00.000Z';
const now = () => Date.parse(AT);
const policy: CustomerSegmentFactsPolicy = {
  schemaVersion: 1, id: 'test.execution', version: 1, population: 'active_profiles',
  orderStatuses: ['paid', 'shipped', 'delivered'], orderEligibility: 'successful_capture',
  activityBasis: 'last_successful_capture', amountBasis: 'captured_payments',
  refunds: 'subtract', storedValue: 'include', paymentAdjustments: 'reject',
  unsettledPayments: 'reject', missingPaymentEvidence: 'null', currency: 'EUR',
  foreignCurrency: 'exclude_orders', dayBoundary: 'elapsed_24h_floor',
};
const template = {
  id: 'test.orders', version: 1,
  parameters: [{ name: 'minimum', min: 0, max: 100 }],
  conditions: [{ fact: 'orders.count', operator: 'gte', parameter: 'minimum' }],
} as const;
const context = (key: string, occurredAt = CREATED) => ({
  actorId: 'system:test', idempotencyKey: `test-execution:${key}`, occurredAt,
});

async function fixture(size = 3) {
  const db = new SqliteD1();
  for (let index = 1; index <= size; index++) {
    db.sqlite.prepare(`INSERT INTO customer_profiles
      (id,primary_email,email_identity_hash,status,version,created_at,updated_at)
      VALUES (?,?,?,'active',1,?,?)`)
      .run(`profile:${index}`, `private-${index}@example.test`, index.toString(16).padStart(64, '0'), CREATED, CREATED);
  }
  const repository = createD1CustomerSegmentationRepository(db.asD1(), { now });
  const realSource = createD1CustomerSegmentFactsSource(db.asD1(), policy, { now });
  const source = { capture: vi.fn(() => realSource.capture()) };
  await repository.appendDefinition({ ...context('definition'), segmentId: 'test-segment',
    expectedVersion: 0, template, parameters: { minimum: 0 } });
  const requested = await repository.requestRun({ ...context('request'), segmentId: 'test-segment', definitionVersion: 1 });
  const runId = requested.value.runId;
  const input = { runId, actorId: 'system:test', limit: 1 };
  const execution = createCustomerSegmentExecution({ repository, source, policy, now });
  return { db, repository, source, runId, input, execution };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function complete(f: Awaited<ReturnType<typeof fixture>>, runId = f.runId) {
  let result = await f.execution.advance({ ...f.input, runId, limit: 100 });
  for (let step = 0; step < 3 && result.run.snapshot.state !== 'completed'; step++) {
    result = await f.execution.advance({ ...f.input, runId, limit: 100 });
  }
  expect(result.run.snapshot.state).toBe('completed');
  return result;
}

describe('bounded internal customer segment execution', () => {
  it('advances one durable transition per call and requires separate explicit publication', async () => {
    const f = await fixture();
    const started = await f.execution.advance(f.input);
    expect(started).toMatchObject({ outcome: 'applied', run: { snapshot: {
      state: 'running', revision: 2, totalCandidates: 3, processedCandidates: 0,
    } } });
    expect(Object.isFrozen(started)).toBe(true);
    expect((await f.execution.advance(f.input)).run.snapshot.processedCandidates).toBe(1);
    expect((await f.execution.advance(f.input)).run.snapshot.processedCandidates).toBe(2);
    const lastBatch = await f.execution.advance(f.input);
    expect(lastBatch.run.snapshot).toMatchObject({ state: 'running', processedCandidates: 3, cursor: null });
    expect((await f.execution.advance(f.input)).run.snapshot).toMatchObject({ state: 'completed', revision: 6 });
    expect(f.source.capture).toHaveBeenCalledTimes(1);
    expect(await f.repository.readMembership('test-segment', 'profile:1')).toEqual({ state: 'unpublished' });
    const result = await f.execution.publish({ ...context('publish', AT), segmentId: 'test-segment',
      runId: f.runId, expectedPublicationVersion: 0 });
    expect(result).toMatchObject({ outcome: 'applied', value: { runId: f.runId, version: 1 } });
    expect(await f.repository.readMembership('test-segment', 'profile:1')).toMatchObject({ state: 'evaluated', matches: true });
    expect(JSON.stringify(started)).not.toMatch(/private-|primary_email|facts_json|candidates/);
  });

  it('moves an empty population through running before completing and leaves terminal runs unchanged', async () => {
    const f = await fixture(0);
    const started = await f.execution.advance(f.input);
    expect(started.run.snapshot).toMatchObject({ state: 'running', totalCandidates: 0, cursor: null });
    const completed = await f.execution.advance(f.input);
    expect(completed.run.snapshot.state).toBe('completed');
    const unchanged = await f.execution.advance(f.input);
    expect(unchanged).toEqual({ outcome: 'unchanged', run: completed.run });
    expect(await f.repository.readSnapshots(f.runId)).toHaveLength(3);
    expect(f.source.capture).toHaveBeenCalledTimes(1);
  });

  it('always rereads the current run after an exact request replay returns requested history', async () => {
    const f = await fixture(1);
    await f.execution.advance(f.input);
    const replayed = await f.repository.requestRun({ ...context('request'), segmentId: 'test-segment', definitionVersion: 1 });
    expect(replayed).toMatchObject({ outcome: 'replayed', value: { snapshot: { state: 'requested' } } });
    const step = await f.execution.advance({ ...f.input, runId: replayed.value.runId });
    expect(step.run.snapshot.processedCandidates).toBe(1);
    expect(f.source.capture).toHaveBeenCalledTimes(1);
  });

  it('resumes committed start and progress after lost responses without recapture or duplicate evaluation', async () => {
    const f = await fixture(2);
    const transport = new Error('synthetic lost response');
    const startRun = vi.fn(async (command: Parameters<CustomerSegmentationRepository['startRun']>[0]) => {
      await f.repository.startRun(command);
      throw transport;
    });
    const first = createCustomerSegmentExecution({ repository: { ...f.repository, startRun }, source: f.source, policy, now });
    await expect(first.advance(f.input)).rejects.toBe(transport);
    expect((await f.repository.readRun(f.runId))?.snapshot.state).toBe('running');
    const capturedCommand = startRun.mock.calls[0]![0];
    expect(Object.isFrozen(capturedCommand)).toBe(true);
    expect(Object.isFrozen(capturedCommand.snapshot)).toBe(true);
    expect((await f.repository.startRun(capturedCommand)).outcome).toBe('replayed');
    const appendProgress = vi.fn(async (command: Parameters<CustomerSegmentationRepository['appendProgress']>[0]) => {
      await f.repository.appendProgress(command);
      throw transport;
    });
    const second = createCustomerSegmentExecution({ repository: { ...f.repository, appendProgress }, source: f.source, policy, now });
    await expect(second.advance(f.input)).rejects.toBe(transport);
    expect((await f.repository.readRun(f.runId))?.snapshot.processedCandidates).toBe(1);
    const recovered = await f.execution.advance(f.input);
    expect(recovered.run.snapshot.processedCandidates).toBe(2);
    expect(f.source.capture).toHaveBeenCalledTimes(1);
    expect(f.db.value('SELECT count(*) AS value FROM customer_segment_results WHERE evaluated_revision IS NOT NULL')).toBe(2);
    expect(f.db.value("SELECT count(*) AS value FROM customer_segment_run_snapshots WHERE state='failed'")).toBe(0);
  });

  it('derives the idempotency key from the complete fixed command including time, actor and limit', async () => {
    const f = await fixture(2);
    const startRun = vi.fn((command: Parameters<CustomerSegmentationRepository['startRun']>[0]) => f.repository.startRun(command));
    const execution = createCustomerSegmentExecution({ repository: { ...f.repository, startRun }, source: f.source, policy, now });
    await execution.advance(f.input);
    const { idempotencyKey, ...payload } = startRun.mock.calls[0]![0];
    expect(idempotencyKey).toBe(`segment-execution:startrun:${await segmentFingerprint({ operation: 'startRun', ...payload })}`);
    const commands: Parameters<CustomerSegmentationRepository['appendProgress']>[0][] = [];
    const stop = new Error('write did not start');
    const appendProgress = vi.fn(async (command: Parameters<CustomerSegmentationRepository['appendProgress']>[0]) => {
      commands.push(command); throw stop;
    });
    let time = now();
    const pending = createCustomerSegmentExecution({ repository: { ...f.repository, appendProgress }, source: f.source, policy, now: () => time });
    await expect(pending.advance(f.input)).rejects.toBe(stop);
    await expect(pending.advance({ ...f.input, limit: 2 })).rejects.toBe(stop);
    await expect(pending.advance({ ...f.input, actorId: 'system:other' })).rejects.toBe(stop);
    time++;
    await expect(pending.advance(f.input)).rejects.toBe(stop);
    expect(new Set(commands.map((command) => command.idempotencyKey)).size).toBe(4);
    for (const command of commands) {
      const { idempotencyKey: key, ...body } = command;
      expect(Object.isFrozen(command)).toBe(true);
      expect(key).toBe(`segment-execution:appendprogress:${await segmentFingerprint({ operation: 'appendProgress', ...body })}`);
    }
  });

  it('reconciles concurrent starts and progress once without advancing the winning revision again', async () => {
    const f = await fixture(3);
    const snapshot = await f.source.capture();
    const sources = { capture: async () => snapshot };
    const readRun = vi.fn((id: string) => f.repository.readRun(id));
    const repository = { ...f.repository, readRun };
    const first = createCustomerSegmentExecution({ repository, source: sources, policy, now });
    const second = createCustomerSegmentExecution({ repository, source: sources, policy, now });
    const started = await Promise.all([first.advance(f.input), second.advance({ ...f.input, actorId: 'system:second' })]);
    expect(started.map((result) => result.outcome).sort()).toEqual(['applied', 'reconciled']);
    expect(started.every((result) => result.run.snapshot.revision === 2)).toBe(true);
    expect(readRun).toHaveBeenCalledTimes(3);
    readRun.mockClear();
    const progress = await Promise.all([first.advance(f.input), second.advance({ ...f.input, actorId: 'system:second' })]);
    expect(progress.map((result) => result.outcome).sort()).toEqual(['applied', 'reconciled']);
    expect(progress.every((result) => result.run.snapshot.processedCandidates === 1)).toBe(true);
    expect(readRun).toHaveBeenCalledTimes(3);
    expect(await f.repository.readSnapshots(f.runId)).toHaveLength(3);
  });
});

describe('capture failures, policy identity and cancellation', () => {
  it.each([
    [new CustomerSegmentationContractError('synthetic invalid source'), 'facts_capture_invalid'],
    [new Error('synthetic infrastructure unavailable'), 'facts_capture_unavailable'],
  ])('records a closed failure code for capture errors: %s', async (error, errorCode) => {
    const f = await fixture();
    const source = { capture: vi.fn(async () => { throw error; }) };
    const execution = createCustomerSegmentExecution({ repository: f.repository, source, policy, now });
    const result = await execution.advance(f.input);
    expect(result.run.snapshot).toMatchObject({ state: 'failed', errorCode, revision: 2, totalCandidates: 0 });
    expect(JSON.stringify(result)).not.toContain(error.message);
    expect((await execution.advance(f.input)).outcome).toBe('unchanged');
    expect(source.capture).toHaveBeenCalledTimes(1);
  });

  it('propagates failure persistence errors without asserting a durable failed state', async () => {
    const f = await fixture();
    const transport = new Error('synthetic failure write unavailable');
    const failRun = vi.fn(async () => { throw transport; });
    const execution = createCustomerSegmentExecution({ repository: { ...f.repository, failRun },
      source: { capture: async () => { throw new Error('source unavailable'); } }, policy, now });
    await expect(execution.advance(f.input)).rejects.toBe(transport);
    expect((await f.repository.readRun(f.runId))?.snapshot.state).toBe('requested');
    expect(failRun).toHaveBeenCalledTimes(1);
  });

  it('closes an over-capacity complete capture without importing a truncated population', async () => {
    const f = await fixture(101);
    const result = await f.execution.advance(f.input);
    expect(result.run.snapshot).toMatchObject({ state: 'failed', errorCode: 'facts_capture_invalid', totalCandidates: 0 });
    expect(f.db.value('SELECT count(*) AS value FROM customer_segment_results')).toBe(0);
  });

  it('reconciles a discarded failing capture after another coordinator has already started', async () => {
    const f = await fixture();
    const capture = deferred<CustomerSegmentFactsSnapshot>();
    const entered = deferred<void>();
    const execution = createCustomerSegmentExecution({ repository: f.repository, policy, now,
      source: { capture: () => { entered.resolve(); return capture.promise; } } });
    const pending = execution.advance(f.input);
    await entered.promise;
    await f.execution.advance(f.input);
    capture.reject(new Error('discarded capture failure'));
    const result = await pending;
    expect(result).toMatchObject({ outcome: 'reconciled', run: { snapshot: { state: 'running', revision: 2 } } });
    expect(await f.repository.readSnapshots(f.runId)).toHaveLength(2);
  });

  it('rejects a competing policy winner instead of adopting it while reconciling a start collision', async () => {
    const f = await fixture();
    const otherPolicy = { ...policy, refunds: 'ignore' };
    const otherSource = createD1CustomerSegmentFactsSource(f.db.asD1(), otherPolicy, { now });
    const snapshot = await otherSource.capture();
    const entered = deferred<void>();
    const gate = deferred<CustomerSegmentFactsSnapshot>();
    const competitor = createCustomerSegmentExecution({ repository: f.repository, policy: otherPolicy, now,
      source: { capture: () => { entered.resolve(); return gate.promise; } } });
    const pending = competitor.advance(f.input);
    await entered.promise;
    await f.execution.advance(f.input);
    gate.resolve(snapshot);
    await expect(pending).rejects.toThrow(/política/);
    expect((await f.repository.readRun(f.runId))?.snapshot).toMatchObject({ state: 'running', revision: 2 });
  });

  it.each(['policy', 'content', 'currency', 'legacy'] as const)('fails capture with invalid %s reference evidence', async (mode) => {
    const f = await fixture();
    const snapshot = await f.source.capture();
    const mutated = mode === 'policy' ? { ...snapshot, ref: snapshot.ref.replace(/^source:[a-f0-9]{64}/, `source:${'0'.repeat(64)}`) }
      : mode === 'content' ? { ...snapshot, candidates: [] }
        : mode === 'currency' ? { ...snapshot, currency: 'USD' }
          : { ...snapshot, ref: 'snapshot:legacy' };
    const execution = createCustomerSegmentExecution({ repository: f.repository, source: { capture: async () => mutated }, policy, now });
    expect((await execution.advance(f.input)).run.snapshot).toMatchObject({ state: 'failed', errorCode: 'facts_capture_invalid' });
    expect(f.db.value('SELECT count(*) AS value FROM customer_segment_results')).toBe(0);
  });

  it('refuses a different policy under the same identity when resuming without failing the existing run', async () => {
    const f = await fixture();
    await f.execution.advance(f.input);
    const execution = createCustomerSegmentExecution({ repository: f.repository, source: f.source,
      policy: { ...policy, refunds: 'ignore' }, now });
    await expect(execution.advance(f.input)).rejects.toThrow(/política/);
    expect((await f.repository.readRun(f.runId))?.snapshot).toMatchObject({ state: 'running', revision: 2 });
    expect(f.source.capture).toHaveBeenCalledTimes(1);
  });

  it('does not adopt the current policy for a legacy run without a policy fingerprint', async () => {
    const f = await fixture();
    const snapshot = await f.source.capture();
    await f.repository.startRun({ ...context('legacy-start', AT), runId: f.runId, expectedRevision: 1,
      snapshot: { ...snapshot, ref: 'snapshot:legacy' } });
    await expect(f.execution.advance(f.input)).rejects.toThrow(/política/);
    expect((await f.repository.readRun(f.runId))?.snapshot.revision).toBe(2);
  });

  it('checks abort before IO, after reads, during capture and after a submitted write', async () => {
    const f = await fixture();
    const controller = new AbortController();
    controller.abort();
    const readRun = vi.fn((id: string) => f.repository.readRun(id));
    const execution = createCustomerSegmentExecution({ repository: { ...f.repository, readRun }, source: f.source, policy, now });
    await expect(execution.advance({ ...f.input, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(readRun).not.toHaveBeenCalled();
    const afterRead = new AbortController();
    const stopped = createCustomerSegmentExecution({ repository: { ...f.repository, readRun: async (id) => {
      const result = await f.repository.readRun(id); afterRead.abort(); return result;
    } }, source: f.source, policy, now });
    await expect(stopped.advance({ ...f.input, signal: afterRead.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(f.source.capture).not.toHaveBeenCalled();
    const duringCapture = new AbortController();
    const cancelledCapture = createCustomerSegmentExecution({ repository: f.repository, policy, now,
      source: { capture: async () => { const value = await f.source.capture(); duringCapture.abort(); return value; } } });
    await expect(cancelledCapture.advance({ ...f.input, signal: duringCapture.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect((await f.repository.readRun(f.runId))?.snapshot.state).toBe('requested');
    const duringWrite = new AbortController();
    const submitted = createCustomerSegmentExecution({ repository: { ...f.repository, startRun: async (command) => {
      duringWrite.abort(); return f.repository.startRun(command);
    } }, source: f.source, policy, now });
    await expect(submitted.advance({ ...f.input, signal: duringWrite.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect((await f.repository.readRun(f.runId))?.snapshot.state).toBe('running');
    const recovered = await f.execution.advance(f.input);
    expect(recovered.run.snapshot.processedCandidates).toBe(1);
  });

  it('does not fail a run when capture rejects after cancellation', async () => {
    const f = await fixture();
    const controller = new AbortController();
    const execution = createCustomerSegmentExecution({ repository: f.repository, policy, now,
      source: { capture: async () => { controller.abort(); throw new Error('discarded capture'); } } });
    await expect(execution.advance({ ...f.input, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect((await f.repository.readRun(f.runId))?.snapshot.state).toBe('requested');
  });
});

describe('definition changes and publication CAS', () => {
  it.each([false, true])('closes superseded open definitions while preserving confirmed progress (started=%s)', async (started) => {
    const f = await fixture();
    if (started) { await f.execution.advance(f.input); await f.execution.advance(f.input); }
    await f.repository.appendDefinition({ ...context('definition-2', AT), segmentId: 'test-segment',
      expectedVersion: 1, template, parameters: { minimum: 1 } });
    const result = await f.execution.advance(f.input);
    expect(result.run.snapshot).toMatchObject({ state: 'failed', errorCode: 'definition_superseded',
      processedCandidates: started ? 1 : 0, totalCandidates: started ? 3 : 0 });
    expect(f.source.capture).toHaveBeenCalledTimes(started ? 1 : 0);
  });

  it('preserves exact historical publication replay after a newer definition and publication', async () => {
    const f = await fixture(1);
    await complete(f);
    const oldCommand = { ...context('publish-old', AT), segmentId: 'test-segment', runId: f.runId, expectedPublicationVersion: 0 };
    const old = await f.execution.publish(oldCommand);
    await f.repository.appendDefinition({ ...context('definition-2', AT), segmentId: 'test-segment',
      expectedVersion: 1, template, parameters: { minimum: 1 } });
    const nextRun = (await f.repository.requestRun({ ...context('request-2', AT), segmentId: 'test-segment', definitionVersion: 2 })).value;
    await complete(f, nextRun.runId);
    const latest = await f.execution.publish({ ...context('publish-new', AT), segmentId: 'test-segment',
      runId: nextRun.runId, expectedPublicationVersion: 1 });
    const replay = await f.execution.publish(oldCommand);
    expect(replay).toEqual({ outcome: 'replayed', value: old.value, current: latest.value });
    await expect(f.execution.publish({ ...oldCommand, idempotencyKey: 'test-execution:obsolete-new', expectedPublicationVersion: 2 }))
      .rejects.toBeInstanceOf(CustomerSegmentationConflictError);
    expect(f.db.value('SELECT count(*) AS value FROM customer_segment_publications')).toBe(2);
  });

  it('keeps publication explicit and never increments an expected publication version after conflict', async () => {
    const f = await fixture(1);
    const command = { ...context('publication', AT), segmentId: 'test-segment', runId: f.runId, expectedPublicationVersion: 0 };
    await expect(f.execution.publish(command)).rejects.toThrow(/completa/);
    await complete(f);
    await f.execution.publish(command);
    const publish = vi.fn((input: Parameters<CustomerSegmentationRepository['publish']>[0]) => f.repository.publish(input));
    const execution = createCustomerSegmentExecution({ repository: { ...f.repository, publish }, source: f.source, policy, now });
    await expect(execution.publish({ ...command, idempotencyKey: 'test-execution:stale-publication' }))
      .rejects.toBeInstanceOf(CustomerSegmentationConflictError);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0]![0].expectedPublicationVersion).toBe(0);
    expect(f.db.value('SELECT count(*) AS value FROM customer_segment_publications')).toBe(1);
  });

  it('propagates an unknown committed publication response and recovers it through exact command replay', async () => {
    const f = await fixture(1);
    await complete(f);
    const transport = new Error('publication response lost');
    const publish = vi.fn(async (command: Parameters<CustomerSegmentationRepository['publish']>[0]) => {
      await f.repository.publish(command); throw transport;
    });
    const execution = createCustomerSegmentExecution({ repository: { ...f.repository, publish }, source: f.source, policy, now });
    const command = { ...context('lost-publication', AT), segmentId: 'test-segment', runId: f.runId, expectedPublicationVersion: 0 };
    await expect(execution.publish(command)).rejects.toBe(transport);
    expect((await f.execution.publish(command)).outcome).toBe('replayed');
    expect(f.db.value('SELECT count(*) AS value FROM customer_segment_publications')).toBe(1);
  });
});

describe('execution input and clock boundaries', () => {
  it('validates and detaches caller inputs before any IO without invoking getters', async () => {
    const f = await fixture();
    const readRun = vi.fn((id: string) => f.repository.readRun(id));
    const execution = createCustomerSegmentExecution({ repository: { ...f.repository, readRun }, source: f.source, policy, now });
    const getter = vi.fn(() => f.runId);
    const inputs = [
      { ...f.input, limit: 0 }, { ...f.input, limit: 101 }, { ...f.input, limit: 1.5 },
      { ...f.input, limit: '1' }, { ...f.input, runId: ' invalid' }, { ...f.input, actorId: '' },
      { ...f.input, extra: true }, { ...f.input, signal: {} },
      Object.defineProperty({ ...f.input }, 'runId', { enumerable: true, get: getter }),
    ];
    for (const input of inputs) await expect(execution.advance(input as CustomerSegmentAdvance)).rejects.toThrow(CustomerSegmentationContractError);
    expect(getter).not.toHaveBeenCalled();
    expect(readRun).not.toHaveBeenCalled();
    const original = { ...f.input };
    const paused = deferred<void>();
    const entered = deferred<void>();
    const detached = createCustomerSegmentExecution({ repository: { ...f.repository, readRun: async (id) => {
      entered.resolve(); await paused.promise; return f.repository.readRun(id);
    } }, source: f.source, policy, now });
    const pending = detached.advance(original);
    await entered.promise;
    original.actorId = 'system:changed'; original.runId = 'run:changed'; original.limit = 100;
    paused.resolve();
    expect((await pending).run.snapshot.actorId).toBe('system:test');
  });

  it('rejects an invalid clock before reading and a backwards command clock without manufacturing time', async () => {
    const f = await fixture();
    const readRun = vi.fn((id: string) => f.repository.readRun(id));
    const execution = createCustomerSegmentExecution({ repository: { ...f.repository, readRun }, source: f.source, policy, now: () => NaN });
    await expect(execution.advance(f.input)).rejects.toThrow(/Reloj/);
    expect(readRun).not.toHaveBeenCalled();
    await f.execution.advance(f.input);
    const oldClock = createCustomerSegmentExecution({ repository: f.repository, source: f.source, policy,
      now: () => now() - 1 });
    await expect(oldClock.advance(f.input)).rejects.toThrow(/reloj precede/);
    expect((await f.repository.readRun(f.runId))?.snapshot.revision).toBe(2);
  });

  it('refuses unknown run identity without requesting an implicit replacement', async () => {
    const f = await fixture();
    await expect(f.execution.advance({ ...f.input, runId: 'run:missing' })).rejects.toThrow(/no existe/);
    expect(f.source.capture).not.toHaveBeenCalled();
    expect(f.db.value('SELECT count(*) AS value FROM customer_segment_runs')).toBe(1);
  });

  it('validates a publication command fully before IO and never executes accessor payloads', async () => {
    const f = await fixture();
    const readRun = vi.fn((id: string) => f.repository.readRun(id));
    const execution = createCustomerSegmentExecution({ repository: { ...f.repository, readRun }, source: f.source, policy, now });
    const command = { ...context('validation', AT), segmentId: 'test-segment', runId: f.runId, expectedPublicationVersion: 0 };
    const getter = vi.fn(() => 'test-segment');
    const invalid = [
      { ...command, expectedPublicationVersion: Number.MAX_SAFE_INTEGER },
      { ...command, expectedPublicationVersion: -1 }, { ...command, segmentId: 'test:segment' },
      { ...command, idempotencyKey: 'short' }, { ...command, occurredAt: '2099-01-02T00:00:00.000Z' },
      Object.defineProperty({ ...command }, 'segmentId', { enumerable: true, get: getter }),
    ];
    for (const input of invalid) await expect(execution.publish(input)).rejects.toThrow(CustomerSegmentationContractError);
    expect(readRun).not.toHaveBeenCalled();
    expect(getter).not.toHaveBeenCalled();
  });
});
