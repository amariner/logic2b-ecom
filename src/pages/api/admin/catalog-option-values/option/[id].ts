import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createAdminOperations } from '../../../../../composition/admin-operations';
import { runtimePlatform } from '../../../../../composition/runtime-platform';
import { catalogAdminErrorResponse, catalogAdminMutationResponse } from '../../../../../modules/catalog';

export const prerender = false;

const schema = z.object({ value: z.string().trim().min(1).max(100) }).strict();

export const POST: APIRoute = async ({ params, request, locals }) => {
  if (locals.runtime.env.DEMO_MODE === 'true') {
    return Response.json({ error: 'El panel público es una muestra de solo lectura.' }, { status: 403 });
  }
  if (!runtimePlatform.isCapabilityActive('CAT-003')) {
    return Response.json({ error: 'Recurso no disponible.' }, { status: 404 });
  }
  const optionId = Number(params.id);
  if (!Number.isInteger(optionId) || optionId <= 0) {
    return Response.json({ error: 'id inválido' }, { status: 400 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Datos inválidos' }, { status: 400 });
  try {
    return catalogAdminMutationResponse(
      await createAdminOperations(locals.runtime.env.DB).createProductOptionValue({
        option_id: optionId,
        value: parsed.data.value,
      }),
    );
  } catch (error) {
    const response = catalogAdminErrorResponse(error);
    if (response) return response;
    throw error;
  }
};
