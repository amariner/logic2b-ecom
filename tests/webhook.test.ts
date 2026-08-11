import { describe, expect, it } from 'vitest';
import { createEventFactory, type EventClock, type EventIdSource } from '../src/shared-kernel/events';
import { orderTimelineEntry } from '../src/modules/orders/domain/order-events';
import {
  buildPaidMutation,
  stockAfterDecrement,
  type OrderForPayment,
  type OrderItemForPayment,
} from '../src/modules/orders/domain/payment-transition';

function testFactory() {
  let tick = 0;
  const clock: EventClock = { now: () => new Date(Date.parse('2026-08-06T10:00:00.000Z') + tick * 1000) };
  const ids: EventIdSource = {
    next: () => {
      tick += 1;
      return `evt_${tick}`;
    },
  };
  return createEventFactory({ clock, ids });
}

const stripeContext = { emit: testFactory(), source: 'stripe' } as const;

const order: OrderForPayment = {
  id: 7,
  order_number: 'BM-260717-TEST',
  status: 'pending',
  email: 'clienta@example.com',
  customer_name: 'Marta Ferrer',
  subtotal_cents: 3040,
  shipping_cents: 490,
  total_cents: 3530,
  currency: 'EUR',
};

const items: OrderItemForPayment[] = [
  { product_id: 1, variant_id: 1, is_default: true, name_snapshot: 'AOVE Picual 500 ml', unit_price_cents: 890, qty: 2 },
  { product_id: 12, variant_id: 12, is_default: true, name_snapshot: 'Fuet artesà 200 g', unit_price_cents: 420, qty: 3 },
];

describe('buildPaidMutation (idempotencia del webhook)', () => {
  it('pedido pending → mutación completa con su hecho de dominio', () => {
    const mutation = buildPaidMutation(order, items, 'pi_123', stripeContext);
    expect(mutation).not.toBeNull();
    expect(mutation?.orderId).toBe(7);
    expect(mutation?.paymentIntent).toBe('pi_123');
    expect(mutation?.stockDecrements).toEqual([
      { product_id: 1, variant_id: 1, is_default: true, qty: 2 },
      { product_id: 12, variant_id: 12, is_default: true, qty: 3 },
    ]);
    expect(mutation?.event.type).toBe('orders.order_paid');
    expect(mutation?.event.payload).toMatchObject({ payment_intent: 'pi_123', source: 'stripe' });
  });

  it('la fila del timeline sigue siendo la de siempre', () => {
    const mutation = buildPaidMutation(order, items, 'pi_123', stripeContext);
    expect(mutation && orderTimelineEntry(mutation.event)).toEqual({
      from_status: 'pending',
      to_status: 'paid',
      note: 'Pago confirmado por Stripe',
    });
  });

  it('pedido ya pagado (reintento de Stripe) → null, sin efectos', () => {
    expect(buildPaidMutation({ ...order, status: 'paid' }, items, 'pi_123', stripeContext)).toBeNull();
  });

  it('pedido en cualquier estado no-pending → null', () => {
    for (const status of ['shipped', 'delivered', 'cancelled']) {
      expect(buildPaidMutation({ ...order, status }, items, null, stripeContext)).toBeNull();
    }
  });

  it('pedido desconocido (sesión de otro entorno) → null', () => {
    expect(buildPaidMutation(null, [], 'pi_123', stripeContext)).toBeNull();
  });

  it('el pedido ya no construye emails: solo declara que se ha cobrado', () => {
    const mutation = buildPaidMutation(order, items, 'pi_123', stripeContext);
    expect(mutation && Object.keys(mutation).toSorted()).toEqual([
      'event',
      'orderId',
      'paymentIntent',
      'stockDecrements',
    ]);
    expect(JSON.stringify(mutation)).not.toContain('body_html');
  });

  it('propaga la causación del evento del proveedor', () => {
    const mutation = buildPaidMutation(order, items, 'pi_123', { ...stripeContext, causationId: 'evt_stripe_9' });
    expect(mutation?.event.causation_id).toBe('evt_stripe_9');
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
