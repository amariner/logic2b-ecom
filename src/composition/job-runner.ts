import { seedStatements } from '../../seed/seed';
import { executeJob, type JobExecutionResult, type JobHandler } from '../platform/jobs';
import type { Platform } from './create-platform';
import { flushEventOutbox } from './outbox-dispatcher';
import { runtimePlatform } from './runtime-platform';

export type ScheduledJobEnv = Env & Readonly<{
  DEMO_MODE: string;
  RESEND_API_KEY?: string;
}>;

function handlerFor(jobId: string, env: ScheduledJobEnv): JobHandler {
  switch (jobId) {
    case 'platform-configuration.demo-fixture-reset':
      return async (_run, signal) => {
        if (env.DEMO_MODE !== 'true' || signal.aborted) return;
        await env.DB.batch(seedStatements().map((sql) => env.DB.prepare(sql)));
      };
    case 'notifications.event-outbox-sweep':
      return async (_run, signal) => {
        if (env.DEMO_MODE === 'true' || signal.aborted) return;
        await flushEventOutbox(env.DB, env);
      };
    default:
      throw new Error('unknown-job-handler');
  }
}

/**
 * Composition root de Cron Trigger: el manifest decide qué job existe y el
 * runner D1 deduplica, reclama y conserva su resultado antes de ejecutar I/O.
 */
export async function runScheduledPlatformJobs(
  cron: string,
  scheduledTime: number,
  env: ScheduledJobEnv,
  platform: Platform = runtimePlatform,
): Promise<readonly JobExecutionResult[]> {
  const envMode = env.DEMO_MODE === 'true' ? 'demo' : 'client';
  // Config y variable deben contar la misma verdad. Ante deriva, ningún cron
  // ejecuta efectos: el despliegue falla cerrado y la fila ni siquiera nace.
  if (platform.manifest.deployment.mode !== envMode) return Object.freeze([]);
  const scheduledFor = new Date(scheduledTime).toISOString();
  const jobs = platform.scheduledJobs(cron);
  const results = await Promise.all(jobs.map((job) => executeJob(
    env.DB,
    job,
    {
      triggerKind: 'recurring',
      scheduledFor,
      idempotencyKey: `${job.id}:${scheduledFor}`,
    },
    handlerFor(job.id, env),
  )));
  return Object.freeze(results);
}
