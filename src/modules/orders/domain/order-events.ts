/**
 * Catálogo de eventos de pedido (R1.5). Es el primer productor real del sobre
 * de `shared-kernel`.
 *
 * Lo que hoy escribe una fila en `order_events` pasa a ser un hecho de dominio
 * con sobre. La fila del timeline queda como **proyección** del hecho
 * (`orderTimelineEntry`), no como el hecho en sí: el comportamiento observable
 * —los mismos `from_status`, `to_status` y nota de siempre— no cambia, pero el
 * dominio ya no depende de cómo se guarde ni de a quién avise.
 *
 * El payload NO lleva datos personales (ver `shared-kernel/events.ts`): quien
 * necesite nombre, email o líneas del pedido los pide a `orders`.
 *
 * Extensiones `.ts` explícitas en los imports relativos: este módulo entra en la
 * cadena del seed, que corre con `node seed/generate.ts` (ESM con type-stripping).
 */

import {
  createEventFromIdentity,
  type EmitEvent,
  type EventActor,
  type EventDraft,
  type EventEnvelope,
  type EventIdentity,
} from '../../../shared-kernel/events.ts';
import type { OrderStatus } from '../../../lib/order-transitions.ts';

/** Versión del contrato de payload de todos los eventos de pedido. */
export const ORDER_EVENT_VERSION = 1;

export const ORDER_EVENT_TYPES = [
  'orders.order_placed',
  'orders.order_paid',
  'orders.order_shipped',
  'orders.order_delivered',
  'orders.order_cancelled',
] as const;

export type OrderEventType = (typeof ORDER_EVENT_TYPES)[number];

/** Cómo se confirmó el cobro: pasarela real o el modo simulado sin claves. */
export type OrderPaymentSource = 'stripe' | 'simulated';

/** Por qué se cancela. Decide la nota del timeline y, mañana, la política. */
export type OrderCancellationReason = 'payment_session_expired' | 'admin';

export type OrderTracking = Readonly<{ carrier: string; number: string }>;

type OrderEventSubject = Readonly<{ order_id: number; order_number: string }>;

export type OrderPlacedPayload = OrderEventSubject & Readonly<{ from_status: null; to_status: 'pending' }>;
export type OrderPaidPayload = OrderEventSubject &
  Readonly<{
    from_status: 'pending';
    to_status: 'paid';
    payment_intent: string | null;
    source: OrderPaymentSource;
  }>;
export type OrderShippedPayload = OrderEventSubject &
  Readonly<{ from_status: OrderStatus; to_status: 'shipped'; tracking: OrderTracking }>;
export type OrderDeliveredPayload = OrderEventSubject &
  Readonly<{ from_status: OrderStatus; to_status: 'delivered' }>;
export type OrderCancelledPayload = OrderEventSubject &
  Readonly<{ from_status: OrderStatus; to_status: 'cancelled'; reason: OrderCancellationReason }>;

export type OrderPlacedEvent = EventEnvelope<'orders.order_placed', OrderPlacedPayload>;
export type OrderPaidEvent = EventEnvelope<'orders.order_paid', OrderPaidPayload>;
export type OrderShippedEvent = EventEnvelope<'orders.order_shipped', OrderShippedPayload>;
export type OrderDeliveredEvent = EventEnvelope<'orders.order_delivered', OrderDeliveredPayload>;
export type OrderCancelledEvent = EventEnvelope<'orders.order_cancelled', OrderCancelledPayload>;

export type OrderDomainEvent =
  | OrderPlacedEvent
  | OrderPaidEvent
  | OrderShippedEvent
  | OrderDeliveredEvent
  | OrderCancelledEvent;

/** Origen del hecho. El actor identifica el canal, nunca a la persona. */
export const ORDER_ACTORS = {
  customer: { kind: 'customer', id: 'guest-checkout', label: 'Comprador invitado' },
  stripe: { kind: 'provider', id: 'stripe', label: 'Stripe' },
  simulated: { kind: 'system', id: 'simulated-payment', label: 'Pago simulado' },
  admin: { kind: 'admin', id: 'admin-panel', label: 'Panel de pedidos' },
} as const satisfies Record<string, EventActor>;

/**
 * Un pedido es un flujo: todos sus hechos comparten correlación, así que el
 * timeline, los emails y (desde R1.9) los logs se pueden reconstruir por pedido
 * aunque los provoquen actores distintos con horas de diferencia.
 */
export function orderCorrelationId(orderNumber: string): string {
  return `order:${orderNumber}`;
}

/**
 * La clave de idempotencia es el hecho, no la entrega: dos webhooks del mismo
 * cobro producen la misma clave y un consumidor puede descartar el segundo.
 */
function orderIdempotencyKey(orderNumber: string, type: OrderEventType): string {
  return `${orderCorrelationId(orderNumber)}:${type.slice('orders.'.length)}`;
}

type EmitOptions = Readonly<{ causationId?: string | null }>;

function draftFor<TType extends OrderEventType, TPayload extends OrderEventSubject>(
  type: TType,
  actor: EventActor,
  payload: TPayload,
  options: EmitOptions,
): EventDraft<TType, TPayload> {
  return {
    type,
    version: ORDER_EVENT_VERSION,
    actor,
    entity: { type: 'order', id: String(payload.order_id), reference: payload.order_number },
    idempotency_key: orderIdempotencyKey(payload.order_number, type),
    correlation_id: orderCorrelationId(payload.order_number),
    causation_id: options.causationId ?? null,
    payload,
  };
}

