import { describe, expect, it } from 'vitest';
import { orderShippedEmail, type OrderEmailData } from '../src/lib/emails';

const data: OrderEmailData = {
  order_number: 'BM-260717-TEST',
  customer_name: 'Marta Ferrer',
  email: 'clienta@example.com',
  subtotal_cents: 1780,
  shipping_cents: 490,
  total_cents: 2270,
  items: [{ name_snapshot: 'AOVE Picual 500 ml', unit_price_cents: 890, qty: 2 }],
};

describe('orderShippedEmail', () => {
  it('incluye transportista y nº de seguimiento en el HTML', () => {
    const email = orderShippedEmail(data, { carrier: 'SEUR', number: '1234567890' });
    expect(email.body_html).toContain('SEUR');
    expect(email.body_html).toContain('1234567890');
  });

  it('escapa transportista y nº de seguimiento maliciosos (campos editables por el comercio, sin restricción de HTML en zod)', () => {
    const email = orderShippedEmail(data, {
      carrier: '<img src=x onerror=alert(1)>SEUR',
      number: '</strong><script>alert(1)</script>',
    });
    expect(email.body_html).not.toContain('<img src=x onerror');
    expect(email.body_html).not.toContain('<script>');
    expect(email.body_html).toContain('&lt;img src=x onerror=alert(1)&gt;SEUR');
    expect(email.body_html).toContain('&lt;/strong&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});
