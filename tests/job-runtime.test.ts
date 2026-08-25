import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import migration from '../migrations/0006_platform_job_runs.sql?raw';
import { createPlatform } from '../src/composition/create-platform';
import { runScheduledPlatformJobs, type ScheduledJobEnv } from '../src/composition/job-runner';
import { createPublicDemoManifest } from '../src/platform/configuration';
import {
  createD1JobRunRepository,
  executeJob,
  type JobDescriptor,
} from '../src/platform/jobs';
import { seedStatements } from '../seed/seed';
import { SqliteD1 } from './sqlite-d1';

const NOW = '2026-08-07T12:00:00.000Z';
const oneOffJob = {
  id: 'platform-configuration.test-once',
  moduleId: 'platform-configuration',
  scope: 'deployment-maintenance',
  trigger: { kind: 'one-off' },
  modes: ['demo'],
  timeoutSeconds: 30,
  maxAttempts: 2,
  retryDelaysSeconds: [60],
} as const satisfies JobDescriptor;

function request(idempotencyKey = 'test-once:1') {
  return { triggerKind: 'one-off' as const, scheduledFor: NOW, idempotencyKey };
}

describe('persistencia y runner de jobs R1.11', () => {
  it('crea el esquema aditivo con índices de claim, lock e historial', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(migration);
    const indexes = db.prepare(`
      SELECT name FROM sqlite_schema
      WHERE type = 'index' AND name LIKE 'idx_platform_job_runs_%'
      ORDER BY name
    `).all().map((row) => row.name);
    expect(indexes).toEqual([
      'idx_platform_job_runs_claim',
      'idx_platform_job_runs_history',
      'idx_platform_job_runs_lock',
    ]);
    expect(() => db.prepare(`
      INSERT INTO platform_job_runs (
        run_id, job_id, trigger_kind, scheduled_for, idempotency_key,
        status, available_at, created_at, updated_at
      ) VALUES ('bad', 'bad.job', 'one-off', ?, 'bad:1', 'running', ?, ?, ?)
    `).run(NOW, NOW, NOW, NOW)).toThrow(/CHECK/);
  });

  it('deduplica la solicitud y concede el lock a un solo Worker', async () => {
    const db = new SqliteD1();
    const repository = createD1JobRunRepository(db.asD1());
    expect(await repository.schedule(oneOffJob, request(), 'run-1', NOW)).toBe(true);
    expect(await repository.schedule(oneOffJob, request(), 'run-2', NOW)).toBe(false);
    const [first, second] = await Promise.all([
      repository.claim(oneOffJob, 'worker-a', NOW),
      repository.claim(oneOffJob, 'worker-b', NOW),
    ]);
    const winner = first ?? second;
    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect(winner).toMatchObject({ runId: 'run-1', attemptCount: 1 });
    expect(await repository.succeed(winner!, first ? 'worker-a' : 'worker-b', NOW)).toBe(true);
    expect(db.query<{ status: string; attempt_count: number }>(
      'SELECT status, attempt_count FROM platform_job_runs',
    )[0]).toEqual({ status: 'succeeded', attempt_count: 1 });
  });

  it('reintenta con backoff, pasa a dead y permite replay explícito', async () => {
    const db = new SqliteD1();
    const repository = createD1JobRunRepository(db.asD1());
    await repository.schedule(oneOffJob, request(), 'run-retry', NOW);
    const first = await repository.claim(oneOffJob, 'worker-a', NOW);
    expect(first).not.toBeNull();
    expect(await repository.fail(oneOffJob, first!, 'worker-a', NOW, {
      code: 'test-failure', message: 'Fallo seguro.',
    })).toBe('pending');
    expect(db.query<{ status: string; available_at: string }>(
      'SELECT status, available_at FROM platform_job_runs',
    )[0]).toEqual({ status: 'pending', available_at: '2026-08-07T12:01:00.000Z' });

    const second = await repository.claim(oneOffJob, 'worker-b', '2026-08-07T12:01:00.000Z');
    expect(second?.attemptCount).toBe(2);
    expect(await repository.fail(oneOffJob, second!, 'worker-b', '2026-08-07T12:01:01.000Z', {
      code: 'test-failure', message: 'Fallo seguro.',
    })).toBe('dead');
    expect(await repository.replayDead('run-retry', '2026-08-07T13:00:00.000Z')).toBe(true);
    const replay = await repository.claim(oneOffJob, 'worker-replay', '2026-08-07T13:00:00.000Z');
    expect(replay).toMatchObject({ attemptCount: 1, replayCount: 1 });
  });

  it('corta por timeout, persiste un error cerrado y no filtra el mensaje real', async () => {
    const db = new SqliteD1();
    const result = await executeJob(
      db.asD1(),
      oneOffJob,
      request('test-timeout:1'),
      async () => new Promise<void>(() => undefined),
      { now: NOW, runId: 'run-timeout', workerId: 'worker-timeout', timeoutMs: 5 },
    );
    expect(result).toMatchObject({ runId: 'run-timeout', status: 'pending' });
    const row = db.query<{ status: string; last_error_code: string; last_error_message: string }>(
      'SELECT status, last_error_code, last_error_message FROM platform_job_runs',
    )[0];
    expect(row).toMatchObject({ status: 'pending', last_error_code: 'job-timeout' });
    expect(row?.last_error_message).not.toContain('job-timeout');
  });

  it('recupera una lease vencida y bloquea el ACK del propietario anterior', async () => {
    const db = new SqliteD1();
    const repository = createD1JobRunRepository(db.asD1());
    await repository.schedule(oneOffJob, request('test-lease:1'), 'run-lease', NOW);
    const stale = await repository.claim(oneOffJob, 'worker-stale', NOW);
    const recovered = await repository.claim(oneOffJob, 'worker-recovery', '2026-08-07T12:00:31.000Z');
    expect(recovered).toMatchObject({ runId: 'run-lease', attemptCount: 2 });
    expect(await repository.succeed(stale!, 'worker-stale', '2026-08-07T12:00:32.000Z')).toBe(false);
    expect(await repository.succeed(recovered!, 'worker-recovery', '2026-08-07T12:00:32.000Z')).toBe(true);
  });

  it('purga solo éxitos antiguos y conserva dead-letter para operación', async () => {
    const db = new SqliteD1();
    db.sqlite.exec(`
      INSERT INTO platform_job_runs (
        run_id, job_id, trigger_kind, scheduled_for, idempotency_key,
        status, available_at, completed_at, created_at, updated_at
      ) VALUES (
        'old-success', 'platform-configuration.test-once', 'one-off',
        '2026-06-01T00:00:00.000Z', 'old-success:1', 'succeeded',
        '2026-06-01T00:00:00.000Z', '2026-06-01T00:01:00.000Z',
        '2026-06-01T00:00:00.000Z', '2026-06-01T00:01:00.000Z'
      );
      INSERT INTO platform_job_runs (
        run_id, job_id, trigger_kind, scheduled_for, idempotency_key,
        status, attempt_count, available_at, dead_at, created_at, updated_at
      ) VALUES (
        'old-dead', 'platform-configuration.test-once', 'one-off',
        '2026-06-01T00:00:00.000Z', 'old-dead:1', 'dead', 2,
        '2026-06-01T00:00:00.000Z', '2026-06-01T00:01:00.000Z',
        '2026-06-01T00:00:00.000Z', '2026-06-01T00:01:00.000Z'
      );
    `);
    const repository = createD1JobRunRepository(db.asD1());
    expect(await repository.purgeSucceeded(NOW, 30, 100)).toBe(1);
    expect(db.query<{ run_id: string }>('SELECT run_id FROM platform_job_runs')).toEqual([
      { run_id: 'old-dead' },
    ]);
  });

  it('refresca solo pedidos semanalmente, deduplica el tick y preserva catálogo', async () => {
    const db = new SqliteD1();
    await db.batch(seedStatements().map((sql) => db.prepare(sql)));
    const platform = createPlatform(createPublicDemoManifest({
      id: 'jobs-reset-test',
      environment: 'development',
    }));
    const env = { DB: db.asD1(), DEMO_MODE: 'true' } as ScheduledJobEnv;
    const scheduled = Date.parse(NOW);

    db.sqlite.prepare("UPDATE products SET name='CATALOGO ESTABLE' WHERE id=(SELECT min(id) FROM products)").run();
    db.sqlite.prepare("UPDATE orders SET customer_name='PEDIDO MUTADO' WHERE order_number='BM-DEMO-1001'").run();
    expect(await runScheduledPlatformJobs('17 3 * * 1', scheduled, env, platform)).toEqual([
      expect.objectContaining({ status: 'succeeded' }),
    ]);
    expect(db.value("SELECT count(*) AS value FROM products WHERE name='CATALOGO ESTABLE'")).toBe(1);
    expect(db.value("SELECT count(*) AS value FROM orders WHERE customer_name='PEDIDO MUTADO'")).toBe(0);

    db.sqlite.prepare("UPDATE orders SET customer_name='PEDIDO MUTADO' WHERE order_number='BM-DEMO-1001'").run();
    expect(await runScheduledPlatformJobs('17 3 * * 1', scheduled, env, platform)).toEqual([
      expect.objectContaining({ status: 'duplicate' }),
    ]);
    expect(db.value("SELECT count(*) AS value FROM orders WHERE customer_name='PEDIDO MUTADO'")).toBe(1);

    expect(await runScheduledPlatformJobs('17 3 * * 1', scheduled + 7 * 24 * 60 * 60 * 1000, env, platform)).toEqual([
      expect.objectContaining({ status: 'succeeded' }),
    ]);
    expect(db.value("SELECT count(*) AS value FROM products WHERE name='CATALOGO ESTABLE'")).toBe(1);
    expect(db.value("SELECT count(*) AS value FROM orders WHERE customer_name='PEDIDO MUTADO'")).toBe(0);
    expect(db.value("SELECT count(*) AS value FROM platform_job_runs WHERE status='succeeded'")).toBe(2);
  });
});
