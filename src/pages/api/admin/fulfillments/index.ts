import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createFulfillmentOperations } from '../../../../composition/fulfillment-operations';
import { flushEventOutbox } from '../../../../composition/outbox-dispatcher';
import { runtimePlatform } from '../../../../composition/runtime-platform';

export const prerender = false;

const allocationSchema = z.object({
  order_item_id: z.number().int().positive(),
  quantity: z.number().int().positive(),
});

const bodySchema = z.object({
  order_id: z.number().int().positive(),
  tracking_carrier: z.string().trim().min(1).max(60),
  tracking_number: z.string().trim().min(1).max(80),
  idempotency_key: z.string().trim().min(8).max(80).regex(/^[A-Za-z0-9:_-]+$/),
  lines: z.array(allocationSchema).min(1).max(100).optional(),
});

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  if (env.DEMO_MODE === 'true') {
    return Response.json({ error: 'El panel público es una muestra de solo lectura.' }, { status: 403 });
  }
  if (!runtimePlatform.hasCapabilityFlag('FUL-004', 'sideEffects')) {
    return Response.json({ error: 'El fulfillment parcial no está habilitado.' }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const result = await createFulfillmentOperations(env.DB).ship({
      orderId: parsed.data.order_id,
      tracking: {
        carrier: parsed.data.tracking_carrier,
        number: parsed.data.tracking_number,
      },
      allocations: parsed.data.lines,
      idempotencyKey: parsed.data.idempotency_key,
    });
    if (result.outcome === 'conflict') {
      return Response.json(
        { error: 'El pedido o sus cantidades cambiaron; recarga la página.' },
        { status: 409 },
      );
    }
    if (result.queuedMessages > 0) {
      locals.runtime.ctx.waitUntil(flushEventOutbox(env.DB, env));
    }
    return Response.json({ ok: true, replayed: result.outcome === 'replayed', ...result });
  } catch (error) {
    if (error instanceof RangeError) {
      return Response.json({ error: error.message }, { status: 422 });
    }
    throw error;
  }
};
