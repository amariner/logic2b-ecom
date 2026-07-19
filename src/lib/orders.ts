/** Utilidades de pedidos: numeración y aplicación de la transición de pago en D1. */

import { shopConfig } from '../../shop.config';
import type { PaidMutation } from './payment-transition';

/** Número de pedido legible: {prefijo}-AAMMDD-XXXX (XXXX aleatorio sin ambiguos). */
export function generateOrderNumber(now: Date = new Date()): string {
  const yy = String(now.getUTCFullYear()).slice(2);
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const suffix = [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('');
  return `${shopConfig.orderNumberPrefix}-${yy}${mm}${dd}-${suffix}`;
}

/**
 * Token de sesión de pago simulado (sin claves de Stripe): `/demo/gracias` busca
 * el pedido por este valor y expone nombre/email/total sin autenticar, igual que
 * haría con un `session_id` real de Stripe (que trae ~120 bits de entropía propia).
 * El nº de pedido legible NO sirve como token: su sufijo de 4 caracteres
 * (~20 bits, y la fecha va en claro) es enumerable en un día de peticiones.
 */
export function generateSimulatedSessionToken(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('');
}

/**
 * Aplica la transición a 'paid'. El UPDATE guardado (`WHERE status = 'pending'`)
 * se ejecuta primero y en solitario para que su recuento de filas afectadas sea
 * la fuente de verdad de la idempotencia: si dos llamadas concurrentes (reintento
 * de Stripe entregado dos veces, o webhook + pago simulado solapados) construyen
 * la misma mutación a partir de un pedido leído como 'pending', solo una de ellas
 * gana la carrera aquí — la otra ve `changes === 0` y no decrementa stock ni
 * encola emails por segunda vez. El resto de mutaciones sí van en una sola batch.
 */
export async function applyPaidMutation(db: D1Database, mutation: PaidMutation): Promise<boolean> {
  const orderUpdate = await db
    .prepare(
      "UPDATE orders SET status = 'paid', stripe_payment_intent = ?, updated_at = datetime('now') WHERE id = ? AND status = 'pending'",
    )
    .bind(mutation.paymentIntent, mutation.orderId)
    .run();
  if (orderUpdate.meta.changes === 0) return false;

  const statements: D1PreparedStatement[] = [
    ...mutation.stockDecrements.map((dec) =>
      db.prepare('UPDATE products SET stock = MAX(stock - ?, 0) WHERE id = ?').bind(dec.qty, dec.product_id),
    ),
    db
      .prepare('INSERT INTO order_events (order_id, from_status, to_status, note) VALUES (?, ?, ?, ?)')
      .bind(mutation.orderId, mutation.event.from_status, mutation.event.to_status, mutation.event.note),
    ...mutation.emails.map((email) =>
      db
        .prepare('INSERT INTO emails_outbox (to_addr, subject, body_html) VALUES (?, ?, ?)')
        .bind(email.to_addr, email.subject, email.body_html),
    ),
  ];
  await db.batch(statements);
  return true;
}

/**
 * Aplica la transición a 'cancelled' por caducidad de la sesión de pago.
 * Mismo patrón que applyPaidMutation: el UPDATE guardado va primero y en
 * solitario, y solo si gana la carrera (changes === 1) se inserta el evento
 * — evita un evento duplicado si el mismo `checkout.session.expired` llega
 * dos veces solapado.
 */
export async function applyExpiredMutation(db: D1Database, orderId: number): Promise<boolean> {
  const orderUpdate = await db
    .prepare("UPDATE orders SET status = 'cancelled', updated_at = datetime('now') WHERE id = ? AND status = 'pending'")
    .bind(orderId)
    .run();
  if (orderUpdate.meta.changes === 0) return false;

  await db
    .prepare(
      "INSERT INTO order_events (order_id, from_status, to_status, note) VALUES (?, 'pending', 'cancelled', 'Sesión de pago caducada')",
    )
    .bind(orderId)
    .run();
  return true;
}
