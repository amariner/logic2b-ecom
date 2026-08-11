/** Política y serialización del sitemap del escaparate público. */
const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>';
const SITEMAP_NAMESPACE = 'http://www.sitemaps.org/schemas/sitemap/0.9';

export const SITEMAP_ORIGIN = 'https://ecom.logic2b.com';

export const PRIVATE_SITEMAP_PREFIXES = ['/api', '/demo'] as const;

export type SitemapEntry = Readonly<{
  loc: string;
  lastmod: string;
}>;

type RenderedPage = Readonly<{
  pathname: string;
  html: string;
}>;

const XML_ENTITY_PATTERN = /[&<>"']/g;
const XML_ENTITIES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

function escapeXml(value: string): string {
  return value.replace(XML_ENTITY_PATTERN, (character) => XML_ENTITIES[character] ?? character);
}

function decodeXml(value: string): string {
  return value
    .replaceAll('&apos;', "'")
    .replaceAll('&quot;', '"')
    .replaceAll('&gt;', '>')
    .replaceAll('&lt;', '<')
    .replaceAll('&amp;', '&');
}

function htmlAttributes(tag: string): Map<string, string> {
  const attributes = new Map<string, string>();
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  const withoutName = tag.replace(/^<\/?[a-z0-9:-]+/i, '').replace(/\/?\s*>$/, '');

  for (const match of withoutName.matchAll(pattern)) {
    const name = match[1]?.toLowerCase();
    if (!name) continue;
    attributes.set(name, match[2] ?? match[3] ?? match[4] ?? '');
  }

  return attributes;
}

function metaContent(html: string, name: string): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attributes = htmlAttributes(tag);
    if (attributes.get('name')?.toLowerCase() === name.toLowerCase()) {
      return attributes.get('content') ?? '';
    }
  }
  return null;
}

function canonicalHref(html: string): string | null {
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const attributes = htmlAttributes(tag);
    const rel = attributes.get('rel')?.toLowerCase().split(/\s+/) ?? [];
    if (rel.includes('canonical')) return attributes.get('href') ?? null;
  }
  return null;
}

function hasMetaRefresh(html: string): boolean {
  return (html.match(/<meta\b[^>]*>/gi) ?? []).some((tag) => {
    return htmlAttributes(tag).get('http-equiv')?.toLowerCase() === 'refresh';
  });
}

function isPrivatePath(pathname: string): boolean {
  return PRIVATE_SITEMAP_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function normalizedPagePath(pathname: string): string {
  if (pathname === '/') return pathname;
  return pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

/**
 * Devuelve la URL canónica solo cuando el HTML final demuestra que la página
 * es pública, indexable y no es una variante/alias de otra URL.
 */
export function inspectIndexablePage(
  page: RenderedPage,
  origin = SITEMAP_ORIGIN,
): string | null {
  const outputPath = normalizedPagePath(page.pathname);
  if (outputPath === '/404' || isPrivatePath(outputPath) || hasMetaRefresh(page.html)) return null;

  const robots = metaContent(page.html, 'robots')?.toLowerCase() ?? '';
  if (robots.split(/[\s,]+/).includes('noindex') || robots.split(/[\s,]+/).includes('none')) {
    return null;
  }

  const canonical = canonicalHref(page.html);
  if (!canonical) return null;

  let url: URL;
  try {
    url = new URL(canonical);
  } catch {
    return null;
  }

  if (
    url.origin !== origin ||
    url.protocol !== 'https:' ||
    url.search !== '' ||
    url.hash !== '' ||
    normalizedPagePath(url.pathname) !== outputPath
  ) {
    return null;
  }

  url.pathname = outputPath;
  return url.href;
}

function assertEntry(entry: SitemapEntry): void {
  const url = new URL(entry.loc);
  if (url.origin !== SITEMAP_ORIGIN || url.protocol !== 'https:' || url.search || url.hash) {
    throw new Error(`URL de sitemap no canónica: ${entry.loc}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.lastmod)) {
    throw new Error(`lastmod inválido para ${entry.loc}: ${entry.lastmod}`);
  }
}

/** XML sin XSL ni namespace XHTML: el navegador conserva su visor nativo. */
export function renderSitemap(entries: readonly SitemapEntry[]): string {
  const seen = new Set<string>();
  const rows = entries.map((entry) => {
    assertEntry(entry);
    if (seen.has(entry.loc)) throw new Error(`URL duplicada en sitemap: ${entry.loc}`);
    seen.add(entry.loc);
    return [
      '  <url>',
      `    <loc>${escapeXml(entry.loc)}</loc>`,
      `    <lastmod>${entry.lastmod}</lastmod>`,
      '  </url>',
    ].join('\n');
  });

  return `${XML_DECLARATION}\n<urlset xmlns="${SITEMAP_NAMESPACE}">\n${rows.join('\n')}\n</urlset>\n`;
}

/**
 * Parser estricto del subconjunto que emite renderSitemap. Sirve como
 * guardarraíl independiente: cualquier etiqueta, atributo o namespace extra
 * hace fallar la verificación.
 */
export function parseSitemap(xml: string): SitemapEntry[] {
  const prefix = `${XML_DECLARATION}\n<urlset xmlns="${SITEMAP_NAMESPACE}">\n`;
  const suffix = '</urlset>\n';
  if (!xml.startsWith(prefix) || !xml.endsWith(suffix)) {
    throw new Error('Documento XML o namespace de sitemap inválido');
  }
  if (/xmlns:xhtml|<xhtml:/i.test(xml)) throw new Error('El namespace XHTML no está permitido');

  let body = xml.slice(prefix.length, -suffix.length);
  if (body === '') return [];

  const entries: SitemapEntry[] = [];
  const rowPattern = /^  <url>\n    <loc>([^\n<]*)<\/loc>\n    <lastmod>(\d{4}-\d{2}-\d{2})<\/lastmod>\n  <\/url>(?:\n|$)/;
  while (body !== '') {
    const match = body.match(rowPattern);
    if (!match?.[1] || !match[2]) throw new Error('Estructura XML de una entrada inválida');
    const entry = { loc: decodeXml(match[1]), lastmod: match[2] };
    assertEntry(entry);
    entries.push(entry);
    body = body.slice(match[0].length);
  }

  if (new Set(entries.map((entry) => entry.loc)).size !== entries.length) {
    throw new Error('El sitemap contiene URLs duplicadas');
  }
  return entries;
}
