import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createPreliminaryOrderOperations } from '../../../../composition/preliminary-order-operations';
import { runtimePlatform } from '../../../../composition/runtime-platform';

export const prerender = false;

const instant = z.string().datetime({ offset: false });
const idempotencyKey = z.string().trim().min(8).max(200).regex(/^[A-Za-z0-9:_-]+$/);
const schema = z.object({
  email: z.string().email().max(254),
  customer_name: z.string().trim().min(2).max(160),
  address: z.record(z.string(), z.unknown()),
  currency: z.string().regex(/^[A-Z]{3}$/),
  shipping_cents: z.number().int().nonnegative().max(1_000_000_000),
  deposit_cents: z.number().int().nonnegative().max(1_000_000_000),
  conversion_gate: z.enum(['approval', 'deposit', 'full_payment']),
  expires_at: instant,
  lines: z.array(z.object({
    variant_id: z.number().int().positive(),
    quantity: z.number().int().positive().max(10_000),
  }).strict()).min(1).max(100),
  idempotency_key: idempotencyKey,
}).strict();

export const GET: APIRoute = async ({ locals }) => {
  if (!runtimePlatform.hasCapabilityFlag('ORD-008', 'routes')) {
    return Response.json({ error: 'Presupuestos no habilitados.' }, { status: 403 });
  }
  const orders = await createPreliminaryOrderOperations(locals.runtime.env.DB).list();
  return Response.json({ orders }, { headers: { 'cache-control': 'no-store' } });
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (locals.runtime.env.DEMO_MODE === 'true') {
    return Response.json({ error: 'El panel público es una muestra de solo lectura.' }, { status: 403 });
  }
  if (!runtimePlatform.hasCapabilityFlag('ORD-008', 'sideEffects')) {
    return Response.json({ error: 'Presupuestos no habilitados.' }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const result = await createPreliminaryOrderOperations(locals.runtime.env.DB).create({
      email: parsed.data.email,
      customerName: parsed.data.customer_name,
      addressJson: JSON.stringify(parsed.data.address),
      currency: parsed.data.currency,
      shippingCents: parsed.data.shipping_cents,
      depositCents: parsed.data.deposit_cents,
      conversionGate: parsed.data.conversion_gate,
      expiresAt: parsed.data.expires_at,
      lines: parsed.data.lines.map((line) => ({
        variantId: line.variant_id,
        quantity: line.quantity,
      })),
      idempotencyKey: parsed.data.idempotency_key,
    });
    if (result.outcome === 'variant-not-found') {
      return Response.json({ error: 'Alguna variante activa no existe.' }, { status: 422 });
    }
    return Response.json({ ok: true, preliminary_order_id: result.id,
      replayed: result.outcome === 'duplicate' }, {
      status: result.outcome === 'duplicate' ? 200 : 201,
    });
  } catch (error) {
    if (error instanceof RangeError) return Response.json({ error: error.message }, { status: 422 });
    throw error;
  }
};
