import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createPreorderOperations } from '../../../../composition/preorder-operations';
import { runtimePlatform } from '../../../../composition/runtime-platform';

export const prerender = false;

const schema = z.object({
  expected_version: z.number().int().positive(),
  state: z.enum(['active', 'paused', 'archived']),
}).strict();

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  if (locals.runtime.env.DEMO_MODE === 'true') {
    return Response.json({ error: 'El panel público es una muestra de solo lectura.' }, { status: 403 });
  }
  if (!runtimePlatform.hasCapabilityFlag('PRC-014', 'sideEffects')) {
    return Response.json({ error: 'Preventa y backorder no habilitados.' }, { status: 403 });
  }
  const id = params.id?.trim();
  if (!id) return Response.json({ error: 'Política inválida.' }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const outcome = await createPreorderOperations(locals.runtime.env.DB).changePolicyState(
      id, parsed.data.expected_version, parsed.data.state,
    );
    if (outcome === 'not-found') return Response.json({ error: 'Política no encontrada.' }, { status: 404 });
    if (outcome === 'conflict') return Response.json({ error: 'La política cambió concurrentemente.' }, { status: 409 });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof RangeError || (error instanceof Error &&
        error.message.includes('preorder_policy_activation_conflict'))) {
      return Response.json({ error: error instanceof Error ? error.message : 'Política inválida.' }, { status: 422 });
    }
    throw error;
  }
};
