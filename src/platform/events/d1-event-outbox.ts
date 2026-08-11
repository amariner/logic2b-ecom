/** Persistencia D1 del sobre y de sus entregas (R1.7). */

import type { EventEnvelope, EventIdentity } from '../../shared-kernel/events';

export type EventOrderGuard = Readonly<{
  orderId: number;
  expectedStatus: string;
  requireNoActiveRefund?: boolean;
  ignoreExistingIdempotencyKey?: boolean;
}>;

function eventValues(event: EventEnvelope): readonly unknown[] {
  return [
    event.event_id,
    event.type,
    event.version,
    event.occurred_at,
    event.actor.kind,
    event.actor.id,
    event.actor.label ?? null,
    event.entity.type,
    event.entity.id,
    event.entity.reference ?? null,
    event.correlation_id,
    event.causation_id,
    event.idempotency_key,
    JSON.stringify(event.payload),
    event.occurred_at,
  ];
}

export function createD1EventOutboxWriter(db: D1Database) {
  return {
    /** El evento solo nace si el pedido sigue en el estado que leyó el caso de uso. */
    guardedEventStatement(event: EventEnvelope, guard: EventOrderGuard): D1PreparedStatement {
      const refundGuard = guard.requireNoActiveRefund
        ? `AND NOT EXISTS (
            SELECT 1 FROM refunds
            WHERE order_id = ? AND status IN ('pending', 'processing', 'succeeded', 'requires_review')
          )`
        : '';
      const refundBindings = guard.requireNoActiveRefund ? [guard.orderId] : [];
      const idempotencyGuard = guard.ignoreExistingIdempotencyKey
        ? 'AND NOT EXISTS (SELECT 1 FROM event_outbox_events WHERE idempotency_key = ?)'
        : '';
      const idempotencyBindings = guard.ignoreExistingIdempotencyKey ? [event.idempotency_key] : [];
      return db.prepare(`
        INSERT INTO event_outbox_events (
          event_id, event_type, event_version, occurred_at,
          actor_kind, actor_id, actor_label,
          entity_type, entity_id, entity_reference,
          correlation_id, causation_id, idempotency_key, payload_json, created_at
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM orders WHERE id = ? AND status = ? ${refundGuard}
        )
        ${idempotencyGuard}
      `).bind(
        ...eventValues(event),
        guard.orderId,
        guard.expectedStatus,
        ...refundBindings,
        ...idempotencyBindings,
      );
    },

    /**
     * El alta conoce `order_number` antes del lote, pero D1 asigna `order_id`.
     * La segunda sentencia de la batch materializa ambos campos desde la fila
     * recién insertada; después el caso de uso reconstruye el mismo sobre.
     */
    placedEventStatement(identity: EventIdentity, orderNumber: string): D1PreparedStatement {
      const correlationId = `order:${orderNumber}`;
      return db.prepare(`
        INSERT INTO event_outbox_events (
          event_id, event_type, event_version, occurred_at,
          actor_kind, actor_id, actor_label,
          entity_type, entity_id, entity_reference,
          correlation_id, causation_id, idempotency_key, payload_json, created_at
        )
        SELECT ?, 'orders.order_placed', 1, ?,
          'customer', 'guest-checkout', 'Comprador invitado',
          'order', CAST(id AS TEXT), order_number,
          ?, NULL, ?,
          json_object(
            'order_id', id,
            'order_number', order_number,
            'from_status', NULL,
            'to_status', 'pending'
          ), ?
        FROM orders
        WHERE order_number = ?
      `).bind(
        identity.event_id,
        identity.occurred_at,
        correlationId,
        `${correlationId}:order_placed`,
        identity.occurred_at,
        orderNumber,
      );
    },

    deliveryStatements(
      eventId: string,
      availableAt: string,
      consumerIds: readonly string[],
    ): D1PreparedStatement[] {
      return consumerIds.map((consumerId) => db.prepare(`
        INSERT INTO event_outbox_deliveries (
          event_id, consumer_id, available_at, created_at, updated_at
        )
        SELECT event_id, ?, ?, ?, ?
        FROM event_outbox_events
        WHERE event_id = ?
      `).bind(consumerId, availableAt, availableAt, availableAt, eventId));
    },
  };
}

export type D1EventOutboxWriter = ReturnType<typeof createD1EventOutboxWriter>;
