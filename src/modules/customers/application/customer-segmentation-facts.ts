import {
  CustomerSegmentationContractError,
  segmentDataArray,
  segmentInteger,
  segmentOpaqueId,
  segmentRecord,
  segmentTimestamp,
} from './customer-segmentation-contract';
import {
  createCustomerSegmentFacts,
  type CustomerSegmentFacts,
} from '../domain/customer-segmentation';

const ORDER_STATUSES = ['pending', 'paid', 'shipped', 'delivered', 'cancelled'] as const;
type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Todas las decisiones son obligatorias; ninguna constituye una política comercial activa. */
export type CustomerSegmentFactsPolicy = Readonly<{
  schemaVersion: 1;
  id: string;
  version: number;
  population: 'active_profiles';
  orderStatuses: readonly OrderStatus[];
  orderEligibility: 'selected_status' | 'successful_capture';
  activityBasis: 'order_created' | 'first_successful_capture' | 'last_successful_capture';
  amountBasis: 'original_order_total' | 'current_order_total' | 'captured_payments';
  refunds: 'ignore' | 'subtract';
  storedValue: 'exclude' | 'include' | 'included_in_order_total';
  paymentAdjustments: 'reject' | 'ignore';
  unsettledPayments: 'reject' | 'exclude';
  missingPaymentEvidence: 'null' | 'reject';
  currency: string;
  foreignCurrency: 'exclude_orders' | 'reject';
  dayBoundary: 'elapsed_24h_floor' | 'utc_calendar_days';
}>;

/**
 * Importes externos y saldo separados; solo capturas y reembolsos succeeded.
 * paymentCount cuenta transacciones externas, no filas de payments. Un payment
 * pendiente puede incrementar unsettledPaymentCount sin tener transacciones.
 */
export type CustomerSegmentOrderEvidence = Readonly<{
  id: number;
  status: OrderStatus;
  createdAt: string;
  currency: string;
  originalTotalCents: number;
  currentTotalCents: number;
  paymentCount: number;
  captureCount: number;
  capturedCents: number;
  refundedCents: number;
  storedValueCaptureCount: number;
  storedValueCapturedCents: number;
  storedValueRefundedCents: number;
  firstCaptureAt: string | null;
  lastCaptureAt: string | null;
  firstStoredValueCaptureAt: string | null;
  lastStoredValueCaptureAt: string | null;
  adjustmentCount: number;
  unsettledPaymentCount: number;
}>;

export type CustomerSegmentProfileEvidence = Readonly<{
  createdAt: string | null;
  orders: readonly CustomerSegmentOrderEvidence[];
}>;

function invalid(message: string): never {
  throw new CustomerSegmentationContractError(message);
}

function option<const T extends string>(value: unknown, values: readonly T[], field: string): T {
  if (typeof value !== 'string' || !values.includes(value as T)) {
    return invalid(`${field} no es una opción explícita permitida.`);
  }
  return value as T;
}

function currency(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) {
    return invalid(`${field} debe ser un código de moneda de tres letras mayúsculas.`);
  }
  return value;
}

