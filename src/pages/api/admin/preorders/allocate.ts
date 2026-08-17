import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createPreorderOperations } from '../../../../composition/preorder-operations';
import { runtimePlatform } from '../../../../composition/runtime-platform';

export const prerender = false;

const schema = z.object({
  variant_id: z.number().int().positive(),
  quantity: z.number().int().positive().max(10_000),
  idempotency_key: z.string().trim().min(8).max(120).regex(/^[A-Za-z0-9:_-]+$/),
}).strict();

export const POST: APIRoute = async ({ request, locals }) => {
  if (locals.runtime.env.DEMO_MODE === 'true') {
    return Response.json({ error: 'El panel público es una muestra de solo lectura.' }, { status: 403 });
  }
  if (!runtimePlatform.hasCapabilityFlag('PRC-014', 'sideEffects')) {
    return Response.json({ error: 'Preventa y backorder no habilitados.' }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const result = await createPreorderOperations(locals.runtime.env.DB).allocate({
      variantId: parsed.data.variant_id,
      quantity: parsed.data.quantity,
      idempotencyKey: parsed.data.idempotency_key,
    });
    if (result.outcome === 'insufficient-stock') {
      return Response.json({ error: 'No hay stock físico suficiente para asignar.' }, { status: 409 });
    }
    if (result.outcome === 'nothing-pending') {
      return Response.json({ error: 'No hay compromisos pendientes para esta variante.' }, { status: 409 });
    }
    return Response.json({ ok: true, replayed: result.outcome === 'duplicate', ...result });
  } catch (error) {
    if (error instanceof RangeError) return Response.json({ error: error.message }, { status: 422 });
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('preorder_') || message.includes('inventory_') ||
        message.includes('UNIQUE constraint failed')) {
      return Response.json({ error: 'La asignación perdió una carrera; recarga el estado.' }, { status: 409 });
    }
    throw error;
  }
};
