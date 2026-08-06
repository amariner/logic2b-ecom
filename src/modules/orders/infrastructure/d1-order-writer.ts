/**
 * Adaptador D1 de escritura de pedidos (R1.5). Recoge el SQL que hasta ahora
 * vivía en tres endpoints y en `lib/orders.ts`.
 *
 * Dos piezas separadas a propósito:
 *
 * - **`claim*`**: el UPDATE guardado por el estado leído, ejecutado en SOLITARIO.
 *   Su recuento de filas afectadas es la fuente de verdad de la idempotencia
 *   (CLAUDE.md §7.3): si dos peticiones concurrentes leyeron el mismo estado,
 *   solo una gana y la otra no aplica ningún efecto. No tocar sin test de carrera.
 * - **`commit`**: una única batch con los efectos ya decididos (timeline, stock
 *   y las sentencias que aporten otros módulos, hoy la bandeja de salida). El
 *   composition root compone esa lista; este adaptador no sabe qué son.
 *
 * `products.stock` se escribe desde aquí como deuda física conocida: el ledger
 * de inventario es R2.6/R2.7. La propiedad lógica ya está declarada en
 * `docs/plataforma/arquitectura/README.md`.
 */

import type { OrderTimelineEntry } from '../domain/order-events';
import type { OrderForPayment, OrderItemForPayment } from '../domain/payment-transition';

export type NewOrderInput = Readonly<{
  order_number: string;
  email: string;
  customer_name: string;
  address_json: string;
  subtotal_cents: number;
  shipping_cents: number;
  total_cents: number;
  stripe_session_id: string;
}>;

export type NewOrderLine = Readonly<{
  product_id: number;
  name_snapshot: string;
  unit_price_cents: number;
  qty: number;
}>;

export type OrderForTransition = Readonly<{
  id: number;
  order_number: string;
  email: string;
  customer_name: string;
  status: string;
  subtotal_cents: number;
  shipping_cents: number;
  total_cents: number;
}>;

export type StockChange = Readonly<{ product_id: number; qty: number }>;

const ORDER_ITEMS_COLUMNS = 'product_id, name_snapshot, unit_price_cents, qty';

export function createD1OrderWriter(db: D1Database) {
  const timelineStatement = (orderId: number, entry: OrderTimelineEntry): D1PreparedStatement =>
    db
      .prepare('INSERT INTO order_events (order_id, from_status, to_status, note) VALUES (?, ?, ?, ?)')
      .bind(orderId, entry.from_status, entry.to_status, entry.note);

  return {
    /** Alta del pedido en `pending`. Devuelve su id, o null si no se registró. */
    async insertPendingOrder(order: NewOrderInput): Promise<number | null> {
      await db
        .prepare(
          `INSERT INTO orders (order_number, email, customer_name, address_json, subtotal_cents, shipping_cents, total_cents, status, stripe_session_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
        )
        .bind(
          order.order_number,
          order.email,
          order.customer_name,
          order.address_json,
          order.subtotal_cents,
          order.shipping_cents,
          order.total_cents,
          order.stripe_session_id,
        )
        .run();

      const row = await db
        .prepare('SELECT id FROM orders WHERE order_number = ?')
        .bind(order.order_number)
        .first<{ id: number }>();
      return row?.id ?? null;
    },

    lineStatements(orderId: number, lines: readonly NewOrderLine[]): D1PreparedStatement[] {
      return lines.map((line) =>
        db
          .prepare(
            'INSERT INTO order_items (order_id, product_id, name_snapshot, unit_price_cents, qty) VALUES (?, ?, ?, ?, ?)',
          )
          .bind(orderId, line.product_id || null, line.name_snapshot, line.unit_price_cents, line.qty),
      );
    },

    findOrderForPaymentBySession(stripeSessionId: string): Promise<OrderForPayment | null> {
      return db
        .prepare(
          'SELECT id, order_number, status, email, customer_name, subtotal_cents, shipping_cents, total_cents FROM orders WHERE stripe_session_id = ?',
        )
        .bind(stripeSessionId)
        .first<OrderForPayment>();
    },

    findOrderForPaymentById(orderId: number): Promise<OrderForPayment | null> {
      return db
        .prepare(
          'SELECT id, order_number, status, email, customer_name, subtotal_cents, shipping_cents, total_cents FROM orders WHERE id = ?',
        )
        .bind(orderId)
        .first<OrderForPayment>();
    },

    findOrderIdBySession(stripeSessionId: string): Promise<{ id: number } | null> {
      return db.prepare('SELECT id FROM orders WHERE stripe_session_id = ?').bind(stripeSessionId).first<{ id: number }>();
    },

    findOrderForTransition(orderId: number): Promise<OrderForTransition | null> {
      return db
        .prepare(
          'SELECT id, order_number, email, customer_name, status, subtotal_cents, shipping_cents, total_cents FROM orders WHERE id = ?',
        )
        .bind(orderId)
        .first<OrderForTransition>();
    },

    async items(orderId: number): Promise<OrderItemForPayment[]> {
      const { results } = await db
        .prepare(`SELECT ${ORDER_ITEMS_COLUMNS} FROM order_items WHERE order_id = ?`)
        .bind(orderId)
        .all<OrderItemForPayment>();
      return results;
    },

    /** UPDATE guardado por `status = 'pending'`, en solitario. true = esta llamada ganó. */
    async claimPaid(orderId: number, paymentIntent: string | null): Promise<boolean> {
      const result = await db
        .prepare(
          "UPDATE orders SET status = 'paid', stripe_payment_intent = ?, updated_at = datetime('now') WHERE id = ? AND status = 'pending'",
        )
        .bind(paymentIntent, orderId)
        .run();
      return result.meta.changes > 0;
    },

    async claimExpired(orderId: number): Promise<boolean> {
      const result = await db
        .prepare("UPDATE orders SET status = 'cancelled', updated_at = datetime('now') WHERE id = ? AND status = 'pending'")
        .bind(orderId)
        .run();
      return result.meta.changes > 0;
    },

    /** Transición del panel, guardada por el estado LEÍDO. true = esta petición ganó. */
    async claimTransition(input: {
      orderId: number;
      from: string;
      to: string;
      tracking: { carrier: string; number: string } | null;
    }): Promise<boolean> {
      const statement = input.tracking
        ? db
            .prepare(
              "UPDATE orders SET status = ?, tracking_carrier = ?, tracking_number = ?, updated_at = datetime('now') WHERE id = ? AND status = ?",
            )
            .bind(input.to, input.tracking.carrier, input.tracking.number, input.orderId, input.from)
        : db
            .prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ? AND status = ?")
            .bind(input.to, input.orderId, input.from);
      const result = await statement.run();
      return result.meta.changes > 0;
    },

    timelineStatement,

    stockDecrementStatements(changes: readonly StockChange[]): D1PreparedStatement[] {
      return changes.map((change) =>
        db.prepare('UPDATE products SET stock = MAX(stock - ?, 0) WHERE id = ?').bind(change.qty, change.product_id),
      );
    },

    stockRestoreStatements(changes: readonly StockChange[]): D1PreparedStatement[] {
      return changes
        .filter((change) => change.product_id > 0)
        .map((change) => db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').bind(change.qty, change.product_id));
    },

    /** Unidad de trabajo: todos los efectos ya decididos, en una sola batch. */
    async commit(statements: readonly D1PreparedStatement[]): Promise<void> {
      if (statements.length === 0) return;
      await db.batch([...statements]);
    },
  };
}

export type D1OrderWriter = ReturnType<typeof createD1OrderWriter>;
