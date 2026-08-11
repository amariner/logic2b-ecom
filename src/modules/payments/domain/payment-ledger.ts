export const PAYMENT_PROVIDERS = ['stripe', 'simulated', 'legacy'] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

export const PAYMENT_STATUSES = [
  'pending',
  'authorized',
  'captured',
  'partially_refunded',
  'refunded',
  'failed',
  'cancelled',
  'requires_review',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export type PaymentLedgerEntry = Readonly<{
  id: number;
  order_id: number;
  provider: PaymentProvider;
  provider_reference: string | null;
  currency: string;
  expected_amount_cents: number;
  status: PaymentStatus;
  version: number;
}>;

export type PaymentCaptureDraft = Readonly<{
  provider: Exclude<PaymentProvider, 'legacy'>;
  provider_reference: string;
  amount_cents: number;
  currency: string;
  idempotency_key: string;
  occurred_at: string;
}>;

export type PlannedPaymentCapture = PaymentCaptureDraft & Readonly<{
  status: 'captured';
  transaction_status: 'succeeded';
  version_after: number;
}>;

const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${field} debe ser un entero seguro >= 1.`);
  }
}

function assertMoney(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${field} debe ser un entero seguro >= 0.`);
  }
}

function assertText(value: string, field: string, max: number): void {
  const length = value.trim().length;
  if (length < 1 || length > max) {
    throw new RangeError(`${field} debe medir entre 1 y ${max}.`);
  }
}

export function assertPaymentCurrency(currency: string): void {
  if (!CURRENCY_PATTERN.test(currency)) {
    throw new RangeError('currency debe ser un código ISO 4217 de tres letras mayúsculas.');
  }
}

/**
 * Planea una captura contra la intención persistida. El importe y la moneda
 * proceden del pedido; el hecho del proveedor solo aporta su referencia.
 */
export function planPaymentCapture(
  payment: PaymentLedgerEntry,
  draft: PaymentCaptureDraft,
): PlannedPaymentCapture {
  assertPositiveInteger(payment.id, 'payment.id');
  assertPositiveInteger(payment.order_id, 'payment.order_id');
  assertPositiveInteger(payment.version, 'payment.version');
  assertMoney(payment.expected_amount_cents, 'payment.expected_amount_cents');
  assertMoney(draft.amount_cents, 'amount_cents');
  assertPaymentCurrency(payment.currency);
  assertPaymentCurrency(draft.currency);
  assertText(draft.provider_reference, 'provider_reference', 200);
  assertText(draft.idempotency_key, 'idempotency_key', 200);
  if (!TIMESTAMP_PATTERN.test(draft.occurred_at)) {
    throw new RangeError('occurred_at debe ser ISO-8601 UTC con milisegundos.');
  }
  if (payment.status !== 'pending') throw new RangeError('solo un pago pending se puede capturar.');
  if (payment.provider !== draft.provider) throw new RangeError('el proveedor no coincide con la intención.');
  if (payment.currency !== draft.currency) throw new RangeError('la moneda no coincide con la intención.');
  if (payment.expected_amount_cents !== draft.amount_cents) {
    throw new RangeError('el importe capturado no coincide con el total decidido por el servidor.');
  }
  return Object.freeze({
    ...draft,
    status: 'captured',
    transaction_status: 'succeeded',
    version_after: payment.version + 1,
  });
}
