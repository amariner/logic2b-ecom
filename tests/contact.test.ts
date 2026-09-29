import { describe, expect, it } from 'vitest';
import {
  AGENCY_EMAIL,
  AGENCY_WHATSAPP,
  agencyWhatsappHref,
  buildContactEmail,
  buildLeadNotificationRequest,
  contactSchema,
  LEADS_EMAIL_FROM,
  leadNotificationConfig,
} from '../src/lib/contact';

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

describe('agencyWhatsappHref', () => {
  it('usa el número central y conserva la ruta de origen en el mensaje', () => {
    const href = agencyWhatsappHref('/demo/tiendas/arce');
    expect(href).toContain(`https://wa.me/${AGENCY_WHATSAPP}?text=`);
    expect(decodeURIComponent(href ?? '')).toContain('/demo/tiendas/arce.');
    expect(decodeURIComponent(href ?? '')).toContain('Logic2B Ecommerce');
  });

  it('normaliza orígenes sin barra inicial', () => {
    expect(decodeURIComponent(agencyWhatsappHref('precios') ?? '')).toContain('/precios.');
  });

  it('no transmite query ni hash del recorrido a WhatsApp', () => {
    const href = decodeURIComponent(
      agencyWhatsappHref('/demo/gracias?session_id=privado#pedido') ?? '',
    );
    expect(href).toContain('/demo/gracias.');
    expect(href).not.toContain('session_id');
    expect(href).not.toContain('privado');
    expect(href).not.toContain('#pedido');
  });
});

describe('aviso de leads', () => {
  it('sin clave no hay aviso: el lead queda guardado y pendiente', () => {
    expect(leadNotificationConfig({})).toBeNull();
    expect(leadNotificationConfig({ LEADS_RESEND_API_KEY: '  ' })).toBeNull();
  });

  it('la clave propia de leads manda sobre la de la tienda', () => {
    expect(leadNotificationConfig({ LEADS_RESEND_API_KEY: 're_leads', RESEND_API_KEY: 're_shop' })?.apiKey).toBe('re_leads');
    expect(leadNotificationConfig({ RESEND_API_KEY: 're_shop' })?.apiKey).toBe('re_shop');
  });

  it('el remitente es la agencia, nunca el dominio ficticio de la tienda demo', () => {
    expect(leadNotificationConfig({ LEADS_RESEND_API_KEY: 'k' })?.from).toBe(LEADS_EMAIL_FROM);
    expect(LEADS_EMAIL_FROM).toContain(AGENCY_EMAIL);
    expect(leadNotificationConfig({ LEADS_RESEND_API_KEY: 'k', LEADS_EMAIL_FROM: 'Avisos <avisos@logic2b.com>' })?.from).toBe('Avisos <avisos@logic2b.com>');
  });

  it('la petición va a la agencia y responder contesta al cliente', () => {
    const { url, init } = buildLeadNotificationRequest(valid, { apiKey: 're_x', from: LEADS_EMAIL_FROM });
    const body = JSON.parse(init.body) as { from: string; to: string[]; reply_to: string; subject: string };
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers.authorization).toBe('Bearer re_x');
    expect(body.to).toEqual([AGENCY_EMAIL]);
    expect(body.reply_to).toBe(valid.email);
    expect(body.subject).toContain(valid.name);
  });
});
