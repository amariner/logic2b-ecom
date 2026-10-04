import { afterEach, describe, expect, it, vi } from 'vitest';
import type { APIContext } from 'astro';
import { onRequest } from '../src/middleware';
import { ADMIN_COOKIE_NAME, createSessionToken } from '../src/lib/admin-auth';

vi.mock('astro:middleware', () => ({ defineMiddleware: (handler: unknown) => handler }));
afterEach(() => vi.restoreAllMocks());

const SECRET = 'synthetic-private-header-test-secret';
function fixture(path: string, method = 'GET', response = new Response('fixture'), token?: string) {
  const request = new Request(`https://fixture.test${path}`, { method });
  const next = vi.fn(async () => response);
  const cookies = { get: vi.fn((name: string) => name === ADMIN_COOKIE_NAME && token ? { value: token } : undefined),
    set: vi.fn(), delete: vi.fn() };
  const waitUntil = vi.fn();
  const env = { DEMO_MODE: 'true', ADMIN_COOKIE_SECRET: SECRET,
    get DB(): never { throw new Error('Unexpected fixture database access'); },
    get RESEND_API_KEY(): never { throw new Error('Unexpected provider access'); },
    get CUSTOMER_AUTH_RATE_LIMIT(): never { throw new Error('Unexpected account binding access'); } };
  const input = { request, url: new URL(request.url), cookies,
    locals: { runtime: { env, ctx: { waitUntil } } },
    redirect: (location: string, status: number) => new Response(null, { status, headers: { location } }),
  } as unknown as APIContext;
  return { input, next, cookies, waitUntil, request };
}
async function invoke(f: ReturnType<typeof fixture>) {
  const response = await onRequest(f.input, f.next);
  if (!(response instanceof Response)) throw new Error('Missing response');
  return response;
}
function expectPrivate(response: Response) {
  expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
  expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive');
  expect(response.headers.get('vary')?.toLowerCase().split(',').map(value => value.trim())).toContain('cookie');
}

describe('privacy headers cover early admin responses', () => {
  it.each(['GET', 'HEAD'])('protects the %s login redirect without reading a handler or setting a cookie', async method => {
    const f = fixture('/demo/admin/divisas/?example=1', method);
    const response = await invoke(f);
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/demo/admin/login?next=%2Fdemo%2Fadmin%2Fdivisas%3Fexample%3D1');
    expectPrivate(response);
    expect(f.next).not.toHaveBeenCalled();
    expect(f.cookies.set).not.toHaveBeenCalled();
    expect(f.waitUntil).not.toHaveBeenCalled();
  });

  it.each(['GET', 'HEAD'])('keeps the %s admin API denial private and generic', async method => {
    const f = fixture('/api/admin/orders/export.csv', method);
    const response = await invoke(f);
    expect(response.status).toBe(401);
    expectPrivate(response);
    expect(await response.json()).toEqual({ error: 'No autorizado: inicia sesión en el panel.' });
    expect(f.next).not.toHaveBeenCalled();
  });

  it('preserves successful response headers, stream, status and Vary without imposing account CSP', async () => {
    const token = await createSessionToken(SECRET);
    const original = new Response('synthetic page body', { status: 202, statusText: 'Accepted', headers: {
      vary: 'Accept-Encoding, Origin', 'set-cookie': 'fixture=preserved; HttpOnly',
      'content-security-policy': "script-src 'self' 'unsafe-inline'", 'x-fixture': 'preserved',
      'cache-control': 'public, max-age=3600',
    } });
    const f = fixture('/demo/admin/divisas', 'GET', original, token);
    const response = await invoke(f);
    expectPrivate(response);
    expect(response.status).toBe(202);
    expect(response.statusText).toBe('Accepted');
    expect(await response.text()).toBe('synthetic page body');
    expect(response.headers.get('vary')).toBe('Accept-Encoding, Origin, Cookie');
    expect(response.headers.get('set-cookie')).toBe('fixture=preserved; HttpOnly');
    expect(response.headers.get('content-security-policy')).toBe("script-src 'self' 'unsafe-inline'");
    expect(response.headers.get('x-fixture')).toBe('preserved');
    expect(f.next).toHaveBeenCalledOnce();
  });

  it.each(['Origin, cookie', '*'])('preserves existing Vary %s without narrowing it', async vary => {
    const response = await invoke(fixture('/demo/admin/login', 'GET', new Response(null, { headers: { vary } })));
    expect(response.headers.get('vary')).toBe(vary);
    expect(response.headers.get('cache-control')).toContain('private');
    expect(response.headers.get('x-robots-tag')).toContain('noindex');
  });

  it('protects a guided-login response while preserving its redirect and cookie', async () => {
    const f = fixture('/demo/admin/login?tour=1', 'GET', new Response(null, { status: 303,
      headers: { location: '/demo/admin/divisas', 'set-cookie': 'synthetic-session=preserved; HttpOnly' } }));
    const response = await invoke(f);
    expectPrivate(response);
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/demo/admin/divisas');
    expect(response.headers.get('set-cookie')).toBe('synthetic-session=preserved; HttpOnly');
  });
});

