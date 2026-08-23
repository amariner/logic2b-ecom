/**
 * Protección del backoffice: páginas `/demo/admin/*` (salvo el login) y APIs
 * `/api/admin/*` exigen la cookie de sesión firmada. Las APIs públicas de
 * carrito/checkout llevan un rate limit best-effort. El resto pasa de largo,
 * incluida la generación estática en build (esas rutas nunca son de admin).
 */
import { defineMiddleware } from 'astro:middleware';
import { ADMIN_COOKIE_NAME, resolveCookieSecret, verifySessionToken } from './lib/admin-auth';
import { RateLimiter, type RateLimitRule } from './lib/rate-limit';
import { runtimePlatform } from './composition/runtime-platform';
import { canonicalRoutePathname, decideRouteAccess } from './platform/configuration';
import { createRuntimeCustomerAccountHttp } from './composition/runtime-customer-account';
import { customerPasswordlessRuntimeObservability } from './composition/customer-passwordless-observability';
import {
  enforceCustomerAccountEdgeRate,
  enforceCustomerAddressEdgeRate,
  enforceCustomerOrderAccessEdgeRate,
} from './composition/customer-account-edge';
import { CUSTOMER_ACCOUNT_ROUTES } from './modules/customers/presentation/customer-account-http';
import {
  createRuntimeCustomerOrderAccessHttp,
  customerOrderAccessRuntimeObservability,
} from './composition/runtime-customer-order-access';
import {
  CUSTOMER_ORDER_API_PATH,
  CUSTOMER_ORDER_API_PREFIX,
  isCustomerOrderAccessPath,
} from './modules/customers/presentation/customer-order-access-http';
import {
  CUSTOMER_ADDRESS_API_PATH,
  CUSTOMER_ADDRESS_API_PREFIX,
  isCustomerAddressPath,
} from './modules/customers/presentation/customer-address-http';
import {
  createRuntimeCustomerAddressHttp,
  customerAddressRuntimeObservability,
} from './composition/runtime-customer-address';
import {
  customerAccountHeaders,
  withCustomerAccountHeaders,
} from './modules/customers/presentation/passwordless-http';

function needsAuth(pathname: string): boolean {
  if (pathname.startsWith('/api/admin')) return true;
  return pathname.startsWith('/demo/admin') && !pathname.startsWith('/demo/admin/login');
}

// Estado por isolate: suficiente como freno de abuso, sin bindings ni coste.
const limiter = new RateLimiter();
const PUBLIC_API_RULES: Record<string, RateLimitRule> = {
  '/api/cart/quote': { limit: 60, windowMs: 60_000 },
  '/api/checkout/session': { limit: 10, windowMs: 60_000 },
  // Reset destructivo (borra pedidos y emails de todos los visitantes): sin
  // autenticación por diseño (es un botón público de la demo), así que necesita
  // un límite bajo para que no se pueda machacar la demo en bucle.
  '/api/demo/reset': { limit: 3, windowMs: 60_000 },
  // Login del panel: sin esto, la contraseña (pública a propósito en demo, pero
  // el mismo código correría en una tienda real) admitía intentos ilimitados.
  '/demo/admin/login': { limit: 10, windowMs: 60_000 },
};
const CUSTOMER_ACCOUNT_ROUTE_PATHS = new Set<string>(Object.values(CUSTOMER_ACCOUNT_ROUTES));

