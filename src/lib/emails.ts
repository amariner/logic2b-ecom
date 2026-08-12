/**
 * Emails transaccionales. En demo se escriben en emails_outbox (nunca se envían);
 * en producción el mismo HTML iría a Resend.
 */

// Extensiones .ts explícitas: estos módulos entran en la cadena del seed, que
// corre con `node seed/generate.ts` (ESM con type-stripping), y ahí los imports
// relativos exigen extensión. Es el mismo patrón que ya usa seed/*.
import { shopConfig } from '../../shop.config.ts';
import { escapeHtml, formatCurrencyCents } from './format.ts';

export type EmailMessage = { to_addr: string; subject: string; body_html: string };

export type OrderEmailData = {
  order_number: string;
  customer_name: string;
  email: string;
  subtotal_cents: number;
  shipping_cents: number;
  total_cents: number;
  items: { order_item_id?: number; name_snapshot: string; unit_price_cents: number; qty: number }[];
};

export type PartialRefundEmailData = Readonly<{
  total_cents: number;
  shipping_cents: number;
  items: readonly Readonly<{ name_snapshot: string; qty: number }>[];
}>;

const formatShopCents = (cents: number): string =>
  formatCurrencyCents(cents, shopConfig.currency);

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
      `<tr><td style="padding:4px 0">${escapeHtml(item.name_snapshot)} × ${item.qty}</td>` +
      `<td style="text-align:right">${formatShopCents(item.unit_price_cents * item.qty)}</td></tr>`,
  )
  .join('')}
