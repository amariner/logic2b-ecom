import { describe, expect, it } from 'vitest';
import {
  assertPaymentCurrency,
  planPaymentCapture,
  planPartialRefund,
  planTotalRefund,
  type PaymentLedgerEntry,
} from '../src/modules/payments';

const payment: PaymentLedgerEntry = {
  id: 1,
  order_id: 7,
  provider: 'stripe',
  provider_reference: 'cs_test',
  currency: 'EUR',
  expected_amount_cents: 3530,
  status: 'pending',
  version: 1,
  refunded_cents: 0,
};

const capture = {
  provider: 'stripe' as const,
  provider_reference: 'pi_test',
  amount_cents: 3530,
  currency: 'EUR',
  idempotency_key: 'order:BM-TEST:order_paid:capture',
  occurred_at: '2026-08-11T08:00:00.000Z',
};

describe('contrato de dominio del ledger de pagos R2.9', () => {
  it('planea una captura exacta y versionada desde la intención del servidor', () => {
    expect(planPaymentCapture(payment, capture)).toEqual({
      ...capture,
      status: 'captured',
      transaction_status: 'succeeded',
      version_after: 2,
    });
  });

  it('rechaza proveedor, moneda, importe, estado o referencia incoherentes', () => {
    expect(() => planPaymentCapture(payment, { ...capture, provider: 'simulated' })).toThrow(/proveedor/);
    expect(() => planPaymentCapture(payment, { ...capture, currency: 'USD' })).toThrow(/moneda/);
    expect(() => planPaymentCapture(payment, { ...capture, amount_cents: 3529 })).toThrow(/importe/);
    expect(() => planPaymentCapture({ ...payment, status: 'captured' }, capture)).toThrow(/pending/);
    expect(() => planPaymentCapture(payment, { ...capture, provider_reference: ' ' })).toThrow(/provider_reference/);
  });

  it('solo admite moneda ISO-4217 normalizada', () => {
    expect(() => assertPaymentCurrency('EUR')).not.toThrow();
    expect(() => assertPaymentCurrency('eur')).toThrow(/ISO 4217/);
    expect(() => assertPaymentCurrency('EURO')).toThrow(/ISO 4217/);
  });

  it('congela un reembolso total exacto y separa la reposición del dinero', () => {
    const captured = { ...payment, status: 'captured' as const };
    expect(planTotalRefund(
      captured,
      { subtotal_cents: 3040, shipping_cents: 490, total_cents: 3530 },
      [
        { order_item_id: 1, quantity: 2, amount_cents: 1780 },
        { order_item_id: 2, quantity: 3, amount_cents: 1260 },
      ],
      'restock',
    )).toMatchObject({ total_cents: 3530, restock_decision: 'restock' });
    expect(() => planTotalRefund(
      captured,
      { subtotal_cents: 3040, shipping_cents: 490, total_cents: 3530 },
      [{ order_item_id: 1, quantity: 1, amount_cents: 1 }],
      'none',
    )).toThrow(/no suman/);
  });

  it('calcula parciales por cantidad con política A sin aceptar importes del cliente', () => {
    const captured = { ...payment, status: 'captured' as const };
    const planned = planPartialRefund(
      captured,
      { subtotal_cents: 3040, shipping_cents: 490, total_cents: 3530 },
      [
        { order_item_id: 1, unit_price_cents: 890, ordered_quantity: 2, fulfilled_quantity: 0, cancelled_quantity: 0 },
        { order_item_id: 2, unit_price_cents: 420, ordered_quantity: 3, fulfilled_quantity: 1, cancelled_quantity: 0 },
      ],
      [
        { order_item_id: 2, quantity: 1 },
        { order_item_id: 1, quantity: 2 },
      ],
      'restock',
      'merchandise-only',
    );
    expect(planned).toEqual({
      subtotal_cents: 2200,
      shipping_cents: 0,
      total_cents: 2200,
      lines: [
        { order_item_id: 2, quantity: 1, amount_cents: 420 },
        { order_item_id: 1, quantity: 2, amount_cents: 1780 },
      ],
      restock_decision: 'restock',
      remaining_quantity: 1,
      payment_status_after: 'partially_refunded',
    });
  });

  it('hace ajustable el envío sin prorratearlo ni devolverlo si ya salió mercancía', () => {
    const captured = { ...payment, status: 'captured' as const };
    const order = { subtotal_cents: 3040, shipping_cents: 490, total_cents: 3530 };
    const lines = [
      { order_item_id: 1, unit_price_cents: 1520, ordered_quantity: 2, fulfilled_quantity: 0, cancelled_quantity: 0 },
    ];
    expect(planPartialRefund(
      captured, order, lines, [{ order_item_id: 1, quantity: 2 }], 'none',
      'merchandise-only',
    ).shipping_cents).toBe(0);
    expect(planPartialRefund(
      captured, order, lines, [{ order_item_id: 1, quantity: 2 }], 'none',
      'full-on-final-cancellation',
    )).toMatchObject({ shipping_cents: 490, total_cents: 3530, payment_status_after: 'refunded' });
    expect(planPartialRefund(
      captured,
      order,
      [{ ...lines[0]!, ordered_quantity: 3, fulfilled_quantity: 1 }],
      [{ order_item_id: 1, quantity: 2 }],
      'none',
      'full-on-final-cancellation',
    ).shipping_cents).toBe(0);
  });

  it('rechaza líneas ajenas, duplicadas, enviadas/canceladas y exceso financiero', () => {
    const partiallyRefunded = {
      ...payment,
      status: 'partially_refunded' as const,
      refunded_cents: 3000,
    };
    const order = { subtotal_cents: 3040, shipping_cents: 490, total_cents: 3530 };
    const lines = [
      { order_item_id: 1, unit_price_cents: 890, ordered_quantity: 2, fulfilled_quantity: 1, cancelled_quantity: 0 },
    ];
    expect(() => planPartialRefund(
      partiallyRefunded, order, lines, [{ order_item_id: 2, quantity: 1 }], 'none', 'merchandise-only',
    )).toThrow(/no pertenece/);
    expect(() => planPartialRefund(
      partiallyRefunded, order, lines,
      [{ order_item_id: 1, quantity: 1 }, { order_item_id: 1, quantity: 1 }],
      'none', 'merchandise-only',
    )).toThrow(/repetirse/);
    expect(() => planPartialRefund(
      partiallyRefunded, order, lines, [{ order_item_id: 1, quantity: 2 }], 'none', 'merchandise-only',
    )).toThrow(/cancelables/);
    expect(() => planPartialRefund(
      partiallyRefunded, order, lines, [{ order_item_id: 1, quantity: 1 }], 'none', 'merchandise-only',
    )).toThrow(/supera la captura/);
  });
});
