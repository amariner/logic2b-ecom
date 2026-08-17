import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createPreorderOperations } from '../../../../composition/preorder-operations';
import { runtimePlatform } from '../../../../composition/runtime-platform';

export const prerender = false;

const instant = z.string().datetime({ offset: false });
const schema = z.object({
  variant_id: z.number().int().positive(),
  kind: z.enum(['preorder', 'backorder']),
  state: z.enum(['active', 'paused']),
  label: z.string().trim().min(2).max(120),
  public_message: z.string().trim().min(2).max(240),
  sale_starts_at: instant.nullable(),
  sale_ends_at: instant.nullable(),
  availability_starts_at: instant,
  availability_ends_at: instant,
  max_deferred_quantity: z.number().int().positive().max(1_000_000),
  payment_policy: z.enum(['charge_now', 'charge_on_allocation']),
}).strict();

export const GET: APIRoute = async ({ url, locals }) => {
  if (!runtimePlatform.hasCapabilityFlag('PRC-014', 'routes')) {
    return Response.json({ error: 'Preventa y backorder no habilitados.' }, { status: 403 });
  }
  const orderIdValue = url.searchParams.get('order_id');
  const orderId = orderIdValue === null ? undefined : Number(orderIdValue);
  if (orderId !== undefined && (!Number.isSafeInteger(orderId) || orderId < 1)) {
    return Response.json({ error: 'Pedido inválido.' }, { status: 400 });
  }
  const operations = createPreorderOperations(locals.runtime.env.DB);
  const [policies, commitments] = await Promise.all([
    operations.policies(),
    operations.commitments(orderId),
  ]);
  return Response.json({ policies, commitments });
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (locals.runtime.env.DEMO_MODE === 'true') {
    return Response.json({ error: 'El panel público es una muestra de solo lectura.' }, { status: 403 });
  }
  if (!runtimePlatform.hasCapabilityFlag('PRC-014', 'sideEffects')) {
    return Response.json({ error: 'Preventa y backorder no habilitados.' }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;
  try {
    const result = await createPreorderOperations(locals.runtime.env.DB).createPolicy({
      variantId: data.variant_id,
      kind: data.kind,
      state: data.state,
      label: data.label,
      publicMessage: data.public_message,
      saleStartsAt: data.sale_starts_at,
      saleEndsAt: data.sale_ends_at,
      availabilityStartsAt: data.availability_starts_at,
      availabilityEndsAt: data.availability_ends_at,
      maxDeferredQuantity: data.max_deferred_quantity,
      paymentPolicy: data.payment_policy,
    });
    if (result.outcome === 'variant-not-found') {
      return Response.json({ error: 'Variante principal activa no encontrada.' }, { status: 422 });
    }
    if (result.outcome === 'conflict') {
      return Response.json({ error: 'La variante ya tiene una política o cambió concurrentemente.' }, { status: 409 });
    }
    return Response.json({ ok: true, policy_id: result.policyId }, { status: 201 });
  } catch (error) {
    if (error instanceof RangeError || (error instanceof Error &&
        error.message.includes('preorder_policy_activation_conflict'))) {
      return Response.json({ error: error instanceof Error ? error.message : 'Política inválida.' }, { status: 422 });
    }
    throw error;
  }
};
