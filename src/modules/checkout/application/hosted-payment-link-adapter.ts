import {
  nextPreliminaryOrderPayment,
  type ConfirmedPreliminaryOrderPayment,
  type PreliminaryOrder,
  type PreliminaryOrderPaymentPlan,
} from '../../orders';

export type HostedPaymentLinkPlan = PreliminaryOrderPaymentPlan & Readonly<{
  providerAdapter: string;
  idempotencyKey: string;
  expiresAt: string;
}>;

export type HostedPaymentLinkSession = Readonly<{
  providerAdapter: string;
  providerReference: string;
  url: string;
  expiresAt: string;
}>;

export type VerifiedHostedPaymentEvent = Readonly<{
  verified: true;
  providerAdapter: string;
  providerEventReference: string;
  providerPaymentReference: string;
  idempotencyKey: string;
  payment: ConfirmedPreliminaryOrderPayment;
}>;

export interface HostedPaymentLinkAdapter {
  readonly id: string;
  createSession(plan: HostedPaymentLinkPlan): Promise<HostedPaymentLinkSession>;
  verifyEvent(input: Readonly<{
    payload: string;
    signature: string;
  }>): Promise<VerifiedHostedPaymentEvent>;
}

const ADAPTER_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/;

function timestamp(value: string, field: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || !value.endsWith('Z')) {
    throw new RangeError(`${field} debe ser una fecha ISO-8601 UTC.`);
  }
  return parsed;
}

function opaqueReference(value: string, field: string): void {
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > 200 || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new RangeError(`${field} inválido.`);
  }
}

/**
 * Planifica una sesión alojada con dinero decidido por el presupuesto. La URL
 * solo puede existir en el resultado efímero del adaptador; no forma parte del plan persistible.
 */
export function planHostedPaymentLink(input: Readonly<{
  order: PreliminaryOrder;
  providerAdapter: string;
  idempotencyKey: string;
  createdAt: string;
  expiresAt: string;
}>): HostedPaymentLinkPlan {
  if (!ADAPTER_PATTERN.test(input.providerAdapter)) {
    throw new RangeError('providerAdapter inválido.');
  }
  opaqueReference(input.idempotencyKey, 'idempotencyKey');
  const createdAt = timestamp(input.createdAt, 'createdAt');
  const expiresAt = timestamp(input.expiresAt, 'expiresAt');
  if (expiresAt <= createdAt) throw new RangeError('El enlace de pago debe caducar en el futuro.');
  if (
    input.order.approvedAt !== null &&
    createdAt < timestamp(input.order.approvedAt, 'preliminaryOrder.approvedAt')
  ) throw new RangeError('El enlace de pago no puede preceder a la aprobación.');
  const payment = nextPreliminaryOrderPayment(input.order);
  if (payment === null) throw new RangeError('El presupuesto ya está completamente pagado.');
  return Object.freeze({
    ...payment,
    providerAdapter: input.providerAdapter,
    idempotencyKey: input.idempotencyKey,
    expiresAt: input.expiresAt,
  });
}
