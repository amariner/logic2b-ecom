import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createDiscountCombinationOperations } from '../../../../composition/discount-combination-operations';
import { runtimePlatform } from '../../../../composition/runtime-platform';

export const prerender = false;

const instant = z.string().datetime({ offset: false });
const source = z.enum(['promotion_code', 'automatic_discount', 'quantity_offer']);
const discountClass = z.enum(['product', 'order', 'shipping']);
const schema = z.object({
  label: z.string().trim().min(2).max(120), state: z.enum(['active', 'disabled']),
  priority: z.number().int().min(0).max(100000), currency: z.string().trim().length(3),
  activeFrom: instant.nullable(), activeUntil: instant.nullable(),
  markets: z.array(z.string().trim().min(1).max(40)).min(1).max(20),
  channels: z.array(z.string().trim().min(1).max(40)).min(1).max(20),
  maximumDiscountBasisPoints: z.number().int().min(1).max(10000),
  sourcePairs: z.array(z.object({ left: source, right: source }).strict()).max(3),
  classPairs: z.array(z.object({ left: discountClass, right: discountClass }).strict()).max(6),
}).strict();

export const GET: APIRoute = async ({ locals }) => {
  if (!runtimePlatform.hasCapabilityFlag('PRC-008', 'routes')) {
    return Response.json({ error: 'Combinación de descuentos no habilitada.' }, { status: 403 });
  }
  return Response.json({ policies: await createDiscountCombinationOperations(locals.runtime.env.DB).list() });
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (locals.runtime.env.DEMO_MODE === 'true') {
    return Response.json({ error: 'El panel público es una muestra de solo lectura.' }, { status: 403 });
  }
  if (!runtimePlatform.hasCapabilityFlag('PRC-008', 'sideEffects')) {
    return Response.json({ error: 'Combinación de descuentos no habilitada.' }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  try {
    const result = await createDiscountCombinationOperations(locals.runtime.env.DB).create(parsed.data);
    if (result.outcome === 'conflict') return Response.json({ error: 'La operación entró en conflicto.' }, { status: 409 });
    return Response.json({ ok: true, policy_id: result.policyId }, { status: 201 });
  } catch (error) {
    if (error instanceof RangeError) return Response.json({ error: error.message }, { status: 422 });
    throw error;
  }
};
