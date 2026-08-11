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
import { createD1AuditLogWriter, type AuditEventProjection } from '../platform/operations';
import {
  createD1InventoryLedger,
  createD1InventoryReservations,
  type InventoryActorKind,
  type InventoryMovementReason,
  type InventoryStockChange,
} from '../modules/inventory';
import {
  createD1PaymentLedger,
  type PaymentProvider,
} from '../modules/payments';
import { createAuditDiff } from '../shared-kernel/audit';
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
  options: Readonly<{
    reservationsEnabled?: boolean;
    reservationTtlSeconds?: number;
    reservationExpiresAt?: string;
  }> = {},
) {
  const orders = createOrderWriter(db);
  const outbox = createD1EventOutboxWriter(db);
  const audit = createD1AuditLogWriter(db);
  const inventory = createD1InventoryLedger(db);
  const reservations = createD1InventoryReservations(db);
  const payments = createD1PaymentLedger(db);
  const reservationsEnabled = options.reservationsEnabled ??
    runtimePlatform.hasCapabilityFlag('INV-004', 'sideEffects');

  async function inventoryStatements(
    event: OrderDomainEvent,
    rawChanges: readonly Readonly<{
      product_id: number;
      variant_id: number;
      is_default: boolean;
      qty: number;
    }>[],
    reason: InventoryMovementReason,
    direction: -1 | 1,
  ): Promise<readonly D1PreparedStatement[]> {
    const byVariant = new Map<number, InventoryStockChange>();
    for (const item of rawChanges) {
      const current = byVariant.get(item.variant_id);
      if (current && (current.product_id !== item.product_id || current.is_default !== Boolean(item.is_default))) {
        throw new Error(`Variante ${item.variant_id}: líneas de inventario incompatibles.`);
      }
      byVariant.set(item.variant_id, {
        variant_id: item.variant_id,
        product_id: item.product_id,
        is_default: Boolean(item.is_default),
        delta: (current?.delta ?? 0) + direction * item.qty,
      });
    }
    const changes = [...byVariant.values()];
    const balances = await inventory.balances(changes.map((change) => change.variant_id));
    return changes.flatMap((change) => {
      const balance = balances.get(change.variant_id);
      if (!balance) throw new Error(`Balance de inventario ausente para variante ${change.variant_id}.`);
      return inventory.movementStatements(balance, change, {
        delta: change.delta,
        reason,
        actor_kind: event.actor.kind as InventoryActorKind,
        actor_id: event.actor.id,
        reference_type: 'order',
        reference_id: String(event.payload.order_id),
        idempotency_key: `${event.idempotency_key}:variant:${change.variant_id}`,
        correlation_id: event.correlation_id,
      }, event.occurred_at, { kind: 'event', id: event.event_id });
    });
  }

  return {
    /** Alta del pedido en `pending` con su primer hecho: nace el flujo. */
    async placeOrder(
      order: NewOrderInput,
      lines: readonly NewOrderLine[],
      paymentProvider: Exclude<PaymentProvider, 'legacy'>,
    ): Promise<{ orderId: number; event: OrderPlacedEvent } | null> {
      const identity = reserveIdentity();
      const timeline = { from_status: null, to_status: 'pending', note: 'Pedido creado, esperando pago' } as const;
      const consumerIds = consumersFor('orders.order_placed');
      const reservationStatements = reservationsEnabled
        ? await reservations.createForOrderStatements(
            order.order_number,
            lines,
            identity.occurred_at,
            { kind: 'event', id: identity.event_id },
            {
              ...(options.reservationTtlSeconds === undefined
                ? {}
                : { ttlSeconds: options.reservationTtlSeconds }),
              ...(options.reservationExpiresAt === undefined
                ? {}
                : { expiresAt: options.reservationExpiresAt }),
            },
          )
        : [];
      const results = await orders.commitResults([
        orders.insertPendingOrderStatement(order),
        outbox.placedEventStatement(identity, order.order_number),
        audit.eventStatement(identity.event_id, placedAuditProjection()),
        payments.pendingForOrderStatement(order.order_number, {
          provider: paymentProvider,
          provider_reference: order.stripe_session_id,
          currency: order.currency,
          occurred_at: identity.occurred_at,
        }, { eventId: identity.event_id }),
        ...outbox.deliveryStatements(identity.event_id, identity.occurred_at, consumerIds),
        ...orders.lineStatementsForOrderNumber(order.order_number, lines),
        ...reservationStatements,
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
      if (mutation.paymentIntent === null || mutation.paymentIntent.trim().length === 0) {
        throw new Error('La captura pagada no incluye una referencia del proveedor.');
      }
      const payment = await payments.findByOrderId(order.id);
      if (payment === null) throw new Error(`Pedido ${order.id}: intención de pago ausente.`);
      const consumerIds = consumersFor(mutation.event.type);
      const reservation = reservationsEnabled
        ? await reservations.findForOrder(order.order_number)
        : null;
      if (reservation && reservation.status !== 'active') return false;
      const stockStatements = reservation
        ? reservations.transitionStatements(
            reservation,
            'consumed',
            mutation.event.occurred_at,
            `${mutation.event.idempotency_key}:reservation`,
          )
        : await inventoryStatements(
            mutation.event,
            mutation.stockDecrements,
            'sale',
            -1,
          );
      const results = await orders.commitResults([
        outbox.guardedEventStatement(mutation.event, { orderId: mutation.orderId, expectedStatus: 'pending' }),
        audit.eventStatement(mutation.event.event_id, orderAuditProjection(mutation.event)),
        ...outbox.deliveryStatements(mutation.event.event_id, mutation.event.occurred_at, consumerIds),
        ...payments.captureStatements(payment, {
          provider: input.source,
          provider_reference: mutation.paymentIntent,
          amount_cents: order.total_cents,
          currency: order.currency,
          idempotency_key: `${mutation.event.idempotency_key}:capture`,
          occurred_at: mutation.event.occurred_at,
        }, { eventId: mutation.event.event_id }),
        orders.guardedPaidStatement(mutation.orderId, mutation.paymentIntent, mutation.event.event_id),
        ...stockStatements,
        orders.guardedTimelineStatement(mutation.orderId, orderTimelineEntry(mutation.event), mutation.event.event_id),
      ]);
      return results[0]?.meta.changes === 1;
    },

    /** Caducidad de la sesión de pago: cancela sin tocar stock (nunca se descontó). */
    async expirePayment(input: Readonly<{ stripeSessionId: string; causationId?: string | null }>): Promise<boolean> {
      const order = await orders.findOrderForPaymentBySession(input.stripeSessionId);
      if (order === null || order.status !== 'pending') return false;
      const payment = await payments.findByOrderId(order.id);
      if (payment === null) throw new Error(`Pedido ${order.id}: intención de pago ausente.`);
      if (payment.status !== 'pending') return false;
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
      const reservation = reservationsEnabled
        ? await reservations.findForOrder(order.order_number)
        : null;
      const reservationStatements = reservation?.status === 'active'
        ? reservations.transitionStatements(
            reservation,
            event.occurred_at >= reservation.expires_at ? 'expired' : 'released',
            event.occurred_at,
            `${event.idempotency_key}:reservation`,
          )
        : [];
      const results = await orders.commitResults([
        outbox.guardedEventStatement(event, { orderId: order.id, expectedStatus: 'pending' }),
        audit.eventStatement(event.event_id, orderAuditProjection(event)),
        ...outbox.deliveryStatements(event.event_id, event.occurred_at, consumerIds),
        payments.cancelPendingStatement(payment, event.occurred_at, { eventId: event.event_id }),
        orders.guardedExpiredStatement(order.id, event.event_id),
        ...reservationStatements,
        orders.guardedTimelineStatement(order.id, orderTimelineEntry(event), event.event_id),
      ]);
      return results[0]?.meta.changes === 1;
    },

    /** Transición hecha a mano desde el panel. */
    async applyPanelTransition(input: PanelTransitionInput): Promise<PanelTransitionOutcome> {
      const items = await orders.items(input.order.id);
      const event = panelTransitionEvent(emit, input);
      const consumerIds = consumersFor(event.type);
      const stockStatements = input.transition.restoreStock
        ? await inventoryStatements(event, items, 'cancellation_restock', 1)
        : [];
      const reservation = reservationsEnabled && input.transition.to === 'cancelled'
        ? await reservations.findForOrder(input.order.order_number)
        : null;
      const reservationStatements = reservation?.status === 'active'
        ? reservations.transitionStatements(
            reservation,
            'released',
            event.occurred_at,
            `${event.idempotency_key}:reservation`,
          )
        : [];
      const paymentStatements = input.transition.to === 'cancelled'
        ? await paymentCancellationStatements(input.order.id, input.from, event.event_id, event.occurred_at)
        : [];
      const results = await orders.commitResults([
        outbox.guardedEventStatement(event, {
          orderId: input.order.id,
          expectedStatus: input.from,
          requireNoActiveRefund: true,
        }),
        audit.eventStatement(event.event_id, orderAuditProjection(event)),
        ...outbox.deliveryStatements(event.event_id, event.occurred_at, consumerIds),
        orders.guardedTransitionStatement({
          orderId: input.order.id,
          from: input.from,
          to: input.transition.to,
          tracking: input.transition.tracking,
          eventId: event.event_id,
          requireNoActiveRefund: true,
        }),
        orders.guardedTimelineStatement(input.order.id, orderTimelineEntry(event), event.event_id),
        ...paymentStatements,
        ...reservationStatements,
        ...stockStatements,
      ]);
      if (results[0]?.meta.changes !== 1) return { outcome: 'conflict', queuedMessages: 0 };
      return { outcome: 'applied', queuedMessages: consumerIds.length };
    },

    findOrderForTransition: orders.findOrderForTransition,
  };

  async function paymentCancellationStatements(
    orderId: number,
    from: OrderStatus,
    eventId: string,
    occurredAt: string,
  ): Promise<readonly D1PreparedStatement[]> {
    const payment = await payments.findByOrderId(orderId);
    if (payment === null) throw new Error(`Pedido ${orderId}: intención de pago ausente.`);
    if (from === 'pending') {
      if (payment.status !== 'pending') throw new Error(`Pedido ${orderId}: estado financiero incoherente.`);
      return [payments.cancelPendingStatement(payment, occurredAt, { eventId })];
    }
    if (from === 'paid') {
      if (payment.status !== 'captured') throw new Error(`Pedido ${orderId}: captura financiera ausente.`);
      return [payments.requireReviewStatement(payment, occurredAt, { eventId })];
    }
    return [];
  }
}

function placedAuditProjection(): AuditEventProjection {
  return {
    action: 'orders.created',
    diff: createAuditDiff({ status: null }, { status: 'pending' }, ['status']),
  };
}

function orderAuditProjection(event: OrderDomainEvent): AuditEventProjection {
  const status = createAuditDiff(
    { status: event.payload.from_status },
    { status: event.payload.to_status },
    ['status'],
  );
  switch (event.type) {
    case 'orders.order_placed':
      return placedAuditProjection();
    case 'orders.order_paid':
      return {
        action: 'payments.confirmed',
        diff: createAuditDiff(
          { status: event.payload.from_status, payment_intent: null, payment_source: null },
          {
            status: event.payload.to_status,
            payment_intent: event.payload.payment_intent,
            payment_source: event.payload.source,
          },
          ['status', 'payment_intent', 'payment_source'],
        ),
      };
    case 'orders.order_shipped':
      return {
        action: 'orders.shipped',
        diff: createAuditDiff(
          { status: event.payload.from_status, tracking_carrier: null, tracking_number: null },
          {
            status: event.payload.to_status,
            tracking_carrier: event.payload.tracking.carrier,
            tracking_number: event.payload.tracking.number,
          },
          ['status', 'tracking_carrier', 'tracking_number'],
        ),
      };
    case 'orders.order_delivered':
      return { action: 'orders.delivered', diff: status };
    case 'orders.order_cancelled':
      return {
        action: event.payload.reason === 'payment_session_expired' ? 'payments.expired' : 'orders.cancelled',
        diff: createAuditDiff(
          { status: event.payload.from_status, cancellation_reason: null },
          { status: event.payload.to_status, cancellation_reason: event.payload.reason },
          ['status', 'cancellation_reason'],
        ),
      };
    case 'orders.order_refunded':
      return {
        action: 'payments.refunded',
        diff: createAuditDiff(
          { status: event.payload.from_status, refunded_cents: 0 },
          { status: event.payload.to_status, refunded_cents: event.payload.total_cents },
          ['status', 'refunded_cents'],
        ),
      };
  }
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
