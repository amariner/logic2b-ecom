import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createPreliminaryOrderOperations } from '../../../../composition/preliminary-order-operations';
import { runtimePlatform } from '../../../../composition/runtime-platform';

export const prerender = false;

const schema = z.object({
  preliminary_order_id: z.string().trim().min(8).max(120),
  idempotency_key: z.string().trim().min(8).max(200).regex(/^[A-Za-z0-9:_-]+$/),
  expires_at: z.string().datetime({ offset: false }),
  created_at: z.string().datetime({ offset: false }).optional(),
}).strict();

export const POST: APIRoute = async ({ request, locals }) => {
  if (locals.runtime.env.DEMO_MODE === 'true') {
    return Response.json({ error: 'El panel público es una muestra de solo lectura.' }, { status: 403 });
  }
  if (!runtimePlatform.hasCapabilityFlag('CHK-011', 'sideEffects')) {
    return Response.json({ error: 'Enlaces de pago para presupuestos no habilitados.' }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const result = await createPreliminaryOrderOperations(locals.runtime.env.DB).createPaymentLink({
      id: parsed.data.preliminary_order_id,
      idempotencyKey: parsed.data.idempotency_key,
      expiresAt: parsed.data.expires_at,
      ...(parsed.data.created_at === undefined ? {} : { createdAt: parsed.data.created_at }),
    });
    if (result.outcome === 'not-found') return Response.json({ error: 'Presupuesto no encontrado.' }, { status: 404 });
    if (result.outcome === 'conflict') return Response.json({ error: 'Enlace en conflicto.' }, { status: 409 });
    return Response.json({ ok: true, replayed: result.outcome === 'duplicate',
      payment_link: result.link,
      url: result.outcome === 'created' ? result.session.url : null,
    }, { status: result.outcome === 'created' ? 201 : 200 });
  } catch (error) {
    if (error instanceof RangeError) return Response.json({ error: error.message }, { status: 422 });
    throw error;
  }
};
