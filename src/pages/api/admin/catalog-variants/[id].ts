import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createAdminOperations } from '../../../../composition/admin-operations';
import { runtimePlatform } from '../../../../composition/runtime-platform';
import { catalogAdminErrorResponse, catalogAdminMutationResponse } from '../../../../modules/catalog';

export const prerender = false;

const schema = z.object({
  sku: z.string().trim().min(1).max(100),
  gtin: z.string().regex(/^\d{8,14}$/).nullable(),
  mpn: z.string().trim().min(1).max(100).nullable(),
  title: z.string().trim().max(160),
  price_cents: z.number().int().min(0).max(10_000_000),
  compare_at_price_cents: z.number().int().min(0).max(10_000_000).nullable(),
  status: z.enum(['draft', 'active', 'archived']),
  option_value_ids: z.array(z.number().int().positive()).min(1).max(20),
  make_default: z.boolean().optional(),
}).strict().refine(
  (value) => value.compare_at_price_cents === null || value.compare_at_price_cents > value.price_cents,
  { message: 'El precio anterior debe ser mayor que el precio actual.', path: ['compare_at_price_cents'] },
);

function guard(params: Record<string, string | undefined>, demoMode: string | undefined): Response | number {
  if (demoMode === 'true') {
    return Response.json({ error: 'El panel público es una muestra de solo lectura.' }, { status: 403 });
  }
  if (!runtimePlatform.isCapabilityActive('CAT-003')) {
    return Response.json({ error: 'Recurso no disponible.' }, { status: 404 });
  }
  const id = Number(params.id);
  return Number.isInteger(id) && id > 0 ? id : Response.json({ error: 'id inválido' }, { status: 400 });
}

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const checked = guard(params, locals.runtime.env.DEMO_MODE);
  if (checked instanceof Response) return checked;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  try {
    return catalogAdminMutationResponse(
      await createAdminOperations(locals.runtime.env.DB).updateProductVariant(checked, parsed.data),
    );
  } catch (error) {
    const response = catalogAdminErrorResponse(error);
    if (response) return response;
    throw error;
  }
};
export const DELETE: APIRoute = async ({ params, locals }) => {
  const checked = guard(params, locals.runtime.env.DEMO_MODE);
  if (checked instanceof Response) return checked;
  try {
    return catalogAdminMutationResponse(
      await createAdminOperations(locals.runtime.env.DB).deleteProductVariant(checked),
    );
  } catch (error) {
    const response = catalogAdminErrorResponse(error);
    if (response) return response;
    throw error;
  }
};
