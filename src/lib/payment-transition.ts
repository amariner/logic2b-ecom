/**
 * Lógica PURA de la transición de pago (webhook). Sin I/O: decide qué mutar.
 * La capa D1 (webhook endpoint) aplica el resultado en una sola batch.
 */

import {
  merchantNewOrderEmail,
  orderConfirmationEmail,
  type EmailMessage,
  type OrderEmailData,
} from './emails';

export type OrderForPayment = {
  id: number;
  order_number: string;
  status: string;
  email: string;
  customer_name: string;
  subtotal_cents: number;
  shipping_cents: number;
  total_cents: number;
};

export type OrderItemForPayment = {
  product_id: number;
  name_snapshot: string;
  unit_price_cents: number;
  qty: number;
};

export type PaidMutation = {
  orderId: number;
  paymentIntent: string | null;
  /** decremento por producto; la SQL aplica MAX(stock - qty, 0) */
  stockDecrements: { product_id: number; qty: number }[];
  event: { from_status: string; to_status: 'paid'; note: string };
  /** [0] confirmación al comprador, [1] aviso al comercio */
  emails: EmailMessage[];
};

/**
 * Devuelve la mutación a aplicar, o null si no hay nada que hacer.
 * Idempotencia (CLAUDE.md §7.3): pedido inexistente o ya procesado → null
 * (el webhook responde 200 igualmente; Stripe reintenta si no).
 */
export function buildPaidMutation(
  order: OrderForPayment | null,
  items: OrderItemForPayment[],
  paymentIntent: string | null,
  note = 'Pago confirmado por Stripe',
): PaidMutation | null {
  if (order === null) return null;
  if (order.status !== 'pending') return null;

  const emailData: OrderEmailData = {
    order_number: order.order_number,
    customer_name: order.customer_name,
    email: order.email,
    subtotal_cents: order.subtotal_cents,
    shipping_cents: order.shipping_cents,
    total_cents: order.total_cents,
    items,
  };

  return {
    orderId: order.id,
    paymentIntent,
    stockDecrements: items.map((item) => ({ product_id: item.product_id, qty: item.qty })),
    event: { from_status: 'pending', to_status: 'paid', note },
    emails: [orderConfirmationEmail(emailData), merchantNewOrderEmail(emailData)],
  };
}

/** Stock resultante tras un decremento: nunca negativo. */
export function stockAfterDecrement(currentStock: number, qty: number): number {
  return Math.max(currentStock - qty, 0);
}
