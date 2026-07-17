/**
 * Cliente Stripe para Cloudflare Workers.
 * Gotchas cubiertos (CLAUDE.md §7.1): fetch HTTP client y Web Crypto para
 * verificar firmas — el método síncrono de Node falla en el edge.
 */

import Stripe from 'stripe';

export function stripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    httpClient: Stripe.createFetchHttpClient(),
  });
}

const cryptoProvider = Stripe.createSubtleCryptoProvider();

/** Verifica la firma del webhook con Web Crypto. Lanza si no es válida. */
export async function verifyWebhookEvent(
  stripe: Stripe,
  payload: string,
  signature: string,
  webhookSecret: string,
): Promise<Stripe.Event> {
  return await stripe.webhooks.constructEventAsync(payload, signature, webhookSecret, undefined, cryptoProvider);
}
