import { describe, expect, it } from 'vitest';
import {
  assertPaymentCurrency,
  planPaymentCapture,
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
});