export const onRequest = defineMiddleware(async (context, next) => {
  const { search } = context.url;
  const pathname = canonicalRoutePathname(context.url.pathname);
  const adminSurface = pathname.startsWith('/api/admin') || pathname.startsWith('/demo/admin');
  const customerAccountSurface = CUSTOMER_ACCOUNT_ROUTE_PATHS.has(pathname);
  const customerOrderSurface = isCustomerOrderAccessPath(pathname);
  const customerAddressSurface = isCustomerAddressPath(pathname);
  const customerOrderApiSurface = pathname === CUSTOMER_ORDER_API_PATH ||
    pathname.startsWith(CUSTOMER_ORDER_API_PREFIX);
  const customerAddressApiSurface = pathname === CUSTOMER_ADDRESS_API_PATH ||
    pathname.startsWith(CUSTOMER_ADDRESS_API_PREFIX);
  const privateResponse = async (): Promise<Response> => {
    const response = await next();
    const headers = new Headers(response.headers);
    headers.set('cache-control', 'private, no-store, max-age=0');
    headers.set('vary', 'Cookie');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  };

  const routeAccess = decideRouteAccess(runtimePlatform, pathname);
  if (routeAccess && !routeAccess.allowed) {
    if ((customerOrderApiSurface || customerAddressApiSurface) && routeAccess.status === 404) {
      return Response.json({ error: { code: 'customer.resource.not_found' } }, {
        status: 404,
        headers: customerAccountHeaders(),
      });
    }
    if (pathname.startsWith('/api/')) {
      return Response.json(
        { error: routeAccess.status === 404 ? 'Recurso no disponible.' : 'Operación no habilitada.' },
        { status: routeAccess.status, headers: { 'cache-control': 'no-store' } },
      );
    }
    if (routeAccess.status === 404) {
      // Astro no permite reescribir desde middleware hacia una ruta
      // prerenderizada. Responder aquí conserva el 404 fail-closed también en
      // el adaptador Cloudflare y evita tocar env/DB para una capacidad ausente.
      return new Response('Página no encontrada.', {
        status: 404,
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
        },
      });
    }
    return new Response('Esta sección no está habilitada.', {
      status: 403,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    });
  }

  if (customerAccountSurface) {
    try {
      if (context.request.method === 'POST' &&
          (pathname === CUSTOMER_ACCOUNT_ROUTES.access ||
            pathname === CUSTOMER_ACCOUNT_ROUTES.confirmAccess)) {
        const edgeResponse = await enforceCustomerAccountEdgeRate({
          request: context.request,
          pathname,
          binding: context.locals.runtime.env.CUSTOMER_AUTH_RATE_LIMIT,
          observability: customerPasswordlessRuntimeObservability,
        });
        if (edgeResponse !== null) return edgeResponse;
      }
      const accountHttp = await createRuntimeCustomerAccountHttp(
        context.locals.runtime.env,
        (promise) => context.locals.runtime.ctx.waitUntil(promise),
      );
      if (accountHttp === null) {
        return new Response('Acceso no disponible.', {
          status: 503,
          headers: customerAccountHeaders({ 'content-type': 'text/plain; charset=utf-8' }),
        });
      }
      context.locals.customerAccountHttp = accountHttp;
      return withCustomerAccountHeaders(await next());
    } catch {
      customerPasswordlessRuntimeObservability.count({ stage: 'runtime', outcome: 'unavailable' });
      return new Response('Acceso no disponible.', {
        status: 503,
        headers: customerAccountHeaders({ 'content-type': 'text/plain; charset=utf-8' }),
      });
    }
  }

  if (customerOrderSurface) {
    try {
      const edgeResponse = await enforceCustomerOrderAccessEdgeRate({
        request: context.request,
        pathname,
        binding: context.locals.runtime.env.CUSTOMER_AUTH_RATE_LIMIT,
        observability: customerOrderAccessRuntimeObservability,
      });
      if (edgeResponse !== null) return edgeResponse;
      const orderHttp = await createRuntimeCustomerOrderAccessHttp(context.locals.runtime.env);
      if (orderHttp === null) {
        return Response.json({ error: { code: 'customer.resource.not_found' } }, {
          status: 404,
          headers: customerAccountHeaders(),
        });
      }
      context.locals.customerOrderAccessHttp = orderHttp;
      return withCustomerAccountHeaders(await next());
    } catch {
      customerOrderAccessRuntimeObservability.count({
        outcome: 'denied', reason: 'runtime_unavailable',
      });
      return new Response('Acceso no disponible.', {
        status: 503,
        headers: customerAccountHeaders({ 'content-type': 'text/plain; charset=utf-8' }),
      });
    }
  }

  if (customerAddressSurface) {
    try {
      const edgeResponse = await enforceCustomerAddressEdgeRate({
        request: context.request,
        pathname,
        binding: context.locals.runtime.env.CUSTOMER_AUTH_RATE_LIMIT,
        observability: customerAddressRuntimeObservability,
      });
      if (edgeResponse !== null) return edgeResponse;
      const addressHttp = await createRuntimeCustomerAddressHttp(context.locals.runtime.env);
      if (addressHttp === null) {
        return Response.json({ error: { code: 'customer.resource.not_found' } }, {
          status: 404, headers: customerAccountHeaders(),
        });
      }
      context.locals.customerAddressHttp = addressHttp;
      return withCustomerAccountHeaders(await next());
    } catch {
      customerAddressRuntimeObservability.count({
        operation: 'list', outcome: 'denied', reason: 'runtime_unavailable',
      });
      return new Response('Acceso no disponible.', {
        status: 503,
        headers: customerAccountHeaders({ 'content-type': 'text/plain; charset=utf-8' }),
      });
    }
  }

  const rule = context.request.method === 'POST' ? PUBLIC_API_RULES[pathname] : undefined;
  if (rule) {
    const ip = context.request.headers.get('cf-connecting-ip') ?? 'local';
    const key = `${pathname}:${ip}`;
    if (!limiter.check(key, rule)) {
      const retryAfter = String(limiter.retryAfterSeconds(key, rule));
      if (!pathname.startsWith('/api/')) {
        // Página normal (p. ej. el login): redirigir con un aviso legible en
        // vez de servir JSON crudo a un envío de formulario. Conserva el resto
        // de la query (p. ej. `next`) para no perder la redirección post-login.
        const params = new URLSearchParams(search);
        params.set('limited', '1');
        return context.redirect(`${pathname}?${params}`, 303);
      }
      return Response.json(
        { error: 'Demasiadas peticiones; espera un momento e inténtalo de nuevo.' },
        { status: 429, headers: { 'retry-after': retryAfter } },
      );
    }
  }

  if (!needsAuth(pathname)) return adminSurface ? privateResponse() : next();

  // En una tienda real (DEMO_MODE off) el guardián es Cloudflare Access
  // (docs/PRODUCCION.md §5); la cookie de login es la capa didáctica de la demo.
  if (context.locals.runtime.env.DEMO_MODE !== 'true') return privateResponse();

  const secret = resolveCookieSecret(context.locals.runtime.env);
  const token = context.cookies.get(ADMIN_COOKIE_NAME)?.value;
  if (secret && token && (await verifySessionToken(secret, token))) return privateResponse();

  if (pathname.startsWith('/api/')) {
    return Response.json(
      { error: 'No autorizado: inicia sesión en el panel.' },
      { status: 401, headers: { 'cache-control': 'private, no-store, max-age=0', vary: 'Cookie' } },
    );
  }
  return context.redirect(`/demo/admin/login?next=${encodeURIComponent(pathname + search)}`, 302);
});
