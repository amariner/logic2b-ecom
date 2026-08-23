import type { CustomerPasswordlessApplication } from './customer-passwordless-auth';
import type { CustomerAccountHttp } from '../modules/customers/presentation/customer-account-http';
import {
  CUSTOMER_ACCOUNT_ROUTES,
} from '../modules/customers/presentation/customer-account-http';
import {
  CUSTOMER_AUTH_SESSION_COOKIE_NAME,
  customerAccountHeaders,
  customerHostCookieValue,
  customerSessionCookieOptions,
  hasExactCustomerAuthOrigin,
} from '../modules/customers/presentation/passwordless-http';
import {
  CUSTOMER_AUTH_ATTEMPT_COOKIE_NAME,
} from '../modules/customers/infrastructure/passwordless-web-crypto';

type Dependencies = Readonly<{
  application: CustomerPasswordlessApplication;
  expectedOrigin: string;
  defer: (promise: Promise<unknown>) => void;
  now?: () => string;
  ordersAvailable?: boolean;
  addressesAvailable?: boolean;
}>;

const MAX_REQUEST_BODY_LENGTH = 4_096;
const ACKNOWLEDGEMENT_BODY = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><meta name="referrer" content="no-referrer"><title>Revisa tu email</title></head><body><main><h1>Revisa tu email</h1><p>Si podemos tramitar la solicitud, recibirás un enlace de acceso. Ábrelo en este mismo navegador.</p><p><a href="/cuenta/acceso">Volver al acceso</a></p></main></body></html>`;

function response(body: BodyInit | null, init: ResponseInit): Response {
  return new Response(body, { ...init, headers: customerAccountHeaders(init.headers) });
}

function redirect(path: string, status = 303, headers?: HeadersInit): Response {
  const output = new Headers(headers);
  output.set('location', path);
  return response(null, { status, headers: output });
}

function forbidden(): Response {
  return response('Solicitud no autorizada.', {
    status: 403,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

function hostCookie(name: string, value: string, maxAge: number): string {
  return `${name}=${value}; Max-Age=${Math.max(0, Math.floor(maxAge))}; Path=/; Secure; HttpOnly; SameSite=Lax`;
}

function deleteHostCookie(name: string): string {
  return hostCookie(name, '', 0);
}

async function bodyRecord(request: Request): Promise<Record<string, unknown> | null> {
  const contentLength = request.headers.get('content-length');
  if (contentLength !== null &&
      (!/^(?:0|[1-9]\d*)$/u.test(contentLength) || Number(contentLength) > MAX_REQUEST_BODY_LENGTH)) {
    return null;
  }
  const reader = request.body?.getReader();
  if (reader === undefined) return null;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let body = '';
  let bytesRead = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytesRead += chunk.value.byteLength;
      if (bytesRead > MAX_REQUEST_BODY_LENGTH) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
    body += decoder.decode();
  } catch {
    await reader.cancel().catch(() => undefined);
    return null;
  }
  const contentType = (request.headers.get('content-type') ?? '').toLowerCase();
  if (contentType.includes('application/json')) {
    try {
      const parsed: unknown = JSON.parse(body);
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  }
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(body));
  }
  return null;
}

function exactConsumePayload(value: Record<string, unknown> | null): Readonly<{
  challenge: string;
  proof: string;
  csrfToken: string;
}> | null {
  if (value === null || Object.keys(value).toSorted().join(',') !== 'challenge,csrfToken,proof' ||
      typeof value.challenge !== 'string' || typeof value.proof !== 'string' ||
      typeof value.csrfToken !== 'string') return null;
  return Object.freeze({
    challenge: value.challenge,
    proof: value.proof,
    csrfToken: value.csrfToken,
  });
}

function secondsBetween(start: string, end: string): number {
  return Math.max(0, Math.floor((Date.parse(end) - Date.parse(start)) / 1_000));
}

export function createCustomerAccountHttp(dependencies: Dependencies): CustomerAccountHttp {
  const { application, expectedOrigin, defer } = dependencies;
  const clock = dependencies.now ?? (() => new Date().toISOString());

  return Object.freeze({
    async requestAccess(request: Request): Promise<Response> {
      if (!hasExactCustomerAuthOrigin(request, expectedOrigin)) return forbidden();
      const values = await bodyRecord(request);
      const result = await application.requestAccess(values?.email, clock());
      defer(result.delivery);
      const headers = new Headers({ 'content-type': 'text/html; charset=utf-8' });
      headers.append('set-cookie', hostCookie(
        CUSTOMER_AUTH_ATTEMPT_COOKIE_NAME,
        result.attempt.cookieValue,
        secondsBetween(result.attempt.issuedAt, result.attempt.expiresAt),
      ));
      return response(ACKNOWLEDGEMENT_BODY, { status: 202, headers });
    },

    async confirmationView(request: Request) {
      return Object.freeze({
        csrfToken: await application.confirmationCsrf(
          customerHostCookieValue(request, CUSTOMER_AUTH_ATTEMPT_COOKIE_NAME),
        ),
      });
    },

    async consumeAccess(request: Request): Promise<Response> {
      if (!hasExactCustomerAuthOrigin(request, expectedOrigin)) return forbidden();
      const headers = new Headers();
      headers.append('set-cookie', deleteHostCookie(CUSTOMER_AUTH_ATTEMPT_COOKIE_NAME));
      const payload = exactConsumePayload(await bodyRecord(request));
      const attemptCookie = customerHostCookieValue(request, CUSTOMER_AUTH_ATTEMPT_COOKIE_NAME);
      if (payload === null || attemptCookie === null) {
        return redirect(CUSTOMER_ACCOUNT_ROUTES.access, 303, headers);
      }
      const at = clock();
      const result = await application.consumeAccess({
        challengeId: payload.challenge,
        proof: payload.proof,
        attemptCookie,
        csrfToken: payload.csrfToken,
        consumedAt: at,
      });
      if (result.outcome !== 'authenticated') {
        return redirect(CUSTOMER_ACCOUNT_ROUTES.access, 303, headers);
      }
      const options = customerSessionCookieOptions(result.session, at);
      headers.append('set-cookie', hostCookie(
        CUSTOMER_AUTH_SESSION_COOKIE_NAME,
        result.sessionToken,
        options.maxAge,
      ));
      return redirect(CUSTOMER_ACCOUNT_ROUTES.sessions, 303, headers);
    },

    async currentSession(request: Request) {
      const sessionToken = customerHostCookieValue(request, CUSTOMER_AUTH_SESSION_COOKIE_NAME);
      if (sessionToken === null) return redirect(CUSTOMER_ACCOUNT_ROUTES.access);
      const context = await application.currentSession(sessionToken, clock());
      if (context === null) {
        return redirect(CUSTOMER_ACCOUNT_ROUTES.access, 303, {
          'set-cookie': deleteHostCookie(CUSTOMER_AUTH_SESSION_COOKIE_NAME),
        });
      }
      return Object.freeze({
        csrfToken: await application.sessionCsrf(context),
        ordersAvailable: dependencies.ordersAvailable ?? false,
        addressesAvailable: dependencies.addressesAvailable ?? false,
        session: Object.freeze({
          issuedAt: context.session.issuedAt,
          expiresAt: context.session.expiresAt,
          absoluteExpiresAt: context.session.absoluteExpiresAt,
        }),
      });
    },

    async logout(request: Request): Promise<Response> {
      if (!hasExactCustomerAuthOrigin(request, expectedOrigin)) return forbidden();
      const sessionToken = customerHostCookieValue(request, CUSTOMER_AUTH_SESSION_COOKIE_NAME);
      const values = await bodyRecord(request);
      if (sessionToken === null || typeof values?.csrfToken !== 'string') return forbidden();
      const outcome = await application.logout({
        sessionToken,
        csrfToken: values.csrfToken,
        occurredAt: clock(),
      });
      if (outcome === 'invalid_csrf') return forbidden();
      return redirect(CUSTOMER_ACCOUNT_ROUTES.access, 303, {
        'set-cookie': deleteHostCookie(CUSTOMER_AUTH_SESSION_COOKIE_NAME),
      });
    },
  });
}
