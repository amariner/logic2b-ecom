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
  return { db, repo, firstPublishCommand, secondPublishCommand, partialProgressCommand, requested, partial, late };
}

function rows(db: SqliteD1): Record<string, Row[]> {
  return Object.fromEntries(BACKUP_TABLES.map((table) => [table, db.query<Row>(`SELECT * FROM ${table}`)]));
}

function stableRows(values: Row[]): Row[] {
  return [...values].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

describe('backup/restore R5.6b', () => {
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

  it('lee las cinco tablas en el mismo batch con columnas explícitas y no oculta un resultado fallido', async () => {
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
    expect(() => old.sqlite.exec(buildBackupSql({}, '2026-08-21'))).toThrow('no such table: customer_segment_definitions');
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
