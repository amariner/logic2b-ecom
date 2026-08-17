import { describe, expect, it } from 'vitest';
import {
  applySubscriptionProviderEvent,
  type SubscriptionAggregate,
  type VerifiedSubscriptionProviderEvent,
} from '../src/modules/subscriptions';

const aggregate: SubscriptionAggregate = Object.freeze({
  id: 'subscription-domain-01',
  planId: 'plan-domain-01',
  planVersion: 1,
  variantId: 1,
  providerAdapter: 'simulated-subscriptions',
  providerSubscriptionReference: 'sim_sub_domain',
  providerCustomerReference: 'sim_customer_domain',
  contactEmail: 'domain@example.test',
  quantity: 2,
  status: 'active',
  planSnapshot: {
    schema: 1 as const, plan_id: 'plan-domain-01', plan_version: 1, variant_id: 1,
    amount_cents: 1200, currency: 'EUR', interval_unit: 'month' as const, interval_count: 1,
  },
  currentPeriodStartsAt: '2026-08-01T00:00:00.000Z',
  currentPeriodEndsAt: '2026-09-01T00:00:00.000Z',
  cancelAtPeriodEnd: false,
  failedPaymentCount: 0,
  version: 2,
  cancelledAt: null,
});

function event(type: VerifiedSubscriptionProviderEvent['type']): VerifiedSubscriptionProviderEvent {
  return Object.freeze({
    verified: true,
    adapter: aggregate.providerAdapter,
    eventReference: `evt_${type}`,
    subscriptionReference: aggregate.providerSubscriptionReference,
    customerReference: aggregate.providerCustomerReference,
    type,
    occurredAt: '2026-08-17T12:00:00.000Z',
    planId: aggregate.planId,
    planVersion: aggregate.planVersion,
    periodStartsAt: aggregate.currentPeriodStartsAt,
    periodEndsAt: aggregate.currentPeriodEndsAt,
  });
}

describe('dominio de suscripciones R4.10', () => {
  it('proyecta impago y recuperación sin decidir política de reintentos', () => {
    const failed = applySubscriptionProviderEvent(aggregate, event('payment_failed'));
    expect(failed).toMatchObject({ transition: 'payment_failed', subscription: {
      status: 'past_due', failedPaymentCount: 1, version: 3,
    } });
    const recovered = applySubscriptionProviderEvent(
      failed.subscription,
      { ...event('payment_succeeded'), eventReference: 'evt_recovered' },
    );
    expect(recovered).toMatchObject({ transition: 'payment_succeeded', subscription: {
      status: 'active', failedPaymentCount: 0, version: 4,
    } });
  });

  it('separa pausa, reanudación y cancelación al final del periodo', () => {
    const paused = applySubscriptionProviderEvent(aggregate, event('subscription_paused'));
    expect(paused.subscription.status).toBe('paused');
    const resumed = applySubscriptionProviderEvent(paused.subscription,
      { ...event('subscription_resumed'), eventReference: 'evt_resume' });
    expect(resumed.subscription.status).toBe('active');
    const scheduled = applySubscriptionProviderEvent(resumed.subscription,
      { ...event('cancellation_scheduled'), eventReference: 'evt_schedule' });
    expect(scheduled.subscription).toMatchObject({
      status: 'cancel_at_period_end', cancelAtPeriodEnd: true,
    });
  });

  it('rechaza hechos no verificados, ajenos o transiciones imposibles', () => {
    expect(() => applySubscriptionProviderEvent(aggregate,
      { ...event('payment_failed'), adapter: 'foreign' })).toThrow(/no pertenece/);
    expect(() => applySubscriptionProviderEvent(
      { ...aggregate, status: 'cancelled', cancelledAt: '2026-08-17T00:00:00.000Z' },
      event('subscription_resumed'),
    )).toThrow(/inválida/);
  });
});
