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
  fulfillmentShippedEmail,
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
  'fulfillment.fulfillment_shipped',
] as const;

function trackingOf(payload: unknown): { carrier: string; number: string } | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const tracking = (payload as { tracking?: unknown }).tracking;
  if (typeof tracking !== 'object' || tracking === null) return null;
  const { carrier, number } = tracking as { carrier?: unknown; number?: unknown };
  if (typeof carrier !== 'string' || typeof number !== 'string') return null;
  return { carrier, number };
}

function partialShipmentOf(payload: unknown): Readonly<{
  allocations: readonly Readonly<{ order_item_id: number; quantity: number }>[];
  remainingQuantity: number;
}> | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const raw = payload as { allocations?: unknown; remaining_quantity?: unknown };
  if (!Array.isArray(raw.allocations) || !Number.isSafeInteger(raw.remaining_quantity) ||
      Number(raw.remaining_quantity) < 0) return null;
  const allocations: Array<{ order_item_id: number; quantity: number }> = [];
  for (const item of raw.allocations) {
    if (typeof item !== 'object' || item === null) return null;
    const allocation = item as { order_item_id?: unknown; quantity?: unknown };
    if (!Number.isSafeInteger(allocation.order_item_id) || Number(allocation.order_item_id) < 1 ||
        !Number.isSafeInteger(allocation.quantity) || Number(allocation.quantity) < 1) return null;
    allocations.push({
      order_item_id: Number(allocation.order_item_id),
      quantity: Number(allocation.quantity),
    });
  }
  return allocations.length > 0
    ? Object.freeze({ allocations, remainingQuantity: Number(raw.remaining_quantity) })
    : null;
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
    case 'fulfillment.fulfillment_shipped': {
      const tracking = trackingOf(event.payload);
      const shipment = partialShipmentOf(event.payload);
      if (!tracking || !shipment) return Object.freeze([]);
      const itemsById = new Map(order.items
        .filter((item) => item.order_item_id !== undefined)
        .map((item) => [item.order_item_id!, item] as const));
      const shippedItems = shipment.allocations.map((allocation) => {
        const item = itemsById.get(allocation.order_item_id);
        return item ? { name_snapshot: item.name_snapshot, qty: allocation.quantity } : null;
      });
      if (shippedItems.some((item) => item === null)) return Object.freeze([]);
      return Object.freeze([fulfillmentShippedEmail(
        order,
        tracking,
        shippedItems as readonly { name_snapshot: string; qty: number }[],
        shipment.remainingQuantity,
      )]);
    }
    default:
      return Object.freeze([]);
  }
}
