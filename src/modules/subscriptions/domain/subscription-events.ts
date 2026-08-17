import type { EmitEvent, EventEnvelope } from '../../../shared-kernel/events';
import type {
  SubscriptionAggregate,
  SubscriptionTransition,
  VerifiedSubscriptionProviderEvent,
} from './subscription';

export const SUBSCRIPTION_EVENT_TYPES = [
  'subscriptions.subscription_created',
  'subscriptions.subscription_activated',
  'subscriptions.payment_succeeded',
  'subscriptions.payment_failed',
  'subscriptions.subscription_paused',
  'subscriptions.subscription_resumed',
  'subscriptions.plan_changed',
  'subscriptions.cancellation_scheduled',
  'subscriptions.subscription_cancelled',
] as const;

export type SubscriptionDomainEventType = (typeof SUBSCRIPTION_EVENT_TYPES)[number];
export type SubscriptionEventPayload = Readonly<{
  subscription_id: string;
  plan_id: string;
  status: SubscriptionAggregate['status'];
  version: number;
  failed_payment_count: number;
}>;

const TYPE_BY_TRANSITION: Readonly<Record<SubscriptionTransition['transition'], SubscriptionDomainEventType>> = {
  activated: 'subscriptions.subscription_activated',
  payment_succeeded: 'subscriptions.payment_succeeded',
  payment_failed: 'subscriptions.payment_failed',
  paused: 'subscriptions.subscription_paused',
  resumed: 'subscriptions.subscription_resumed',
  plan_changed: 'subscriptions.plan_changed',
  cancellation_scheduled: 'subscriptions.cancellation_scheduled',
  cancelled: 'subscriptions.subscription_cancelled',
};

export function subscriptionDomainEvent(
  emit: EmitEvent,
  subscription: SubscriptionAggregate,
  providerEvent: VerifiedSubscriptionProviderEvent,
  transition?: SubscriptionTransition['transition'],
): EventEnvelope<SubscriptionDomainEventType, SubscriptionEventPayload> {
  const type = transition === undefined
    ? 'subscriptions.subscription_created'
    : TYPE_BY_TRANSITION[transition];
  return emit({
    type,
    version: 1,
    actor: { kind: 'provider', id: providerEvent.adapter, label: 'Adaptador de suscripciones' },
    entity: { type: 'subscription', id: subscription.id },
    correlation_id: `subscription:${subscription.id}`,
    causation_id: providerEvent.eventReference,
    idempotency_key: `subscription-provider:${providerEvent.adapter}:${providerEvent.eventReference}`,
    payload: {
      subscription_id: subscription.id,
      plan_id: subscription.planId,
      status: subscription.status,
      version: subscription.version,
      failed_payment_count: subscription.failedPaymentCount,
    },
  });
}

