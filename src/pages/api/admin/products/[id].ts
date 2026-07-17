import type { APIRoute } from 'astro';
import { z } from 'zod';

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
  const binds: (string | number)[] = [];
  const { name, price_cents, stock, active } = parsed.data;
  if (name !== undefined) { sets.push('name = ?'); binds.push(name); }
  if (price_cents !== undefined) { sets.push('price_cents = ?'); binds.push(price_cents); }
  if (stock !== undefined) { sets.push('stock = ?'); binds.push(stock); }
  if (active !== undefined) { sets.push('active = ?'); binds.push(active ? 1 : 0); }
  binds.push(id);

  const result = await env.DB.prepare(`UPDATE products SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...binds)
    .run();
  if (result.meta.changes === 0) {
    return Response.json({ error: 'Producto no encontrado' }, { status: 404 });
  }
  return Response.json({ ok: true });
};
