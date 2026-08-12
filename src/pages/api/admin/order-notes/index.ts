import type { APIRoute } from 'astro';
import { z } from 'zod';
import { runtimePlatform } from '../../../../composition/runtime-platform';
import { createD1OrderCollaboration } from '../../../../modules/orders';

export const prerender = false;
const schema = z.object({
  order_id: z.number().int().positive(),
  body: z.string().trim().min(1).max(4000),
  visibility: z.enum(['internal', 'customer']),
}).strict();

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  if (env.DEMO_MODE === 'true') return Response.json({ error: 'El panel público es una muestra de solo lectura.' }, { status: 403 });
  if (!runtimePlatform.hasCapabilityFlag('ORD-004', 'sideEffects')) return Response.json({ error: 'La colaboración de pedidos no está habilitada.' }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  const outcome = await createD1OrderCollaboration(env.DB).createNote(parsed.data.order_id, parsed.data);
  if (outcome === 'not-found') return Response.json({ error: 'Pedido no encontrado.' }, { status: 404 });
  if (outcome === 'conflict') return Response.json({ error: 'El pedido cambió; recarga la página.' }, { status: 409 });
  return Response.json({ ok: true, outcome }, { status: 201 });
};
