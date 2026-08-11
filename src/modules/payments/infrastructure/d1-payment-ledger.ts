import {
  planPaymentCapture,
  type PlannedTotalRefund,
  type PaymentCaptureDraft,
  type PaymentLedgerEntry,
  type PaymentProvider,
  type RefundLedgerEntry,
  type RefundStatus,
} from '../domain/payment-ledger';
import type { RefundGatewayResult } from '../application/refund-gateway';

export type PaymentLedgerGuard = Readonly<{ eventId: string }>;

export type PendingPaymentInput = Readonly<{
  provider: Exclude<PaymentProvider, 'legacy'>;
  provider_reference: string;
  currency: string;
  occurred_at: string;
}>;

export type TotalRefundIntentInput = Readonly<{
  order_id: number;
  reason: string;
  occurred_at: string;
  idempotency_key: string;
  planned: PlannedTotalRefund;
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

    findRefundByOrderId(orderId: number): Promise<RefundLedgerEntry | null> {
      return db.prepare(`
        SELECT r.id, r.order_id, r.payment_id, r.status, r.reason,
               r.subtotal_cents, r.shipping_cents, r.total_cents,
               r.provider_reference, r.idempotency_key, r.version,
               COALESCE((
                 SELECT min(ri.restock_decision) FROM refund_items ri
                 WHERE ri.refund_id = r.id AND ri.restock_decision IN ('none', 'restock')
               ), 'none') AS restock_decision
        FROM refunds r
        WHERE r.order_id = ?
        ORDER BY r.id
        LIMIT 1
      `).bind(orderId).first<RefundLedgerEntry>();
    },

    createTotalRefundIntentStatements(
      payment: PaymentLedgerEntry,
      input: TotalRefundIntentInput,
    ): readonly D1PreparedStatement[] {
      const reason = input.reason.trim();
      if (reason.length < 1 || reason.length > 240) throw new RangeError('motivo de reembolso inválido.');
      const statements: D1PreparedStatement[] = [
        db.prepare(`
          INSERT INTO refunds (
            order_id, payment_id, status, reason, subtotal_cents,
            shipping_cents, total_cents, provider_reference,
            idempotency_key, version, created_at, updated_at
          )
          SELECT o.id, p.id, 'pending', ?, ?, ?, ?, NULL, ?, 1, ?, ?
          FROM payments p
          JOIN orders o ON o.id = p.order_id
          WHERE p.id = ? AND p.order_id = ? AND p.status = 'captured' AND p.version = ?
            AND o.status = 'paid'
            AND NOT EXISTS (SELECT 1 FROM refunds r WHERE r.idempotency_key = ?)
        `).bind(
          reason,
          input.planned.subtotal_cents,
          input.planned.shipping_cents,
          input.planned.total_cents,
          input.idempotency_key,
          input.occurred_at,
          input.occurred_at,
          payment.id,
          input.order_id,
          payment.version,
          input.idempotency_key,
        ),
      ];
      for (const line of input.planned.lines) {
        statements.push(db.prepare(`
          INSERT INTO refund_items (
            refund_id, order_item_id, quantity, amount_cents, restock_decision
          )
          SELECT r.id, ?, ?, ?, ?
          FROM refunds r
          WHERE r.idempotency_key = ?
            AND NOT EXISTS (
              SELECT 1 FROM refund_items ri
              WHERE ri.refund_id = r.id AND ri.order_item_id = ?
            )
        `).bind(
          line.order_item_id,
          line.quantity,
          line.amount_cents,
          input.planned.restock_decision,
          input.idempotency_key,
          line.order_item_id,
        ));
      }
      return statements;
    },

    refundGatewayOutcomeStatement(
      refund: RefundLedgerEntry,
      result: RefundGatewayResult,
      occurredAt: string,
    ): D1PreparedStatement {
      if (result.status === 'succeeded') {
        throw new RangeError('un reembolso succeeded debe cerrarse con refundSuccessStatements.');
      }
      const status: Exclude<RefundStatus, 'pending' | 'succeeded' | 'cancelled'> = result.status;
      return db.prepare(`
        UPDATE refunds
        SET status = ?, provider_reference = ?, version = version + 1, updated_at = ?
        WHERE id = ? AND version = ? AND status <> 'succeeded'
      `).bind(status, result.providerReference, occurredAt, refund.id, refund.version);
    },

    refundSuccessStatements(
      payment: PaymentLedgerEntry,
      refund: RefundLedgerEntry,
      providerReference: string,
      occurredAt: string,
      guard: PaymentLedgerGuard,
    ): readonly D1PreparedStatement[] {
      const transactionKey = `${refund.idempotency_key}:transaction`;
      return [
        db.prepare(`
          INSERT INTO payment_transactions (
            payment_id, type, amount_cents, currency, status,
            provider_reference, idempotency_key, occurred_at, created_at
          )
          SELECT ?, 'refund', ?, ?, 'succeeded', ?, ?, ?, ?
          WHERE EXISTS (SELECT 1 FROM event_outbox_events WHERE event_id = ?)
            AND EXISTS (
              SELECT 1 FROM payments
              WHERE id = ? AND status = 'captured' AND version = ?
            )
            AND EXISTS (
              SELECT 1 FROM refunds
              WHERE id = ? AND version = ? AND status <> 'succeeded'
            )
        `).bind(
          payment.id,
          refund.total_cents,
          payment.currency,
          providerReference,
          transactionKey,
          occurredAt,
          occurredAt,
          guard.eventId,
          payment.id,
          payment.version,
          refund.id,
          refund.version,
        ),
        db.prepare(`
          UPDATE payments
          SET status = 'refunded', version = version + 1, updated_at = ?
          WHERE id = ? AND status = 'captured' AND version = ?
            AND EXISTS (
              SELECT 1 FROM payment_transactions
              WHERE payment_id = payments.id AND idempotency_key = ?
            )
            AND EXISTS (SELECT 1 FROM event_outbox_events WHERE event_id = ?)
        `).bind(
          occurredAt,
          payment.id,
          payment.version,
          transactionKey,
          guard.eventId,
        ),
        db.prepare(`
          UPDATE refunds
          SET status = 'succeeded', provider_reference = ?,
              version = version + 1, updated_at = ?
          WHERE id = ? AND version = ? AND status <> 'succeeded'
            AND EXISTS (
              SELECT 1 FROM payment_transactions
              WHERE payment_id = ? AND idempotency_key = ?
            )
            AND EXISTS (SELECT 1 FROM event_outbox_events WHERE event_id = ?)
        `).bind(
          providerReference,
          occurredAt,
          refund.id,
          refund.version,
          payment.id,
          transactionKey,
          guard.eventId,
        ),
      ];
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
