import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createOrderOperations } from '../../../../composition/order-operations';
import { decideTransition, isOrderStatus } from '../../../../lib/order-transitions';
import { flushEventOutbox } from '../../../../composition/outbox-dispatcher';
import { runtimePlatform } from '../../../../composition/runtime-platform';

export const prerender = false;

const patchSchema = z.object({
  status: z.enum(['paid', 'shipped', 'delivered', 'cancelled']),
  tracking_carrier: z.string().trim().max(60).optional(),
  tracking_number: z.string().trim().max(80).optional(),
});

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const env = locals.runtime.env;
  if (env.DEMO_MODE === 'true') {
    return Response.json({ error: 'El panel público es una muestra de solo lectura.' }, { status: 403 });
  }
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: 'id inválido' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  }
  if (
    (parsed.data.status === 'shipped' || parsed.data.status === 'delivered') &&
    !runtimePlatform.hasCapabilityFlag('FUL-002', 'routes')
  ) {
    return Response.json({ error: 'El seguimiento de envíos no está habilitado.' }, { status: 403 });
  }

  const orders = createOrderOperations(env.DB);
  const order = await orders.findOrderForTransition(id);
  if (!order) return Response.json({ error: 'Pedido no encontrado' }, { status: 404 });
  if (!isOrderStatus(order.status)) {
    return Response.json({ error: `Estado corrupto: ${order.status}` }, { status: 500 });
  }

  const decision = decideTransition(order.status, {
    to: parsed.data.status,
    tracking_carrier: parsed.data.tracking_carrier,
    tracking_number: parsed.data.tracking_number,
  });
  if (!decision.ok) return Response.json({ error: decision.error }, { status: 422 });

  // La guarda de idempotencia vive en el caso de uso (mismo patrón que el
  // webhook, ver ROADMAP): el UPDATE va acotado por el estado LEÍDO y en
  // solitario, y solo si de verdad afectó una fila se aplican el resto de
  // efectos. Dos clics casi simultáneos (o un doble envío por conexión lenta)
  // sobre el mismo pedido no deben restockear ni avisar por email dos veces.
  const result = await orders.applyPanelTransition({ order, from: order.status, transition: decision });
  if (result.outcome === 'conflict') {
    return Response.json(
      { error: 'El pedido cambió de estado mientras se procesaba; recarga la página.' },
      { status: 409 },
    );
  }

  if (result.queuedMessages > 0) {
    // Producción: entrega el email de aviso sin retrasar la respuesta al panel.
    locals.runtime.ctx.waitUntil(flushEventOutbox(env.DB, env));
  }
  return Response.json({ ok: true, status: parsed.data.status });
};
