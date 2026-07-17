import type { APIRoute } from 'astro';
import { z } from 'zod';

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

  const sets: string[] = [];
  const binds: (string | number | null)[] = [];
  const { price_cents, free_over_cents, active } = parsed.data;
  if (price_cents !== undefined) { sets.push('price_cents = ?'); binds.push(price_cents); }
  if (free_over_cents !== undefined) { sets.push('free_over_cents = ?'); binds.push(free_over_cents); }
  if (active !== undefined) { sets.push('active = ?'); binds.push(active ? 1 : 0); }
  binds.push(id);

  const result = await env.DB.prepare(`UPDATE shipping_rates SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...binds)
    .run();
  if (result.meta.changes === 0) {
    return Response.json({ error: 'Tarifa no encontrada' }, { status: 404 });
  }
  return Response.json({ ok: true });
};
