import type { APIRoute } from 'astro';
import { seedStatements } from '../../../../seed/seed';

export const prerender = false;

/** Restaura el estado sembrado de la demo. Solo existe con DEMO_MODE activo. */
export const POST: APIRoute = async ({ locals }) => {
  const env = locals.runtime.env;
  if (env.DEMO_MODE !== 'true') {
    return Response.json({ error: 'Solo disponible en modo demo' }, { status: 403 });
  }
  await env.DB.batch(seedStatements().map((sql) => env.DB.prepare(sql)));
  return Response.json({ ok: true });
};
