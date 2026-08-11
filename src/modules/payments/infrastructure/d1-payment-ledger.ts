import {
  planPaymentCapture,
  type PaymentCaptureDraft,
  type PaymentLedgerEntry,
  type PaymentProvider,
} from '../domain/payment-ledger';

export type PaymentLedgerGuard = Readonly<{ eventId: string }>;

export type PendingPaymentInput = Readonly<{
  provider: Exclude<PaymentProvider, 'legacy'>;
  provider_reference: string;
  currency: string;
  occurred_at: string;
}>;

export function createD1PaymentLedger(db: D1Database) {
  return Object.freeze({
    pendingForOrderStatement(
      orderNumber: string,
      input: PendingPaymentInput,
      guard: PaymentLedgerGuard,
    ): D1PreparedStatement {
      return db.prepare(`
        INSERT INTO payments (
          order_id, provider, provider_reference, currency,
          expected_amount_cents, status, version, idempotency_key,
          created_at, updated_at
        )
        SELECT
          o.id, ?, ?, o.currency, o.total_cents, 'pending', 1,
          'r2:payment:order:' || o.id || ':primary', ?, ?
        FROM orders o
        WHERE o.order_number = ? AND o.currency = ?
          AND EXISTS (SELECT 1 FROM event_outbox_events WHERE event_id = ?)
      `).bind(
        input.provider,
        input.provider_reference,
        input.occurred_at,
        input.occurred_at,
        orderNumber,
        input.currency,
        guard.eventId,
      );
    },

    findByOrderId(orderId: number): Promise<PaymentLedgerEntry | null> {
      return db.prepare(`
        SELECT id, order_id, provider, provider_reference, currency,
               expected_amount_cents, status, version
        FROM payments
        WHERE order_id = ?
          AND idempotency_key = ?
        LIMIT 1
      `).bind(orderId, `r2:payment:order:${orderId}:primary`).first<PaymentLedgerEntry>();
    },

    captureStatements(
      payment: PaymentLedgerEntry,
      draft: PaymentCaptureDraft,
      guard: PaymentLedgerGuard,
    ): readonly D1PreparedStatement[] {
      const planned = planPaymentCapture(payment, draft);
      return [
        db.prepare(`
          INSERT INTO payment_transactions (
            payment_id, type, amount_cents, currency, status,
            provider_reference, idempotency_key, occurred_at, created_at
          )
          SELECT ?, 'capture', ?, ?, ?, ?, ?, ?, ?
          WHERE EXISTS (SELECT 1 FROM event_outbox_events WHERE event_id = ?)
            AND EXISTS (
              SELECT 1 FROM payments
              WHERE id = ? AND status = 'pending' AND version = ?
            )
        `).bind(
          payment.id,
          planned.amount_cents,
          planned.currency,
          planned.transaction_status,
          planned.provider_reference,
          planned.idempotency_key,
          planned.occurred_at,
          planned.occurred_at,
          guard.eventId,
          payment.id,
          payment.version,
        ),
        db.prepare(`
          UPDATE payments
          SET status = ?, provider_reference = ?, version = ?, updated_at = ?
          WHERE id = ? AND status = 'pending' AND version = ?
            AND EXISTS (
              SELECT 1 FROM payment_transactions
              WHERE idempotency_key = ? AND payment_id = payments.id
            )
            AND EXISTS (SELECT 1 FROM event_outbox_events WHERE event_id = ?)
        `).bind(
          planned.status,
          planned.provider_reference,
          planned.version_after,
          planned.occurred_at,
          payment.id,
          payment.version,
          planned.idempotency_key,
          guard.eventId,
        ),
      ];
    },

    cancelPendingStatement(
      payment: PaymentLedgerEntry,
      occurredAt: string,
      guard: PaymentLedgerGuard,
    ): D1PreparedStatement {
      return db.prepare(`
        UPDATE payments
        SET status = 'cancelled', version = version + 1, updated_at = ?
        WHERE id = ? AND status = 'pending' AND version = ?
          AND EXISTS (SELECT 1 FROM event_outbox_events WHERE event_id = ?)
      `).bind(occurredAt, payment.id, payment.version, guard.eventId);
    },

    requireReviewStatement(
      payment: PaymentLedgerEntry,
      occurredAt: string,
      guard: PaymentLedgerGuard,
    ): D1PreparedStatement {
      return db.prepare(`
        UPDATE payments
        SET status = 'requires_review', version = version + 1, updated_at = ?
        WHERE id = ? AND status = 'captured' AND version = ?
          AND EXISTS (SELECT 1 FROM event_outbox_events WHERE event_id = ?)
      `).bind(occurredAt, payment.id, payment.version, guard.eventId);
    },
  });
}

export type D1PaymentLedger = ReturnType<typeof createD1PaymentLedger>;
