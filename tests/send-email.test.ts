import { describe, expect, it } from 'vitest';
import { buildResendRequest, shouldDeliver } from '../src/lib/send-email';
import { shopConfig } from '../shop.config';

describe('shouldDeliver', () => {
  it('nunca envía en modo demo, aunque haya clave', () => {
    expect(shouldDeliver({ DEMO_MODE: 'true', RESEND_API_KEY: 're_abc' })).toBe(false);
  });

  it('no envía sin clave de Resend', () => {
    expect(shouldDeliver({ DEMO_MODE: 'false' })).toBe(false);
    expect(shouldDeliver({ DEMO_MODE: 'false', RESEND_API_KEY: '' })).toBe(false);
  });

  it('envía solo fuera de demo y con clave', () => {
    expect(shouldDeliver({ DEMO_MODE: 'false', RESEND_API_KEY: 're_abc' })).toBe(true);
  });
});

describe('buildResendRequest', () => {
  const message = {
    to_addr: 'cliente@example.com',
    subject: 'Pedido BM-260718-ABCD confirmado',
    body_html: '<p>Hola</p>',
  };

  it('construye la petición a la API de Resend con la clave en el header', () => {
    const { url, init } = buildResendRequest(message, 're_test_key');
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect(init.headers['authorization']).toBe('Bearer re_test_key');
    expect(init.headers['content-type']).toBe('application/json');
  });

  it('remite desde la identidad de la tienda con el contenido de la outbox', () => {
    const { init } = buildResendRequest(message, 're_test_key');
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(body['from']).toBe(`${shopConfig.name} <${shopConfig.email}>`);
    expect(body['to']).toEqual(['cliente@example.com']);
    expect(body['subject']).toBe(message.subject);
    expect(body['html']).toBe(message.body_html);
  });
});
