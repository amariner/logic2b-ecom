import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createOrderHoldOperations } from '../../../../composition/order-hold-operations';
import { runtimePlatform } from '../../../../composition/runtime-platform';

export const prerender = false;

const schema = z.object({
  order_id: z.number().int().positive(),
  reason_code: z.enum([
    'payment_review', 'inventory_issue', 'address_issue', 'customer_request',
    'fulfillment_issue', 'risk_review', 'other',
  ]),
  owner_id: z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9:_-]+$/),
  owner_label: z.string().trim().min(1).max(120),
  due_at: z.string().datetime({ offset: false }),
  idempotency_key: z.string().trim().min(8).max(160).regex(/^[A-Za-z0-9:_-]+$/),
}).strict();

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  if (env.DEMO_MODE === 'true') {
    return Response.json({ error: 'El panel público es una muestra de solo lectura.' }, { status: 403 });
  }
  if (!runtimePlatform.hasCapabilityFlag('ORD-010', 'sideEffects')) {
    return Response.json({ error: 'Las incidencias de pedido no están habilitadas.' }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const result = await createOrderHoldOperations(env.DB).create({
      orderId: parsed.data.order_id,
      source: 'manual',
      reasonCode: parsed.data.reason_code,
      owner: { kind: 'admin', id: parsed.data.owner_id, label: parsed.data.owner_label },
      dueAt: parsed.data.due_at,
      idempotencyKey: parsed.data.idempotency_key,
    });
    if (result.outcome === 'not-found') {
      return Response.json({ error: 'Pedido no encontrado.' }, { status: 404 });
    }
    if (result.outcome === 'conflict') {
      return Response.json({ error: 'El pedido o la clave de idempotencia cambiaron; recarga la página.' }, { status: 409 });
    }
    return Response.json({ ok: true, replayed: result.outcome === 'replayed', hold: result.hold }, {
      status: result.outcome === 'applied' ? 201 : 200,
    });
  } catch (error) {
    if (error instanceof Error) return Response.json({ error: error.message }, { status: 422 });
    throw error;
  }
};
