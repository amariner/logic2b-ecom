import type {
  SubscriptionProviderAdapter,
  SubscriptionProviderCommand,
} from '../application/provider-adapter';
import type {
  SubscriptionProviderEventType,
  VerifiedSubscriptionProviderEvent,
} from '../domain/subscription';

function safeReference(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
}

function event(
  type: SubscriptionProviderEventType,
  command: SubscriptionProviderCommand,
  suffix: string,
  overrides: Partial<VerifiedSubscriptionProviderEvent> = {},
): VerifiedSubscriptionProviderEvent {
  return Object.freeze({
    verified: true,
    adapter: 'simulated-subscriptions',
    eventReference: `sim_evt_${safeReference(command.idempotencyKey)}_${suffix}`,
    subscriptionReference: command.subscriptionReference,
    customerReference: command.customerReference,
    type,
    occurredAt: new Date().toISOString(),
    planId: command.planId,
    planVersion: command.planVersion,
    periodStartsAt: command.periodStartsAt,
    periodEndsAt: command.periodEndsAt,
    ...overrides,
  });
}

/** Adaptador local determinista: no usa red, credenciales ni dinero real. */
export function createSimulatedSubscriptionAdapter(): SubscriptionProviderAdapter & Readonly<{
  payment(input: SubscriptionProviderCommand & Readonly<{
    outcome: 'succeeded' | 'failed';
    cycleReference: string;
    amountCents: number;
    currency: string;
    attemptCount: number;
    failureCode?: string;
  }>): Promise<VerifiedSubscriptionProviderEvent>;
}> {
  return Object.freeze({
    id: 'simulated-subscriptions',
    async create(input: Readonly<{
      planId: string; planVersion: number; contactEmail: string;
      quantity: number; idempotencyKey: string;
    }>) {
      const key = safeReference(input.idempotencyKey);
      return Object.freeze({
        verified: true,
        adapter: 'simulated-subscriptions',
        eventReference: `sim_evt_${key}_created`,
        subscriptionReference: `sim_sub_${key}`,
        customerReference: `sim_customer_${key}`,
        type: 'subscription_created',
        occurredAt: new Date().toISOString(),
        planId: input.planId,
        planVersion: input.planVersion,
        periodStartsAt: null,
        periodEndsAt: null,
      });
    },
    async activate(input: SubscriptionProviderCommand) {
      return event('subscription_activated', input, 'activate');
    },
    async pause(input: SubscriptionProviderCommand) {
      return event('subscription_paused', input, 'pause');
    },
    async resume(input: SubscriptionProviderCommand) {
      return event('subscription_resumed', input, 'resume');
    },
    async changePlan(input: SubscriptionProviderCommand & Readonly<{
      nextPlanId: string; nextPlanVersion: number;
    }>) {
      return event('plan_changed', input, 'change_plan', {
        planId: input.nextPlanId,
        planVersion: input.nextPlanVersion,
      });
    },
    async cancel(input: SubscriptionProviderCommand & Readonly<{ atPeriodEnd: boolean }>) {
      return input.atPeriodEnd
        ? event('cancellation_scheduled', input, 'cancel_scheduled')
        : event('subscription_cancelled', input, 'cancel_now');
    },
    async payment(input: SubscriptionProviderCommand & Readonly<{
      outcome: 'succeeded' | 'failed'; cycleReference: string; amountCents: number;
      currency: string; attemptCount: number; failureCode?: string;
    }>) {
      const failed = input.outcome === 'failed';
      return event(failed ? 'payment_failed' : 'payment_succeeded', input,
        failed ? 'payment_failed' : 'payment_succeeded', {
          cycle: {
            reference: input.cycleReference,
            amountCents: input.amountCents,
            currency: input.currency,
            attemptCount: input.attemptCount,
            failureCode: failed ? (input.failureCode ?? 'payment_failed') : null,
          },
        });
    },
    async createPortalSession(input: Readonly<{
      subscriptionReference: string; customerReference: string; returnUrl: string;
    }>) {
      const token = safeReference(`${input.customerReference}_${input.subscriptionReference}`);
      return Object.freeze({
        url: `https://subscriptions.invalid/portal/${token}`,
        expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      });
    },
    async verifyWebhook() {
      throw new RangeError('El adaptador simulado no acepta webhooks públicos.');
    },
  });
}
