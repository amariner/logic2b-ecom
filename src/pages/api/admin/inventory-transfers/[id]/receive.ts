import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createInventoryTransferOperations } from '../../../../../composition/inventory-transfer-operations';
import { runtimePlatform } from '../../../../../composition/runtime-platform';

export const prerender = false;
const schema = z.object({
  expected_version: z.number().int().positive(),
  idempotency_key: z.string().min(8).max(160),
  note: z.string().trim().max(500).optional(),
  lines: z.array(z.object({
    transfer_line_id: z.string().min(8).max(80),
    received_quantity: z.number().int().min(0).max(100_000),
    discrepancy_quantity: z.number().int().min(0).max(100_000),
  }).strict()).min(1).max(100),
}).strict();

export const POST: APIRoute = async ({ params, request, locals }) => {
  const env = locals.runtime.env;
  if (env.DEMO_MODE === 'true') return Response.json({ error: 'El panel público es una muestra de solo lectura.' }, { status: 403 });
  if (!runtimePlatform.hasCapabilityFlag('INV-007', 'sideEffects')) return Response.json({ error: 'Transferencias no habilitadas.' }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !params.id) return Response.json({ error: 'Datos inválidos', details: parsed.success ? undefined : parsed.error.flatten() }, { status: 400 });
  try {
    const result = await createInventoryTransferOperations(env.DB).receive(params.id, {
      expectedVersion: parsed.data.expected_version,
      idempotencyKey: parsed.data.idempotency_key,
      lines: parsed.data.lines.map((line) => ({
        transferLineId: line.transfer_line_id,
        receivedQuantity: line.received_quantity,
        discrepancyQuantity: line.discrepancy_quantity,
      })),
      ...(parsed.data.note === undefined ? {} : { note: parsed.data.note }),
    });
    if (result.outcome === 'not-found') return Response.json({ error: 'Transferencia no encontrada.' }, { status: 404 });
    if (result.outcome === 'conflict') return Response.json({ error: 'La transferencia cambió; recarga la página.', transfer: result.detail }, { status: 409 });
    return Response.json({ ok: true, outcome: result.outcome, transfer: result.detail });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'No se pudo recibir.' }, { status: 409 });
  }
};
