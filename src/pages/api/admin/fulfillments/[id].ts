import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createFulfillmentOperations } from '../../../../composition/fulfillment-operations';
import { runtimePlatform } from '../../../../composition/runtime-platform';

export const prerender = false;

const bodySchema = z.object({ status: z.literal('delivered') });

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const env = locals.runtime.env;
  if (env.DEMO_MODE === 'true') {
    return Response.json({ error: 'El panel público es una muestra de solo lectura.' }, { status: 403 });
  }
  if (!runtimePlatform.hasCapabilityFlag('FUL-004', 'sideEffects')) {
    return Response.json({ error: 'El fulfillment parcial no está habilitado.' }, { status: 403 });
  }
  const id = Number(params.id);
  if (!Number.isInteger(id) || id < 1) {
    return Response.json({ error: 'id inválido' }, { status: 400 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 });
  }
  if (!bodySchema.safeParse(body).success) {
    return Response.json({ error: 'Datos inválidos' }, { status: 400 });
  }
  const result = await createFulfillmentOperations(env.DB).deliver(id);
  if (result.outcome === 'conflict') {
    return Response.json(
      { error: 'El envío cambió de estado; recarga la página.' },
      { status: 409 },
    );
  }
  return Response.json({ ok: true, replayed: result.outcome === 'replayed', ...result });
};
