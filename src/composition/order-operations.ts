/**
 * Casos de uso de escritura de pedido, compuestos (R1.5).
 *
 * Aquí se junta lo que los módulos no pueden juntar por sí solos: `orders`
 * decide y emite el hecho, `notifications` se suscribe a ese hecho y produce los
 * mensajes, y la unidad de trabajo escribe ambos efectos en una sola batch. Es
 * el único punto que conoce a los dos módulos a la vez — el pedido sigue sin
 * saber que existen los emails.
 *
 * Lo que NO cambia respecto de la Fase 3: el UPDATE guardado va primero y en
 * solitario, y solo quien gana esa carrera aplica efectos. Dos entregas del
 * mismo webhook, o dos clics del panel, siguen produciendo un único cobro, un
 * único evento y un único aviso.
 *
 * Cuando exista el outbox transaccional (R1.6/R1.7), la entrega dejará de ser
 * una lista de sentencias compuesta aquí y pasará a ser un despachador; el
 * contrato del sobre ya está preparado para eso.
 */

import type { OrderStatus, PanelTransition } from '../lib/order-transitions';
import {
  createOutboxWriter,
  orderNotificationsFor,
  type EmailMessage,
  type OrderEmailData,
} from '../modules/notifications';
import {
  buildPaidMutation,
  createOrderWriter,
  orderCancelledEvent,
  orderDeliveredEvent,
  orderPlacedEvent,
  orderShippedEvent,
  orderTimelineEntry,
  type NewOrderInput,
  type NewOrderLine,
  type OrderDomainEvent,
  type OrderForPayment,
  type OrderForTransition,
  type OrderItemForPayment,
  type OrderPaymentSource,
  type OrderPlacedEvent,
} from '../modules/orders';
import type { EmitEvent } from '../shared-kernel/events';
import { emitPlatformEvent } from './event-context';

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

function emailDataFor(
  order: Readonly<{
    order_number: string;
    customer_name: string;
    email: string;
    subtotal_cents: number;
    shipping_cents: number;
    total_cents: number;
  }>,
  items: readonly OrderItemForPayment[],
): OrderEmailData {
  return {
    order_number: order.order_number,
    customer_name: order.customer_name,
    email: order.email,
    subtotal_cents: order.subtotal_cents,
    shipping_cents: order.shipping_cents,
    total_cents: order.total_cents,
    items: items.map((item) => ({
      name_snapshot: item.name_snapshot,
      unit_price_cents: item.unit_price_cents,
      qty: item.qty,
    })),
  };
}

export function createOrderOperations(db: D1Database, emit: EmitEvent = emitPlatformEvent) {
  const orders = createOrderWriter(db);
  const outbox = createOutboxWriter(db);

  /** Suscripción única del bloque: los consumidores registrados de un hecho. */
  const messagesFor = (event: OrderDomainEvent, order: OrderEmailData): readonly EmailMessage[] =>
    orderNotificationsFor(event, order);

  return {
    /** Alta del pedido en `pending` con su primer hecho: nace el flujo. */
    async placeOrder(
      order: NewOrderInput,
      lines: readonly NewOrderLine[],
    ): Promise<{ orderId: number; event: OrderPlacedEvent } | null> {
      const orderId = await orders.insertPendingOrder(order);
      if (orderId === null) return null;

      const event = orderPlacedEvent(emit, { order_id: orderId, order_number: order.order_number });
      await orders.commit([
        ...orders.lineStatements(orderId, lines),
        orders.timelineStatement(orderId, orderTimelineEntry(event)),
      ]);
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
      if (!(await orders.claimPaid(mutation.orderId, mutation.paymentIntent))) return false;

      const messages = messagesFor(mutation.event, emailDataFor(order, items));
      await orders.commit([
        ...orders.stockDecrementStatements(mutation.stockDecrements),
        orders.timelineStatement(mutation.orderId, orderTimelineEntry(mutation.event)),
        ...outbox.statementsFor(messages),
      ]);
      return true;
    },

    /** Caducidad de la sesión de pago: cancela sin tocar stock (nunca se descontó). */
    async expirePayment(input: Readonly<{ stripeSessionId: string; causationId?: string | null }>): Promise<boolean> {
      const order = await orders.findOrderForPaymentBySession(input.stripeSessionId);
      if (order === null || order.status !== 'pending') return false;
      if (!(await orders.claimExpired(order.id))) return false;

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
      await orders.commit([orders.timelineStatement(order.id, orderTimelineEntry(event))]);
      return true;
    },

    /** Transición hecha a mano desde el panel. */
    async applyPanelTransition(input: PanelTransitionInput): Promise<PanelTransitionOutcome> {
      const won = await orders.claimTransition({
        orderId: input.order.id,
        from: input.from,
        to: input.transition.to,
        tracking: input.transition.tracking,
      });
      if (!won) return { outcome: 'conflict', queuedMessages: 0 };

      const items = await orders.items(input.order.id);
      const event = panelTransitionEvent(emit, input);
      const messages = messagesFor(event, emailDataFor(input.order, items));
      await orders.commit([
        orders.timelineStatement(input.order.id, orderTimelineEntry(event)),
        ...(input.transition.restoreStock ? orders.stockRestoreStatements(items) : []),
        ...outbox.statementsFor(messages),
      ]);
      return { outcome: 'applied', queuedMessages: messages.length };
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
