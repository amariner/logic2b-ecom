import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createAdminOperations } from '../../../../../composition/admin-operations';
import { runtimePlatform } from '../../../../../composition/runtime-platform';
import { catalogAdminErrorResponse, catalogAdminMutationResponse } from '../../../../../modules/catalog';

export const prerender = false;
const schema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), value: z.string().min(1).max(5000) }),
  z.object({ type: z.literal('number'), value: z.number().finite() }),
  z.object({ type: z.literal('boolean'), value: z.boolean() }),
  z.object({ type: z.literal('reference'), value: z.string().trim().min(1).max(500) }),
  z.object({ type: z.literal('list'), value: z.array(z.string().min(1).max(120)).min(1).max(100) }),
]);
function gate(locals: App.Locals) {
  if (locals.runtime.env.DEMO_MODE === 'true') return Response.json({ error: 'El panel público es una muestra de solo lectura.' }, { status: 403 });
  if (!runtimePlatform.isCapabilityActive('CAT-007')) return Response.json({ error: 'Recurso no disponible.' }, { status: 404 });
  return null;
}
export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const denied = gate(locals); if (denied) return denied;
  const id = Number(params.id); if (!Number.isInteger(id) || id <= 0) return Response.json({ error: 'id inválido' }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  try { return catalogAdminMutationResponse(await createAdminOperations(locals.runtime.env.DB).updateProductAttributeValue(id, parsed.data)); }
  catch (error) { return catalogAdminErrorResponse(error) ?? Promise.reject(error); }
};
export const DELETE: APIRoute = async ({ params, locals }) => {
  const denied = gate(locals); if (denied) return denied;
  const id = Number(params.id); if (!Number.isInteger(id) || id <= 0) return Response.json({ error: 'id inválido' }, { status: 400 });
  try { return catalogAdminMutationResponse(await createAdminOperations(locals.runtime.env.DB).deleteProductAttributeValue(id)); }
  catch (error) { return catalogAdminErrorResponse(error) ?? Promise.reject(error); }
};
