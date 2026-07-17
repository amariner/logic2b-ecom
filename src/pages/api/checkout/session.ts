import type { APIRoute } from 'astro';
import { z } from 'zod';
import { shopConfig } from '../../../../shop.config';
import { generateOrderNumber } from '../../../lib/orders';
import { quoteCart } from '../../../lib/quote';
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

  const stripe = stripeClient(env.STRIPE_SECRET_KEY);
  const orderNumber = generateOrderNumber();
  const origin = new URL(request.url).origin;

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

  // Pedido en 'pending' + líneas con snapshot de nombre y precio, en una batch
  const addressJson = JSON.stringify({
    name: customer.name,
    phone: customer.phone ?? null,
    street: customer.street,
    city: customer.city,
    postal_code: customer.postal_code,
    zone: quote.shipping.zone,
  });

  const productRows = await env.DB.prepare(
    `SELECT id, slug FROM products WHERE slug IN (${quote.lines.map(() => '?').join(',')})`,
  )
    .bind(...quote.lines.map((line) => line.slug))
    .all<{ id: number; slug: string }>();
  const idBySlug = new Map(productRows.results.map((row) => [row.slug, row.id]));

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
    session.id,
  );
  await insertOrder.run();

  const orderRow = await env.DB.prepare('SELECT id FROM orders WHERE order_number = ?')
    .bind(orderNumber)
    .first<{ id: number }>();
  if (!orderRow) {
    return Response.json({ error: 'No se pudo registrar el pedido' }, { status: 500 });
  }

  const itemStatements = quote.lines.map((line) =>
    env.DB.prepare(
      'INSERT INTO order_items (order_id, product_id, name_snapshot, unit_price_cents, qty) VALUES (?, ?, ?, ?, ?)',
    ).bind(orderRow.id, idBySlug.get(line.slug) ?? null, line.name, line.unit_price_cents, line.qty),
  );
  itemStatements.push(
    env.DB.prepare(
      "INSERT INTO order_events (order_id, from_status, to_status, note) VALUES (?, NULL, 'pending', 'Pedido creado, esperando pago')",
    ).bind(orderRow.id),
  );
  await env.DB.batch(itemStatements);

  return Response.json({ url: session.url, order_number: orderNumber });
};
