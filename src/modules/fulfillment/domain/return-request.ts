export const RETURN_STATUSES = [
  'requested', 'authorized', 'in_transit', 'received', 'inspected',
  'resolved', 'rejected', 'cancelled',
] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];
export const RETURN_REASONS = ['damaged', 'defective', 'wrong_item', 'not_as_expected', 'other'] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];
export const RETURN_INSPECTIONS = ['restock', 'damaged', 'reject'] as const;
export type ReturnInspection = (typeof RETURN_INSPECTIONS)[number];
export const RETURN_RESOLUTIONS = ['refund', 'exchange', 'reject'] as const;
export type ReturnResolution = (typeof RETURN_RESOLUTIONS)[number];

export const RETURN_POLICY = Object.freeze({ eligibilityDays: 30, maxLines: 100 });

export type ReturnEligibilityLine = Readonly<{
  orderItemId: number;
  variantId: number;
  unitAmountCents: number;
  deliveredQuantity: number;
  claimedQuantity: number;
  lastDeliveredAt: string;
}>;

export type ReturnRequestLineDraft = Readonly<{ orderItemId: number; quantity: number }>;
export type ReturnReceiptDraft = Readonly<{
  returnLineId: string;
  receivedQuantity: number;
}>;
export type ReturnInspectionDraft = Readonly<{
  returnLineId: string;
  inspection: ReturnInspection;
  resolution: ReturnResolution;
  exchangeVariantId?: number | undefined;
}>;

const transitions: Readonly<Record<ReturnStatus, readonly ReturnStatus[]>> = Object.freeze({
  requested: ['authorized', 'rejected', 'cancelled'],
  authorized: ['in_transit', 'received', 'cancelled'],
  in_transit: ['received', 'cancelled'],
  received: ['inspected'],
  inspected: ['resolved', 'rejected'],
  resolved: [], rejected: [], cancelled: [],
});

function positive(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${label} debe ser un entero positivo.`);
}

export function assertReturnTransition(from: ReturnStatus, to: ReturnStatus): void {
  if (!transitions[from]?.includes(to)) throw new RangeError(`Transición RMA inválida: ${from} → ${to}.`);
}

export function planReturnRequest(input: Readonly<{
  now: string;
  lines: readonly ReturnRequestLineDraft[];
  eligibility: readonly ReturnEligibilityLine[];
}>): readonly Readonly<ReturnEligibilityLine & { requestedQuantity: number }>[] {
  if (input.lines.length < 1 || input.lines.length > RETURN_POLICY.maxLines) {
    throw new RangeError(`El RMA exige entre 1 y ${RETURN_POLICY.maxLines} líneas.`);
  }
  const observedAt = Date.parse(input.now);
  if (!Number.isFinite(observedAt)) throw new RangeError('Fecha de elegibilidad inválida.');
  const source = new Map(input.eligibility.map((line) => [line.orderItemId, line]));
  const seen = new Set<number>();
  return Object.freeze(input.lines.map((draft) => {
    positive(draft.orderItemId, 'orderItemId'); positive(draft.quantity, 'quantity');
    if (seen.has(draft.orderItemId)) throw new RangeError('Una línea de pedido no puede repetirse.');
    seen.add(draft.orderItemId);
    const line = source.get(draft.orderItemId);
    if (!line) throw new RangeError('La línea no tiene unidades entregadas elegibles.');
    const age = observedAt - Date.parse(line.lastDeliveredAt);
    if (!Number.isFinite(age) || age < 0 || age > RETURN_POLICY.eligibilityDays * 86_400_000) {
      throw new RangeError('La línea está fuera de la ventana de devolución.');
    }
    if (draft.quantity > line.deliveredQuantity - line.claimedQuantity) {
      throw new RangeError('La cantidad supera las unidades entregadas aún no reclamadas.');
    }
    return Object.freeze({ ...line, requestedQuantity: draft.quantity });
  }));
}

export function assertReturnInspection(input: Readonly<{
  expectedLines: readonly Readonly<{ id: string; receivedQuantity: number }>[];
  lines: readonly ReturnInspectionDraft[];
}>): void {
  if (input.lines.length !== input.expectedLines.length) throw new RangeError('La inspección debe resolver todas las líneas.');
  const expected = new Map(input.expectedLines.map((line) => [line.id, line.receivedQuantity]));
  const seen = new Set<string>();
  const acceptedResolutions = new Set<ReturnResolution>();
  for (const line of input.lines) {
    if (seen.has(line.returnLineId)) throw new RangeError('Una línea RMA no puede repetirse.');
    seen.add(line.returnLineId);
    const received = expected.get(line.returnLineId);
    if (received === undefined) throw new RangeError('La línea no pertenece al RMA.');
    positive(received, 'receivedQuantity');
    if (line.resolution === 'exchange') positive(line.exchangeVariantId ?? 0, 'exchangeVariantId');
    if (line.resolution !== 'exchange' && line.exchangeVariantId !== undefined) {
      throw new RangeError('Solo un cambio admite exchangeVariantId.');
    }
    if (line.inspection === 'reject' && line.resolution !== 'reject') {
      throw new RangeError('Una inspección rechazada solo admite resolución rechazada.');
    }
    if (line.inspection !== 'reject' && line.resolution === 'reject') {
      throw new RangeError('Un artículo aceptado no puede resolverse como rechazo.');
    }
    if (line.resolution !== 'reject') acceptedResolutions.add(line.resolution);
  }
  if (acceptedResolutions.size > 1) {
    throw new RangeError('Un RMA no puede mezclar reembolso y cambio en una misma resolución.');
  }
}

export function assertReturnReceipt(input: Readonly<{
  expectedLines: readonly Readonly<{ id: string; requestedQuantity: number }>[];
  lines: readonly ReturnReceiptDraft[];
}>): void {
  if (input.lines.length !== input.expectedLines.length) {
    throw new RangeError('La recepción debe declarar todas las líneas.');
  }
  const expected = new Map(input.expectedLines.map((line) => [line.id, line.requestedQuantity]));
  const seen = new Set<string>();
  for (const line of input.lines) {
    if (seen.has(line.returnLineId)) throw new RangeError('Una línea RMA no puede repetirse.');
    seen.add(line.returnLineId);
    const requested = expected.get(line.returnLineId);
    if (requested === undefined) throw new RangeError('La línea no pertenece al RMA.');
    positive(line.receivedQuantity, 'receivedQuantity');
    if (line.receivedQuantity > requested) {
      throw new RangeError('La recepción supera la cantidad solicitada.');
    }
  }
}
