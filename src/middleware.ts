/**
 * Protección del backoffice: páginas `/demo/admin/*` (salvo el login) y APIs
 * `/api/admin/*` exigen la cookie de sesión firmada. Las APIs públicas de
 * carrito/checkout llevan un rate limit best-effort. El resto pasa de largo,
 * incluida la generación estática en build (esas rutas nunca son de admin).
 */
import { defineMiddleware } from 'astro:middleware';
import { ADMIN_COOKIE_NAME, resolveCookieSecret, verifySessionToken } from './lib/admin-auth';
import { RateLimiter, type RateLimitRule } from './lib/rate-limit';

function needsAuth(pathname: string): boolean {
  if (pathname.startsWith('/api/admin')) return true;
  return pathname.startsWith('/demo/admin') && !pathname.startsWith('/demo/admin/login');
}

// Estado por isolate: suficiente como freno de abuso, sin bindings ni coste.
const limiter = new RateLimiter();
const PUBLIC_API_RULES: Record<string, RateLimitRule> = {
  '/api/cart/quote': { limit: 60, windowMs: 60_000 },
  '/api/checkout/session': { limit: 10, windowMs: 60_000 },
};

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname, search } = context.url;

  const rule = context.request.method === 'POST' ? PUBLIC_API_RULES[pathname] : undefined;
  if (rule) {
    const ip = context.request.headers.get('cf-connecting-ip') ?? 'local';
    const key = `${pathname}:${ip}`;
    if (!limiter.check(key, rule)) {
      return Response.json(
        { error: 'Demasiadas peticiones; espera un momento e inténtalo de nuevo.' },
        { status: 429, headers: { 'retry-after': String(limiter.retryAfterSeconds(key, rule)) } },
      );
    }
  }

  if (!needsAuth(pathname)) return next();

  // En una tienda real (DEMO_MODE off) el guardián es Cloudflare Access
  // (docs/PRODUCCION.md §5); la cookie de login es la capa didáctica de la demo.
  if (context.locals.runtime.env.DEMO_MODE !== 'true') return next();

  const secret = resolveCookieSecret(context.locals.runtime.env);
  const token = context.cookies.get(ADMIN_COOKIE_NAME)?.value;
  if (secret && token && (await verifySessionToken(secret, token))) return next();

  if (pathname.startsWith('/api/')) {
    return Response.json({ error: 'No autorizado: inicia sesión en el panel.' }, { status: 401 });
  }
  return context.redirect(`/demo/admin/login?next=${encodeURIComponent(pathname + search)}`, 302);
});
