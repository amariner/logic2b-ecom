import type { APIRoute } from 'astro';
import { createOrderOperations } from '../../../composition/order-operations';
import { flushEventOutbox } from '../../../composition/outbox-dispatcher';
import { verifyCheckoutWebhookEvent } from '../../../lib/stripe';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  if (env.DEMO_MODE === 'true') {
    return Response.json({ error: 'La demo pública no procesa pagos ni webhooks.' }, { status: 410 });
  }
  // Sin claves de Stripe el checkout va en modo simulado y no hay webhook que verificar.
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
    return new Response('Pagos en modo simulado: webhook deshabilitado', { status: 503 });
  }
  const signature = request.headers.get('stripe-signature');
  if (signature === null) {
    return new Response('Falta la firma', { status: 400 });
  }

  const payload = await request.text();
  let event;
  try {
    event = await verifyCheckoutWebhookEvent(env.STRIPE_SECRET_KEY, payload, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return new Response('Firma inválida', { status: 400 });
  }

  const orders = createOrderOperations(env.DB);

  // Idempotente en todas sus capas: pedido desconocido o ya no-pending → sin
  // efectos; y si dos entregas del mismo evento llegan solapadas, el UPDATE
  // guardado de dentro decide cuál gana (CLAUDE.md §7.3). Stripe recibe 200
  // igualmente: reintentaría si no.
  if (event.kind === 'checkout_completed' && event.paid) {
    const confirmed = await orders.confirmPayment({
      lookup: { by: 'session', stripeSessionId: event.session_id },
      paymentIntent: event.payment_intent,
      source: 'stripe',
      causationId: event.id,
    });
    if (confirmed) {
      // Producción: entrega el email de confirmación sin retrasar el 200 a Stripe.
      locals.runtime.ctx.waitUntil(flushEventOutbox(env.DB, env));
    }
  }

  if (event.kind === 'checkout_expired') {
    await orders.expirePayment({ stripeSessionId: event.session_id, causationId: event.id });
  }

  return Response.json({ received: true });
};
