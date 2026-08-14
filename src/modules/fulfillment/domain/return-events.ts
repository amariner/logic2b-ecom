import type { EmitEvent, EventEnvelope } from '../../../shared-kernel/events';
import type { ReturnResolution } from './return-request';

export const RETURN_EVENT_TYPES = ['fulfillment.return_resolved'] as const;

export type ReturnResolvedPayload = Readonly<{
  return_id: string;
  return_number: string;
  order_id: number;
  order_number: string;
  resolution: ReturnResolution;
  refund_id: number | null;
  refunded_cents: number;
  restocked_quantity: number;
  exchange_quantity: number;
}>;

export type ReturnResolvedEvent = EventEnvelope<
  'fulfillment.return_resolved',
  ReturnResolvedPayload
>;

export function returnResolvedEvent(
  emit: EmitEvent,
  input: ReturnResolvedPayload & Readonly<{ idempotencyKey: string; causationId?: string | null }>,
): ReturnResolvedEvent {
  return emit({
    type: 'fulfillment.return_resolved',
    version: 1,
    actor: { kind: 'admin', id: 'admin-panel', label: 'Panel de administración' },
    entity: { type: 'return_request', id: input.return_id, reference: input.return_number },
    correlation_id: `order:${input.order_number}`,
    causation_id: input.causationId ?? null,
    idempotency_key: `${input.idempotencyKey}:resolved`,
    payload: {
      return_id: input.return_id,
      return_number: input.return_number,
      order_id: input.order_id,
      order_number: input.order_number,
      resolution: input.resolution,
      refund_id: input.refund_id,
      refunded_cents: input.refunded_cents,
      restocked_quantity: input.restocked_quantity,
      exchange_quantity: input.exchange_quantity,
    },
  });
}
