import { describe, expect, it } from 'vitest';
import { isSimulatedPayment } from '../src/lib/payment-mode';
import { buildPaidMutation, type OrderForPayment, type OrderItemForPayment } from '../src/lib/payment-transition';

describe('isSimulatedPayment', () => {
  it('simula cuando no hay clave de Stripe', () => {
    expect(isSimulatedPayment({})).toBe(true);
    expect(isSimulatedPayment({ STRIPE_SECRET_KEY: '' })).toBe(true);
    expect(isSimulatedPayment({ STRIPE_SECRET_KEY: '   ' })).toBe(true);
  });

  it('usa Stripe real cuando la clave está configurada', () => {
    expect(isSimulatedPayment({ STRIPE_SECRET_KEY: 'sk_test_123' })).toBe(false);
  });
});

describe('buildPaidMutation con nota de pago simulado', () => {
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
    { product_id: 1, name_snapshot: 'AOVE Picual 500 ml', unit_price_cents: 500, qty: 2 },
  ];

  it('por defecto marca el pago como confirmado por Stripe', () => {
    expect(buildPaidMutation(order, items, 'pi_1')?.event.note).toBe('Pago confirmado por Stripe');
  });

  it('acepta una nota personalizada para el pago simulado', () => {
    const mutation = buildPaidMutation(order, items, 'sim_pi_1', 'Pago confirmado (simulado)');
    expect(mutation?.event.note).toBe('Pago confirmado (simulado)');
    expect(mutation?.event.to_status).toBe('paid');
    expect(mutation?.stockDecrements).toEqual([{ product_id: 1, qty: 2 }]);
    expect(mutation?.emails).toHaveLength(2);
  });
});
