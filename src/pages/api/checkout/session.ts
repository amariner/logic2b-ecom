import type { APIRoute } from 'astro';
import { z } from 'zod';
import { shopConfig } from '../../../../shop.config';
import { createOrderOperations } from '../../../composition/order-operations';
import { getProductIdsBySlugs } from '../../../lib/db';
import { generateOrderNumber, generateSimulatedSessionToken } from '../../../lib/orders';
import { isSimulatedPayment } from '../../../lib/payment-mode';
import { DEFAULT_COLLECTION_ID, resolveCollection, storePaths } from '../../../collections';
import { quoteCart } from '../../../lib/quote';
import { deliverPendingEmails } from '../../../lib/send-email';
import { stripeClient } from '../../../lib/stripe';
import type { NewOrderLine } from '../../../modules/orders';

export const prerender = false;

const checkoutRequestSchema = z.object({
  lines: z
    .array(z.object({ slug: z.string().min(1).max(120), qty: z.number().int().min(1).max(99) }))
    .min(1)
    .max(50),
  // Tienda desde la que se compra (9B.4): decide SOLO adónde se vuelve tras el
  // pago (gracias/carrito de esa tienda). Se valida contra el registro — un id
  // desconocido cae a la tienda genérica, nunca a una URL construida del input.
  collection: z.string().trim().max(40).optional(),
  customer: z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(200),
    phone: z.string().trim().max(30).optional(),
    street: z.string().trim().min(3).max(200),
    city: z.string().trim().min(2).max(100),
    postal_code: z.string().trim().regex(/^\d{5}$/, 'CP de 5 dígitos'),
    // Datos de facturación opcionales: el kit no emite facturas (ver ROADMAP),
    // pero el pedido nace con lo necesario para que el comercio la haga fuera.
    nif: z.string().trim().max(20).optional(),
    company: z.string().trim().max(160).optional(),
  }),
});

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  if (env.DEMO_MODE === 'true') {
    return Response.json(
      { error: 'La demo pública no crea pedidos ni sesiones de pago.' },
      { status: 410 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 });
  }
  const parsed = checkoutRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  }
  const { lines, customer } = parsed.data;
  const storeCollection = resolveCollection(parsed.data.collection);
  const paths = storePaths(storeCollection?.id ?? DEFAULT_COLLECTION_ID);

  // Revalidar TODO contra D1: precios, stock y cobertura de envío (§7.4)
  const quote = await quoteCart(env.DB, { lines, postal_code: customer.postal_code });
  if (!quote.purchasable) {
    return Response.json({ error: 'Hay productos no disponibles en el carrito', quote }, { status: 409 });
  }
  if (quote.shipping_cents === null || quote.total_cents === null || quote.shipping === null) {
    return Response.json({ error: 'No hay cobertura de envío para ese código postal' }, { status: 422 });
  }

  const orderNumber = generateOrderNumber();
  const origin = new URL(request.url).origin;
  const simulate = isSimulatedPayment(env);

  const addressJson = JSON.stringify({
    name: customer.name,
    phone: customer.phone ?? null,
    street: customer.street,
    city: customer.city,
    postal_code: customer.postal_code,
    zone: quote.shipping.zone,
    nif: customer.nif ?? null,
    company: customer.company ?? null,
  });

  // Mapa slug → id de producto para el snapshot de líneas (y el decremento de stock).
  const idBySlug = await getProductIdsBySlugs(
    env.DB,
    quote.lines.map((line) => line.slug),
  );

  // En pago real, el session_id lo da Stripe (alta entropía propia). En
  // simulación lo sintetizamos con un token aleatorio independiente del nº de
  // pedido: /demo/gracias no requiere login y lo usa para exponer nombre/email/total.
  let sessionId = `sim_${generateSimulatedSessionToken()}`;
  let redirectUrl = `${origin}${paths.thanks}?session_id=${sessionId}`;

  if (!simulate) {
    const stripe = stripeClient(env.STRIPE_SECRET_KEY!);

    // line_items construidos EN SERVIDOR desde la quote (nunca del cliente)
    const lineItems = quote.lines.map((line) => ({
      quantity: line.qty,
      price_data: {
        currency: shopConfig.currency,
        unit_amount: line.unit_price_cents,
        product_data: { name: line.name },
      },
    }));
    if (quote.shipping_cents > 0) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency: shopConfig.currency,
          unit_amount: quote.shipping_cents,
          product_data: { name: `Envío — ${quote.shipping.label}` },
        },
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      customer_email: customer.email,
      metadata: { order_number: orderNumber },
      success_url: `${origin}${paths.thanks}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${paths.cart}`,
    });
    sessionId = session.id;
    redirectUrl = session.url ?? redirectUrl;
  }

  const orderLines: NewOrderLine[] = quote.lines.map((line) => ({
    product_id: idBySlug.get(line.slug) ?? 0,
    name_snapshot: line.name,
    unit_price_cents: line.unit_price_cents,
    qty: line.qty,
  }));

  // Pedido en 'pending' + líneas con snapshot de nombre y precio + primer hecho
  // del flujo (`orders.order_placed`), del que sale la entrada del timeline.
  const orders = createOrderOperations(env.DB);
  const placed = await orders.placeOrder(
    {
      order_number: orderNumber,
      email: customer.email,
      customer_name: customer.name,
      address_json: addressJson,
      subtotal_cents: quote.subtotal_cents,
      shipping_cents: quote.shipping_cents,
      total_cents: quote.total_cents,
      stripe_session_id: sessionId,
    },
    orderLines,
  );
  if (placed === null) {
    return Response.json({ error: 'No se pudo registrar el pedido' }, { status: 500 });
  }

  // Pago simulado: marcamos pagado al instante (sin Stripe ni webhook). Recorre
  // exactamente el mismo caso de uso que el webhook real → stock, evento y emails;
  // solo cambian el origen del cobro y el hecho que lo causa (el alta del pedido).
  if (simulate) {
    const confirmed = await orders.confirmPayment({
      lookup: { by: 'id', orderId: placed.orderId },
      paymentIntent: `sim_pi_${orderNumber}`,
      source: 'simulated',
      causationId: placed.event.event_id,
    });
    if (confirmed) {
      locals.runtime.ctx.waitUntil(deliverPendingEmails(env.DB, env));
    }
  }

  return Response.json({ url: redirectUrl, order_number: orderNumber });
};
