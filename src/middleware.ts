/**
 * Protección del backoffice: páginas `/demo/admin/*` (salvo el login) y APIs
 * `/api/admin/*` exigen la cookie de sesión firmada. El resto pasa de largo,
 * incluida la generación estática en build (esas rutas nunca son de admin).
 */
import { defineMiddleware } from 'astro:middleware';
import { ADMIN_COOKIE_NAME, resolveCookieSecret, verifySessionToken } from './lib/admin-auth';

function needsAuth(pathname: string): boolean {
  if (pathname.startsWith('/api/admin')) return true;
  return pathname.startsWith('/demo/admin') && !pathname.startsWith('/demo/admin/login');
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname, search } = context.url;
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
