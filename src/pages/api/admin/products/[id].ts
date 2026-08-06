import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createProductAdmin } from '../../../../modules/catalog';

export const prerender = false;

const patchSchema = z
  .object({
    name: z.string().trim().min(2).max(200).optional(),
    price_cents: z.number().int().min(0).max(10_000_000).optional(),
    stock: z.number().int().min(0).max(1_000_000).optional(),
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

  const updated = await createProductAdmin(env.DB).update(id, parsed.data);
  if (!updated) {
    return Response.json({ error: 'Producto no encontrado' }, { status: 404 });
  }
  return Response.json({ ok: true });
};
