import type { VerifiedSubscriptionProviderEvent } from '../domain/subscription';

export type SubscriptionProviderCommand = Readonly<{
  subscriptionReference: string;
  customerReference: string;
  planId: string;
  planVersion: number;
  idempotencyKey: string;
  periodStartsAt: string | null;
  periodEndsAt: string | null;
}>;

export interface SubscriptionProviderAdapter {
  readonly id: string;
  create(input: Readonly<{
    planId: string;
    planVersion: number;
    contactEmail: string;
    quantity: number;
    idempotencyKey: string;
  }>): Promise<VerifiedSubscriptionProviderEvent>;
  activate(input: SubscriptionProviderCommand): Promise<VerifiedSubscriptionProviderEvent>;
  pause(input: SubscriptionProviderCommand): Promise<VerifiedSubscriptionProviderEvent>;
  resume(input: SubscriptionProviderCommand): Promise<VerifiedSubscriptionProviderEvent>;
  changePlan(input: SubscriptionProviderCommand & Readonly<{
    nextPlanId: string;
    nextPlanVersion: number;
  }>): Promise<VerifiedSubscriptionProviderEvent>;
  cancel(input: SubscriptionProviderCommand & Readonly<{
    atPeriodEnd: boolean;
  }>): Promise<VerifiedSubscriptionProviderEvent>;
  createPortalSession(input: Readonly<{
    subscriptionReference: string;
    customerReference: string;
    returnUrl: string;
  }>): Promise<Readonly<{ url: string; expiresAt: string }>>;
  /** Un adaptador real debe autenticar firma y cuerpo antes de devolver este tipo. */
  verifyWebhook(input: Readonly<{
    rawBody: Uint8Array;
    signature: string;
  }>): Promise<VerifiedSubscriptionProviderEvent>;
}

export type SubscriptionProviderAdapterResolver = (
  id: string,
) => SubscriptionProviderAdapter | null;

