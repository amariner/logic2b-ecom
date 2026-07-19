import type { APIRoute } from 'astro';
import { z } from 'zod';
import { orderShippedEmail, type OrderEmailData } from '../../../../lib/emails';
import { decideTransition, isOrderStatus } from '../../../../lib/order-transitions';
import { deliverPendingEmails } from '../../../../lib/send-email';

export const prerender = false;

const patchSchema = z.object({
  status: z.enum(['paid', 'shipped', 'delivered', 'cancelled']),
  tracking_carrier: z.string().trim().max(60).optional(),
  tracking_number: z.string().trim().max(80).optional(),
});

type OrderRow = {
  id: number;
  order_number: string;
  email: string;
  customer_name: string;
  status: string;
  subtotal_cents: number;
  shipping_cents: number;
  total_cents: number;
};

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const env = locals.runtime.env;
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: 'id inválido' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  }

  const order = await env.DB.prepare(
    'SELECT id, order_number, email, customer_name, status, subtotal_cents, shipping_cents, total_cents FROM orders WHERE id = ?',
  )
    .bind(id)
    .first<OrderRow>();
  if (!order) return Response.json({ error: 'Pedido no encontrado' }, { status: 404 });
  if (!isOrderStatus(order.status)) {
    return Response.json({ error: `Estado corrupto: ${order.status}` }, { status: 500 });
  }

  const decision = decideTransition(order.status, {
    to: parsed.data.status,
    tracking_carrier: parsed.data.tracking_carrier,
    tracking_number: parsed.data.tracking_number,
  });
  if (!decision.ok) return Response.json({ error: decision.error }, { status: 422 });

  // Guarda de idempotencia (misma clase de bug que applyPaidMutation, ver ROADMAP):
  // el UPDATE va guardado por el estado LEÍDO y en solitario, y solo si de verdad
  // afectó una fila seguimos con el resto. Dos clics casi simultáneos (o un doble
  // envío por conexión lenta) sobre el mismo pedido no deben restockear ni avisar
  // por email dos veces.
  const guardedUpdate =
    parsed.data.status === 'shipped'
      ? env.DB.prepare(
          "UPDATE orders SET status = ?, tracking_carrier = ?, tracking_number = ?, updated_at = datetime('now') WHERE id = ? AND status = ?",
        ).bind(parsed.data.status, parsed.data.tracking_carrier ?? '', parsed.data.tracking_number ?? '', id, order.status)
      : env.DB.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ? AND status = ?").bind(
          parsed.data.status,
          id,
          order.status,
        );
  const updateResult = await guardedUpdate.run();
  if (updateResult.meta.changes === 0) {
    return Response.json(
      { error: 'El pedido cambió de estado mientras se procesaba; recarga la página.' },
      { status: 409 },
    );
  }

  const statements: D1PreparedStatement[] = [
    env.DB.prepare('INSERT INTO order_events (order_id, from_status, to_status, note) VALUES (?, ?, ?, ?)').bind(
      id,
      order.status,
      parsed.data.status,
      decision.note,
    ),
  ];

  // paid → cancelled: el webhook ya decrementó stock al cobrar; al cancelar (p. ej.
  // tras un reembolso en Stripe) hay que devolverlo, o el producto queda agotado
  // para siempre por unidades que nunca llegaron a salir del almacén.
  if (decision.restoreStock) {
    const { results: restockItems } = await env.DB.prepare(
      'SELECT product_id, qty FROM order_items WHERE order_id = ?',
    )
      .bind(id)
      .all<{ product_id: number | null; qty: number }>();
    for (const item of restockItems) {
      if (item.product_id === null) continue;
      statements.push(
        env.DB.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').bind(item.qty, item.product_id),
      );
    }
  }

  if (decision.sendShippedEmail) {
    const items = (
      await env.DB.prepare(
        'SELECT name_snapshot, unit_price_cents, qty FROM order_items WHERE order_id = ?',
      )
        .bind(id)
        .all<OrderEmailData['items'][number]>()
    ).results;
    const email = orderShippedEmail(
      {
        order_number: order.order_number,
        customer_name: order.customer_name,
        email: order.email,
        subtotal_cents: order.subtotal_cents,
        shipping_cents: order.shipping_cents,
        total_cents: order.total_cents,
        items,
      },
      {
        carrier: parsed.data.tracking_carrier ?? '',
        number: parsed.data.tracking_number ?? '',
      },
    );
    statements.push(
      env.DB.prepare('INSERT INTO emails_outbox (to_addr, subject, body_html) VALUES (?, ?, ?)').bind(
        email.to_addr,
        email.subject,
        email.body_html,
      ),
    );
  }

  await env.DB.batch(statements);
  if (decision.sendShippedEmail) {
    // Producción: entrega el email de aviso sin retrasar la respuesta al panel.
    locals.runtime.ctx.waitUntil(deliverPendingEmails(env.DB, env));
  }
  return Response.json({ ok: true, status: parsed.data.status });
};
