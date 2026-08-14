import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createInventoryLocationOperations } from '../../../../composition/inventory-location-operations';
import { normalizeInventoryLocationCode } from '../../../../modules/inventory';
import { runtimePlatform } from '../../../../composition/runtime-platform';

export const prerender = false;
const schema = z.object({
  code: z.string().trim().min(2).max(32),
  name: z.string().trim().min(2).max(100),
  kind: z.enum(['warehouse', 'store']),
  timezone: z.string().trim().min(3).max(64),
}).strict();

export const GET: APIRoute = async ({ locals }) => {
  if (!runtimePlatform.hasCapabilityFlag('INV-005', 'routes')) return Response.json({ error: 'Ubicaciones no habilitadas.' }, { status: 403 });
  return Response.json({ locations: await createInventoryLocationOperations(locals.runtime.env.DB).list() });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  if (env.DEMO_MODE === 'true') return Response.json({ error: 'El panel público es una muestra de solo lectura.' }, { status: 403 });
  if (!runtimePlatform.hasCapabilityFlag('INV-005', 'sideEffects')) return Response.json({ error: 'Ubicaciones no habilitadas.' }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  const input = { ...parsed.data, code: normalizeInventoryLocationCode(parsed.data.code) };
  const outcome = await createInventoryLocationOperations(env.DB).create(input);
  return outcome === 'applied'
    ? Response.json({ ok: true }, { status: 201 })
    : Response.json({ error: 'Ya existe una ubicación con ese código.' }, { status: 409 });
};
