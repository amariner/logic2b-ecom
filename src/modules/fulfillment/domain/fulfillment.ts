export const FULFILLMENT_STATUSES = [
  'pending',
  'ready',
  'shipped',
  'delivered',
  'cancelled',
] as const;

export type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number];

export type FulfillmentTracking = Readonly<{
  carrier: string;
  number: string;
}>;

export type FulfillmentLineBalance = Readonly<{
  order_item_id: number;
  ordered_quantity: number;
  cancelled_quantity: number;
  fulfilled_quantity: number;
}>;

export type FulfillmentAllocation = Readonly<{
  order_item_id: number;
  quantity: number;
}>;

export const FULFILLMENT_POLICY = Object.freeze({
  maxCarrierLength: 60,
  maxTrackingNumberLength: 80,
  maxIdempotencyKeyLength: 200,
});

const FULFILLMENT_TRANSITIONS: Readonly<Record<FulfillmentStatus, readonly FulfillmentStatus[]>> = {
  pending: ['ready', 'shipped', 'cancelled'],
  ready: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${field} debe ser un entero seguro positivo.`);
  }
}

function assertNonNegativeInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${field} debe ser un entero seguro no negativo.`);
  }
}

function normalizedText(value: string, field: string, maxLength: number): string {
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > maxLength) {
    throw new RangeError(`${field} debe medir entre 1 y ${maxLength}.`);
  }
  return normalized;
}

export function normalizeFulfillmentTracking(tracking: FulfillmentTracking): FulfillmentTracking {
  return Object.freeze({
    carrier: normalizedText(tracking.carrier, 'carrier', FULFILLMENT_POLICY.maxCarrierLength),
    number: normalizedText(tracking.number, 'tracking_number', FULFILLMENT_POLICY.maxTrackingNumberLength),
  });
}

export function normalizeFulfillmentIdempotencyKey(idempotencyKey: string): string {
  return normalizedText(
    idempotencyKey,
    'idempotency_key',
    FULFILLMENT_POLICY.maxIdempotencyKeyLength,
  );
}

export function canTransitionFulfillment(from: FulfillmentStatus, to: FulfillmentStatus): boolean {
  return FULFILLMENT_TRANSITIONS[from].includes(to);
}

export function trackingRequiredForFulfillment(status: FulfillmentStatus): boolean {
  return status === 'shipped' || status === 'delivered';
}

export function remainingFulfillableQuantity(line: FulfillmentLineBalance): number {
  assertPositiveInteger(line.order_item_id, 'order_item_id');
  assertPositiveInteger(line.ordered_quantity, 'ordered_quantity');
  assertNonNegativeInteger(line.cancelled_quantity, 'cancelled_quantity');
  assertNonNegativeInteger(line.fulfilled_quantity, 'fulfilled_quantity');

  if (line.cancelled_quantity > line.ordered_quantity) {
    throw new RangeError('cancelled_quantity no puede superar ordered_quantity.');
  }
  const netQuantity = line.ordered_quantity - line.cancelled_quantity;
  if (line.fulfilled_quantity > netQuantity) {
    throw new RangeError('fulfilled_quantity no puede superar la cantidad neta de la línea.');
  }
  return netQuantity - line.fulfilled_quantity;
}

/**
 * R2.11 convierte el envío total legacy en una asignación explícita. R2.12
 * reutilizará el mismo saldo para aceptar cantidades parciales solicitadas.
 */
export function planOutstandingFulfillment(
  lines: readonly FulfillmentLineBalance[],
): readonly FulfillmentAllocation[] {
  if (lines.length === 0) throw new RangeError('un fulfillment exige al menos una línea de pedido.');
  const seen = new Set<number>();
  const allocations: FulfillmentAllocation[] = [];
  for (const line of lines) {
    if (seen.has(line.order_item_id)) throw new RangeError('order_item_id no puede repetirse.');
    seen.add(line.order_item_id);
    const quantity = remainingFulfillableQuantity(line);
    if (quantity > 0) allocations.push(Object.freeze({ order_item_id: line.order_item_id, quantity }));
  }
  if (allocations.length === 0) throw new RangeError('el pedido no conserva cantidades pendientes de fulfillment.');
  return Object.freeze(allocations);
}

/** Selección parcial autoritativa: ids y límites se contrastan con el saldo D1. */
export function planRequestedFulfillment(
  lines: readonly FulfillmentLineBalance[],
  requested: readonly FulfillmentAllocation[],
): readonly FulfillmentAllocation[] {
  if (requested.length === 0) throw new RangeError('selecciona al menos una línea para el envío.');
  const balances = new Map(lines.map((line) => [line.order_item_id, line] as const));
  const seen = new Set<number>();
  return Object.freeze(requested.map((allocation) => {
    assertPositiveInteger(allocation.order_item_id, 'order_item_id');
    assertPositiveInteger(allocation.quantity, 'quantity');
    if (seen.has(allocation.order_item_id)) throw new RangeError('order_item_id no puede repetirse.');
    seen.add(allocation.order_item_id);
    const balance = balances.get(allocation.order_item_id);
    if (!balance) throw new RangeError('la línea no pertenece al pedido.');
    const remaining = remainingFulfillableQuantity(balance);
    if (allocation.quantity > remaining) {
      throw new RangeError('quantity no puede superar la cantidad pendiente de la línea.');
    }
    return Object.freeze({
      order_item_id: allocation.order_item_id,
      quantity: allocation.quantity,
    });
  }));
}
