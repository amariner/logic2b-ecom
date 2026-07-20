import type { APIRoute } from 'astro';

/** Sitemap solo con las páginas indexables. Todo /demo/* es noindex. */
export const GET: APIRoute = ({ site }) => {
  const urls = ['/', '/arquitectura', '/estilos', '/dossier'];
  const body =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((path) => `  <url><loc>${new URL(path, site).href}</loc></url>`).join('\n') +
    '\n</urlset>\n';
  return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
};
