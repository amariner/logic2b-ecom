/**
 * Casos de uso de escritura de pedido, compuestos (R1.5).
 *
 * Aquí se junta lo que los módulos no pueden juntar por sí solos: `orders`
 * decide y emite el hecho y la unidad de trabajo confirma mutación + sobre +
 * entregas en una sola batch. El dispatcher resuelve después los consumidores;
 * el pedido no sabe que existen los emails.
 *
 * Lo que NO cambia respecto de la Fase 3 es la garantía: solo quien gana la
 * carrera aplica efectos. Ahora la guardia es la inserción condicionada del
 * evento dentro del lote, no un UPDATE previo y separado.
 *
 * R1.7 usa el evento como guardia transaccional: se inserta condicionado al
 * estado esperado, y cada efecto posterior exige ese `event_id`. Una carrera
 * perdedora inserta cero filas y, dentro de la misma batch, aplica cero efectos.
 */

import type { OrderStatus, PanelTransition } from '../lib/order-transitions';
import {
  buildPaidMutation,
  createOrderWriter,
  orderCancelledEvent,
  orderDeliveredEvent,
  orderPlacedEventFromIdentity,
  orderShippedEvent,
  orderTimelineEntry,
  type NewOrderInput,
  type NewOrderLine,
  type OrderDomainEvent,
  type OrderForPayment,
  type OrderForTransition,
  type OrderPaymentSource,
  type OrderPlacedEvent,
} from '../modules/orders';
import { createD1EventOutboxWriter } from '../platform/events';
import type { EmitEvent, ReserveEventIdentity } from '../shared-kernel/events';
import { emitPlatformEvent, reservePlatformEventIdentity } from './event-context';
import { runtimePlatform } from './runtime-platform';

export type ConfirmPaymentInput = Readonly<{
  /** Referencia del pedido: la sesión de la pasarela o el id ya conocido. */
  lookup: { by: 'session'; stripeSessionId: string } | { by: 'id'; orderId: number };
  paymentIntent: string | null;
  source: OrderPaymentSource;
  causationId?: string | null;
}>;

export type PanelTransitionInput = Readonly<{
  order: OrderForTransition;
  from: OrderStatus;
  transition: PanelTransition;
}>;

export type PanelTransitionOutcome = Readonly<{
  outcome: 'applied' | 'conflict';
  /** Mensajes encolados por los consumidores; 0 = no hay nada que entregar. */
  queuedMessages: number;
}>;

function consumersFor(eventType: string): readonly string[] {
  return runtimePlatform.modules
    .filter((module) => module.descriptor.subscriptions.includes(eventType))
    .map((module) => module.descriptor.id);
}

