/**
 * Consulta de la página de gracias — compartida entre la tienda genérica y las
 * tiendas del escaparate (9B.4). Expone SOLO lo que la confirmación necesita.
 */

export type ThanksOrderRow = {
  order_number: string;
  customer_name: string;
  email: string;
  status: string;
  total_cents: number;
};

export async function getOrderBySessionId(
  db: D1Database,
  sessionId: string | null,
): Promise<ThanksOrderRow | null> {
  if (!sessionId) return null;
  return await db
    .prepare(
      'SELECT order_number, customer_name, email, status, total_cents FROM orders WHERE stripe_session_id = ?',
    )
    .bind(sessionId)
    .first<ThanksOrderRow>();
}
