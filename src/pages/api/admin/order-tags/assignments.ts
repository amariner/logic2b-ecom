import type { APIRoute } from 'astro';
import { z } from 'zod';
import { runtimePlatform } from '../../../../composition/runtime-platform';
import { createD1OrderCollaboration } from '../../../../modules/orders';

export const prerender = false;
const schema = z.object({
  order_id: z.number().int().positive(),
  tag_id: z.number().int().positive(),
  action: z.enum(['assign', 'remove']),
}).strict();

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  if (env.DEMO_MODE === 'true') return Response.json({ error: 'El panel público es una muestra de solo lectura.' }, { status: 403 });
  if (!runtimePlatform.hasCapabilityFlag('ORD-004', 'sideEffects')) return Response.json({ error: 'La colaboración de pedidos no está habilitada.' }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  const outcome = await createD1OrderCollaboration(env.DB).changeTag(parsed.data.order_id, parsed.data.tag_id, parsed.data.action);
  if (outcome === 'not-found') return Response.json({ error: 'Pedido o etiqueta no encontrados.' }, { status: 404 });
  if (outcome === 'conflict') return Response.json({ error: 'La asignación cambió; recarga la página.' }, { status: 409 });
  return Response.json({ ok: true, outcome });
};
