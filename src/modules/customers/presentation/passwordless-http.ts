export const CUSTOMER_AUTH_SESSION_COOKIE_NAME = '__Host-l2b-customer-session';

/** Lee una cookie __Host sin decodificar ni aceptar valores vacíos o enormes. */
export function customerHostCookieValue(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (header === null) return null;
  for (const item of header.split(';')) {
    const separator = item.indexOf('=');
    if (separator < 1 || item.slice(0, separator).trim() !== name) continue;
    const value = item.slice(separator + 1).trim();
    return value.length === 0 || value.length > 4_096 ? null : value;
  }
  return null;
}

export const CUSTOMER_ACCOUNT_CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "object-src 'none'",
].join('; ');

export const CUSTOMER_ACCOUNT_CONTINUATIONS = ['/cuenta/sesiones'] as const;
export type CustomerAccountContinuation = (typeof CUSTOMER_ACCOUNT_CONTINUATIONS)[number];

export const CUSTOMER_AUTH_SESSION_COOKIE_BASE_OPTIONS = Object.freeze({
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  path: '/',
});

const MAX_BROWSER_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

type CustomerSessionExpiry = Readonly<{
  expiresAt: string;
  absoluteExpiresAt: string;
}>;

function instant(value: string, label: string): number {
  const parsed = Date.parse(value);
  if (!value.endsWith('Z') || !Number.isFinite(parsed)) {
    throw new RangeError(`${label} debe ser una fecha ISO-8601 UTC.`);
  }
  return parsed;
}

/**
 * La cookie nunca sobrevive a la ventana que D1 autoriza. El límite de siete
 * días es solo un techo de navegador, no una ampliación del idle TTL.
 */
export function customerSessionCookieMaxAge(
  session: CustomerSessionExpiry,
  now: string,
): number {
  const at = instant(now, 'customerAuth.cookie.now');
  const idleRemaining = instant(session.expiresAt, 'customerAuth.cookie.expiresAt') - at;
  const absoluteRemaining = instant(
    session.absoluteExpiresAt,
    'customerAuth.cookie.absoluteExpiresAt',
  ) - at;
  return Math.max(
    0,
    Math.min(
      MAX_BROWSER_SESSION_TTL_SECONDS,
      Math.floor(idleRemaining / 1000),
      Math.floor(absoluteRemaining / 1000),
    ),
  );
}

export function customerSessionCookieOptions(
  session: CustomerSessionExpiry,
  now: string,
) {
  return Object.freeze({
    ...CUSTOMER_AUTH_SESSION_COOKIE_BASE_OPTIONS,
    maxAge: customerSessionCookieMaxAge(session, now),
  });
}

/** Solo se aceptan continuaciones internas enumeradas por el servidor. */
export function customerAccountContinuation(value: unknown): CustomerAccountContinuation {
  return typeof value === 'string' &&
    CUSTOMER_ACCOUNT_CONTINUATIONS.includes(value as CustomerAccountContinuation)
    ? value as CustomerAccountContinuation
    : '/cuenta/sesiones';
}

/**
 * Origin y URL efectiva deben coincidir con el origen canónico. Esto evita que
 * una cabecera válida recibida a través de un alias/Host no canónico autorice
 * una mutación.
 */
export function hasExactCustomerAuthOrigin(request: Request, expectedOrigin: string): boolean {
  let requestOrigin: string;
  try {
    requestOrigin = new URL(request.url).origin;
  } catch {
    return false;
  }
  return request.headers.get('origin') === expectedOrigin && requestOrigin === expectedOrigin;
}

function appendVaryCookie(headers: Headers): void {
  const values = (headers.get('vary') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (!values.some((value) => value.toLowerCase() === 'cookie')) values.push('Cookie');
  headers.set('vary', values.join(', '));
}

export function customerAccountHeaders(initial?: HeadersInit): Headers {
  const headers = new Headers(initial);
  headers.set('cache-control', 'private, no-store, max-age=0');
  headers.set('content-security-policy', CUSTOMER_ACCOUNT_CONTENT_SECURITY_POLICY);
  headers.set('referrer-policy', 'no-referrer');
  headers.set('x-content-type-options', 'nosniff');
  appendVaryCookie(headers);
  return headers;
}

export function withCustomerAccountHeaders(response: Response): Response {
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: customerAccountHeaders(response.headers),
  });
}