describe('inactive customer surfaces fail before runtime and stay private', () => {
  const paths = ['/cuenta/acceso/', '/cuenta/acceso/confirmar', '/cuenta/sesiones', '/cuenta/pedidos/',
    '/cuenta/direcciones', '/cuenta/devoluciones/', '/api/customer/orders', '/api/customer/addresses/',
    '/api/customer/returns/synthetic-reference'];
  it.each(paths.flatMap(path => ['GET', 'HEAD'].map(method => ({ path, method }))))('$method $path remains a protected 404', async ({ path, method }) => {
    const f = fixture(path, method);
    // Even reading the environment or request body would invalidate the capability gate.
    Object.defineProperty(f.input.locals.runtime, 'env', { get() { throw new Error('Gate read runtime'); } });
    const json = vi.spyOn(f.request, 'json');
    const formData = vi.spyOn(f.request, 'formData');
    const response = await invoke(f);
    expect(response.status).toBe(404);
    expectPrivate(response);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('set-cookie')).toBeNull();
    if (path.startsWith('/api/')) {
      expect(await response.json()).toEqual({ error: { code: 'customer.resource.not_found' } });
    } else expect(await response.text()).toBe('Página no encontrada.');
    expect(f.next).not.toHaveBeenCalled();
    expect(f.cookies.get).not.toHaveBeenCalled();
    expect(f.cookies.set).not.toHaveBeenCalled();
    expect(f.waitUntil).not.toHaveBeenCalled();
    expect(json).not.toHaveBeenCalled();
    expect(formData).not.toHaveBeenCalled();
  });

  it.each(['/demo/admin/login', '/api/admin/orders/1', '/cuenta/acceso'])('adds private headers without weakening command rejection at %s', async path => {
    const f = fixture(path, 'POST');
    const body = vi.spyOn(f.request, 'formData');
    const response = await invoke(f);
    expect([403, 404]).toContain(response.status);
    expectPrivate(response);
    expect(f.next).not.toHaveBeenCalled();
    expect(body).not.toHaveBeenCalled();
    expect(f.cookies.set).not.toHaveBeenCalled();
    expect(f.waitUntil).not.toHaveBeenCalled();
  });

  it.each(['/', '/demo/tienda', '/cuenta-publica'])('leaves unrelated public response policy unchanged at %s', async path => {
    const original = new Response('public fixture', { headers: { 'cache-control': 'public, max-age=60', vary: 'Accept-Encoding' } });
    const f = fixture(path, 'GET', original);
    const response = await invoke(f);
    expect(response).toBe(original);
    expect(response.headers.get('cache-control')).toBe('public, max-age=60');
    expect(response.headers.get('vary')).toBe('Accept-Encoding');
    expect(response.headers.get('x-robots-tag')).toBeNull();
  });
});
