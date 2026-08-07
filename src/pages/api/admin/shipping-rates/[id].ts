import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createAdminOperations } from '../../../../composition/admin-operations';

export const prerender = false;

const patchSchema = z
  .object({
    price_cents: z.number().int().min(0).max(100_000).optional(),
    free_over_cents: z.number().int().min(0).max(10_000_000).nullable().optional(),
    active: z.boolean().optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, 'Nada que actualizar');

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

  const outcome = await createAdminOperations(env.DB).updateShippingRate(id, parsed.data);
  if (outcome === 'not-found') {
    return Response.json({ error: 'Tarifa no encontrada' }, { status: 404 });
  }
  if (outcome === 'conflict') {
    return Response.json(
      { error: 'La tarifa cambió mientras se procesaba; recarga la página.' },
      { status: 409 },
    );
  }
  return Response.json({ ok: true });
};
