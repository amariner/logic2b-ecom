import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createPreliminaryOrderOperations } from '../../../../composition/preliminary-order-operations';
import { runtimePlatform } from '../../../../composition/runtime-platform';

export const prerender = false;

const schema = z.object({
  action: z.literal('confirm_simulated'),
  occurred_at: z.string().datetime({ offset: false }).optional(),
}).strict();

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  if (locals.runtime.env.DEMO_MODE === 'true') {
    return Response.json({ error: 'El panel público es una muestra de solo lectura.' }, { status: 403 });
  }
  if (!runtimePlatform.hasCapabilityFlag('CHK-011', 'sideEffects')) {
    return Response.json({ error: 'Enlaces de pago para presupuestos no habilitados.' }, { status: 403 });
  }
  const id = params.id?.trim();
  if (!id) return Response.json({ error: 'Enlace inválido.' }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const result = await createPreliminaryOrderOperations(locals.runtime.env.DB)
      .confirmSimulatedPayment({ linkId: id,
        ...(parsed.data.occurred_at === undefined ? {} : { occurredAt: parsed.data.occurred_at }),
      });
    if (result === 'not-found') return Response.json({ error: 'Enlace no encontrado.' }, { status: 404 });
    if (result === 'conflict') return Response.json({ error: 'El enlace ya no corresponde a la versión activa.' }, { status: 409 });
    return Response.json({ ok: true, replayed: result === 'duplicate' });
  } catch (error) {
    if (error instanceof RangeError) return Response.json({ error: error.message }, { status: 422 });
    throw error;
  }
};
