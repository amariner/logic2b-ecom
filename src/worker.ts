/**
 * Entry point personalizado del Worker (ver `workerEntryPoint` en astro.config.mjs).
 *
 * Envuelve el handler `fetch` estándar de Astro y añade un handler `scheduled`
 * para los Cron Triggers registrados por R1.11: refresco semanal y acotado de
 * pedidos ficticios en demo, y recuperación del outbox cada 5 min en una tienda real.
 */
import type {
  ExecutionContext,
  ExportedHandlerFetchHandler,
  ScheduledController,
} from '@cloudflare/workers-types';
import type { SSRManifest } from 'astro';
import { App } from 'astro/app';
import { handle } from '@astrojs/cloudflare/handler';
import { runScheduledPlatformJobs } from './composition/job-runner';

type WorkerEnv = Env & {
  ASSETS: { fetch: (req: Request | string) => Promise<Response> };
};

export function createExports(manifest: SSRManifest) {
  const app = new App(manifest);
  return {
    default: {
      async fetch(
        request: Parameters<ExportedHandlerFetchHandler>[0],
        env: WorkerEnv,
        context: ExecutionContext,
      ) {
        return handle(manifest, app, request, env, context);
      },
      async scheduled(controller: ScheduledController, env: WorkerEnv, context: ExecutionContext) {
        context.waitUntil(runScheduledPlatformJobs(controller.cron, controller.scheduledTime, env).then(() => undefined));
      },
    },
  };
}
