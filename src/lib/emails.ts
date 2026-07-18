/**
 * Emails transaccionales. En demo se escriben en emails_outbox (nunca se envían);
 * en producción el mismo HTML iría a Resend.
 */

import { shopConfig } from '../../shop.config';
import { formatEurCents } from './format';

export type EmailMessage = { to_addr: string; subject: string; body_html: string };

export type OrderEmailData = {
  order_number: string;
  customer_name: string;
  email: string;
  subtotal_cents: number;
  shipping_cents: number;
  total_cents: number;
  items: { name_snapshot: string; unit_price_cents: number; qty: number }[];
};

const wrap = (title: string, inner: string): string => `<!doctype html>
<html lang="es"><body style="font-family:Georgia,serif;color:#292524;max-width:560px;margin:0 auto;padding:24px">
<h1 style="font-size:20px;color:#8a3324">${shopConfig.name}</h1>
<h2 style="font-size:17px">${title}</h2>
${inner}
<p style="margin-top:32px;font-size:13px;color:#78716c">${shopConfig.legalName}<br>${shopConfig.legal.returnsNote}</p>
</body></html>`;

const itemsTable = (data: OrderEmailData): string => `
<table style="width:100%;border-collapse:collapse;font-size:14px">
${data.items
  .map(
    (item) =>
      `<tr><td style="padding:4px 0">${item.name_snapshot} × ${item.qty}</td>` +
      `<td style="text-align:right">${formatEurCents(item.unit_price_cents * item.qty)}</td></tr>`,
  )
  .join('')}
<tr><td style="padding:4px 0;border-top:1px solid #d6d3d1">Envío</td><td style="text-align:right;border-top:1px solid #d6d3d1">${formatEurCents(data.shipping_cents)}</td></tr>
<tr><td style="padding:4px 0;font-weight:bold">Total</td><td style="text-align:right;font-weight:bold">${formatEurCents(data.total_cents)}</td></tr>
</table>`;

export function orderConfirmationEmail(data: OrderEmailData): EmailMessage {
  return {
    to_addr: data.email,
    subject: `Pedido ${data.order_number} confirmado — ${shopConfig.name}`,
    body_html: wrap(
      `¡Gracias por tu pedido, ${data.customer_name}!`,
      `<p style="font-size:14px">Hemos recibido el pago del pedido <strong>${data.order_number}</strong>. Te avisaremos cuando salga de la tienda.</p>${itemsTable(data)}`,
    ),
  };
}

/** Aviso interno al comercio de que ha entrado un pedido pagado (paso 1 de docs/CLIENTE.md). */
export function merchantNewOrderEmail(data: OrderEmailData): EmailMessage {
  return {
    to_addr: shopConfig.email,
    subject: `Nuevo pedido ${data.order_number} (${formatEurCents(data.total_cents)})`,
    body_html: wrap(
      `Nuevo pedido de ${data.customer_name}`,
      `<p style="font-size:14px">Pedido <strong>${data.order_number}</strong> pagado (${data.email}). ` +
        `Dirección y etiqueta de envío en el panel.</p>${itemsTable(data)}`,
    ),
  };
}

export function orderShippedEmail(
  data: OrderEmailData,
  tracking: { carrier: string; number: string },
): EmailMessage {
  return {
    to_addr: data.email,
    subject: `Pedido ${data.order_number} en camino — ${shopConfig.name}`,
    body_html: wrap(
      `Tu pedido está en camino, ${data.customer_name}`,
      `<p style="font-size:14px">El pedido <strong>${data.order_number}</strong> ha salido con <strong>${tracking.carrier}</strong>.<br>` +
        `Número de seguimiento: <strong>${tracking.number}</strong></p>${itemsTable(data)}`,
    ),
  };
}
