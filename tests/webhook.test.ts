import { describe, expect, it } from 'vitest';
import {
  buildPaidMutation,
  stockAfterDecrement,
  type OrderForPayment,
  type OrderItemForPayment,
} from '../src/lib/payment-transition';

const order: OrderForPayment = {
  id: 7,
  order_number: 'BM-260717-TEST',
  status: 'pending',
  email: 'clienta@example.com',
  customer_name: 'Marta Ferrer',
  subtotal_cents: 3040,
  shipping_cents: 490,
  total_cents: 3530,
};

const items: OrderItemForPayment[] = [
  { product_id: 1, name_snapshot: 'AOVE Picual 500 ml', unit_price_cents: 890, qty: 2 },
  { product_id: 12, name_snapshot: 'Fuet artesà 200 g', unit_price_cents: 420, qty: 3 },
];

describe('buildPaidMutation (idempotencia del webhook)', () => {
  it('pedido pending → mutación completa', () => {
    const mutation = buildPaidMutation(order, items, 'pi_123');
    expect(mutation).not.toBeNull();
    expect(mutation?.orderId).toBe(7);
    expect(mutation?.paymentIntent).toBe('pi_123');
    expect(mutation?.stockDecrements).toEqual([
      { product_id: 1, qty: 2 },
      { product_id: 12, qty: 3 },
    ]);
    expect(mutation?.event).toEqual({ from_status: 'pending', to_status: 'paid', note: 'Pago confirmado por Stripe' });
  });

  it('pedido ya pagado (reintento de Stripe) → null, sin efectos', () => {
    expect(buildPaidMutation({ ...order, status: 'paid' }, items, 'pi_123')).toBeNull();
  });

  it('pedido en cualquier estado no-pending → null', () => {
    for (const status of ['shipped', 'delivered', 'cancelled']) {
      expect(buildPaidMutation({ ...order, status }, items, null)).toBeNull();
    }
  });

  it('pedido desconocido (sesión de otro entorno) → null', () => {
    expect(buildPaidMutation(null, [], 'pi_123')).toBeNull();
  });

  it('el email de confirmación lleva número de pedido, items y total', () => {
    const mutation = buildPaidMutation(order, items, null);
    expect(mutation?.email.to_addr).toBe('clienta@example.com');
    expect(mutation?.email.subject).toContain('BM-260717-TEST');
    expect(mutation?.email.body_html).toContain('AOVE Picual 500 ml × 2');
    expect(mutation?.email.body_html).toContain('35,30');
  });
});

describe('stockAfterDecrement', () => {
  it('decrementa con normalidad', () => {
    expect(stockAfterDecrement(10, 3)).toBe(7);
  });

  it('nunca baja de cero (sobreventa en la ventana pending→paid)', () => {
    expect(stockAfterDecrement(1, 3)).toBe(0);
    expect(stockAfterDecrement(0, 1)).toBe(0);
  });
});
