import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createAdminOperations } from '../../../../../composition/admin-operations';
import { runtimePlatform } from '../../../../../composition/runtime-platform';
import { catalogAdminErrorResponse, catalogAdminMutationResponse } from '../../../../../modules/catalog';

export const prerender = false;

const schema = z.object({
  kind: z.enum(['image', 'video']),
  source: z.string().trim().min(1).max(500),
  alt_text: z.string().trim().min(1).max(240),
  focal_x_bps: z.number().int().min(0).max(10000),
  focal_y_bps: z.number().int().min(0).max(10000),
  variant_ids: z.array(z.number().int().positive()).max(100),
}).strict();

const reorderSchema = z.object({
  ordered_ids: z.array(z.number().int().positive()).min(1).max(100),
}).strict();

export const POST: APIRoute = async ({ params, request, locals }) => {
  if (locals.runtime.env.DEMO_MODE === 'true') return Response.json({ error: 'El panel público es una muestra de solo lectura.' }, { status: 403 });
  if (!runtimePlatform.isCapabilityActive('CAT-008')) return Response.json({ error: 'Recurso no disponible.' }, { status: 404 });
  const productId = Number(params.id);
  if (!Number.isInteger(productId) || productId <= 0) return Response.json({ error: 'id inválido' }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  try {
    return catalogAdminMutationResponse(await createAdminOperations(locals.runtime.env.DB).createProductMedia(productId, parsed.data));
  } catch (error) {
    return catalogAdminErrorResponse(error) ?? Promise.reject(error);
  }
};

export const PUT: APIRoute = async ({ params, request, locals }) => {
  if (locals.runtime.env.DEMO_MODE === 'true') return Response.json({ error: 'El panel público es una muestra de solo lectura.' }, { status: 403 });
  if (!runtimePlatform.isCapabilityActive('CAT-008')) return Response.json({ error: 'Recurso no disponible.' }, { status: 404 });
  const productId = Number(params.id);
  if (!Number.isInteger(productId) || productId <= 0) return Response.json({ error: 'id inválido' }, { status: 400 });
  const parsed = reorderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  try {
    return catalogAdminMutationResponse(await createAdminOperations(locals.runtime.env.DB).reorderProductMedia(productId, parsed.data.ordered_ids));
  } catch (error) {
    return catalogAdminErrorResponse(error) ?? Promise.reject(error);
  }
};