export function defineCustomerSegmentFactsPolicy(input: unknown): CustomerSegmentFactsPolicy {
  const record = segmentRecord(input, [
    'schemaVersion', 'id', 'version', 'population', 'orderStatuses', 'orderEligibility',
    'activityBasis', 'amountBasis', 'refunds', 'storedValue', 'paymentAdjustments',
    'unsettledPayments', 'missingPaymentEvidence', 'currency', 'foreignCurrency', 'dayBoundary',
  ], 'policy');
  if (record.schemaVersion !== 1) return invalid('policy.schemaVersion debe ser 1.');
  const id = segmentOpaqueId(record.id, 'policy.id');
  if (!/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/.test(id)) {
    return invalid('policy.id no es un nombre canónico de política.');
  }
  const statusesInput = segmentDataArray(record.orderStatuses, 'policy.orderStatuses', ORDER_STATUSES.length);
  if (statusesInput.length === 0) return invalid('policy.orderStatuses no puede estar vacío.');
  const statuses = statusesInput.map((status) => option(status, ORDER_STATUSES, 'policy.orderStatuses'));
  if (new Set(statuses).size !== statuses.length) return invalid('policy.orderStatuses contiene duplicados.');
  const amountBasis = option(record.amountBasis,
    ['original_order_total', 'current_order_total', 'captured_payments'], 'policy.amountBasis');
  const storedValue = option(record.storedValue,
    ['exclude', 'include', 'included_in_order_total'], 'policy.storedValue');
  if ((amountBasis === 'captured_payments') === (storedValue === 'included_in_order_total')) {
    return invalid('policy.storedValue debe declarar included_in_order_total exclusivamente para totales de pedido.');
  }
  const refunds = option(record.refunds, ['ignore', 'subtract'], 'policy.refunds');
  // El total vigente puede incorporar ya una reducción por edición de pedido.
  // Su devolución monetaria solo se netea una vez, en la base de capturas.
  if (amountBasis !== 'captured_payments' && refunds !== 'ignore') {
    return invalid('policy.refunds solo puede restar reembolsos sobre captured_payments.');
  }
  return Object.freeze({
    schemaVersion: 1,
    id,
    version: segmentInteger(record.version, 1, 'policy.version'),
    population: option(record.population, ['active_profiles'], 'policy.population'),
    orderStatuses: Object.freeze(ORDER_STATUSES.filter((status) => statuses.includes(status))),
    orderEligibility: option(record.orderEligibility, ['selected_status', 'successful_capture'], 'policy.orderEligibility'),
    activityBasis: option(record.activityBasis,
      ['order_created', 'first_successful_capture', 'last_successful_capture'], 'policy.activityBasis'),
    amountBasis,
    refunds,
    storedValue,
    paymentAdjustments: option(record.paymentAdjustments, ['reject', 'ignore'], 'policy.paymentAdjustments'),
    unsettledPayments: option(record.unsettledPayments, ['reject', 'exclude'], 'policy.unsettledPayments'),
    missingPaymentEvidence: option(record.missingPaymentEvidence, ['null', 'reject'], 'policy.missingPaymentEvidence'),
    currency: currency(record.currency, 'policy.currency'),
    foreignCurrency: option(record.foreignCurrency, ['exclude_orders', 'reject'], 'policy.foreignCurrency'),
    dayBoundary: option(record.dayBoundary, ['elapsed_24h_floor', 'utc_calendar_days'], 'policy.dayBoundary'),
  });
}

function optionalDate(value: unknown, nowMs: number, field: string): string | null {
  return value === null ? null : segmentTimestamp(value, nowMs, field);
}

function assertCaptureEvidence(
  count: number, captured: number, refunded: number,
  first: string | null, last: string | null, field: string,
): void {
  if (refunded > captured) return invalid(`${field} reembolsa más que lo capturado.`);
  if (count === 0) {
    if (captured !== 0 || refunded !== 0 || first !== null || last !== null) {
      return invalid(`${field} contiene importes o fechas sin capturas.`);
    }
  } else if (first === null || last === null || first > last) {
    return invalid(`${field} tiene fechas de captura ausentes o incoherentes.`);
  } else if (count === 1 && first !== last) {
    return invalid(`${field} atribuye fechas distintas a una única captura.`);
  }
}

