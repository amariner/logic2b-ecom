import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createInventoryLocationOperations } from '../../../../composition/inventory-location-operations';
import { runtimePlatform } from '../../../../composition/runtime-platform';

export const prerender = false;
const schema = z.object({
  expected_version: z.number().int().min(1),
  name: z.string().trim().min(2).max(100).optional(),
  kind: z.enum(['warehouse', 'store']).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  timezone: z.string().trim().min(3).max(64).optional(),
}).strict().refine((value) => Object.keys(value).length > 1, 'Nada que actualizar');

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const env = locals.runtime.env;
  if (env.DEMO_MODE === 'true') return Response.json({ error: 'El panel público es una muestra de solo lectura.' }, { status: 403 });
  if (!runtimePlatform.hasCapabilityFlag('INV-005', 'sideEffects')) return Response.json({ error: 'Ubicaciones no habilitadas.' }, { status: 403 });
  const id = Number(params.id);
  if (!Number.isInteger(id) || id < 1) return Response.json({ error: 'id inválido' }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  const { expected_version, ...patch } = parsed.data;
  try {
    const outcome = await createInventoryLocationOperations(env.DB).update(id, {
      expectedVersion: expected_version,
      ...(patch.name === undefined ? {} : { name: patch.name }),
      ...(patch.kind === undefined ? {} : { kind: patch.kind }),
      ...(patch.status === undefined ? {} : { status: patch.status }),
      ...(patch.timezone === undefined ? {} : { timezone: patch.timezone }),
    });
    if (outcome === 'not-found') return Response.json({ error: 'Ubicación no encontrada.' }, { status: 404 });
    if (outcome === 'conflict') return Response.json({ error: 'La ubicación cambió; recarga la página.' }, { status: 409 });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Cambio inválido.' }, { status: 409 });
  }
};