<tr><td style="padding:4px 0;border-top:1px solid #d6d3d1">Envío</td><td style="text-align:right;border-top:1px solid #d6d3d1">${formatShopCents(data.shipping_cents)}</td></tr>
<tr><td style="padding:4px 0;font-weight:bold">Total</td><td style="text-align:right;font-weight:bold">${formatShopCents(data.total_cents)}</td></tr>
</table>`;

// Todo dato que pueda venir de un formulario (nombre del cliente, email, tracking
// tecleado por el comercio) se escapa antes de entrar en el HTML del email: estos
// mensajes salen tal cual a bandejas reales (Resend) o se muestran en el panel demo.

export function orderConfirmationEmail(data: OrderEmailData): EmailMessage {
  const orderNumber = escapeHtml(data.order_number);
  return {
    to_addr: data.email,
    subject: `Pedido ${data.order_number} confirmado — ${shopConfig.name}`,
    body_html: wrap(
      `¡Gracias por tu pedido, ${escapeHtml(data.customer_name)}!`,
      `<p style="font-size:14px">Hemos recibido el pago del pedido <strong>${orderNumber}</strong>. Te avisaremos cuando salga de la tienda.</p>${itemsTable(data)}`,
    ),
  };
}

/** Aviso interno al comercio de que ha entrado un pedido pagado (paso 1 de docs/CLIENTE.md). */
export function merchantNewOrderEmail(data: OrderEmailData): EmailMessage {
  const orderNumber = escapeHtml(data.order_number);
  return {
    to_addr: shopConfig.email,
    subject: `Nuevo pedido ${data.order_number} (${formatShopCents(data.total_cents)})`,
    body_html: wrap(
      `Nuevo pedido de ${escapeHtml(data.customer_name)}`,
      `<p style="font-size:14px">Pedido <strong>${orderNumber}</strong> pagado (${escapeHtml(data.email)}). ` +
        `Dirección y etiqueta de envío en el panel.</p>${itemsTable(data)}`,
    ),
  };
}

export function orderShippedEmail(
  data: OrderEmailData,
  tracking: { carrier: string; number: string },
): EmailMessage {
  const orderNumber = escapeHtml(data.order_number);
  return {
    to_addr: data.email,
    subject: `Pedido ${data.order_number} en camino — ${shopConfig.name}`,
    body_html: wrap(
      `Tu pedido está en camino, ${escapeHtml(data.customer_name)}`,
      `<p style="font-size:14px">El pedido <strong>${orderNumber}</strong> ha salido con <strong>${escapeHtml(tracking.carrier)}</strong>.<br>` +
        `Número de seguimiento: <strong>${escapeHtml(tracking.number)}</strong></p>${itemsTable(data)}`,
    ),
  };
}

export function fulfillmentShippedEmail(
  data: OrderEmailData,
  tracking: { carrier: string; number: string },
  shippedItems: readonly { name_snapshot: string; qty: number }[],
  remainingQuantity: number,
): EmailMessage {
  const orderNumber = escapeHtml(data.order_number);
  const lines = shippedItems.map((item) =>
    `<li>${escapeHtml(item.name_snapshot)} × ${item.qty}</li>`
  ).join('');
  const pendingLabel = remainingQuantity === 1 ? 'Queda 1 unidad pendiente' : `Quedan ${remainingQuantity} unidades pendientes`;
  const progress = remainingQuantity > 0
    ? `<p style="font-size:14px">${pendingLabel}. Te enviaremos el seguimiento de cada salida.</p>`
    : '<p style="font-size:14px">Con este envío salen todas las unidades pendientes.</p>';
  return {
    to_addr: data.email,
    subject: `Envío del pedido ${data.order_number} en camino — ${shopConfig.name}`,
    body_html: wrap(
      `Parte de tu pedido está en camino, ${escapeHtml(data.customer_name)}`,
      `<p style="font-size:14px">El envío del pedido <strong>${orderNumber}</strong> ha salido con ` +
        `<strong>${escapeHtml(tracking.carrier)}</strong>.<br>Número de seguimiento: ` +
        `<strong>${escapeHtml(tracking.number)}</strong></p>` +
        `<p style="font-size:14px"><strong>Incluye:</strong></p><ul style="font-size:14px">${lines}</ul>${progress}`,
    ),
  };
}

export function orderRefundedEmail(data: OrderEmailData): EmailMessage {
  const orderNumber = escapeHtml(data.order_number);
  return {
    to_addr: data.email,
    subject: `Reembolso del pedido ${data.order_number} confirmado — ${shopConfig.name}`,
    body_html: wrap(
      `Tu reembolso está confirmado, ${escapeHtml(data.customer_name)}`,
      `<p style="font-size:14px">Hemos reembolsado el importe completo del pedido <strong>${orderNumber}</strong>. ` +
        `El abono puede tardar varios días en aparecer, según tu banco.</p>${itemsTable(data)}`,
    ),
  };
}

export function orderPartiallyRefundedEmail(
  data: OrderEmailData,
  refund: PartialRefundEmailData,
): EmailMessage {
  const orderNumber = escapeHtml(data.order_number);
  const lines = refund.items.map((item) =>
    `<li>${escapeHtml(item.name_snapshot)} × ${item.qty}</li>`
  ).join('');
  const shipping = refund.shipping_cents > 0
    ? `<p style="font-size:14px">El abono incluye ${formatShopCents(refund.shipping_cents)} de envío.</p>`
    : '<p style="font-size:14px">Este abono no incluye los gastos de envío.</p>';
  return {
    to_addr: data.email,
    subject: `Reembolso parcial del pedido ${data.order_number} — ${shopConfig.name}`,
    body_html: wrap(
      `Tu reembolso parcial está confirmado, ${escapeHtml(data.customer_name)}`,
      `<p style="font-size:14px">Hemos confirmado un abono de <strong>${formatShopCents(refund.total_cents)}</strong> ` +
        `para el pedido <strong>${orderNumber}</strong>.</p>` +
        `<p style="font-size:14px"><strong>Unidades canceladas:</strong></p>` +
        `<ul style="font-size:14px">${lines}</ul>${shipping}` +
        '<p style="font-size:14px">El abono puede tardar varios días en aparecer, según tu banco.</p>',
    ),
  };
}