function normalizeEvidence(input: unknown, capturedMs: number): CustomerSegmentProfileEvidence {
  const record = segmentRecord(input, ['createdAt', 'orders'], 'evidence');
  const createdAt = optionalDate(record.createdAt, capturedMs, 'evidence.createdAt');
  const ids = new Set<number>();
  const orders = segmentDataArray(record.orders, 'evidence.orders').map((inputOrder, index) => {
    const field = `evidence.orders.${index}`;
    const value = segmentRecord(inputOrder, [
      'id', 'status', 'createdAt', 'currency', 'originalTotalCents', 'currentTotalCents',
      'paymentCount', 'captureCount', 'capturedCents', 'refundedCents', 'storedValueCaptureCount',
      'storedValueCapturedCents', 'storedValueRefundedCents', 'firstCaptureAt', 'lastCaptureAt',
      'firstStoredValueCaptureAt', 'lastStoredValueCaptureAt', 'adjustmentCount', 'unsettledPaymentCount',
    ], field);
    const order: CustomerSegmentOrderEvidence = Object.freeze({
      id: segmentInteger(value.id, 1, `${field}.id`),
      status: option(value.status, ORDER_STATUSES, `${field}.status`),
      createdAt: segmentTimestamp(value.createdAt, capturedMs, `${field}.createdAt`),
      currency: currency(value.currency, `${field}.currency`),
      originalTotalCents: segmentInteger(value.originalTotalCents, 0, `${field}.originalTotalCents`),
      currentTotalCents: segmentInteger(value.currentTotalCents, 0, `${field}.currentTotalCents`),
      paymentCount: segmentInteger(value.paymentCount, 0, `${field}.paymentCount`),
      captureCount: segmentInteger(value.captureCount, 0, `${field}.captureCount`),
      capturedCents: segmentInteger(value.capturedCents, 0, `${field}.capturedCents`),
      refundedCents: segmentInteger(value.refundedCents, 0, `${field}.refundedCents`),
      storedValueCaptureCount: segmentInteger(value.storedValueCaptureCount, 0, `${field}.storedValueCaptureCount`),
      storedValueCapturedCents: segmentInteger(value.storedValueCapturedCents, 0, `${field}.storedValueCapturedCents`),
      storedValueRefundedCents: segmentInteger(value.storedValueRefundedCents, 0, `${field}.storedValueRefundedCents`),
      firstCaptureAt: optionalDate(value.firstCaptureAt, capturedMs, `${field}.firstCaptureAt`),
      lastCaptureAt: optionalDate(value.lastCaptureAt, capturedMs, `${field}.lastCaptureAt`),
      firstStoredValueCaptureAt: optionalDate(value.firstStoredValueCaptureAt, capturedMs, `${field}.firstStoredValueCaptureAt`),
      lastStoredValueCaptureAt: optionalDate(value.lastStoredValueCaptureAt, capturedMs, `${field}.lastStoredValueCaptureAt`),
      adjustmentCount: segmentInteger(value.adjustmentCount, 0, `${field}.adjustmentCount`),
      unsettledPaymentCount: segmentInteger(value.unsettledPaymentCount, 0, `${field}.unsettledPaymentCount`),
    });
    if (ids.has(order.id)) return invalid(`${field}.id está duplicado.`);
    ids.add(order.id);
    if (order.captureCount > order.paymentCount - order.adjustmentCount) {
      return invalid(`${field} contiene más capturas y ajustes que transacciones de pago.`);
    }
    assertCaptureEvidence(order.captureCount, order.capturedCents, order.refundedCents,
      order.firstCaptureAt, order.lastCaptureAt, `${field}.payments`);
    assertCaptureEvidence(order.storedValueCaptureCount, order.storedValueCapturedCents, order.storedValueRefundedCents,
      order.firstStoredValueCaptureAt, order.lastStoredValueCaptureAt, `${field}.storedValue`);
    return order;
  });
  return Object.freeze({ createdAt, orders: Object.freeze(orders) });
}

function add(left: number, right: number, field: string): number {
  return segmentInteger(left + right, 0, field);
}

function daysSince(at: string, capturedMs: number, policy: CustomerSegmentFactsPolicy): number {
  const atMs = Date.parse(at);
  return policy.dayBoundary === 'elapsed_24h_floor'
    ? Math.floor((capturedMs - atMs) / 86_400_000)
    : Math.floor(capturedMs / 86_400_000) - Math.floor(atMs / 86_400_000);
}

/**
 * Proyección pura de una lectura completa, sin reloj global, IO, PII ni defaults.
 * La infraestructura acredita completitud y consistencia; no se deducen cobros
 * del estado paid. Los null solo afectan a hechos que dependen de esa ausencia.
 */
