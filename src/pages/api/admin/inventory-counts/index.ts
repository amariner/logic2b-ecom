import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createInventoryCountOperations } from '../../../../composition/inventory-count-operations';
import { runtimePlatform } from '../../../../composition/runtime-platform';

export const prerender = false;

const schema = z.object({
  location_id: z.number().int().positive(),
  reason: z.enum(['cycle_count', 'reconciliation', 'damage']),
  requires_approval: z.boolean(),
  counted_by: z.string().trim().min(2).max(120),
  lines: z.array(z.object({
    variant_id: z.number().int().positive(),
    counted_quantity: z.number().int().min(0).max(1_000_000),
  }).strict()).min(1).max(100),
  idempotency_key: z.string().min(8).max(160),
  note: z.string().trim().max(500).optional(),
}).strict();

export const GET: APIRoute = async ({ locals }) => {
  if (!runtimePlatform.hasCapabilityFlag('INV-008', 'routes')) {
    return Response.json({ error: 'Conteos no habilitados.' }, { status: 403 });
  }
  return Response.json({ counts: await createInventoryCountOperations(locals.runtime.env.DB).list() });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  if (env.DEMO_MODE === 'true') return Response.json({ error: 'El panel público es una muestra de solo lectura.' }, { status: 403 });
  if (!runtimePlatform.hasCapabilityFlag('INV-008', 'sideEffects')) {
    return Response.json({ error: 'Conteos no habilitados.' }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  try {
    const result = await createInventoryCountOperations(env.DB).create({
      locationId: parsed.data.location_id,
      reason: parsed.data.reason,
      requiresApproval: parsed.data.requires_approval,
      countedBy: parsed.data.counted_by,
      lines: parsed.data.lines.map((line) => ({ variantId: line.variant_id, countedQuantity: line.counted_quantity })),
      idempotencyKey: parsed.data.idempotency_key,
      ...(parsed.data.note === undefined ? {} : { note: parsed.data.note }),
    });
    return Response.json({ ok: true, outcome: result.outcome, count: result.detail }, { status: result.outcome === 'applied' ? 201 : 200 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Conteo inválido.' }, { status: 409 });
  }
};
