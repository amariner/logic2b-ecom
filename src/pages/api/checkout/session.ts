import type { APIRoute } from 'astro';
import { z } from 'zod';
import { shopConfig } from '../../../../shop.config';
import { applyPaidMutation, generateOrderNumber } from '../../../lib/orders';
import { isSimulatedPayment } from '../../../lib/payment-mode';
import { buildPaidMutation, type OrderItemForPayment } from '../../../lib/payment-transition';
import { quoteCart } from '../../../lib/quote';
import { deliverPendingEmails } from '../../../lib/send-email';
import { stripeClient } from '../../../lib/stripe';

export const prerender = false;

const checkoutRequestSchema = z.object({
  lines: z
    .array(z.object({ slug: z.string().min(1).max(120), qty: z.number().int().min(1).max(99) }))
    .min(1)
    .max(50),
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
  const productRows = await env.DB.prepare(
    `SELECT id, slug FROM products WHERE slug IN (${quote.lines.map(() => '?').join(',')})`,
  )
    .bind(...quote.lines.map((line) => line.slug))
    .all<{ id: number; slug: string }>();
  const idBySlug = new Map(productRows.results.map((row) => [row.slug, row.id]));

  // En pago real, el session_id lo da Stripe. En simulación lo sintetizamos:
  // sirve de clave de idempotencia y de referencia en /demo/gracias.
  let sessionId = `sim_${orderNumber}`;
  let redirectUrl = `${origin}/demo/gracias?session_id=${sessionId}`;

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
      success_url: `${origin}/demo/gracias?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/demo/carrito`,
    });
    sessionId = session.id;
    redirectUrl = session.url ?? redirectUrl;
  }

  // Pedido en 'pending' + líneas con snapshot de nombre y precio, en una batch
  const insertOrder = env.DB.prepare(
    `INSERT INTO orders (order_number, email, customer_name, address_json, subtotal_cents, shipping_cents, total_cents, status, stripe_session_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
  ).bind(
    orderNumber,
    customer.email,
    customer.name,
    addressJson,
    quote.subtotal_cents,
    quote.shipping_cents,
    quote.total_cents,
    sessionId,
  );
  await insertOrder.run();

  const orderRow = await env.DB.prepare('SELECT id FROM orders WHERE order_number = ?')
    .bind(orderNumber)
    .first<{ id: number }>();
  if (!orderRow) {
    return Response.json({ error: 'No se pudo registrar el pedido' }, { status: 500 });
  }

  const items: OrderItemForPayment[] = quote.lines.map((line) => ({
    product_id: idBySlug.get(line.slug) ?? 0,
    name_snapshot: line.name,
    unit_price_cents: line.unit_price_cents,
    qty: line.qty,
  }));

  const itemStatements = items.map((item) =>
    env.DB.prepare(
      'INSERT INTO order_items (order_id, product_id, name_snapshot, unit_price_cents, qty) VALUES (?, ?, ?, ?, ?)',
    ).bind(orderRow.id, item.product_id || null, item.name_snapshot, item.unit_price_cents, item.qty),
  );
  itemStatements.push(
    env.DB.prepare(
      "INSERT INTO order_events (order_id, from_status, to_status, note) VALUES (?, NULL, 'pending', 'Pedido creado, esperando pago')",
    ).bind(orderRow.id),
  );
  await env.DB.batch(itemStatements);

  // Pago simulado: marcamos pagado al instante (sin Stripe ni webhook). Reutiliza
  // exactamente la misma mutación que el webhook real → stock, evento y emails.
  if (simulate) {
    const mutation = buildPaidMutation(
      {
        id: orderRow.id,
        order_number: orderNumber,
        status: 'pending',
        email: customer.email,
        customer_name: customer.name,
        subtotal_cents: quote.subtotal_cents,
        shipping_cents: quote.shipping_cents,
        total_cents: quote.total_cents,
      },
      items,
      `sim_pi_${orderNumber}`,
      'Pago confirmado (simulado)',
    );
    if (mutation !== null) {
      await applyPaidMutation(env.DB, mutation);
      locals.runtime.ctx.waitUntil(deliverPendingEmails(env.DB, env));
    }
  }

  return Response.json({ url: redirectUrl, order_number: orderNumber });
};
