import type { ConfirmedPreliminaryOrderPayment } from '../../orders';
import type {
  HostedPaymentLinkAdapter,
  HostedPaymentLinkPlan,
  HostedPaymentLinkSession,
  VerifiedHostedPaymentEvent,
} from '../application/hosted-payment-link-adapter';

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export interface SimulatedHostedPaymentAdapter extends HostedPaymentLinkAdapter {
  confirmInternally(input: Readonly<{
    plan: HostedPaymentLinkPlan;
    session: HostedPaymentLinkSession;
    occurredAt: string;
  }>): Promise<VerifiedHostedPaymentEvent>;
}

/** Adaptador de test sin red, credenciales, dinero ni webhook público. */
export function createSimulatedHostedPaymentAdapter(): SimulatedHostedPaymentAdapter {
  const id = 'simulated-hosted-payment';
  return Object.freeze({
    id,
    async createSession(plan: HostedPaymentLinkPlan): Promise<HostedPaymentLinkSession> {
      if (plan.providerAdapter !== id) throw new RangeError('El plan pertenece a otro adaptador.');
      const token = await sha256(`${plan.idempotencyKey}:${plan.preliminaryOrderVersion}`);
      return Object.freeze({
        providerAdapter: id,
        providerReference: `sim_link_${token.slice(0, 32)}`,
        url: `https://payments.example.test/session/${token.slice(0, 40)}`,
        expiresAt: plan.expiresAt,
      });
    },
    async verifyEvent(): Promise<VerifiedHostedPaymentEvent> {
      throw new RangeError('El adaptador simulado no acepta webhooks públicos.');
    },
    async confirmInternally({ plan, session, occurredAt }: Readonly<{
      plan: HostedPaymentLinkPlan;
      session: HostedPaymentLinkSession;
      occurredAt: string;
    }>): Promise<VerifiedHostedPaymentEvent> {
      if (plan.providerAdapter !== id || session.providerAdapter !== id) {
        throw new RangeError('La sesión pertenece a otro adaptador.');
      }
      if (session.expiresAt !== plan.expiresAt || Date.parse(occurredAt) >= Date.parse(plan.expiresAt)) {
        throw new RangeError('La sesión alojada ha caducado o no coincide con el plan.');
      }
      const eventHash = await sha256(`${session.providerReference}:${occurredAt}`);
      const payment: ConfirmedPreliminaryOrderPayment = Object.freeze({
        confirmed: true,
        stage: plan.stage,
        amountCents: plan.amountCents,
        currency: plan.currency,
        paidAt: occurredAt,
        expectedVersion: plan.preliminaryOrderVersion,
      });
      return Object.freeze({
        verified: true,
        providerAdapter: id,
        providerEventReference: `sim_event_${eventHash.slice(0, 32)}`,
        providerPaymentReference: `sim_payment_${eventHash.slice(0, 32)}`,
        idempotencyKey: `${plan.idempotencyKey}:payment`,
        payment,
      });
    },
  });
}
