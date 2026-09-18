import { describe, expect, it, vi } from 'vitest';
import {
  CustomerSegmentationContractError,
  normalizeCustomerSegmentFactsSnapshot,
} from '../src/modules/customers/application/customer-segmentation-contract';
import { createD1CustomerSegmentationRepository } from '../src/modules/customers/infrastructure/d1-customer-segmentation-repository';
import { SqliteD1 } from './sqlite-d1';

const NOW = Date.parse('2026-09-18T12:00:00.000Z');
const AT = '2026-09-18T11:00:00.000Z';
const TEMPLATE = {
  id: 'test_orders', version: 1,
  parameters: [{ name: 'minimum', min: 0, max: 100 }],
  conditions: [{ fact: 'orders.count', operator: 'gte', parameter: 'minimum' }],
} as const;
const context = (idempotencyKey: string) => ({ actorId: 'test:operator', idempotencyKey, occurredAt: AT });

async function fixture() {
  const db = new SqliteD1();
  db.sqlite.prepare(`INSERT INTO customer_profiles (id,primary_email,email_identity_hash,status,version,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?)`).run('customer:present', 'present@example.test', 'a'.repeat(64), 'active', 1, AT, AT);
  let id = 0;
  const repository = createD1CustomerSegmentationRepository(db.asD1(), { now: () => NOW, newId: () => `id-${++id}` });
  await repository.appendDefinition({ ...context('test:definition'), segmentId: 'orders', expectedVersion: 0,
    template: TEMPLATE, parameters: { minimum: 1 } });
  const requested = await repository.requestRun({ ...context('test:request'), segmentId: 'orders', definitionVersion: 1 });
  const facts = (customerProfileId: string) => ({ customerProfileId, customerProfileVersion: 1, facts: { 'orders.count': 2 } });
  const source = () => normalizeCustomerSegmentFactsSnapshot({
    ref: 'test:snapshot', policyId: 'test_policy', policyVersion: 1, capturedAt: AT, currency: 'EUR',
    candidates: [facts('customer:present')],
  }, NOW);
  return { db, repository, runId: requested.value.runId, source, facts };
}