export function orderPlacedEvent(
  emit: EmitEvent,
  subject: OrderEventSubject,
  options: EmitOptions = {},
): OrderPlacedEvent {
  const payload: OrderPlacedPayload = { ...subject, from_status: null, to_status: 'pending' };
  return emit(draftFor('orders.order_placed', ORDER_ACTORS.customer, payload, options));
}

/** Completa el alta con la identidad reservada antes de que D1 asigne `order_id`. */
export function orderPlacedEventFromIdentity(
  identity: EventIdentity,
  subject: OrderEventSubject,
): OrderPlacedEvent {
  const payload: OrderPlacedPayload = { ...subject, from_status: null, to_status: 'pending' };
  return createEventFromIdentity(identity, draftFor('orders.order_placed', ORDER_ACTORS.customer, payload, {}));
}

export function orderPaidEvent(
  emit: EmitEvent,
  input: OrderEventSubject & Readonly<{ payment_intent: string | null; source: OrderPaymentSource }>,
  options: EmitOptions = {},
): OrderPaidEvent {
  const payload: OrderPaidPayload = {
    order_id: input.order_id,
    order_number: input.order_number,
    from_status: 'pending',
    to_status: 'paid',
    payment_intent: input.payment_intent,
    source: input.source,
  };
  const actor = input.source === 'stripe' ? ORDER_ACTORS.stripe : ORDER_ACTORS.simulated;
  return emit(draftFor('orders.order_paid', actor, payload, options));
}

export function orderShippedEvent(
  emit: EmitEvent,
  input: OrderEventSubject & Readonly<{ from_status: OrderStatus; tracking: OrderTracking }>,
  options: EmitOptions = {},
): OrderShippedEvent {
  const payload: OrderShippedPayload = {
    order_id: input.order_id,
    order_number: input.order_number,
    from_status: input.from_status,
    to_status: 'shipped',
    tracking: input.tracking,
  };
  return emit(draftFor('orders.order_shipped', ORDER_ACTORS.admin, payload, options));
}

export function orderDeliveredEvent(
  emit: EmitEvent,
  input: OrderEventSubject & Readonly<{ from_status: OrderStatus }>,
  options: EmitOptions = {},
): OrderDeliveredEvent {
  const payload: OrderDeliveredPayload = {
    order_id: input.order_id,
    order_number: input.order_number,
    from_status: input.from_status,
    to_status: 'delivered',
  };
  return emit(draftFor('orders.order_delivered', ORDER_ACTORS.admin, payload, options));
}

export function orderCancelledEvent(
  emit: EmitEvent,
  input: OrderEventSubject & Readonly<{ from_status: OrderStatus; reason: OrderCancellationReason }>,
  options: EmitOptions = {},
): OrderCancelledEvent {
  const payload: OrderCancelledPayload = {
    order_id: input.order_id,
    order_number: input.order_number,
    from_status: input.from_status,
    to_status: 'cancelled',
    reason: input.reason,
  };
  const actor = input.reason === 'payment_session_expired' ? ORDER_ACTORS.stripe : ORDER_ACTORS.admin;
  return emit(draftFor('orders.order_cancelled', actor, payload, options));
}

/** Entrada del timeline tal y como la guarda `order_events` desde la Fase 3. */
export type OrderTimelineEntry = Readonly<{
  from_status: string | null;
  to_status: string;
  note: string;
}>;

/**
 * Hecho mínimo del que se deriva la nota. Existe aparte del sobre porque el
 * seed de la demo fabrica timelines sin pasar por el motor y debe redactar
 * exactamente las mismas notas.
 */
export type OrderTimelineFact =
  | Readonly<{ to_status: 'pending' }>
  | Readonly<{ to_status: 'paid'; source: OrderPaymentSource }>
  | Readonly<{ to_status: 'shipped'; tracking: OrderTracking | null }>
  | Readonly<{ to_status: 'delivered' }>
  | Readonly<{ to_status: 'cancelled'; reason: OrderCancellationReason }>;

/** Única redacción de las notas del timeline en todo el proyecto. */
export function orderTimelineNote(fact: OrderTimelineFact): string {
  switch (fact.to_status) {
    case 'pending':
      return 'Pedido creado, esperando pago';
    case 'paid':
      return fact.source === 'stripe' ? 'Pago confirmado por Stripe' : 'Pago confirmado (simulado)';
    case 'shipped':
      return fact.tracking ? `Enviado con ${fact.tracking.carrier} (${fact.tracking.number})` : 'Enviado';
    case 'delivered':
      return 'Marcado como entregado';
    case 'cancelled':
      return fact.reason === 'payment_session_expired' ? 'Sesión de pago caducada' : 'Cancelado desde el panel';
  }
}

function timelineFactOf(event: OrderDomainEvent): OrderTimelineFact {
  switch (event.type) {
    case 'orders.order_placed':
      return { to_status: 'pending' };
    case 'orders.order_paid':
      return { to_status: 'paid', source: event.payload.source };
    case 'orders.order_shipped':
      return { to_status: 'shipped', tracking: event.payload.tracking };
    case 'orders.order_delivered':
      return { to_status: 'delivered' };
    case 'orders.order_cancelled':
      return { to_status: 'cancelled', reason: event.payload.reason };
  }
}

/** Proyecta el hecho a la fila de `order_events`. Es presentación del hecho, no el hecho. */
export function orderTimelineEntry(event: OrderDomainEvent): OrderTimelineEntry {
  return Object.freeze({
    from_status: event.payload.from_status,
    to_status: event.payload.to_status,
    note: orderTimelineNote(timelineFactOf(event)),
  });
}