export function projectCustomerSegmentFacts(
  policyInput: unknown,
  evidenceInput: unknown,
  capturedAtInput: unknown,
): CustomerSegmentFacts {
  const policy = defineCustomerSegmentFactsPolicy(policyInput);
  const capturedAt = segmentTimestamp(capturedAtInput, 8.64e15, 'capturedAt');
  const capturedMs = Date.parse(capturedAt);
  const evidence = normalizeEvidence(evidenceInput, capturedMs);
  let count: number | null = 0;
  let total: number | null = 0;
  let lastActivity: string | null = null;
  let missingActivity = false;
  const includeStoredValue = policy.storedValue !== 'exclude';

  function missing(field: string): null {
    if (policy.missingPaymentEvidence === 'reject') {
      return invalid(`${field} carece de evidencia de pagos requerida por la política.`);
    }
    return null;
  }

  for (const order of evidence.orders) {
    if (!policy.orderStatuses.includes(order.status)) continue;
    if (order.currency !== policy.currency) {
      if (policy.foreignCurrency === 'reject') return invalid('El pedido usa una moneda ajena a policy.currency.');
      continue;
    }
    if (order.adjustmentCount > 0 && policy.paymentAdjustments === 'reject') {
      return invalid('El pedido contiene ajustes de pago rechazados por la política.');
    }
    if (order.unsettledPaymentCount > 0 && policy.unsettledPayments === 'reject') {
      return invalid('El pedido contiene pagos no resueltos rechazados por la política.');
    }
    const hasPaymentEvidence = order.paymentCount > 0 || order.storedValueCaptureCount > 0;
    const hasCapture = order.captureCount > 0 || (includeStoredValue && order.storedValueCaptureCount > 0);
    if (policy.orderEligibility === 'successful_capture') {
      if (!hasPaymentEvidence) {
        count = missing('orders.count');
        total = null;
        missingActivity = true;
        continue;
      }
      if (!hasCapture) continue;
    }
    if (count !== null) count = add(count, 1, 'orders.count');

    let activity: string | null;
    if (policy.activityBasis === 'order_created') {
      activity = order.createdAt;
    } else if (!hasPaymentEvidence) {
      activity = missing('orders.days_since_last');
      missingActivity = true;
    } else if (!hasCapture) {
      // La ausencia acreditada de capturas no inventa una fecha ni oculta otras.
      activity = null;
    } else {
      const dates = policy.activityBasis === 'first_successful_capture'
        ? [order.firstCaptureAt, includeStoredValue ? order.firstStoredValueCaptureAt : null]
        : [order.lastCaptureAt, includeStoredValue ? order.lastStoredValueCaptureAt : null];
      const available = dates.filter((date): date is string => date !== null).sort();
      activity = policy.activityBasis === 'first_successful_capture' ? available[0]! : available[available.length - 1]!;
    }
    if (activity !== null && (lastActivity === null || activity > lastActivity)) lastActivity = activity;

    let amount: number | null;
    if (!hasPaymentEvidence && (policy.amountBasis === 'captured_payments' || policy.refunds === 'subtract')) {
      amount = missing('orders.total_spent_cents');
    } else {
      const captured = policy.amountBasis === 'original_order_total' ? order.originalTotalCents
        : policy.amountBasis === 'current_order_total' ? order.currentTotalCents
          : add(order.capturedCents, includeStoredValue ? order.storedValueCapturedCents : 0, 'capturedCents');
      const refunded = policy.refunds === 'ignore' ? 0
        : add(order.refundedCents, includeStoredValue ? order.storedValueRefundedCents : 0, 'refundedCents');
      amount = segmentInteger(captured - refunded, 0, 'orders.total_spent_cents');
    }
    total = total === null || amount === null ? null : add(total, amount, 'orders.total_spent_cents');
  }
  return createCustomerSegmentFacts({
    'customer.age_days': evidence.createdAt === null ? null : daysSince(evidence.createdAt, capturedMs, policy),
    'orders.count': count,
    'orders.days_since_last': missingActivity || lastActivity === null ? null : daysSince(lastActivity, capturedMs, policy),
    'orders.total_spent_cents': total,
  });
}
