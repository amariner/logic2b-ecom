export const SUBSCRIPTION_STATUSES = [
  'pending', 'active', 'paused', 'past_due', 'cancel_at_period_end', 'cancelled',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const SUBSCRIPTION_PROVIDER_EVENT_TYPES = [
  'subscription_created', 'subscription_activated', 'payment_succeeded',
  'payment_failed', 'subscription_paused', 'subscription_resumed', 'plan_changed',
  'cancellation_scheduled', 'subscription_cancelled',
] as const;
export type SubscriptionProviderEventType = (typeof SUBSCRIPTION_PROVIDER_EVENT_TYPES)[number];

export type SubscriptionPlanSnapshot = Readonly<{
  schema: 1;
  plan_id: string;
  plan_version: number;
  variant_id: number;
  amount_cents: number;
  currency: string;
  interval_unit: 'day' | 'week' | 'month' | 'year';
  interval_count: number;
}>;

export type SubscriptionAggregate = Readonly<{
  id: string;
  planId: string;
  planVersion: number;
  variantId: number;
  providerAdapter: string;
  providerSubscriptionReference: string;
  providerCustomerReference: string;
  contactEmail: string;
  quantity: number;
  status: SubscriptionStatus;
  planSnapshot: SubscriptionPlanSnapshot;
  currentPeriodStartsAt: string | null;
  currentPeriodEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  failedPaymentCount: number;
  version: number;
  cancelledAt: string | null;
}>;

export type VerifiedSubscriptionProviderEvent = Readonly<{
  verified: true;
  adapter: string;
  eventReference: string;
  subscriptionReference: string;
  customerReference: string;
  type: SubscriptionProviderEventType;
  occurredAt: string;
  planId: string;
  planVersion: number;
  periodStartsAt: string | null;
  periodEndsAt: string | null;
  cycle?: Readonly<{
    reference: string;
    amountCents: number;
    currency: string;
    attemptCount: number;
    failureCode: string | null;
  }>;
}>;

export type SubscriptionTransition = Readonly<{
  transition: 'activated' | 'payment_succeeded' | 'payment_failed' | 'paused' | 'resumed' |
    'plan_changed' | 'cancellation_scheduled' | 'cancelled';
  subscription: SubscriptionAggregate;
}>;

function next(
  current: SubscriptionAggregate,
  event: VerifiedSubscriptionProviderEvent,
  status: SubscriptionStatus,
  overrides: Partial<SubscriptionAggregate> = {},
): SubscriptionAggregate {
  return Object.freeze({
    ...current,
    status,
    currentPeriodStartsAt: event.periodStartsAt ?? current.currentPeriodStartsAt,
    currentPeriodEndsAt: event.periodEndsAt ?? current.currentPeriodEndsAt,
    version: current.version + 1,
    ...overrides,
  });
}

/** Proyección pura de hechos ya autenticados por el adaptador. */
export function applySubscriptionProviderEvent(
  current: SubscriptionAggregate,
  event: VerifiedSubscriptionProviderEvent,
): SubscriptionTransition {
  if (!event.verified || event.adapter !== current.providerAdapter ||
      event.subscriptionReference !== current.providerSubscriptionReference) {
    throw new RangeError('El hecho no pertenece a esta suscripción o no está verificado.');
  }
  switch (event.type) {
    case 'subscription_created':
      throw new RangeError('El alta no puede reproyectarse sobre una suscripción existente.');
    case 'subscription_activated':
      if (current.status !== 'pending' && current.status !== 'past_due') break;
      return { transition: 'activated', subscription: next(current, event, 'active', {
        cancelAtPeriodEnd: false,
      }) };
    case 'payment_succeeded':
      if (current.status !== 'active' && current.status !== 'past_due') break;
      return { transition: 'payment_succeeded', subscription: next(current, event, 'active', {
        failedPaymentCount: 0,
      }) };
    case 'payment_failed':
      if (current.status !== 'active' && current.status !== 'past_due') break;
      return { transition: 'payment_failed', subscription: next(current, event, 'past_due', {
        failedPaymentCount: current.failedPaymentCount + 1,
      }) };
    case 'subscription_paused':
      if (current.status !== 'active' && current.status !== 'past_due') break;
      return { transition: 'paused', subscription: next(current, event, 'paused') };
    case 'subscription_resumed':
      if (current.status !== 'paused') break;
      return { transition: 'resumed', subscription: next(current, event, 'active') };
    case 'plan_changed':
      if (!['active', 'paused', 'past_due'].includes(current.status)) break;
      return { transition: 'plan_changed', subscription: next(current, event, current.status, {
        planId: event.planId,
        planVersion: event.planVersion,
      }) };
    case 'cancellation_scheduled':
      if (!['active', 'paused', 'past_due'].includes(current.status)) break;
      return { transition: 'cancellation_scheduled', subscription: next(
        current, event, 'cancel_at_period_end', { cancelAtPeriodEnd: true },
      ) };
    case 'subscription_cancelled':
      if (current.status === 'cancelled') break;
      return { transition: 'cancelled', subscription: next(current, event, 'cancelled', {
        cancelAtPeriodEnd: false,
        cancelledAt: event.occurredAt,
      }) };
  }
  throw new RangeError(`Transición ${event.type} inválida desde ${current.status}.`);
}
