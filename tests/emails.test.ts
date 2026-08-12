import { describe, expect, it } from 'vitest';
import {
  fulfillmentShippedEmail,
  orderPartiallyRefundedEmail,
  orderShippedEmail,
  type OrderEmailData,
} from '../src/lib/emails';

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

describe('fulfillmentShippedEmail', () => {
  it('describe solo las unidades de esta salida y el pendiente', () => {
    const email = fulfillmentShippedEmail(
      data,
      { carrier: 'GLS', number: 'GLS-2' },
      [{ name_snapshot: 'AOVE Picual 500 ml', qty: 1 }],
      1,
    );
    expect(email.body_html).toContain('AOVE Picual 500 ml × 1');
    expect(email.body_html).toContain('Queda 1 unidad pendiente');
    expect(email.body_html).not.toContain('AOVE Picual 500 ml × 2');
    expect(email.body_html).not.toContain('Total');
  });

  it('escapa tracking y nombre de una línea antes de generar HTML', () => {
    const email = fulfillmentShippedEmail(
      data,
      { carrier: '<b>GLS</b>', number: '<script>x</script>' },
      [{ name_snapshot: '<img src=x onerror=x>', qty: 1 }],
      0,
    );
    expect(email.body_html).not.toContain('<script>');
    expect(email.body_html).not.toContain('<img src=x');
    expect(email.body_html).toContain('&lt;b&gt;GLS&lt;/b&gt;');
    expect(email.body_html).toContain('&lt;img src=x onerror=x&gt;');
    expect(email.body_html).toContain('todas las unidades pendientes');
  });
});

describe('orderPartiallyRefundedEmail', () => {
  it('muestra las unidades abonadas y distingue si el envío forma parte del abono', () => {
    const withoutShipping = orderPartiallyRefundedEmail(data, {
      total_cents: 890,
      shipping_cents: 0,
      items: [{ name_snapshot: 'AOVE Picual 500 ml', qty: 1 }],
    });
    expect(withoutShipping.body_html).toContain('AOVE Picual 500 ml × 1');
    expect(withoutShipping.body_html).toContain('no incluye los gastos de envío');

    const withShipping = orderPartiallyRefundedEmail(data, {
      total_cents: 1380,
      shipping_cents: 490,
      items: [{ name_snapshot: 'AOVE Picual 500 ml', qty: 1 }],
    });
    expect(withShipping.body_html).toContain('incluye 4,90');
  });

  it('escapa el nombre de la línea cancelada', () => {
    const email = orderPartiallyRefundedEmail(data, {
      total_cents: 890,
      shipping_cents: 0,
      items: [{ name_snapshot: '<script>alert(1)</script>', qty: 1 }],
    });
    expect(email.body_html).not.toContain('<script>');
    expect(email.body_html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});
