import type { APIRoute } from 'astro';
import { z } from 'zod';
import {
  createAdminOperations,
  type AdminMutationOutcome,
} from '../../../../composition/admin-operations';

export const prerender = false;

const patchSchema = z
  .object({
    name: z.string().trim().min(2).max(200).optional(),
    price_cents: z.number().int().min(0).max(10_000_000).optional(),
    compare_at_price_cents: z.number().int().min(0).max(10_000_000).nullable().optional(),
    stock: z.number().int().min(0).max(1_000_000).optional(),
    active: z.boolean().optional(),
    sku: z.string().trim().min(1).max(100).optional(),
    gtin: z.string().regex(/^\d{8,14}$/).nullable().optional(),
    mpn: z.string().trim().min(1).max(100).nullable().optional(),
    variant_title: z.string().trim().max(160).optional(),
    variant_status: z.enum(['draft', 'active', 'archived']).optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, 'Nada que actualizar')
  .refine(
    (obj) => obj.compare_at_price_cents === undefined || obj.compare_at_price_cents === null ||
      obj.price_cents === undefined || obj.compare_at_price_cents > obj.price_cents,
    { message: 'El precio anterior debe ser mayor que el precio', path: ['compare_at_price_cents'] },
  )
  .refine(
    (obj) => obj.active === undefined || obj.variant_status === undefined ||
      obj.active === (obj.variant_status === 'active'),
    { message: 'active y variant_status deben representar el mismo estado', path: ['variant_status'] },
  );

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

  let outcome: AdminMutationOutcome;
  try {
    outcome = await createAdminOperations(env.DB).updateProduct(id, parsed.data);
  } catch (error) {
    if (error instanceof Error && /UNIQUE constraint failed: product_variants\.sku/i.test(error.message)) {
      return Response.json({ error: 'Ese SKU ya pertenece a otra variante.' }, { status: 409 });
    }
    throw error;
  }
  if (outcome === 'not-found') {
    return Response.json({ error: 'Producto no encontrado' }, { status: 404 });
  }
  if (outcome === 'conflict') {
    return Response.json(
      { error: 'El producto cambió mientras se procesaba; recarga la página.' },
      { status: 409 },
    );
  }
  if (outcome === 'invalid') {
    return Response.json(
      { error: 'El precio anterior debe ser mayor que el precio.' },
      { status: 400 },
    );
  }
  return Response.json({ ok: true });
};