export function createOrderOperations(
  db: D1Database,
  emit: EmitEvent = emitPlatformEvent,
  reserveIdentity: ReserveEventIdentity = reservePlatformEventIdentity,
) {
  const orders = createOrderWriter(db);
  const outbox = createD1EventOutboxWriter(db);

  return {
    /** Alta del pedido en `pending` con su primer hecho: nace el flujo. */
    async placeOrder(
      order: NewOrderInput,
      lines: readonly NewOrderLine[],
    ): Promise<{ orderId: number; event: OrderPlacedEvent } | null> {
      const identity = reserveIdentity();
      const timeline = { from_status: null, to_status: 'pending', note: 'Pedido creado, esperando pago' } as const;
      const consumerIds = consumersFor('orders.order_placed');
      const results = await orders.commitResults([
        orders.insertPendingOrderStatement(order),
        outbox.placedEventStatement(identity, order.order_number),
        ...outbox.deliveryStatements(identity.event_id, identity.occurred_at, consumerIds),
        ...orders.lineStatementsForOrderNumber(order.order_number, lines),
        orders.timelineStatementForOrderNumber(order.order_number, timeline),
      ]);
      const orderId = results[0]?.meta.last_row_id;
      if (!orderId || results[0]?.meta.changes !== 1 || results[1]?.meta.changes !== 1) return null;
      const event = orderPlacedEventFromIdentity(identity, { order_id: orderId, order_number: order.order_number });
      return { orderId, event };
    },

    /**
     * Confirma el cobro. Devuelve true solo si ESTA llamada ganó la carrera —
     * es lo que decide si hay algo que entregar.
     */
    async confirmPayment(input: ConfirmPaymentInput): Promise<boolean> {
      const order: OrderForPayment | null =
        input.lookup.by === 'session'
          ? await orders.findOrderForPaymentBySession(input.lookup.stripeSessionId)
          : await orders.findOrderForPaymentById(input.lookup.orderId);
      const items = order ? await orders.items(order.id) : [];

      const mutation = buildPaidMutation(order, items, input.paymentIntent, {
        emit,
        source: input.source,
        causationId: input.causationId ?? null,
      });
      if (order === null || mutation === null) return false;
      const consumerIds = consumersFor(mutation.event.type);
      const results = await orders.commitResults([
        outbox.guardedEventStatement(mutation.event, { orderId: mutation.orderId, expectedStatus: 'pending' }),
        ...outbox.deliveryStatements(mutation.event.event_id, mutation.event.occurred_at, consumerIds),
        orders.guardedPaidStatement(mutation.orderId, mutation.paymentIntent, mutation.event.event_id),
        ...orders.guardedStockDecrementStatements(mutation.stockDecrements, mutation.event.event_id),
        orders.guardedTimelineStatement(mutation.orderId, orderTimelineEntry(mutation.event), mutation.event.event_id),
      ]);
      return results[0]?.meta.changes === 1;
    },

    /** Caducidad de la sesión de pago: cancela sin tocar stock (nunca se descontó). */
    async expirePayment(input: Readonly<{ stripeSessionId: string; causationId?: string | null }>): Promise<boolean> {
      const order = await orders.findOrderForPaymentBySession(input.stripeSessionId);
      if (order === null || order.status !== 'pending') return false;
      const event = orderCancelledEvent(
        emit,
        {
          order_id: order.id,
          order_number: order.order_number,
          from_status: 'pending',
          reason: 'payment_session_expired',
        },
        { causationId: input.causationId ?? null },
      );
      const consumerIds = consumersFor(event.type);
      const results = await orders.commitResults([
        outbox.guardedEventStatement(event, { orderId: order.id, expectedStatus: 'pending' }),
        ...outbox.deliveryStatements(event.event_id, event.occurred_at, consumerIds),
        orders.guardedExpiredStatement(order.id, event.event_id),
        orders.guardedTimelineStatement(order.id, orderTimelineEntry(event), event.event_id),
      ]);
      return results[0]?.meta.changes === 1;
    },

    /** Transición hecha a mano desde el panel. */
    async applyPanelTransition(input: PanelTransitionInput): Promise<PanelTransitionOutcome> {
      const items = await orders.items(input.order.id);
      const event = panelTransitionEvent(emit, input);
      const consumerIds = consumersFor(event.type);
      const results = await orders.commitResults([
        outbox.guardedEventStatement(event, { orderId: input.order.id, expectedStatus: input.from }),
        ...outbox.deliveryStatements(event.event_id, event.occurred_at, consumerIds),
        orders.guardedTransitionStatement({
          orderId: input.order.id,
          from: input.from,
          to: input.transition.to,
          tracking: input.transition.tracking,
          eventId: event.event_id,
        }),
        orders.guardedTimelineStatement(input.order.id, orderTimelineEntry(event), event.event_id),
        ...(input.transition.restoreStock ? orders.guardedStockRestoreStatements(items, event.event_id) : []),
      ]);
      if (results[0]?.meta.changes !== 1) return { outcome: 'conflict', queuedMessages: 0 };
      return { outcome: 'applied', queuedMessages: consumerIds.length };
    },

    findOrderForTransition: orders.findOrderForTransition,
  };
}

function panelTransitionEvent(emit: EmitEvent, input: PanelTransitionInput): OrderDomainEvent {
  const subject = {
    order_id: input.order.id,
    order_number: input.order.order_number,
    from_status: input.from,
  };
  switch (input.transition.to) {
    case 'shipped':
      return orderShippedEvent(emit, { ...subject, tracking: input.transition.tracking });
    case 'delivered':
      return orderDeliveredEvent(emit, subject);
    case 'cancelled':
      return orderCancelledEvent(emit, { ...subject, reason: 'admin' });
  }
}

export type OrderOperations = ReturnType<typeof createOrderOperations>;
