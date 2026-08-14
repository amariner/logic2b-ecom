import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createInventoryAllocationOperations } from '../../../../composition/inventory-allocation-operations';
import { runtimePlatform } from '../../../../composition/runtime-platform';

export const prerender = false;

const schema = z.object({
  location_id: z.number().int().positive(),
  expected_version: z.number().int().positive(),
  priority: z.number().int().min(0).max(100000),
  handling_cost_cents: z.number().int().min(0).max(10000000),
  markets: z.array(z.string().trim().min(1).max(20)).min(1).max(20),
  channels: z.array(z.string().trim().min(1).max(40)).min(1).max(20),
  enabled: z.boolean(),
}).strict();

export const GET: APIRoute = async ({ locals }) => {
  if (!runtimePlatform.hasCapabilityFlag('INV-011', 'routes')) {
    return Response.json({ error: 'Asignación de inventario no habilitada.' }, { status: 403 });
  }
  const operations = createInventoryAllocationOperations(locals.runtime.env.DB);
  const [policies, decisions] = await Promise.all([operations.policies(), operations.decisions()]);
  return Response.json({ policies, decisions });
};

export const PATCH: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  if (env.DEMO_MODE === 'true') {
    return Response.json({ error: 'El panel público es una muestra de solo lectura.' }, { status: 403 });
  }
  if (!runtimePlatform.hasCapabilityFlag('INV-011', 'sideEffects')) {
    return Response.json({ error: 'Asignación de inventario no habilitada.' }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const outcome = await createInventoryAllocationOperations(env.DB).updatePolicy({
      locationId: parsed.data.location_id,
      expectedVersion: parsed.data.expected_version,
      priority: parsed.data.priority,
      handlingCostCents: parsed.data.handling_cost_cents,
      markets: parsed.data.markets,
      channels: parsed.data.channels,
      enabled: parsed.data.enabled,
    });
    if (outcome === 'not-found') return Response.json({ error: 'Política no encontrada.' }, { status: 404 });
    if (outcome === 'conflict') {
      return Response.json({ error: 'La política cambió; recarga la página.' }, { status: 409 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof RangeError) return Response.json({ error: error.message }, { status: 422 });
    throw error;
  }
};
