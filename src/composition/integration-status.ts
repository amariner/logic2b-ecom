import {
  resolveIntegrationStatuses,
  type IntegrationOperationEvidence,
  type IntegrationStatuses,
} from '../integrations';
import type { ResolvedCapabilityManifest } from '../platform/configuration';

export type IntegrationEnvironment = Readonly<{
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  RESEND_API_KEY?: string;
}>;

function hasSecret(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Único corte que ve valores secretos: los reduce inmediatamente a presencia.
 * El registro y sus snapshots solo aceptan booleanos y nunca pueden serializar
 * una credencial por accidente.
 */
export function integrationSecretPresence(env: IntegrationEnvironment) {
  return Object.freeze({
    stripeApiCredential: hasSecret(env.STRIPE_SECRET_KEY),
    stripeWebhookCredential: hasSecret(env.STRIPE_WEBHOOK_SECRET),
    resendApiCredential: hasSecret(env.RESEND_API_KEY),
  });
}

export function inspectIntegrations(
  manifest: ResolvedCapabilityManifest,
  env: IntegrationEnvironment,
  operations: Readonly<Partial<Record<'stripe-checkout' | 'resend-email' | 'logistics-csv', IntegrationOperationEvidence>>> = {},
): IntegrationStatuses {
  return resolveIntegrationStatuses(manifest, {
    secrets: integrationSecretPresence(env),
    operations,
  });
}
