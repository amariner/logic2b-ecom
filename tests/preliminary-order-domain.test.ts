import { describe, expect, it } from 'vitest';
import { planHostedPaymentLink } from '../src/modules/checkout';
import {
  applyConfirmedPreliminaryOrderPayment,
  approvePreliminaryOrder,
  cancelPreliminaryOrder,
  convertPreliminaryOrder,
  createPreliminaryOrderDraft,
  expirePreliminaryOrder,
  issuePreliminaryOrder,
  nextPreliminaryOrderPayment,
  type ConfirmedPreliminaryOrderPayment,
  type PreliminaryOrder,
  type PreliminaryOrderDraft,
} from '../src/modules/orders';

const issuedAt = '2026-08-17T10:00:00.000Z';
const approvedAt = '2026-08-17T11:00:00.000Z';
const expiresAt = '2026-08-24T10:00:00.000Z';

function draft(overrides: Partial<PreliminaryOrderDraft> = {}): PreliminaryOrder {
  return createPreliminaryOrderDraft({
    id: 'quote-domain-01',
    currency: 'EUR',
    totalCents: 10_000,
    depositCents: 2_500,
    conversionGate: 'deposit',
    expiresAt,
    ...overrides,
  });
}

function approved(overrides: Partial<PreliminaryOrderDraft> = {}): PreliminaryOrder {
  return approvePreliminaryOrder(issuePreliminaryOrder(draft(overrides), issuedAt), approvedAt);
}

function payment(
  order: PreliminaryOrder,
  overrides: Partial<ConfirmedPreliminaryOrderPayment> = {},
): ConfirmedPreliminaryOrderPayment {
  const next = nextPreliminaryOrderPayment(order);
  if (next === null) throw new Error('El fixture requiere un pago pendiente.');
  return {
    confirmed: true,
    stage: next.stage,
    amountCents: next.amountCents,
    currency: next.currency,
    paidAt: '2026-08-17T12:00:00.000Z',
    expectedVersion: order.version,
    ...overrides,
  };
}

