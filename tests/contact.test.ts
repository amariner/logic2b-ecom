import { describe, expect, it } from 'vitest';
import { AGENCY_EMAIL, buildContactEmail, contactSchema } from '../src/lib/contact';

const valid = {
  name: 'Marta Ferrer',
  email: 'marta@ejemplo.com',
  needs: 'Vendo aceite y quiero dejar Shopify.',
};

describe('contactSchema', () => {
  it('acepta el mínimo: nombre, email y necesidad', () => {
    expect(contactSchema.safeParse(valid).success).toBe(true);
  });

  it('rechaza un email inválido', () => {
    expect(contactSchema.safeParse({ ...valid, email: 'marta' }).success).toBe(false);
  });

  it('rechaza una necesidad demasiado corta para ser útil', () => {
    expect(contactSchema.safeParse({ ...valid, needs: 'hola' }).success).toBe(false);
  });

  it('acepta los opcionales vacíos, que es como los manda un formulario HTML', () => {
    const parsed = contactSchema.safeParse({ ...valid, phone: '', sells: '', catalog: '', source: '' });
    expect(parsed.success).toBe(true);
  });

  it('rechaza un tamaño de catálogo que no está en la lista', () => {
    expect(contactSchema.safeParse({ ...valid, catalog: 'un-millon' }).success).toBe(false);
  });

  it('deja pasar la trampa anti-bot vacía y rechaza la rellena', () => {
    expect(contactSchema.safeParse({ ...valid, website: '' }).success).toBe(true);
    expect(contactSchema.safeParse({ ...valid, website: 'http://spam' }).success).toBe(false);
  });
});

describe('buildContactEmail', () => {
  it('va a la agencia, no a la tienda de la demo', () => {
    expect(buildContactEmail(valid).to_addr).toBe(AGENCY_EMAIL);
  });

  it('escapa lo que escribe el visitante: nada de HTML inyectado', () => {
    const email = buildContactEmail({
      ...valid,
      name: '<script>alert(1)</script>',
      needs: 'Quiero <b>negrita</b> y "comillas".',
    });
    expect(email.body_html).not.toContain('<script>');
    expect(email.body_html).toContain('&lt;script&gt;');
    expect(email.body_html).not.toContain('<b>negrita</b>');
  });

  it('marca «sin indicar» los opcionales que no llegan', () => {
    expect(buildContactEmail(valid).body_html).toContain('sin indicar');
  });

  it('traduce el tamaño de catálogo a su etiqueta legible', () => {
    expect(buildContactEmail({ ...valid, catalog: '50-200' }).body_html).toContain('Entre 50 y 200');
  });
});
