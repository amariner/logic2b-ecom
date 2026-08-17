import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createSubscriptionOperations } from '../../../../../composition/subscription-operations';
import { runtimePlatform } from '../../../../../composition/runtime-platform';

export const prerender = false;

const schema = z.object({ return_url: z.string().url().max(500) }).strict();

export const POST: APIRoute = async ({ params, request, locals }) => {
  if (locals.runtime.env.DEMO_MODE === 'true') {
    return Response.json({ error: 'El panel público es una muestra de solo lectura.' }, { status: 403 });
  }
  if (!runtimePlatform.hasCapabilityFlag('PRC-013', 'sideEffects')) {
    return Response.json({ error: 'Suscripciones no habilitadas.' }, { status: 403 });
  }
  const id = params.id?.trim();
  if (!id) return Response.json({ error: 'Suscripción inválida.' }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  }
  if (new URL(parsed.data.return_url).origin !== new URL(request.url).origin) {
    return Response.json({ error: 'El retorno del portal debe pertenecer a este despliegue.' }, { status: 422 });
  }
  try {
    const result = await createSubscriptionOperations(locals.runtime.env.DB).portal({
      subscriptionId: id,
      returnUrl: parsed.data.return_url,
    });
    if (result.outcome === 'not-found') return Response.json({ error: 'Suscripción no encontrada.' }, { status: 404 });
    if (result.outcome === 'cancelled') return Response.json({ error: 'Suscripción cancelada.' }, { status: 409 });
    return Response.json({ url: result.url, expires_at: result.expiresAt }, {
      headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    if (error instanceof RangeError) return Response.json({ error: error.message }, { status: 422 });
    throw error;
  }
};
