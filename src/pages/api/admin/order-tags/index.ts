import type { APIRoute } from 'astro';
import { z } from 'zod';
import { runtimePlatform } from '../../../../composition/runtime-platform';
import { createD1OrderCollaboration, normalizeOrderTagSlug } from '../../../../modules/orders';

export const prerender = false;
const schema = z.object({ label: z.string().trim().min(1).max(80) }).strict()
  .refine((value) => normalizeOrderTagSlug(value.label).length > 0, { message: 'La etiqueta necesita letras o números.' });

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  if (env.DEMO_MODE === 'true') return Response.json({ error: 'El panel público es una muestra de solo lectura.' }, { status: 403 });
  if (!runtimePlatform.hasCapabilityFlag('ORD-004', 'sideEffects')) return Response.json({ error: 'La colaboración de pedidos no está habilitada.' }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  const outcome = await createD1OrderCollaboration(env.DB).createTag(parsed.data.label);
  return Response.json({ ok: true, outcome }, { status: outcome === 'applied' ? 201 : 200 });
};
