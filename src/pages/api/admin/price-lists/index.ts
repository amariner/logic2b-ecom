import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createPriceListOperations } from '../../../../composition/price-list-operations';
import { runtimePlatform } from '../../../../composition/runtime-platform';

export const prerender = false;

const instant = z.string().datetime({ offset: false });
const schema = z.object({
  label: z.string().trim().min(2).max(120), state: z.enum(['active', 'disabled']),
  priority: z.number().int().min(0).max(100000), currency: z.string().trim().length(3),
  activeFrom: instant.nullable(), activeUntil: instant.nullable(),
  markets: z.array(z.string().trim().min(1).max(40)).min(1).max(20),
  channels: z.array(z.string().trim().min(1).max(40)).min(1).max(20),
  companyKeyHashes: z.array(z.string().trim().regex(/^[a-fA-F0-9]{64}$/)).max(1000),
  prices: z.array(z.object({
    productId: z.number().int().positive(), priceCents: z.number().int().min(1).max(10000000),
  }).strict()).min(1).max(5000),
}).strict();

export const GET: APIRoute = async ({ locals }) => {
  if (!runtimePlatform.hasCapabilityFlag('PRC-009', 'routes')) {
    return Response.json({ error: 'Listas de precios no habilitadas.' }, { status: 403 });
  }
  return Response.json({ price_lists: await createPriceListOperations(locals.runtime.env.DB).list() });
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (locals.runtime.env.DEMO_MODE === 'true') {
    return Response.json({ error: 'El panel público es una muestra de solo lectura.' }, { status: 403 });
  }
  if (!runtimePlatform.hasCapabilityFlag('PRC-009', 'sideEffects')) {
    return Response.json({ error: 'Listas de precios no habilitadas.' }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  try {
    const result = await createPriceListOperations(locals.runtime.env.DB).create(parsed.data);
    if (result.outcome === 'product-not-found') return Response.json({ error: 'Hay productos inexistentes.' }, { status: 422 });
    if (result.outcome === 'conflict') return Response.json({ error: 'La operación entró en conflicto.' }, { status: 409 });
    return Response.json({ ok: true, price_list_id: result.priceListId }, { status: 201 });
  } catch (error) {
    if (error instanceof RangeError) return Response.json({ error: error.message }, { status: 422 });
    throw error;
  }
};
