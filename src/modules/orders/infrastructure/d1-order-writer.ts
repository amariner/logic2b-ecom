/**
 * Adaptador D1 de escritura de pedidos (R1.5–R1.7).
 *
 * Todas las escrituras devuelven sentencias al composition root. Desde R1.7 el
 * evento se inserta condicionado al estado leído y estas mutaciones exigen ese
 * `event_id`: pedido, stock, timeline y entregas se confirman en UNA batch.
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
  return {
    insertPendingOrderStatement(order: NewOrderInput): D1PreparedStatement {
      return db
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
        );
    },

    lineStatementsForOrderNumber(orderNumber: string, lines: readonly NewOrderLine[]): D1PreparedStatement[] {
      return lines.map((line) => db.prepare(`
        INSERT INTO order_items (order_id, product_id, name_snapshot, unit_price_cents, qty)
        SELECT id, ?, ?, ?, ? FROM orders WHERE order_number = ?
      `).bind(line.product_id || null, line.name_snapshot, line.unit_price_cents, line.qty, orderNumber));
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

    guardedPaidStatement(orderId: number, paymentIntent: string | null, eventId: string): D1PreparedStatement {
      return db.prepare(`
        UPDATE orders
        SET status = 'paid', stripe_payment_intent = ?, updated_at = datetime('now')
        WHERE id = ? AND status = 'pending'
          AND EXISTS (SELECT 1 FROM event_outbox_events WHERE event_id = ?)
      `).bind(paymentIntent, orderId, eventId);
    },

    guardedExpiredStatement(orderId: number, eventId: string): D1PreparedStatement {
      return db.prepare(`
        UPDATE orders SET status = 'cancelled', updated_at = datetime('now')
        WHERE id = ? AND status = 'pending'
          AND EXISTS (SELECT 1 FROM event_outbox_events WHERE event_id = ?)
      `).bind(orderId, eventId);
    },

    guardedTransitionStatement(input: {
      orderId: number;
      from: string;
      to: string;
      tracking: { carrier: string; number: string } | null;
      eventId: string;
    }): D1PreparedStatement {
      return input.tracking
        ? db.prepare(`
            UPDATE orders
            SET status = ?, tracking_carrier = ?, tracking_number = ?, updated_at = datetime('now')
            WHERE id = ? AND status = ?
              AND EXISTS (SELECT 1 FROM event_outbox_events WHERE event_id = ?)
          `).bind(input.to, input.tracking.carrier, input.tracking.number, input.orderId, input.from, input.eventId)
        : db.prepare(`
            UPDATE orders SET status = ?, updated_at = datetime('now')
            WHERE id = ? AND status = ?
              AND EXISTS (SELECT 1 FROM event_outbox_events WHERE event_id = ?)
          `).bind(input.to, input.orderId, input.from, input.eventId);
    },

    timelineStatementForOrderNumber(orderNumber: string, entry: OrderTimelineEntry): D1PreparedStatement {
      return db.prepare(`
        INSERT INTO order_events (order_id, from_status, to_status, note)
        SELECT id, ?, ?, ? FROM orders WHERE order_number = ?
      `).bind(entry.from_status, entry.to_status, entry.note, orderNumber);
    },

    guardedTimelineStatement(orderId: number, entry: OrderTimelineEntry, eventId: string): D1PreparedStatement {
      return db.prepare(`
        INSERT INTO order_events (order_id, from_status, to_status, note)
        SELECT ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM event_outbox_events WHERE event_id = ?)
      `).bind(orderId, entry.from_status, entry.to_status, entry.note, eventId);
    },

    guardedStockDecrementStatements(changes: readonly StockChange[], eventId: string): D1PreparedStatement[] {
      return changes.map((change) => db.prepare(`
        UPDATE products SET stock = MAX(stock - ?, 0)
        WHERE id = ? AND EXISTS (SELECT 1 FROM event_outbox_events WHERE event_id = ?)
      `).bind(change.qty, change.product_id, eventId));
    },

    guardedStockRestoreStatements(changes: readonly StockChange[], eventId: string): D1PreparedStatement[] {
      return changes
        .filter((change) => change.product_id > 0)
        .map((change) => db.prepare(`
          UPDATE products SET stock = stock + ?
          WHERE id = ? AND EXISTS (SELECT 1 FROM event_outbox_events WHERE event_id = ?)
        `).bind(change.qty, change.product_id, eventId));
    },

    /** Unidad de trabajo: el primer resultado decide quién ganó la carrera. */
    async commitResults(statements: readonly D1PreparedStatement[]): Promise<D1Result[]> {
      if (statements.length === 0) return [];
      return db.batch([...statements]);
    },
  };
}

export type D1OrderWriter = ReturnType<typeof createD1OrderWriter>;
