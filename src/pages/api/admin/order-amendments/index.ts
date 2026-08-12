import type { APIRoute } from 'astro';
import { createOrderAmendmentOperations } from '../../../../composition/order-amendment-operations';
import { runtimePlatform } from '../../../../composition/runtime-platform';
import { createPaymentRefundGatewayResolver } from '../../../../integrations';
import { orderAmendmentCreateSchema } from '../../../../modules/orders/application/order-amendment-request';
import { isSimulatedPayment } from '../../../../lib/payment-mode';
import { stripeClient } from '../../../../lib/stripe';
import { INVENTORY_RESERVATION_POLICY } from '../../../../modules/inventory';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  if (env.DEMO_MODE === 'true') {
    return Response.json({ error: 'El panel público es una muestra de solo lectura.' }, { status: 403 });
  }
  if (!runtimePlatform.hasCapabilityFlag('ORD-005', 'sideEffects')) {
    return Response.json({ error: 'La edición de pedidos no está habilitada.' }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'JSON inválido.' }, { status: 400 });
  }
  const parsed = orderAmendmentCreateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Datos inválidos.', details: parsed.error.flatten() }, { status: 400 });
  }
  const operations = createOrderAmendmentOperations(
    env.DB,
    createPaymentRefundGatewayResolver(env.STRIPE_SECRET_KEY),
  );
  const amendmentId = `amd_${parsed.data.idempotency_key}`;
  try {
    const existing = await operations.findById(amendmentId);
    let plan = existing ? null : await operations.preview({
      orderId: parsed.data.order_id,
      expectedVersion: parsed.data.expected_version,
      lines: parsed.data.lines,
      ...(parsed.data.address === undefined ? {} : { address: parsed.data.address }),
    });
    const simulated = isSimulatedPayment(env);
    let sessionId: string | null = existing?.stripe_session_id ?? null;
    let sessionUrl: string | null = null;
    let expiresAt: string | null = existing?.expires_at ?? null;
    if ((plan?.delta_cents ?? existing?.delta_cents ?? 0) > 0) {
      if (!sessionId) {
        expiresAt = new Date(Date.now() + INVENTORY_RESERVATION_POLICY.ttlSeconds * 1000).toISOString();
        if (simulated) {
          sessionId = `sim_amendment_${parsed.data.idempotency_key}`;
        } else {
          const origin = new URL(request.url).origin;
          const stripe = stripeClient(env.STRIPE_SECRET_KEY!);
          const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            line_items: [{
              quantity: 1,
              price_data: {
                currency: plan!.currency.toLowerCase(),
                unit_amount: plan!.delta_cents,
                product_data: { name: `Ajuste del pedido ${plan!.order_number}` },
              },
            }],
            metadata: { amendment_id: amendmentId, order_number: plan!.order_number },
            success_url: `${origin}/demo/admin/pedidos/${plan!.order_id}?amendment=paid`,
            cancel_url: `${origin}/demo/admin/pedidos/${plan!.order_id}?amendment=cancelled`,
            expires_at: Math.floor(Date.parse(expiresAt) / 1000),
          }, { idempotencyKey: `r3:amendment:${amendmentId}:checkout` });
          sessionId = session.id;
          sessionUrl = session.url;
        }
      } else if (!simulated && env.STRIPE_SECRET_KEY) {
        const session = await stripeClient(env.STRIPE_SECRET_KEY).checkout.sessions.retrieve(sessionId);
        sessionUrl = session.url;
      }
    }
    const begun = existing ? {
      outcome: existing.status === 'applied' ? 'already_applied' as const : existing.status,
      amendment: existing,
    } : await operations.begin({
      amendmentId,
      orderId: parsed.data.order_id,
      expectedVersion: parsed.data.expected_version,
      lines: parsed.data.lines,
      ...(parsed.data.address === undefined ? {} : { address: parsed.data.address }),
      reason: parsed.data.reason,
      stripeSessionId: sessionId,
      expiresAt,
    });
    let result = begun;
    if (begun.amendment?.status === 'pending_refund') {
      result = await operations.reconcileRefund(amendmentId);
    }
    if (begun.amendment?.status === 'pending_payment' && simulated && sessionId) {
      result = await operations.confirmAdditionalPayment(
        sessionId,
        `sim_pi_amendment_${parsed.data.idempotency_key}`,
        `sim_event_amendment_${parsed.data.idempotency_key}`,
      );
    }
    const status = result.outcome === 'conflict' ? 409
      : result.outcome === 'invalid_state' ? 422
        : result.outcome === 'gateway_unavailable' ? 503
          : result.outcome === 'failed' || result.outcome === 'requires_review' ? 502
            : result.outcome === 'processing' || result.outcome === 'pending_payment' ? 202
              : 200;
    return Response.json({
      ok: status < 400,
      status: result.outcome,
      amendment_id: amendmentId,
      payment_url: sessionUrl,
    }, { status, headers: { 'cache-control': 'private, no-store', vary: 'Cookie' } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'No se pudo crear la edición.' },
      { status: 422, headers: { 'cache-control': 'private, no-store', vary: 'Cookie' } },
    );
  }
};
