/**
 * Entry point personalizado del Worker (ver `workerEntryPoint` en astro.config.mjs).
 *
 * Envuelve el handler `fetch` estándar de Astro y añade un handler `scheduled`
 * para dos Cron Triggers de Cloudflare: reset de fixtures cada 6 h en demo y
 * recuperación del outbox cada 5 min en una tienda real.
 */
import type {
  ExecutionContext,
  ExportedHandlerFetchHandler,
  ScheduledController,
} from '@cloudflare/workers-types';
import type { SSRManifest } from 'astro';
import { App } from 'astro/app';
import { handle } from '@astrojs/cloudflare/handler';
import { seedStatements } from '../seed/seed';
import { flushEventOutbox } from './composition/outbox-dispatcher';

const DEMO_RESET_CRON = '0 */6 * * *';
const OUTBOX_CRON = '*/5 * * * *';

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
        if (controller.cron === DEMO_RESET_CRON && env.DEMO_MODE === 'true') {
          await env.DB.batch(seedStatements().map((sql) => env.DB.prepare(sql)));
          return;
        }
        if (controller.cron === OUTBOX_CRON && env.DEMO_MODE !== 'true') {
          context.waitUntil(flushEventOutbox(env.DB, env));
        }
      },
    },
  };
}
