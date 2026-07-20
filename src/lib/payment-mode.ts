/**
 * Decide si el pago se procesa contra Stripe real o se simula.
 *
 * Regla: el modo real exige LAS DOS claves (`STRIPE_SECRET_KEY` y
 * `STRIPE_WEBHOOK_SECRET`). Falta cualquiera → pago simulado (el pedido se
 * marca pagado al instante en servidor, sin redirección a Stripe). En cuanto
 * se añaden ambas (`wrangler secret put …`), el checkout pasa a usar Stripe
 * Checkout sin tocar código.
 *
 * Por qué ambas: el webhook (`/api/webhooks/stripe`) necesita
 * `STRIPE_WEBHOOK_SECRET` para verificar la firma y responde 503 sin ella. Si
 * el checkout se activara solo con la secret key, un despliegue a medio
 * configurar cobraría de verdad pero el webhook nunca cumpliría el pedido
 * (quedaría `pending` para siempre, sin stock decrementado ni confirmación).
 * Atar el modo real a ambas claves cierra esa ventana.
 *
 * Función pura para poder testearla sin runtime de Cloudflare.
 */
export function isSimulatedPayment(env: {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
}): boolean {
  const hasSecret = !!env.STRIPE_SECRET_KEY && env.STRIPE_SECRET_KEY.trim() !== '';
  const hasWebhookSecret = !!env.STRIPE_WEBHOOK_SECRET && env.STRIPE_WEBHOOK_SECRET.trim() !== '';
  return !hasSecret || !hasWebhookSecret;
}
