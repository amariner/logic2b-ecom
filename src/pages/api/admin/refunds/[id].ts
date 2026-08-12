import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createRefundOperations } from '../../../../composition/refund-operations';
import { flushEventOutbox } from '../../../../composition/outbox-dispatcher';
import { runtimePlatform } from '../../../../composition/runtime-platform';
import { createPaymentRefundGatewayResolver } from '../../../../integrations';

export const prerender = false;

const totalRefundSchema = z.object({
  mode: z.literal('total').optional(),
  reason: z.string().trim().min(1).max(240),
  restock: z.boolean(),
}).strict();

const partialRefundSchema = z.object({
  mode: z.literal('partial'),
  reason: z.string().trim().min(1).max(240),
  restock: z.boolean(),
  idempotency_key: z.string().uuid(),
  lines: z.array(z.object({
    order_item_id: z.number().int().positive(),
    quantity: z.number().int().positive(),
  }).strict()).min(1).max(100),
}).strict();

export const POST: APIRoute = async ({ params, request, locals }) => {
  const env = locals.runtime.env;
  if (env.DEMO_MODE === 'true') {
    return Response.json({ error: 'El panel público es una muestra de solo lectura.' }, { status: 403 });
  }
  if (!runtimePlatform.hasCapabilityFlag('ORD-007', 'sideEffects')) {
    return Response.json({ error: 'Los reembolsos no están habilitados.' }, { status: 403 });
  }
  const orderId = Number(params.id);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return Response.json({ error: 'id inválido' }, { status: 400 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 });
  }
  const parsed = typeof body === 'object' && body !== null &&
    (body as { mode?: unknown }).mode === 'partial'
    ? partialRefundSchema.safeParse(body)
    : totalRefundSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const refunds = createRefundOperations(
      env.DB,
      createPaymentRefundGatewayResolver(env.STRIPE_SECRET_KEY),
    );
    const result = parsed.data.mode === 'partial'
      ? await refunds.refundPartial({
          orderId,
          reason: parsed.data.reason,
          restock: parsed.data.restock,
          idempotencyKey: parsed.data.idempotency_key,
          lines: parsed.data.lines,
        })
      : await refunds.refundTotal({
          orderId,
          reason: parsed.data.reason,
          restock: parsed.data.restock,
        });
    switch (result.outcome) {
      case 'applied':
        if (result.queuedMessages > 0) {
          locals.runtime.ctx.waitUntil(flushEventOutbox(env.DB, env));
        }
        return Response.json({ ok: true, status: 'succeeded' });
      case 'already_applied':
        return Response.json({ ok: true, status: 'succeeded', replay: true });
      case 'processing':
        return Response.json({ ok: true, status: 'processing' }, { status: 202 });
      case 'not_found':
        return Response.json({ error: 'Pedido no encontrado.' }, { status: 404 });
      case 'invalid_state':
        return Response.json({
          error: parsed.data.mode === 'partial'
            ? 'La selección ya no conserva esas unidades cancelables.'
            : 'El pedido o el pago ya no admite un reembolso total.',
        }, { status: 422 });
      case 'gateway_unavailable':
        return Response.json({ error: 'La pasarela del pago no permite completar el reembolso.' }, { status: 503 });
      case 'conflict':
        return Response.json({ error: 'El pedido cambió mientras se procesaba; recarga la página.' }, { status: 409 });
      case 'failed':
      case 'requires_review':
        return Response.json(
          { error: 'La pasarela no confirmó el reembolso; queda visible para revisión.' },
          { status: 502 },
        );
    }
  } catch {
    return Response.json(
      { error: 'La pasarela no respondió. Reintenta: la misma clave evita duplicar el reembolso.' },
      { status: 502 },
    );
  }
};
