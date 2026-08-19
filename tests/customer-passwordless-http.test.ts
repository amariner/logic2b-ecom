import { describe, expect, it } from 'vitest';
import {
  CUSTOMER_ACCOUNT_CONTENT_SECURITY_POLICY,
  CUSTOMER_AUTH_SESSION_COOKIE_BASE_OPTIONS,
  customerAccountContinuation,
  customerAccountHeaders,
  customerSessionCookieMaxAge,
  customerSessionCookieOptions,
  hasExactCustomerAuthOrigin,
  withCustomerAccountHeaders,
} from '../src/modules/customers/presentation/passwordless-http';

describe('frontera HTTP passwordless', () => {
  it('exige el Origin y el origen efectivo canónicos exactos', () => {
    const expected = 'https://shop.example';
    expect(hasExactCustomerAuthOrigin(new Request(`${expected}/cuenta/acceso`, {
      method: 'POST',
      headers: { origin: expected },
    }), expected)).toBe(true);
    expect(hasExactCustomerAuthOrigin(new Request(`${expected}/cuenta/acceso`, {
      method: 'POST',
      headers: { origin: 'https://alias.example' },
    }), expected)).toBe(false);
    expect(hasExactCustomerAuthOrigin(new Request('https://alias.example/cuenta/acceso', {
      method: 'POST',
      headers: { origin: expected },
    }), expected)).toBe(false);
    expect(hasExactCustomerAuthOrigin(new Request(`${expected}/cuenta/acceso`, {
      method: 'POST',
    }), expected)).toBe(false);
  });

  it('solo permite continuaciones relativas enumeradas', () => {
    expect(customerAccountContinuation('/cuenta/sesiones')).toBe('/cuenta/sesiones');
    expect(customerAccountContinuation('https://evil.example')).toBe('/cuenta/sesiones');
    expect(customerAccountContinuation('//evil.example')).toBe('/cuenta/sesiones');
    expect(customerAccountContinuation('/demo/admin')).toBe('/cuenta/sesiones');
  });

  it('limita Max-Age por idle, corte absoluto y siete días', () => {
    const now = '2026-08-19T10:00:00.000Z';
    expect(customerSessionCookieMaxAge({
      expiresAt: '2026-08-20T10:00:00.000Z',
      absoluteExpiresAt: '2026-09-18T10:00:00.000Z',
    }, now)).toBe(24 * 60 * 60);
    expect(customerSessionCookieMaxAge({
      expiresAt: '2026-08-29T10:00:00.000Z',
      absoluteExpiresAt: '2026-08-21T10:00:00.000Z',
    }, now)).toBe(2 * 24 * 60 * 60);
    expect(customerSessionCookieMaxAge({
      expiresAt: '2026-08-29T10:00:00.000Z',
      absoluteExpiresAt: '2026-09-18T10:00:00.000Z',
    }, now)).toBe(7 * 24 * 60 * 60);
    expect(customerSessionCookieMaxAge({
      expiresAt: '2026-08-19T09:59:59.000Z',
      absoluteExpiresAt: '2026-09-18T10:00:00.000Z',
    }, now)).toBe(0);
  });

  it('fija atributos __Host compatibles y nunca añade Domain', () => {
    const options = customerSessionCookieOptions({
      expiresAt: '2026-08-20T10:00:00.000Z',
      absoluteExpiresAt: '2026-08-21T10:00:00.000Z',
    }, '2026-08-19T10:00:00.000Z');
    expect(options).toEqual({ ...CUSTOMER_AUTH_SESSION_COOKIE_BASE_OPTIONS, maxAge: 86_400 });
    expect(options).not.toHaveProperty('domain');
  });

  it('aplica CSP cerrada y cabeceras privadas a toda respuesta de cuenta', async () => {
    const headers = customerAccountHeaders({ vary: 'Accept-Encoding' });
    expect(headers.get('content-security-policy')).toBe(CUSTOMER_ACCOUNT_CONTENT_SECURITY_POLICY);
    expect(headers.get('content-security-policy')).toContain("script-src 'self'");
    expect(headers.get('content-security-policy')).not.toContain("'unsafe-inline'");
    expect(headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(headers.get('referrer-policy')).toBe('no-referrer');
    expect(headers.get('x-content-type-options')).toBe('nosniff');
    expect(headers.get('vary')).toBe('Accept-Encoding, Cookie');

    const response = withCustomerAccountHeaders(new Response('genérico', {
      status: 202,
      headers: { 'x-test': 'preserved' },
    }));
    expect(response.status).toBe(202);
    expect(response.headers.get('x-test')).toBe('preserved');
    expect(response.headers.get('vary')).toBe('Cookie');
    expect(await response.text()).toBe('genérico');
  });
});
