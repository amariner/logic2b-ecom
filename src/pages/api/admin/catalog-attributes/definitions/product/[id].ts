import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createAdminOperations } from '../../../../../../composition/admin-operations';
import { runtimePlatform } from '../../../../../../composition/runtime-platform';
import { catalogAdminErrorResponse, catalogAdminMutationResponse } from '../../../../../../modules/catalog';

export const prerender = false;
const schema = z.object({
  code: z.string().trim().min(1).max(80), label: z.string().trim().min(1).max(120),
  value_type: z.enum(['text', 'number', 'boolean', 'reference', 'list']),
  unit: z.string().trim().min(1).max(24).nullable(),
  constraints: z.record(z.unknown()), active: z.boolean(),
}).strict();

export const POST: APIRoute = async ({ params, request, locals }) => {
  if (locals.runtime.env.DEMO_MODE === 'true') return Response.json({ error: 'El panel público es una muestra de solo lectura.' }, { status: 403 });
  if (!runtimePlatform.isCapabilityActive('CAT-007')) return Response.json({ error: 'Recurso no disponible.' }, { status: 404 });
  const productId = Number(params.id); if (!Number.isInteger(productId) || productId <= 0) return Response.json({ error: 'id inválido' }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  try { return catalogAdminMutationResponse(await createAdminOperations(locals.runtime.env.DB).createAttributeDefinition(productId, parsed.data)); }
  catch (error) { return catalogAdminErrorResponse(error) ?? Promise.reject(error); }
};
