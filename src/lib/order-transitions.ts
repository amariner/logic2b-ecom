/**
 * Transiciones de estado de pedidos desde el panel. Lógica PURA y testeada;
 * el endpoint PATCH aplica el resultado en D1.
 */

export const ORDER_STATUSES = ['pending', 'paid', 'shipped', 'delivered', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Transiciones que puede hacer el comercio a mano desde el panel. */
const ALLOWED: Record<OrderStatus, OrderStatus[]> = {
  pending: ['cancelled'], // el paso a paid lo hace SOLO el webhook
  paid: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

export function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value);
}

export type TransitionRequest = {
  to: OrderStatus;
  tracking_carrier?: string | undefined;
  tracking_number?: string | undefined;
};

export type TransitionDecision =
  | { ok: true; note: string; sendShippedEmail: boolean; restoreStock: boolean }
  | { ok: false; error: string };

export function decideTransition(from: OrderStatus, req: TransitionRequest): TransitionDecision {
  if (!ALLOWED[from].includes(req.to)) {
    return { ok: false, error: `No se puede pasar de «${from}» a «${req.to}»` };
  }
  if (req.to === 'shipped') {
    if (!req.tracking_carrier?.trim() || !req.tracking_number?.trim()) {
      return { ok: false, error: 'Para marcar enviado hacen falta transportista y nº de seguimiento' };
    }
    return {
      ok: true,
      note: `Enviado con ${req.tracking_carrier.trim()} (${req.tracking_number.trim()})`,
      sendShippedEmail: true,
      restoreStock: false,
    };
  }
  const notes: Partial<Record<OrderStatus, string>> = {
    delivered: 'Marcado como entregado',
    cancelled: 'Cancelado desde el panel',
  };
  // El stock solo se decrementó al pasar a 'paid' (webhook): cancelar un pedido
  // pagado debe devolverlo. Cancelar desde 'pending' no toca stock (nunca se descontó).
  return {
    ok: true,
    note: notes[req.to] ?? `Estado cambiado a ${req.to}`,
    sendShippedEmail: false,
    restoreStock: from === 'paid' && req.to === 'cancelled',
  };
}
