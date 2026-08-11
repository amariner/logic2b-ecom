import type { APIRoute } from 'astro';
import { renderSitemap, SITEMAP_ORIGIN } from '../modules/storefront/application/sitemap';

/**
 * Respuesta de desarrollo. En cada build, generate-sitemap.mjs sustituye este
 * artefacto por el mapa descubierto desde el HTML final y calcula lastmod desde
 * el historial real de cada página y sus dependencias locales.
 */
export const GET: APIRoute = () => {
  const lastmods = {
    '/': '2026-08-11',
    '/agencias': '2026-08-06',
    '/arquitectura': '2026-08-06',
    '/dossier': '2026-08-06',
    '/precios': '2026-08-06',
    '/temas': '2026-08-11',
  } as const;
  const body = renderSitemap(
    Object.entries(lastmods).map(([path, lastmod]) => ({
      loc: new URL(path, SITEMAP_ORIGIN).href,
      lastmod,
    })),
  );
  return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
};
