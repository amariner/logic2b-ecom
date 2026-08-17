import { describe, expect, it } from 'vitest';
import { orderConfirmationEmail } from '../src/lib/emails';

describe('comunicación de preventa R4.9', () => {
  it('la confirmación distingue disponibilidad de fecha de envío', () => {
    const message = orderConfirmationEmail({
      order_number: 'PRE-EMAIL', customer_name: 'Cliente', email: 'client@example.test',
      subtotal_cents: 2500, shipping_cents: 0, total_cents: 2500,
      items: [{ order_item_id: 1, name_snapshot: 'Producto futuro', unit_price_cents: 2500,
        qty: 1, preorder: { deferred_quantity: 1, public_message: 'Ventana configurada',
          availability_starts_at: '2026-09-01T00:00:00.000Z',
          availability_ends_at: '2026-09-15T23:59:59.000Z' } }],
    });
    expect(message.body_html).toContain('1 ud. diferida');
    expect(message.body_html).toContain('Ventana configurada');
    expect(message.body_html).toContain('disponibilidad, no fecha de envío');
  });
});
