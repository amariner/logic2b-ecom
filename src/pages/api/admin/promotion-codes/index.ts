import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createPromotionCodeOperations } from '../../../../composition/promotion-code-operations';
import { runtimePlatform } from '../../../../composition/runtime-platform';

export const prerender = false;

const instant = z.string().datetime({ offset: false });
const schema = z.object({
  code: z.string().trim().min(3).max(32),
  label: z.string().trim().min(2).max(120),
  state: z.enum(['active', 'disabled']),
  priority: z.number().int().min(0).max(100000),
  currency: z.string().trim().length(3),
  effect: z.discriminatedUnion('type', [
    z.object({ type: z.literal('percentage_off'), basisPoints: z.number().int().min(1).max(10000) }).strict(),
    z.object({ type: z.literal('amount_off'), amountCents: z.number().int().min(1).max(10000000) }).strict(),
  ]),
  activeFrom: instant.nullable(),
  activeUntil: instant.nullable(),
  markets: z.array(z.string().trim().min(1).max(40)).min(1).max(20),
  channels: z.array(z.string().trim().min(1).max(40)).min(1).max(20),
  globalUsageLimit: z.number().int().min(1).max(1000000000).nullable(),
  perCustomerUsageLimit: z.number().int().min(1).max(1000000000).nullable(),
  minimumSubtotalCents: z.number().int().min(0).max(1000000000),
  productIds: z.array(z.number().int().positive()).max(500),
}).strict();

export const GET: APIRoute = async ({ locals }) => {
  if (!runtimePlatform.hasCapabilityFlag('PRC-004', 'routes')) {
    return Response.json({ error: 'Códigos promocionales no habilitados.' }, { status: 403 });
  }
  return Response.json({ promotions: await createPromotionCodeOperations(locals.runtime.env.DB).list() });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  if (env.DEMO_MODE === 'true') {
    return Response.json({ error: 'El panel público es una muestra de solo lectura.' }, { status: 403 });
  }
  if (!runtimePlatform.hasCapabilityFlag('PRC-004', 'sideEffects')) {
    return Response.json({ error: 'Códigos promocionales no habilitados.' }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const result = await createPromotionCodeOperations(env.DB).create(parsed.data);
    if (result.outcome === 'conflict') {
      return Response.json({ error: 'El código ya existe o la operación entró en conflicto.' }, { status: 409 });
    }
    if (result.outcome === 'unknown-product') {
      return Response.json({ error: 'El scope contiene productos inexistentes.' }, { status: 422 });
    }
    return Response.json({
      ok: true,
      promotion_id: result.promotionId,
      code: result.normalizedCode,
      warning: 'Guarda el código ahora: después solo se mostrará una pista parcial.',
    }, { status: 201, headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    if (error instanceof RangeError) return Response.json({ error: error.message }, { status: 422 });
    throw error;
  }
};
