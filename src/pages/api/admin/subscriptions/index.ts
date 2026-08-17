import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createSubscriptionOperations } from '../../../../composition/subscription-operations';
import { runtimePlatform } from '../../../../composition/runtime-platform';

export const prerender = false;

const schema = z.object({
  plan_id: z.string().trim().min(8).max(120),
  contact_email: z.string().email().max(254),
  quantity: z.number().int().positive().max(10_000),
  idempotency_key: z.string().regex(/^[a-zA-Z0-9_-]{8,100}$/),
}).strict();

export const GET: APIRoute = async ({ locals }) => {
  if (!runtimePlatform.hasCapabilityFlag('PRC-013', 'routes')) {
    return Response.json({ error: 'Suscripciones no habilitadas.' }, { status: 403 });
  }
  return Response.json(await createSubscriptionOperations(locals.runtime.env.DB).list(), {
    headers: { 'cache-control': 'no-store' },
  });
};

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
  try {
    const result = await createSubscriptionOperations(locals.runtime.env.DB).create({
      planId: parsed.data.plan_id,
      contactEmail: parsed.data.contact_email,
      quantity: parsed.data.quantity,
      idempotencyKey: parsed.data.idempotency_key,
    });
    if (result.outcome === 'plan-not-found') return Response.json({ error: 'Plan no encontrado.' }, { status: 404 });
    if (result.outcome === 'plan-inactive') return Response.json({ error: 'Plan no activo.' }, { status: 422 });
    if (result.outcome === 'conflict') return Response.json({ error: 'Alta en conflicto.' }, { status: 409 });
    return Response.json({ ok: true, subscription_id: result.subscriptionId,
      duplicate: result.outcome === 'duplicate' }, { status: result.outcome === 'duplicate' ? 200 : 201 });
  } catch (error) {
    if (error instanceof RangeError) return Response.json({ error: error.message }, { status: 422 });
    throw error;
  }
};

