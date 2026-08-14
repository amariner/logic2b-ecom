import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createQuantityOfferOperations } from '../../../../composition/quantity-offer-operations';
import { runtimePlatform } from '../../../../composition/runtime-platform';

export const prerender = false;

const instant = z.string().datetime({ offset: false });
const effect = z.discriminatedUnion('type', [
  z.object({ type: z.literal('percentage_off'), basisPoints: z.number().int().min(1).max(10000) }).strict(),
  z.object({ type: z.literal('amount_off'), amountCents: z.number().int().min(1).max(10000000) }).strict(),
]);
const common = {
  label: z.string().trim().min(2).max(120),
  publicReason: z.string().trim().min(2).max(160),
  state: z.enum(['active', 'disabled']),
  priority: z.number().int().min(0).max(100000),
  currency: z.string().trim().length(3),
  activeFrom: instant.nullable(),
  activeUntil: instant.nullable(),
  markets: z.array(z.string().trim().min(1).max(40)).min(1).max(20),
  channels: z.array(z.string().trim().min(1).max(40)).min(1).max(20),
};
const schema = z.discriminatedUnion('kind', [
  z.object({
    ...common,
    kind: z.literal('quantity_tier'),
    tierBasis: z.enum(['quantity', 'subtotal']),
    tiers: z.array(z.object({ threshold: z.number().int().positive(), effect }).strict()).min(1).max(50),
    productIds: z.array(z.number().int().positive()).max(500),
  }).strict(),
  z.object({
    ...common,
    kind: z.literal('buy_x_get_y'),
    buyQuantity: z.number().int().min(1).max(99),
    rewardQuantity: z.number().int().min(1).max(99),
    rewardEffect: effect,
    maxApplications: z.number().int().min(1).max(99).nullable(),
    buyProductIds: z.array(z.number().int().positive()).min(1).max(500),
    rewardProductIds: z.array(z.number().int().positive()).min(1).max(500),
  }).strict(),
]);

function enabled(flag: 'routes' | 'sideEffects'): boolean {
  return runtimePlatform.hasCapabilityFlag('PRC-006', flag) ||
    runtimePlatform.hasCapabilityFlag('PRC-007', flag);
}

export const GET: APIRoute = async ({ locals }) => {
  if (!enabled('routes')) return Response.json({ error: 'Ofertas por cantidad no habilitadas.' }, { status: 403 });
  return Response.json({ offers: await createQuantityOfferOperations(locals.runtime.env.DB).list() });
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (locals.runtime.env.DEMO_MODE === 'true') {
    return Response.json({ error: 'El panel público es una muestra de solo lectura.' }, { status: 403 });
  }
  if (!enabled('sideEffects')) return Response.json({ error: 'Ofertas por cantidad no habilitadas.' }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  const requiredCapability = parsed.data.kind === 'quantity_tier' ? 'PRC-006' : 'PRC-007';
  if (!runtimePlatform.hasCapabilityFlag(requiredCapability, 'sideEffects')) {
    return Response.json({ error: 'El tipo de oferta no está habilitado.' }, { status: 403 });
  }
  try {
    const result = await createQuantityOfferOperations(locals.runtime.env.DB).create(parsed.data);
    if (result.outcome === 'conflict') return Response.json({ error: 'La operación entró en conflicto.' }, { status: 409 });
    if (result.outcome === 'unknown-product') {
      return Response.json({ error: 'El scope contiene productos inexistentes.' }, { status: 422 });
    }
    return Response.json({ ok: true, offer_id: result.offerId }, { status: 201 });
  } catch (error) {
    if (error instanceof RangeError) return Response.json({ error: error.message }, { status: 422 });
    throw error;
  }
};
