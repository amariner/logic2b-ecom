import { describe, expect, it } from 'vitest';
import { isSimulatedPayment } from '../src/lib/payment-mode';
import { orderTimelineEntry } from '../src/modules/orders/domain/order-events';
import {
  buildPaidMutation,
  type OrderForPayment,
  type OrderItemForPayment,
} from '../src/modules/orders/domain/payment-transition';
import { emitPlatformEvent } from '../src/composition/event-context';

describe('isSimulatedPayment', () => {
  it('simula cuando no hay clave de Stripe', () => {
    expect(isSimulatedPayment({})).toBe(true);
    expect(isSimulatedPayment({ STRIPE_SECRET_KEY: '' })).toBe(true);
    expect(isSimulatedPayment({ STRIPE_SECRET_KEY: '   ' })).toBe(true);
  });

  it('sigue simulando si falta la clave del webhook (config a medias)', () => {
    // Solo la secret key: el checkout cobraría de verdad pero el webhook (que
    // exige STRIPE_WEBHOOK_SECRET) respondería 503 y el pedido nunca se cumpliría.
    expect(isSimulatedPayment({ STRIPE_SECRET_KEY: 'sk_test_123' })).toBe(true);
    expect(isSimulatedPayment({ STRIPE_SECRET_KEY: 'sk_test_123', STRIPE_WEBHOOK_SECRET: '' })).toBe(true);
    expect(isSimulatedPayment({ STRIPE_SECRET_KEY: 'sk_test_123', STRIPE_WEBHOOK_SECRET: '  ' })).toBe(true);
    // Solo el webhook secret, sin secret key: también simulado.
    expect(isSimulatedPayment({ STRIPE_WEBHOOK_SECRET: 'whsec_123' })).toBe(true);
  });

  it('usa Stripe real solo cuando ambas claves están configuradas', () => {
    expect(isSimulatedPayment({ STRIPE_SECRET_KEY: 'sk_test_123', STRIPE_WEBHOOK_SECRET: 'whsec_123' })).toBe(false);
  });
});

describe('buildPaidMutation según el origen del cobro', () => {
  const order: OrderForPayment = {
    id: 3,
    order_number: 'BM-260718-SIMU',
    status: 'pending',
    email: 'clienta@example.com',
    customer_name: 'Marta Ferrer',
    subtotal_cents: 1000,
    shipping_cents: 490,
    total_cents: 1490,
  };
  const items: OrderItemForPayment[] = [
    { product_id: 1, variant_id: 1, is_default: true, name_snapshot: 'AOVE Picual 500 ml', unit_price_cents: 500, qty: 2 },
  ];

  it('el cobro por la pasarela lo atribuye a Stripe', () => {
    const mutation = buildPaidMutation(order, items, 'pi_1', { emit: emitPlatformEvent, source: 'stripe' });
    expect(mutation?.event.payload.source).toBe('stripe');
    expect(mutation && orderTimelineEntry(mutation.event).note).toBe('Pago confirmado por Stripe');
  });

  it('el modo simulado produce el mismo hecho, marcado como tal', () => {
    const mutation = buildPaidMutation(order, items, 'sim_pi_1', { emit: emitPlatformEvent, source: 'simulated' });
    expect(mutation?.event.payload.to_status).toBe('paid');
    expect(mutation && orderTimelineEntry(mutation.event).note).toBe('Pago confirmado (simulado)');
    expect(mutation?.stockDecrements).toEqual([
      { product_id: 1, variant_id: 1, is_default: true, qty: 2 },
    ]);
  });
});
