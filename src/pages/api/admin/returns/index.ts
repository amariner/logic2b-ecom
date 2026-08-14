import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createReturnOperations } from '../../../../composition/return-operations';
import { runtimePlatform } from '../../../../composition/runtime-platform';

export const prerender = false;

const schema = z.object({
  order_id: z.number().int().positive(),
  receive_location_id: z.number().int().positive(),
  reason: z.enum(['damaged', 'defective', 'wrong_item', 'not_as_expected', 'other']),
  requested_by_kind: z.enum(['customer', 'admin']),
  requested_by_id: z.string().trim().min(2).max(80),
  idempotency_key: z.string().min(8).max(160),
  note: z.string().trim().max(500).optional(),
  lines: z.array(z.object({
    order_item_id: z.number().int().positive(),
    quantity: z.number().int().positive(),
  }).strict()).min(1).max(100),
}).strict();

export const GET: APIRoute = async ({ request, locals }) => {
  if (!runtimePlatform.hasCapabilityFlag('FUL-011', 'routes')) {
    return Response.json({ error: 'Devoluciones no habilitadas.' }, { status: 403 });
  }
  const operations = createReturnOperations(locals.runtime.env.DB);
  const orderId = Number(new URL(request.url).searchParams.get('order_id'));
  if (Number.isInteger(orderId) && orderId > 0) {
    return Response.json({ eligibility: await operations.eligibility(orderId) });
  }
  return Response.json({ returns: await operations.list() });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  if (env.DEMO_MODE === 'true') {
    return Response.json({ error: 'El panel público es una muestra de solo lectura.' }, { status: 403 });
  }
  if (!runtimePlatform.hasCapabilityFlag('FUL-011', 'sideEffects')) {
    return Response.json({ error: 'Devoluciones no habilitadas.' }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  try {
    const result = await createReturnOperations(env.DB).create({
      orderId: parsed.data.order_id,
      receiveLocationId: parsed.data.receive_location_id,
      reason: parsed.data.reason,
      requestedByKind: parsed.data.requested_by_kind,
      requestedById: parsed.data.requested_by_id,
      idempotencyKey: parsed.data.idempotency_key,
      lines: parsed.data.lines.map((line) => ({ orderItemId: line.order_item_id, quantity: line.quantity })),
      ...(parsed.data.note === undefined ? {} : { note: parsed.data.note }),
    });
    if (result.outcome === 'invalid-state') return Response.json({ error: 'El pedido no admite devolución.' }, { status: 422 });
    return Response.json({ ok: true, outcome: result.outcome, return: result.detail },
      { status: result.outcome === 'applied' ? 201 : 200 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Devolución inválida.' }, { status: 409 });
  }
};