describe('presupuestos y depósitos R4.11 (dominio previo al gate D1)', () => {
  it('emite y aprueba antes de la caducidad con versiones crecientes', () => {
    const created = draft();
    expect(created).toMatchObject({ status: 'draft', paymentStatus: 'unpaid', version: 1 });
    const issued = issuePreliminaryOrder(created, issuedAt);
    expect(issued).toMatchObject({ status: 'issued', issuedAt, version: 2 });
    expect(approvePreliminaryOrder(issued, approvedAt)).toMatchObject({
      status: 'approved', approvedAt, version: 3,
    });
  });

  it('caduca de forma explícita y no permite aprobar fuera de vigencia', () => {
    const issued = issuePreliminaryOrder(draft(), issuedAt);
    expect(expirePreliminaryOrder(issued, expiresAt)).toMatchObject({
      status: 'expired', version: 3,
    });
    expect(() => approvePreliminaryOrder(issued, expiresAt)).toThrow(/caducado/);
  });

  it('calcula depósito y saldo desde céntimos explícitos, nunca desde porcentajes', () => {
    const order = approved();
    expect(nextPreliminaryOrderPayment(order)).toEqual({
      stage: 'deposit', amountCents: 2_500, currency: 'EUR', preliminaryOrderVersion: 3,
    });
    const deposited = applyConfirmedPreliminaryOrderPayment(order, payment(order));
    expect(deposited).toMatchObject({
      paymentStatus: 'deposit_paid', paidCents: 2_500, version: 4,
    });
    expect(nextPreliminaryOrderPayment(deposited)).toEqual({
      stage: 'balance', amountCents: 7_500, currency: 'EUR', preliminaryOrderVersion: 4,
    });
    const paid = applyConfirmedPreliminaryOrderPayment(deposited, payment(deposited));
    expect(paid).toMatchObject({ paymentStatus: 'paid', paidCents: 10_000, version: 5 });
    expect(nextPreliminaryOrderPayment(paid)).toBeNull();
  });

  it('planifica un enlace alojado con caducidad aportada sin persistir URL', () => {
    expect(planHostedPaymentLink({
      order: approved(),
      providerAdapter: 'simulated-hosted-payment',
      idempotencyKey: 'quote-domain-01:deposit',
      createdAt: '2026-08-17T11:30:00.000Z',
      expiresAt: '2026-08-18T11:30:00.000Z',
    })).toEqual({
      stage: 'deposit',
      amountCents: 2_500,
      currency: 'EUR',
      preliminaryOrderVersion: 3,
      providerAdapter: 'simulated-hosted-payment',
      idempotencyKey: 'quote-domain-01:deposit',
      expiresAt: '2026-08-18T11:30:00.000Z',
    });
  });

  it('rechaza importe, moneda, etapa o versión manipulados', () => {
    const order = approved();
    expect(() => applyConfirmedPreliminaryOrderPayment(order,
      payment(order, { amountCents: 1 }))).toThrow(/no coincide/);
    expect(() => applyConfirmedPreliminaryOrderPayment(order,
      payment(order, { currency: 'USD' }))).toThrow(/no coincide/);
    expect(() => applyConfirmedPreliminaryOrderPayment(order,
      payment(order, { stage: 'balance' }))).toThrow(/no coincide/);
    expect(() => applyConfirmedPreliminaryOrderPayment(order,
      payment(order, { expectedVersion: 2 }))).toThrow(/versión/);
  });

  it('aplica cada puerta de conversión sin convertir al aprobar o cobrar implícitamente', () => {
    const byApproval = approved({ depositCents: 0, conversionGate: 'approval' });
    expect(byApproval.status).toBe('approved');
    expect(convertPreliminaryOrder(byApproval, {
      orderId: 41, convertedAt: '2026-08-17T12:00:00.000Z',
    })).toMatchObject({ status: 'converted', convertedOrderId: 41, paidCents: 0 });

    const byDeposit = approved();
    expect(() => convertPreliminaryOrder(byDeposit, {
      orderId: 42, convertedAt: '2026-08-17T12:00:00.000Z',
    })).toThrow(/condición/);
    const deposited = applyConfirmedPreliminaryOrderPayment(byDeposit, payment(byDeposit));
    expect(convertPreliminaryOrder(deposited, {
      orderId: 42, convertedAt: '2026-08-17T12:30:00.000Z',
    })).toMatchObject({ status: 'converted', paymentStatus: 'deposit_paid' });

    const fullRequired = approved({ conversionGate: 'full_payment' });
    const depositPaid = applyConfirmedPreliminaryOrderPayment(fullRequired, payment(fullRequired));
    expect(() => convertPreliminaryOrder(depositPaid, {
      orderId: 43, convertedAt: '2026-08-17T13:00:00.000Z',
    })).toThrow(/condición/);
  });

  it('bloquea depósitos ambiguos, floats y cancelación con dinero conciliable', () => {
    expect(() => draft({ conversionGate: 'deposit', depositCents: 0 })).toThrow(/depósito/);
    expect(() => draft({ totalCents: 10_000.5 })).toThrow(/entero seguro/);
    const order = approved();
    const deposited = applyConfirmedPreliminaryOrderPayment(order, payment(order));
    expect(() => cancelPreliminaryOrder(deposited)).toThrow(/reembolso explícito/);
  });

  it('rechaza hitos financieros o comerciales anteriores a la aprobación', () => {
    const order = approved();
    expect(() => applyConfirmedPreliminaryOrderPayment(order,
      payment(order, { paidAt: '2026-08-17T10:30:00.000Z' }))).toThrow(/preceder/);
    expect(() => convertPreliminaryOrder(order, {
      orderId: 44, convertedAt: '2026-08-17T10:30:00.000Z',
    })).toThrow(/preceder/);
    expect(() => planHostedPaymentLink({
      order,
      providerAdapter: 'simulated-hosted-payment',
      idempotencyKey: 'quote-domain-01:deposit:early',
      createdAt: '2026-08-17T10:30:00.000Z',
      expiresAt: '2026-08-18T10:30:00.000Z',
    })).toThrow(/preceder/);
  });
});
