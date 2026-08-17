import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createSubscriptionOperations } from '../../../../composition/subscription-operations';
import { runtimePlatform } from '../../../../composition/runtime-platform';

export const prerender = false;

const schema = z.object({
  expected_version: z.number().int().positive(),
  action: z.enum([
    'activate', 'pause', 'resume', 'change_plan', 'cancel_at_period_end',
    'cancel_now', 'payment_succeeded', 'payment_failed',
  ]),
  idempotency_key: z.string().regex(/^[a-zA-Z0-9_-]{8,100}$/),
  next_plan_id: z.string().trim().min(8).max(120).optional(),
  cycle_reference: z.string().trim().min(2).max(200).optional(),
  attempt_count: z.number().int().positive().optional(),
  failure_code: z.string().trim().min(2).max(80).optional(),
  period_starts_at: z.string().datetime({ offset: false }).optional(),
  period_ends_at: z.string().datetime({ offset: false }).optional(),
}).strict();

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  if (locals.runtime.env.DEMO_MODE === 'true') {
    return Response.json({ error: 'El panel público es una muestra de solo lectura.' }, { status: 403 });
  }
  if (!runtimePlatform.hasCapabilityFlag('PRC-013', 'sideEffects')) {
    return Response.json({ error: 'Suscripciones no habilitadas.' }, { status: 403 });
  }
  const id = params.id?.trim();
  if (!id) return Response.json({ error: 'Suscripción inválida.' }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;
  try {
    const outcome = await createSubscriptionOperations(locals.runtime.env.DB).command({
      subscriptionId: id,
      expectedVersion: data.expected_version,
      action: data.action,
      idempotencyKey: data.idempotency_key,
      ...(data.next_plan_id === undefined ? {} : { nextPlanId: data.next_plan_id }),
      ...(data.cycle_reference === undefined ? {} : { cycleReference: data.cycle_reference }),
      ...(data.attempt_count === undefined ? {} : { attemptCount: data.attempt_count }),
      ...(data.failure_code === undefined ? {} : { failureCode: data.failure_code }),
      ...(data.period_starts_at === undefined ? {} : { periodStartsAt: data.period_starts_at }),
      ...(data.period_ends_at === undefined ? {} : { periodEndsAt: data.period_ends_at }),
    });
    if (outcome === 'not-found') return Response.json({ error: 'Suscripción no encontrada.' }, { status: 404 });
    if (outcome === 'conflict') return Response.json({ error: 'La suscripción cambió concurrentemente.' }, { status: 409 });
    return Response.json({ ok: true, duplicate: outcome === 'duplicate' });
  } catch (error) {
    if (error instanceof RangeError) return Response.json({ error: error.message }, { status: 422 });
    throw error;
  }
};
