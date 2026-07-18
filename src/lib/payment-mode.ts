/**
 * Decide si el pago se procesa contra Stripe real o se simula.
 *
 * Regla: sin `STRIPE_SECRET_KEY` configurada → pago simulado (el pedido se marca
 * pagado al instante en servidor, sin redirección a Stripe). En cuanto se
 * añade la clave real (`wrangler secret put STRIPE_SECRET_KEY`), el checkout
 * pasa a usar Stripe Checkout sin tocar código.
 *
 * Función pura para poder testearla sin runtime de Cloudflare.
 */
export function isSimulatedPayment(env: { STRIPE_SECRET_KEY?: string }): boolean {
  return !env.STRIPE_SECRET_KEY || env.STRIPE_SECRET_KEY.trim() === '';
}