describe('R5.6b adversarial repository boundaries', () => {
  it('rolls back the entire source import when a later candidate has no profile', async () => {
    const { db, repository, runId, source, facts } = await fixture();
    await expect(repository.startRun({ ...context('test:start-missing'), runId, expectedRevision: 1,
      snapshot: normalizeCustomerSegmentFactsSnapshot({
        ...source(), candidates: [facts('customer:present'), facts('customer:missing')],
      }, NOW),
    })).rejects.toThrow(/FOREIGN KEY/);
    expect(db.value('SELECT count(*) AS value FROM customer_segment_results')).toBe(0);
    expect(db.value('SELECT count(*) AS value FROM customer_segment_run_snapshots')).toBe(1);
    expect((await repository.readRun(runId))?.snapshot.state).toBe('requested');
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('propagates an unknown D1 failure without turning it into conflict or empty progress', async () => {
    const { db, repository, runId, source } = await fixture();
    const failure = new Error('injected D1 unavailable');
    const batch = vi.spyOn(db, 'batch').mockRejectedValueOnce(failure);
    await expect(repository.startRun({ ...context('test:start-down'), runId, expectedRevision: 1, snapshot: source() }))
      .rejects.toBe(failure);
    batch.mockRestore();
    expect(db.value('SELECT count(*) AS value FROM customer_segment_results')).toBe(0);
    expect((await repository.readRun(runId))?.snapshot.state).toBe('requested');
  });

  it('propagates membership read failure without reporting unpublished', async () => {
    const { db, repository } = await fixture();
    const failure = new Error('injected membership read unavailable');
    const batch = vi.spyOn(db, 'batch').mockRejectedValueOnce(failure);
    await expect(repository.readMembership('orders', 'customer:present')).rejects.toBe(failure);
    batch.mockRestore();
  });

  it('does not mask unrelated D1 errors with matching evidence written by a concurrent command', async () => {
    const { db, repository } = await fixture();
    const command = { ...context('test:concurrent-definition'), segmentId: 'racing', expectedVersion: 0,
      template: TEMPLATE, parameters: { minimum: 1 } };
    const concurrentRepository = createD1CustomerSegmentationRepository(db.asD1(), { now: () => NOW });
    const failure = new Error('injected D1 connection failed');
    const batch = vi.spyOn(db, 'batch').mockImplementationOnce(async () => {
      await concurrentRepository.appendDefinition(command);
      throw failure;
    });
    await expect(repository.appendDefinition(command)).rejects.toBe(failure);
    batch.mockRestore();
    await expect(repository.appendDefinition(command)).resolves.toMatchObject({ outcome: 'replayed' });
    expect(db.value("SELECT count(*) AS value FROM customer_segment_definitions WHERE segment_id='racing'"))
      .toBe(1);
  });

  it('rejects unknown command fields and getters before accessing D1', async () => {
    const { db, repository, runId } = await fixture();
    const prepare = vi.spyOn(db, 'prepare');
    const command = { ...context('test:fail-unknown'), runId, expectedRevision: 1, errorCode: 'provider_unavailable' };
    await expect(repository.failRun({ ...command, matches: true } as never)).rejects.toBeInstanceOf(CustomerSegmentationContractError);
    const getter = vi.fn(() => 1);
    await expect(repository.failRun(Object.defineProperty(command, 'expectedRevision', { enumerable: true, get: getter })))
      .rejects.toBeInstanceOf(CustomerSegmentationContractError);
    expect(prepare).not.toHaveBeenCalled();
    expect(getter).not.toHaveBeenCalled();
    prepare.mockRestore();
  });

  it('captures the start command before asynchronous hashing instead of rereading mutable caller input', async () => {
    const { repository, runId, source } = await fixture();
    const other = await repository.requestRun({ ...context('test:request-other'), segmentId: 'orders', definitionVersion: 1 });
    const command = { ...context('test:start-mutable'), runId, expectedRevision: 1, snapshot: source() };
    const pending = repository.startRun(command);
    command.runId = other.value.runId;
    await pending;
    expect((await repository.readRun(runId))?.snapshot.state).toBe('running');
    expect((await repository.readRun(other.value.runId))?.snapshot.state).toBe('requested');
  });

  it('classifies overlong error codes as contract errors before executing SQL', async () => {
    const { db, repository, runId } = await fixture();
    const prepare = vi.spyOn(db, 'prepare');
    await expect(repository.failRun({ ...context('test:fail-long'), runId, expectedRevision: 1, errorCode: 'x'.repeat(201) }))
      .rejects.toBeInstanceOf(CustomerSegmentationContractError);
    expect(prepare).not.toHaveBeenCalled();
    prepare.mockRestore();
  });

  it('rejects extended year timestamps at the D1 application boundary', async () => {
    const { db, repository } = await fixture();
    const prepare = vi.spyOn(db, 'prepare');
    await expect(repository.appendDefinition({ ...context('test:negative-year'), occurredAt: '-000001-01-01T00:00:00.000Z',
      segmentId: 'historical', expectedVersion: 0, template: TEMPLATE, parameters: { minimum: 1 },
    })).rejects.toBeInstanceOf(CustomerSegmentationContractError);
    expect(prepare).not.toHaveBeenCalled();
    prepare.mockRestore();
  });

  it('rejects template identifiers beyond the persisted limit as contract errors', async () => {
    const { db, repository } = await fixture();
    const prepare = vi.spyOn(db, 'prepare');
    await expect(repository.appendDefinition({ ...context('test:template-long'), segmentId: 'long_template', expectedVersion: 0,
      template: { ...TEMPLATE, id: 'a'.repeat(201) }, parameters: { minimum: 1 },
    })).rejects.toBeInstanceOf(CustomerSegmentationContractError);
    expect(prepare).not.toHaveBeenCalled();
    prepare.mockRestore();
  });

  it('detects a persisted definition whose syntactically valid hash no longer identifies its content', async () => {
    const { db, repository } = await fixture();
    // Se simula daño de almacenamiento, no una escritura autorizada del repositorio.
    db.sqlite.exec('DROP TRIGGER customer_segment_definitions_update_guard');
    db.sqlite.prepare('UPDATE customer_segment_definitions SET definition_fingerprint=?').run('f'.repeat(64));
    await expect(repository.readDefinition('orders')).rejects.toBeInstanceOf(CustomerSegmentationContractError);
  });

  it('rejects a corrupt completed snapshot before exposing its published membership', async () => {
    const { db, repository, runId, source } = await fixture();
    const started = await repository.startRun({ ...context('test:start-corrupt'), runId, expectedRevision: 1, snapshot: source() });
    await repository.appendProgress({ ...context('test:progress-corrupt'), runId, expectedRevision: 2, cursor: started.value.cursor!, limit: 1 });
    await repository.completeRun({ ...context('test:complete-corrupt'), runId, expectedRevision: 3 });
    await repository.publish({ ...context('test:publish-corrupt'), segmentId: 'orders', runId, expectedPublicationVersion: 0 });
    await expect(repository.readMembership('orders', 'customer:present')).resolves.toMatchObject({ state: 'evaluated', matches: true });
    // Daño simulado después de publicar: una etiqueta completed no acredita cierre.
    db.sqlite.exec('DROP TRIGGER customer_segment_run_snapshots_update_guard; PRAGMA ignore_check_constraints=ON;');
    db.sqlite.prepare("UPDATE customer_segment_run_snapshots SET finished_at=NULL WHERE state='completed'").run();
    await expect(repository.readRun(runId)).rejects.toBeInstanceOf(CustomerSegmentationContractError);
    await expect(repository.readMembership('orders', 'customer:present')).rejects.toBeInstanceOf(CustomerSegmentationContractError);
  });
});
