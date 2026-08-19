import { describe, expect, it, vi } from 'vitest';
import { createCustomerAccountHttp } from '../src/composition/customer-account-http';
import type { CustomerPasswordlessApplication } from '../src/composition/customer-passwordless-auth';
import type { ActiveCustomerSessionContext } from '../src/modules/customers/application/passwordless-auth-ports';

const ORIGIN = 'https://shop.example';
const AT = '2026-08-19T10:00:00.000Z';
const ATTEMPT = `v1.${Date.parse(AT)}.${Date.parse('2026-08-19T10:10:00.000Z')}.${'n'.repeat(43)}.${'s'.repeat(43)}`;
const SESSION_TOKEN = 't'.repeat(43);

function application(overrides: Partial<CustomerPasswordlessApplication> = {}): CustomerPasswordlessApplication {
  const context = {
    session: {
      id: 'customer_session:test', familyId: 'customer_session_family:test',
      identityId: 'auth_identity:test', customerProfileId: 'customer_profile:test',
      tokenDigest: 'a'.repeat(64), scopes: ['customer:self'], status: 'active',
      issuedAt: AT, expiresAt: '2026-08-20T10:00:00.000Z',
      absoluteExpiresAt: '2026-09-18T10:00:00.000Z', generation: 1,
      rotatedFromSessionId: null, replacedBySessionId: null, revokedAt: null,
      revocationReasonId: null, transitionIdempotencyKey: null, version: 1,
    },
    identity: {
      id: 'auth_identity:test', customerProfileId: 'customer_profile:test',
      contactIdentityHash: 'b'.repeat(64), status: 'active', createdAt: AT, revokedAt: null,
    },
    family: { id: 'customer_session_family:test', status: 'active',
      absoluteExpiresAt: '2026-09-18T10:00:00.000Z', version: 1 },
    profile: { id: 'customer_profile:test', status: 'active', emailIdentityHash: 'b'.repeat(64) },
  } as const satisfies ActiveCustomerSessionContext;
  return {
    requestAccess: vi.fn(async () => ({
      acknowledgement: { accepted: true, messageKey: 'customer.auth.request.accepted' },
      attempt: { cookieValue: ATTEMPT, issuedAt: AT, expiresAt: '2026-08-19T10:10:00.000Z' },
      delivery: Promise.resolve(),
    })),
    consumeAccess: vi.fn(async () => ({ outcome: 'authenticated', session: context.session, sessionToken: SESSION_TOKEN })),
    confirmationCsrf: vi.fn(async () => 'c'.repeat(43)),
    currentSession: vi.fn(async () => context),
    sessionCsrf: vi.fn(async () => 'x'.repeat(43)),
    logout: vi.fn(async () => 'revoked'),
    ...overrides,
  } as CustomerPasswordlessApplication;
}

function request(path: string, init: RequestInit = {}): Request {
  return new Request(`${ORIGIN}${path}`, {
    ...init,
    headers: { origin: ORIGIN, ...(init.headers ?? {}) },
  });
}

