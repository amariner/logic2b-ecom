/**
 * Consumidor de eventos de pedido (R1.5).
 *
 * Es el módulo de notificaciones —no el de pedidos— quien decide qué se avisa y
 * a quién. Depende del **sobre genérico**, nunca del módulo que lo emite: aquí
 * no se importa nada de `orders`, solo se reconocen tipos de evento por su
 * nombre y se lee el payload de forma defensiva. Ese es el precio de admisión
 * para que mañana un consumidor nuevo (SMS, ERP) se enchufe sin tocar el pedido.
 *
 * Los datos del pedido llegan aparte porque el sobre no transporta PII.
 */

import type { EventEnvelope } from '../../../shared-kernel/events';
import {
  merchantNewOrderEmail,
  orderConfirmationEmail,
  orderRefundedEmail,
  orderShippedEmail,
  type EmailMessage,
  type OrderEmailData,
} from '../../../lib/emails';

/** Hechos a los que este consumidor está suscrito. El registro de módulos lo declara. */
export const SUBSCRIBED_ORDER_EVENTS = [
  'orders.order_paid',
  'orders.order_shipped',
  'orders.order_refunded',
] as const;

function trackingOf(payload: unknown): { carrier: string; number: string } | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const tracking = (payload as { tracking?: unknown }).tracking;
  if (typeof tracking !== 'object' || tracking === null) return null;
  const { carrier, number } = tracking as { carrier?: unknown; number?: unknown };
  if (typeof carrier !== 'string' || typeof number !== 'string') return null;
  return { carrier, number };
}

/**
 * Mensajes que provoca un hecho de pedido. Un tipo no suscrito devuelve lista
 * vacía: el consumidor ignora en silencio lo que no le toca.
 */
export function orderNotificationsFor(event: EventEnvelope, order: OrderEmailData): readonly EmailMessage[] {
  switch (event.type) {
    case 'orders.order_paid':
      return Object.freeze([orderConfirmationEmail(order), merchantNewOrderEmail(order)]);
    case 'orders.order_shipped': {
      const tracking = trackingOf(event.payload);
      return tracking ? Object.freeze([orderShippedEmail(order, tracking)]) : Object.freeze([]);
    }
    case 'orders.order_refunded':
      return Object.freeze([orderRefundedEmail(order)]);
    default:
      return Object.freeze([]);
  }
}
