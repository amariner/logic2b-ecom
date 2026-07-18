/** Utilidades de pedidos: numeración y aplicación de la transición de pago en D1. */

import type { PaidMutation } from './payment-transition';

/** Número de pedido legible: BM-AAMMDD-XXXX (XXXX aleatorio sin ambiguos). */
export function generateOrderNumber(now: Date = new Date()): string {
  const yy = String(now.getUTCFullYear()).slice(2);
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const suffix = [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('');
  return `BM-${yy}${mm}${dd}-${suffix}`;
}

/** Aplica la transición a 'paid' en una sola batch (atómica en D1). */
export async function applyPaidMutation(db: D1Database, mutation: PaidMutation): Promise<void> {
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        "UPDATE orders SET status = 'paid', stripe_payment_intent = ?, updated_at = datetime('now') WHERE id = ? AND status = 'pending'",
      )
      .bind(mutation.paymentIntent, mutation.orderId),
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
}