describe('composición HTTP de cuenta', () => {
  it('responde 202 uniforme, difiere entrega y fija la cookie de intento __Host', async () => {
    const app = application();
    const deferred: Promise<unknown>[] = [];
    const http = createCustomerAccountHttp({ application: app, expectedOrigin: ORIGIN,
      defer: (promise) => deferred.push(promise), now: () => AT });
    const result = await http.requestAccess(request('/cuenta/acceso', {
      method: 'POST',
      headers: { origin: ORIGIN, 'content-type': 'application/x-www-form-urlencoded' },
      body: 'email=cliente%40example.test',
    }));
    expect(result.status).toBe(202);
    expect(result.headers.get('cache-control')).toContain('no-store');
    expect(result.headers.get('set-cookie')).toContain('__Host-l2b-customer-auth-attempt=');
    expect(result.headers.get('set-cookie')).toContain('Max-Age=600; Path=/; Secure; HttpOnly; SameSite=Lax');
    expect(result.headers.get('set-cookie')).not.toContain('Domain=');
    expect(await result.text()).not.toContain('cliente@example.test');
    expect(deferred).toHaveLength(1);
  });

  it('rechaza Origin ausente o alias antes de invocar la aplicación', async () => {
    const app = application();
    const http = createCustomerAccountHttp({ application: app, expectedOrigin: ORIGIN,
      defer: () => undefined, now: () => AT });
    const result = await http.requestAccess(new Request(`${ORIGIN}/cuenta/acceso`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'email=a%40b.test',
    }));
    expect(result.status).toBe(403);
    expect(app.requestAccess).not.toHaveBeenCalled();
  });

  it('corta un body streaming sin Content-Length antes de superar 4096 bytes', async () => {
    const app = application();
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(4_000));
        controller.enqueue(new Uint8Array(97));
      },
      cancel() {
        cancelled = true;
      },
    });
    const http = createCustomerAccountHttp({ application: app, expectedOrigin: ORIGIN,
      defer: () => undefined, now: () => AT });
    const result = await http.requestAccess(request('/cuenta/acceso', {
      method: 'POST',
      headers: { origin: ORIGIN, 'content-type': 'application/x-www-form-urlencoded' },
      body: stream,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' }));
    expect(result.status).toBe(202);
    expect(cancelled).toBe(true);
    expect(app.requestAccess).toHaveBeenCalledWith(undefined, AT);
  });

  it('GET de confirmación no emite cookie y deriva CSRF sin leer fragmentos', async () => {
    const app = application();
    const http = createCustomerAccountHttp({ application: app, expectedOrigin: ORIGIN,
      defer: () => undefined, now: () => AT });
    const view = await http.confirmationView(request('/cuenta/acceso/confirmar', {
      headers: { cookie: `__Host-l2b-customer-auth-attempt=${ATTEMPT}` },
    }));
    expect(view.csrfToken).toBe('c'.repeat(43));
    expect(app.confirmationCsrf).toHaveBeenCalledWith(ATTEMPT);
  });

  it('consume una sola vez, borra attempt y emite sesión con TTL idle', async () => {
    const http = createCustomerAccountHttp({ application: application(), expectedOrigin: ORIGIN,
      defer: () => undefined, now: () => AT });
    const result = await http.consumeAccess(request('/cuenta/acceso/confirmar', {
      method: 'POST',
      headers: { origin: ORIGIN, 'content-type': 'application/json',
        cookie: `__Host-l2b-customer-auth-attempt=${ATTEMPT}` },
      body: JSON.stringify({ challenge: 'auth_challenge:test', proof: 'p'.repeat(43), csrfToken: 'c'.repeat(43) }),
    }));
    expect(result.status).toBe(303);
    expect(result.headers.get('location')).toBe('/cuenta/sesiones');
    const cookies = result.headers.get('set-cookie') ?? '';
    expect(cookies).toContain('__Host-l2b-customer-auth-attempt=; Max-Age=0');
    expect(cookies).toContain(`__Host-l2b-customer-session=${SESSION_TOKEN}; Max-Age=86400`);
  });

  it('limpia una sesión ausente y exige session-CSRF para logout', async () => {
    const missing = application({ currentSession: vi.fn(async () => null) });
    const missingHttp = createCustomerAccountHttp({ application: missing, expectedOrigin: ORIGIN,
      defer: () => undefined, now: () => AT });
    const current = await missingHttp.currentSession(request('/cuenta/sesiones', {
      headers: { cookie: `__Host-l2b-customer-session=${SESSION_TOKEN}` },
    }));
    expect(current).toBeInstanceOf(Response);
    expect((current as Response).headers.get('set-cookie')).toContain('Max-Age=0');

    const invalid = application({ logout: vi.fn(async () => 'invalid_csrf' as const) });
    const invalidHttp = createCustomerAccountHttp({ application: invalid, expectedOrigin: ORIGIN,
      defer: () => undefined, now: () => AT });
    const logout = await invalidHttp.logout(request('/cuenta/sesiones', {
      method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/x-www-form-urlencoded',
        cookie: `__Host-l2b-customer-session=${SESSION_TOKEN}` }, body: `csrfToken=${'x'.repeat(43)}`,
    }));
    expect(logout.status).toBe(403);
    expect(logout.headers.get('set-cookie')).toBeNull();
  });
});
