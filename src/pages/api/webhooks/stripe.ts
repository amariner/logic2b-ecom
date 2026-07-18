import type { APIRoute } from 'astro';
import type Stripe from 'stripe';
import { applyPaidMutation } from '../../../lib/orders';
import {
  buildPaidMutation,
  type OrderForPayment,
  type OrderItemForPayment,
} from '../../../lib/payment-transition';
import { deliverPendingEmails } from '../../../lib/send-email';
import { stripeClient, verifyWebhookEvent } from '../../../lib/stripe';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const signature = request.headers.get('stripe-signature');
  if (signature === null) {
    return new Response('Falta la firma', { status: 400 });
  }

  const payload = await request.text();
  let event: Stripe.Event;
  try {
    event = await verifyWebhookEvent(
      stripeClient(env.STRIPE_SECRET_KEY),
      payload,
      signature,
      env.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    return new Response('Firma inválida', { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const paymentIntent = typeof session.payment_intent === 'string' ? session.payment_intent : null;

    const order = await env.DB.prepare(
      'SELECT id, order_number, status, email, customer_name, subtotal_cents, shipping_cents, total_cents FROM orders WHERE stripe_session_id = ?',
    )
      .bind(session.id)
      .first<OrderForPayment>();

    const items = order
      ? (
          await env.DB.prepare(
            'SELECT product_id, name_snapshot, unit_price_cents, qty FROM order_items WHERE order_id = ?',
          )
            .bind(order.id)
            .all<OrderItemForPayment>()
        ).results
      : [];

    // Idempotente: pedido desconocido o ya no-pending → mutación null → 200 sin efectos
    const mutation = buildPaidMutation(order, items, paymentIntent);
    if (mutation !== null) {
      await applyPaidMutation(env.DB, mutation);
      // Producción: entrega el email de confirmación sin retrasar el 200 a Stripe.
      locals.runtime.ctx.waitUntil(deliverPendingEmails(env.DB, env));
    }
  }

  if (event.type === 'checkout.session.expired') {
    const session = event.data.object;
    const order = await env.DB.prepare('SELECT id, status FROM orders WHERE stripe_session_id = ?')
      .bind(session.id)
      .first<{ id: number; status: string }>();
    // Idempotente: solo actúa la primera vez que llega estando en 'pending'
    if (order !== null && order.status === 'pending') {
      await env.DB.batch([
        env.DB.prepare(
          "UPDATE orders SET status = 'cancelled', updated_at = datetime('now') WHERE id = ? AND status = 'pending'",
        ).bind(order.id),
        env.DB.prepare(
          "INSERT INTO order_events (order_id, from_status, to_status, note) VALUES (?, 'pending', 'cancelled', 'Sesión de pago caducada')",
        ).bind(order.id),
      ]);
    }
  }

  return Response.json({ received: true });
};
