import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createStoredValueOperations } from '../../../../composition/stored-value-operations';
import { runtimePlatform } from '../../../../composition/runtime-platform';

export const prerender = false;

const schema = z.object({
  expectedVersion: z.number().int().positive(),
  state: z.enum(['active', 'disabled', 'closed']),
}).strict();

export const PATCH: APIRoute = async ({ request, params, locals }) => {
  if (locals.runtime.env.DEMO_MODE === 'true') {
    return Response.json({ error: 'El panel público es una muestra de solo lectura.' }, { status: 403 });
  }
  if (!runtimePlatform.hasCapabilityFlag('PRC-010', 'sideEffects') &&
      !runtimePlatform.hasCapabilityFlag('PRC-011', 'sideEffects')) {
    return Response.json({ error: 'Valor almacenado no habilitado.' }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !params.id) return Response.json({ error: 'Datos inválidos.' }, { status: 400 });
  const outcome = await createStoredValueOperations(locals.runtime.env.DB)
    .changeState(params.id, parsed.data.expectedVersion, parsed.data.state);
  if (outcome === 'not-found') return Response.json({ error: 'Saldo no encontrado.' }, { status: 404 });
  if (outcome === 'conflict') return Response.json({ error: 'El saldo cambió o la transición no es válida.' }, { status: 409 });
  return Response.json({ ok: true });
};
