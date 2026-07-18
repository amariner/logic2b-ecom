/**
 * Entry point personalizado del Worker (ver `workerEntryPoint` en astro.config.mjs).
 *
 * Envuelve el handler `fetch` estándar de Astro y añade un handler `scheduled`
 * para el Cron Trigger de Cloudflare (cada 6 h, ver `triggers.crons` en
 * wrangler.jsonc): restaura el estado sembrado de la demo, exactamente igual
 * que `POST /api/demo/reset`.
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
      async scheduled(_controller: ScheduledController, env: WorkerEnv, _context: ExecutionContext) {
        // Mismo guard que /api/demo/reset: si esto se desplegara por error en
        // una tienda real (DEMO_MODE off), el cron no debe tocar datos.
        if (env.DEMO_MODE !== 'true') return;
        await env.DB.batch(seedStatements().map((sql) => env.DB.prepare(sql)));
      },
    },
  };
}
