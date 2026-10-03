/**
 * Entry point personalizado del Worker (ver `workerEntryPoint` en astro.config.mjs).
 *
 * Envuelve el handler `fetch` estándar de Astro. El handler `scheduled` solo
 * admite jobs configurados en un despliegue cliente; la demo es inerte incluso
 * si recibe un trigger antiguo todavía registrado en el proveedor.
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
import { runtimePlatform } from './composition/runtime-platform';

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
        if (env.DEMO_MODE === 'true' || runtimePlatform.manifest.deployment.mode === 'demo') return;
        context.waitUntil(runScheduledPlatformJobs(controller.cron, controller.scheduledTime, env).then(() => undefined));
      },
    },
  };
}
