import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createInventoryTransferOperations } from '../../../../composition/inventory-transfer-operations';
import { runtimePlatform } from '../../../../composition/runtime-platform';

export const prerender = false;

const schema = z.object({
  source_location_id: z.number().int().positive(),
  destination_location_id: z.number().int().positive(),
  lines: z.array(z.object({
    variant_id: z.number().int().positive(),
    quantity: z.number().int().positive().max(100_000),
  }).strict()).min(1).max(100),
  idempotency_key: z.string().min(8).max(160),
  note: z.string().trim().max(500).optional(),
}).strict();

export const GET: APIRoute = async ({ locals }) => {
  if (!runtimePlatform.hasCapabilityFlag('INV-007', 'routes')) {
    return Response.json({ error: 'Transferencias no habilitadas.' }, { status: 403 });
  }
  const operations = createInventoryTransferOperations(locals.runtime.env.DB);
  return Response.json({ transfers: await operations.list() });
};
export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  if (env.DEMO_MODE === 'true') {
    return Response.json({ error: 'El panel público es una muestra de solo lectura.' }, { status: 403 });
  }
  if (!runtimePlatform.hasCapabilityFlag('INV-007', 'sideEffects')) {
    return Response.json({ error: 'Transferencias no habilitadas.' }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  try {
    const result = await createInventoryTransferOperations(env.DB).create({
      sourceLocationId: parsed.data.source_location_id,
      destinationLocationId: parsed.data.destination_location_id,
      lines: parsed.data.lines.map((line) => ({ variantId: line.variant_id, quantity: line.quantity })),
      idempotencyKey: parsed.data.idempotency_key,
      ...(parsed.data.note === undefined ? {} : { note: parsed.data.note }),
    });
    return Response.json({ ok: true, outcome: result.outcome, transfer: result.detail }, { status: result.outcome === 'applied' ? 201 : 200 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Transferencia inválida.' }, { status: 409 });
  }
};
