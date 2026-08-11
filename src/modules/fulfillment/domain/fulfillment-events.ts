import type { FulfillmentAllocation, FulfillmentTracking } from './fulfillment';
import type { EmitEvent, EventEnvelope } from '../../../shared-kernel/events';

export const FULFILLMENT_EVENT_TYPES = [
  'fulfillment.fulfillment_shipped',
  'fulfillment.fulfillment_delivered',
] as const;

export type FulfillmentShippedPayload = Readonly<{
  order_id: number;
  order_number: string;
  tracking: FulfillmentTracking;
  allocations: readonly FulfillmentAllocation[];
  remaining_quantity: number;
}>;

export type FulfillmentDeliveredPayload = Readonly<{
  order_id: number;
  order_number: string;
  fulfillment_id: number;
}>;

export type FulfillmentShippedEvent = EventEnvelope<
  'fulfillment.fulfillment_shipped',
  FulfillmentShippedPayload
>;

export type FulfillmentDeliveredEvent = EventEnvelope<
  'fulfillment.fulfillment_delivered',
  FulfillmentDeliveredPayload
>;

const ADMIN_ACTOR = Object.freeze({
  kind: 'admin' as const,
  id: 'admin-panel',
  label: 'Panel de pedidos',
});

function orderCorrelationId(orderNumber: string): string {
  return `order:${orderNumber}`;
}

export function fulfillmentShippedEvent(
  emit: EmitEvent,
  input: FulfillmentShippedPayload & Readonly<{ idempotencyKey: string }>,
): FulfillmentShippedEvent {
  return emit({
    type: 'fulfillment.fulfillment_shipped',
    version: 1,
    actor: ADMIN_ACTOR,
    entity: { type: 'order', id: String(input.order_id), reference: input.order_number },
    correlation_id: orderCorrelationId(input.order_number),
    causation_id: null,
    idempotency_key: `${input.idempotencyKey}:shipped`,
    payload: {
      order_id: input.order_id,
      order_number: input.order_number,
      tracking: input.tracking,
      allocations: input.allocations,
      remaining_quantity: input.remaining_quantity,
    },
  });
}

export function fulfillmentDeliveredEvent(
  emit: EmitEvent,
  input: FulfillmentDeliveredPayload,
): FulfillmentDeliveredEvent {
  return emit({
    type: 'fulfillment.fulfillment_delivered',
    version: 1,
    actor: ADMIN_ACTOR,
    entity: { type: 'order', id: String(input.order_id), reference: input.order_number },
    correlation_id: orderCorrelationId(input.order_number),
    causation_id: null,
    idempotency_key: `r2:fulfillment:${input.fulfillment_id}:delivered`,
    payload: input,
  });
}

export type FulfillmentDomainEvent = FulfillmentShippedEvent | FulfillmentDeliveredEvent;
