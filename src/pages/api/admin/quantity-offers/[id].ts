import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createQuantityOfferOperations } from '../../../../composition/quantity-offer-operations';
import { runtimePlatform } from '../../../../composition/runtime-platform';

export const prerender = false;

const schema = z.object({
  expectedVersion: z.number().int().positive(),
  state: z.enum(['active', 'disabled', 'archived']),
}).strict();

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  if (locals.runtime.env.DEMO_MODE === 'true') {
    return Response.json({ error: 'El panel público es una muestra de solo lectura.' }, { status: 403 });
  }
  if (!runtimePlatform.hasCapabilityFlag('PRC-006', 'sideEffects') &&
      !runtimePlatform.hasCapabilityFlag('PRC-007', 'sideEffects')) {
    return Response.json({ error: 'Ofertas por cantidad no habilitadas.' }, { status: 403 });
  }
  const id = params.id?.trim();
  if (!id) return Response.json({ error: 'Oferta inválida.' }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  const operations = createQuantityOfferOperations(locals.runtime.env.DB);
  const kind = await operations.findKind(id);
  if (!kind) return Response.json({ error: 'Oferta no encontrada.' }, { status: 404 });
  const requiredCapability = kind === 'quantity_tier' ? 'PRC-006' : 'PRC-007';
  if (!runtimePlatform.hasCapabilityFlag(requiredCapability, 'sideEffects')) {
    return Response.json({ error: 'El tipo de oferta no está habilitado.' }, { status: 403 });
  }
  const outcome = await operations.changeState(id, parsed.data.expectedVersion, parsed.data.state);
  if (outcome === 'not-found') return Response.json({ error: 'Oferta no encontrada.' }, { status: 404 });
  if (outcome === 'conflict') return Response.json({ error: 'La operación entró en conflicto.' }, { status: 409 });
  return Response.json({ ok: true });
};
