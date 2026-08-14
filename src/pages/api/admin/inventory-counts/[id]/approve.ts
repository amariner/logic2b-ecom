import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createInventoryCountOperations } from '../../../../../composition/inventory-count-operations';
import { runtimePlatform } from '../../../../../composition/runtime-platform';

export const prerender = false;
const schema = z.object({
  expected_version: z.number().int().positive(),
  reviewer_id: z.string().trim().min(2).max(120),
  idempotency_key: z.string().min(8).max(160),
}).strict();

export const POST: APIRoute = async ({ params, request, locals }) => {
  const env = locals.runtime.env;
  if (env.DEMO_MODE === 'true') return Response.json({ error: 'El panel público es una muestra de solo lectura.' }, { status: 403 });
  if (!runtimePlatform.hasCapabilityFlag('INV-008', 'sideEffects')) return Response.json({ error: 'Conteos no habilitados.' }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !params.id) return Response.json({ error: 'Datos inválidos' }, { status: 400 });
  try {
    const result = await createInventoryCountOperations(env.DB).approve(
      params.id, parsed.data.expected_version, parsed.data.reviewer_id, parsed.data.idempotency_key,
    );
    if (result.outcome === 'not-found') return Response.json({ error: 'Conteo no encontrado.' }, { status: 404 });
    if (result.outcome === 'conflict') return Response.json({ error: 'El conteo o el stock cambiaron; recarga la página.', count: result.detail }, { status: 409 });
    return Response.json({ ok: true, outcome: result.outcome, count: result.detail });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'No se pudo aprobar el conteo.' }, { status: 409 });
  }
};
