import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createBundleOperations } from '../../../../composition/bundle-operations';
import { runtimePlatform } from '../../../../composition/runtime-platform';

export const prerender = false;

const schema = z.object({
  expectedVersion: z.number().int().positive(),
  state: z.enum(['active', 'disabled', 'archived']),
}).strict();

export const PATCH: APIRoute = async ({ request, params, locals }) => {
  if (locals.runtime.env.DEMO_MODE === 'true') {
    return Response.json({ error: 'El panel público es una muestra de solo lectura.' }, { status: 403 });
  }
  if (!runtimePlatform.hasCapabilityFlag('PRC-012', 'sideEffects')) {
    return Response.json({ error: 'Bundles no habilitados.' }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !params.id) return Response.json({ error: 'Datos inválidos.' }, { status: 400 });
  try {
    const outcome = await createBundleOperations(locals.runtime.env.DB)
      .changeState(params.id, parsed.data.expectedVersion, parsed.data.state);
    if (outcome === 'not-found') return Response.json({ error: 'Bundle no encontrado.' }, { status: 404 });
    if (outcome === 'conflict') return Response.json({ error: 'El bundle cambió o la transición no es válida.' }, { status: 409 });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes('bundle_activation_conflict')) {
      return Response.json({ error: 'La composición del bundle no permite activarlo.' }, { status: 422 });
    }
    throw error;
  }
};
