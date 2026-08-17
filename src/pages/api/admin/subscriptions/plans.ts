import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createSubscriptionOperations } from '../../../../composition/subscription-operations';
import { runtimePlatform } from '../../../../composition/runtime-platform';

export const prerender = false;

const schema = z.object({
  variant_id: z.number().int().positive(),
  state: z.enum(['draft', 'active', 'paused']),
  label: z.string().trim().min(2).max(120),
  amount_cents: z.number().int().positive(),
  currency: z.string().trim().length(3),
  interval_unit: z.enum(['day', 'week', 'month', 'year']),
  interval_count: z.number().int().min(1).max(365),
  provider_adapter: z.literal('simulated-subscriptions'),
  provider_plan_reference: z.string().trim().min(2).max(200).nullable(),
}).strict();

export const POST: APIRoute = async ({ request, locals }) => {
  if (locals.runtime.env.DEMO_MODE === 'true') {
    return Response.json({ error: 'El panel público es una muestra de solo lectura.' }, { status: 403 });
  }
  if (!runtimePlatform.hasCapabilityFlag('PRC-013', 'sideEffects')) {
    return Response.json({ error: 'Suscripciones no habilitadas.' }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;
  try {
    const result = await createSubscriptionOperations(locals.runtime.env.DB).createPlan({
      variantId: data.variant_id,
      state: data.state,
      label: data.label,
      amountCents: data.amount_cents,
      currency: data.currency,
      intervalUnit: data.interval_unit,
      intervalCount: data.interval_count,
      providerAdapter: data.provider_adapter,
      providerPlanReference: data.provider_plan_reference,
    });
    if (result.outcome === 'variant-not-found') {
      return Response.json({ error: 'Variante activa no encontrada.' }, { status: 422 });
    }
    return Response.json({ ok: true, plan_id: result.planId }, { status: 201 });
  } catch (error) {
    if (error instanceof RangeError) return Response.json({ error: error.message }, { status: 422 });
    throw error;
  }
};

