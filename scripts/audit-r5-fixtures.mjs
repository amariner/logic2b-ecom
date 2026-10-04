/**
 * R5.12: auditoría HTTP/SSR del build servido por un Worker local ya preparado.
 * Solo GET/HEAD, redirects manuales y una cookie de guía sintética en memoria.
 * No inicia servidores, ejecuta JavaScript, modifica D1 ni contacta proveedores.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const BASE = (process.env.BASE_URL ?? 'http://127.0.0.1:8793').replace(/\/$/u, '');
const base = new URL(BASE);
if (!['localhost', '127.0.0.1', '[::1]'].includes(base.hostname) ||
  !['http:', 'https:'].includes(base.protocol) || base.origin !== BASE) {
  throw new Error('La auditoría solo admite un origen localhost de fixtures.');
}
const PRODUCTION_ORIGIN = 'https://ecom.logic2b.com';
const output = resolve(process.env.OUTPUT_DIR ?? 'docs/audits/r5-12');
const ADMINS = [
  { path: '/demo/admin/segmentos', marker: 'data-customer-segments-demo' },
  { path: '/demo/admin/mercados', marker: 'data-market-content-demo' },
  { path: '/demo/admin/publicacion', marker: 'data-market-publication-demo' },
  { path: '/demo/admin/impuestos', marker: 'data-tax-demo' },
  { path: '/demo/admin/divisas', marker: 'data-currency-methods-demo' },
];
const synthetic = 'f'.repeat(32);
const ACCOUNT_PAGES = ['/cuenta/acceso', '/cuenta/acceso/confirmar', '/cuenta/sesiones',
  '/cuenta/pedidos', `/cuenta/pedidos/ord_${synthetic}`, '/cuenta/direcciones',
  '/cuenta/devoluciones', `/cuenta/devoluciones/ret_${synthetic}`];
const ACCOUNT_APIS = ['/api/customer/orders', `/api/customer/orders/ord_${synthetic}`,
  '/api/customer/addresses', `/api/customer/addresses/addr_${synthetic}`,
  '/api/customer/returns', `/api/customer/returns/ret_${synthetic}`];
const checks = [];
const requests = [];
const sitemapPages = [];
const startedAt = new Date().toISOString();
let failure = null;
let cookie = null;
class AuditFailure extends Error {}
const check = (label, condition) => {
  if (!condition) throw new AuditFailure(label);
  checks.push(label);
};
const tokens = value => (value ?? '').toLowerCase().split(/[\s,]+/u).filter(Boolean);
const decode = value => value.replace(/&(#x[0-9a-f]+|#[0-9]+|amp|quot|apos|lt|gt|colon|sol|period|Tab|NewLine);/giu, (_entity, code) => {
  if (code[0] === '#') {
    const number = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    if (!Number.isSafeInteger(number) || number <= 0 || number > 0x10ffff) throw new AuditFailure('Entidad inválida en metadatos.');
    return String.fromCodePoint(number);
  }
  return { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', colon: ':', sol: '/', period: '.', tab: '\t', newline: '\n' }[code.toLowerCase()];
});

// Tokenizador del HTML emitido: ignora comentarios y texto raw de scripts/estilos.
// Lee atributos exactos, con comillas y primera aparición, como el navegador.
function tags(html) {
  const found = [];
  const pattern = /<!--[^]*?-->|<![^>]*>|<\/?([a-z][a-z0-9:-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/giu;
  for (let match; (match = pattern.exec(html));) {
    if (!match[1]) continue;
    const name = match[1].toLowerCase();
    const closing = match[0][1] === '/';
    const attributes = new Map();
    if (!closing) for (const [, rawName, quoted, single, unquoted] of match[2].matchAll(/([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu)) {
      const key = rawName.toLowerCase();
      if (!attributes.has(key)) attributes.set(key, decode(quoted ?? single ?? unquoted ?? ''));
    }
    found.push({ name, closing, attributes, index: match.index, end: pattern.lastIndex });
    if (!closing && ['script', 'style', 'textarea', 'title'].includes(name)) {
      const close = new RegExp(`</${name}\\s*>`, 'giu');
      close.lastIndex = pattern.lastIndex;
      const end = close.exec(html);
      if (!end) throw new AuditFailure('Elemento raw de HTML sin cierre.');
      pattern.lastIndex = close.lastIndex;
    }
  }
  return found;
}

function inspectHtml(html, path, { marker = null, privatePage = false, canonical = null } = {}) {
  const parsed = tags(html);
  const opening = parsed.filter(tag => !tag.closing);
  const metas = opening.filter(tag => tag.name === 'meta');
  const robots = metas.filter(tag => ['robots', 'googlebot'].includes((tag.attributes.get('name') ?? '').toLowerCase()))
    .flatMap(tag => tokens(tag.attributes.get('content')));
  const canonicals = opening.filter(tag => tag.name === 'link' && tokens(tag.attributes.get('rel')).includes('canonical'));
  check(`${path}: HTML sin redirección meta ni base ajena`, !metas.some(tag => (tag.attributes.get('http-equiv') ?? '').toLowerCase() === 'refresh')
    && !opening.some(tag => tag.name === 'base' && tag.attributes.has('href')));
  if (privatePage) {
    check(`${path}: noindex en HTML y sin canonical/hreflang efectivos`, robots.includes('noindex') && canonicals.length === 0
      && !opening.some(tag => tag.attributes.has('hreflang')));
  } else if (canonical !== null) {
    check(`${path}: canonical pública única coincide con sitemap`, canonicals.length === 1 && canonicals[0].attributes.get('href') === canonical);
    check(`${path}: página de sitemap indexable`, !robots.includes('noindex') && !robots.includes('none'));
  }
  check(`${path}: sin beacon activo ni sustituciones de envío`, opening.every(tag => !tag.attributes.has('data-cf-beacon')
    && !tag.attributes.has('formaction') && !tag.attributes.has('formmethod') && !tag.attributes.get('ping')));
  for (const tag of opening) {
    const candidates = ['href', 'src', 'action'].filter(name => tag.attributes.has(name)).map(name => tag.attributes.get(name));
    if (tag.attributes.has('srcset')) candidates.push(...tag.attributes.get('srcset').split(',').map(part => part.trim().split(/\s+/u)[0]));
    for (const value of candidates) {
      let url;
      try { url = new URL(value, BASE + path); } catch { throw new AuditFailure(`${path}: enlace o recurso mal formado.`); }
      check(`${path}: enlaces y recursos reales sin destino fixture ni beacon`, !url.hostname.endsWith('.test')
        && url.hostname !== 'static.cloudflareinsights.com' && !url.pathname.startsWith('/cdn-cgi/rum')
        && !['javascript:', 'vbscript:'].includes(url.protocol));
    }
  }
  check(`${path}: formularios globales solo simulados`, opening.filter(tag => tag.name === 'form').every(tag =>
    (tag.attributes.get('method') ?? 'get').toLowerCase() === 'dialog' && !tag.attributes.has('action')));
  if (marker !== null) {
    const roots = parsed.filter(tag => !tag.closing && tag.attributes.has(marker));
    check(`${path}: un módulo SSR de fixtures`, roots.length === 1);
    const root = roots[0];
    let depth = 1;
    let end = null;
    for (const tag of parsed.filter(tag => tag.index >= root.end)) {
      if (tag.name !== root.name) continue;
      depth += tag.closing ? -1 : 1;
      if (depth === 0) { end = tag.index; break; }
    }
    check(`${path}: raíz del módulo cerrada`, end !== null);
    const controls = opening.filter(tag => tag.index > root.index && tag.index < end);
    check(`${path}: módulo sin forms ni botones de envío`, controls.every(tag => tag.name !== 'form'
      && (tag.name !== 'button' || tag.attributes.get('type')?.toLowerCase() === 'button')));
    check(`${path}: controles SSR inertes antes de JavaScript`, controls.filter(tag => ['button', 'input', 'select', 'textarea'].includes(tag.name))
      .every(tag => tag.attributes.has('disabled')));
  }
}

async function request(path, method = 'GET', authenticated = false) {
  const url = new URL(path, BASE);
  check(`${method} ${url.pathname}: destino exclusivamente local`, url.origin === BASE && url.hash === '' && ['GET', 'HEAD'].includes(method));
  const headers = { 'accept': '*/*' };
  if (authenticated) {
    check('Cookie sintética disponible solo en memoria', typeof cookie === 'string' && cookie.length > 0);
    headers.cookie = cookie;
  }
  const response = await fetch(url, { method, headers, redirect: 'manual', signal: AbortSignal.timeout(15000) });
  const body = await response.text();
  check(`${method} ${url.pathname}: respuesta acotada`, Buffer.byteLength(body) <= 5 * 1024 * 1024);
  if (method === 'HEAD') check(`${method} ${url.pathname}: cuerpo vacío`, body === '');
  let redirectPath = null;
  if (response.headers.has('location')) {
    let next;
    try { next = new URL(response.headers.get('location'), url); } catch { throw new AuditFailure(`${url.pathname}: redirect mal formado.`); }
    check(`${method} ${url.pathname}: redirección manual permanece local`, next.origin === BASE && !next.hash && !next.username && !next.password);
    redirectPath = next.pathname;
  }
  requests.push({ method, path: url.pathname, authenticated, status: response.status, redirectPath,
    headers: { cacheControl: response.headers.get('cache-control'), vary: response.headers.get('vary'),
      robots: response.headers.get('x-robots-tag'), contentType: response.headers.get('content-type'),
      nosniff: response.headers.get('x-content-type-options') },
    setCookiePresent: response.headers.has('set-cookie'), bodyBytes: Buffer.byteLength(body) });
  return { response, body, path: url.pathname };
}
function privateHeaders(result, label) {
  const headers = result.response.headers;
  const cache = tokens(headers.get('cache-control'));
  const vary = tokens(headers.get('vary'));
  check(`${label}: respuesta privada no almacenable`, cache.includes('private') && cache.includes('no-store')
    && !cache.includes('public'));
  check(`${label}: Vary Cookie conservado`, vary.includes('cookie') || vary.includes('*'));
  check(`${label}: X-Robots-Tag excluye indexación`, tokens(headers.get('x-robots-tag')).includes('noindex'));
}
function notFound(result, method, api) {
  const label = `${method} ${result.path}`;
  check(`${label}: gate responde 404 sin redirección`, result.response.status === 404 && !result.response.headers.has('location'));
  privateHeaders(result, label);
  check(`${label}: sin cookies ni sniffing`, !result.response.headers.has('set-cookie') && result.response.headers.get('x-content-type-options') === 'nosniff');
  check(`${label}: tipo de contenido seguro`, result.response.headers.get('content-type')?.startsWith(api ? 'application/json' : 'text/plain'));
  if (method === 'GET') {
    if (api) {
      let value;
      try { value = JSON.parse(result.body); } catch { throw new AuditFailure(`${label}: respuesta JSON no válida.`); }
      check(`${label}: recurso uniforme sin datos personales`, JSON.stringify(value) === JSON.stringify({ error: { code: 'customer.resource.not_found' } }));
    } else check(`${label}: cuenta cerrada sin formulario ni documento HTML`, result.body.length > 0 && !/[<>]/u.test(result.body));
  }
}

try {
  for (const { path } of ADMINS) for (const method of ['GET', 'HEAD']) {
    const result = await request(path, method);
    check(`${method} ${path}: admin anónimo redirige al login`, result.response.status === 302
      && new URL(result.response.headers.get('location') ?? '', BASE).pathname === '/demo/admin/login');
    privateHeaders(result, `${method} ${path} sin sesión`);
    check(`${method} ${path}: redirección no crea sesión`, !result.response.headers.has('set-cookie'));
  }
  for (const method of ['GET', 'HEAD']) {
    const result = await request('/demo/admin/login', method);
    check(`${method} login: acceso guiado disponible`, result.response.status === 200);
    privateHeaders(result, `${method} login`);
    check(`${method} login: consultar no crea sesión`, !result.response.headers.has('set-cookie'));
    if (method === 'GET') inspectHtml(result.body, result.path, { privatePage: true });
  }
  const entry = await request('/demo/admin/login?tour=1&next=%2Fdemo%2Fadmin%2Fsegmentos');
  check('Entrada guiada GET: redirect explícito al destino permitido', entry.response.status === 303
    && new URL(entry.response.headers.get('location') ?? '', BASE).pathname === ADMINS[0].path);
  privateHeaders(entry, 'Entrada guiada GET');
  const setCookies = entry.response.headers.getSetCookie();
  check('Entrada guiada: solo una cookie admin sintética', setCookies.length === 1 && setCookies[0].startsWith('admin_session='));
  check('Entrada guiada: cookie HttpOnly y SameSite', /;\s*HttpOnly(?:;|$)/iu.test(setCookies[0]) && /;\s*SameSite=Lax(?:;|$)/iu.test(setCookies[0]));
  cookie = setCookies[0].split(';', 1)[0];
  for (const { path, marker } of ADMINS) for (const method of ['GET', 'HEAD']) {
    const result = await request(path, method, true);
    check(`${method} ${path}: fixture accesible con sesión guiada`, result.response.status === 200);
    privateHeaders(result, `${method} ${path} con sesión`);
    check(`${method} ${path}: lectura no renueva cookies`, !result.response.headers.has('set-cookie'));
    if (method === 'GET') inspectHtml(result.body, path, { marker, privatePage: true });
  }
  cookie = null;
  for (const [paths, api] of [[ACCOUNT_PAGES, false], [ACCOUNT_APIS, true]]) {
    for (const original of paths) for (const path of [original, original + '/']) for (const method of ['GET', 'HEAD']) {
      notFound(await request(path, method), method, api);
    }
  }
  const robots = await request('/robots.txt');
  const robotsHead = await request('/robots.txt', 'HEAD');
  check('Robots generado disponible por GET/HEAD', robots.response.status === 200 && robotsHead.response.status === 200);
  const directives = robots.body.split(/\r?\n/u).map(line => line.trim()).filter(line => line && !line.startsWith('#'));
  for (const path of ['/demo/', '/api/', '/cuenta/']) check(`Robots excluye ${path}`, directives.includes(`Disallow: ${path}`));
  check('Robots declara el sitemap público correcto', directives.includes(`Sitemap: ${PRODUCTION_ORIGIN}/sitemap.xml`));
  const sitemap = await request('/sitemap.xml');
  const sitemapHead = await request('/sitemap.xml', 'HEAD');
  check('Sitemap generado disponible por GET/HEAD', sitemap.response.status === 200 && sitemapHead.response.status === 200);
  const artifact = await readFile(new URL('../dist/sitemap.xml', import.meta.url), 'utf8');
  check('Se audita el sitemap del build final, no el placeholder de desarrollo', sitemap.body === artifact);
  check('Sitemap sin namespace alternativo ni hreflang ficticio', !/xhtml:|xmlns:xhtml|hreflang/iu.test(sitemap.body));
  check('Sitemap declara documento XML y un único urlset', /^<\?xml version="1\.0" encoding="UTF-8"\?>\s*<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/u.test(sitemap.body)
    && /<\/urlset>\s*$/u.test(sitemap.body));
  const entries = [...sitemap.body.matchAll(/<url>\s*<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>\s*<\/url>/gu)];
  const remainder = sitemap.body.replace(/<\?xml[^>]*\?>/u, '').replace(/<urlset\s+xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/u, '')
    .replace(/<\/urlset>/u, '').replace(/<url>\s*<loc>[^<]+<\/loc>\s*<lastmod>[^<]+<\/lastmod>\s*<\/url>/gu, '').trim();
  check('Sitemap tiene estructura y entradas acotadas', remainder === '' && entries.length > 0 && entries.length <= 1000);
  const seen = new Set();
  for (const [, encodedLoc, lastmod] of entries) {
    let loc;
    try { loc = new URL(decode(encodedLoc)); } catch { throw new AuditFailure('Sitemap contiene una URL inválida.'); }
    check('Sitemap usa URLs públicas canónicas del origen esperado', loc.origin === PRODUCTION_ORIGIN && !loc.search && !loc.hash
      && !loc.username && !loc.password && !/\/(?:demo|api|cuenta)(?:\/|$)/u.test(loc.pathname) && loc.pathname !== '/404');
    check('Sitemap no duplica entradas', !seen.has(loc.href)); seen.add(loc.href);
    check('Sitemap conserva lastmod válido', /^\d{4}-\d{2}-\d{2}$/u.test(lastmod)
      && Number.isFinite(Date.parse(lastmod)) && new Date(lastmod).toISOString().slice(0, 10) === lastmod);
    const page = await request(loc.pathname);
    const head = await request(loc.pathname, 'HEAD');
    check(`${loc.pathname}: destino sitemap servido sin redirect`, page.response.status === 200 && head.response.status === 200);
    check(`${loc.pathname}: destino sitemap sin cookie ni noindex HTTP`, !page.response.headers.has('set-cookie')
      && !head.response.headers.has('set-cookie') && !tokens(page.response.headers.get('x-robots-tag')).includes('noindex')
      && !tokens(head.response.headers.get('x-robots-tag')).includes('noindex'));
    inspectHtml(page.body, loc.pathname, { canonical: loc.href });
    sitemapPages.push({ path: loc.pathname, lastmod });
  }
} catch (error) {
  failure = error instanceof AuditFailure ? error.message : 'La auditoría HTTP local no pudo completarse.';
  process.exitCode = 1;
} finally {
  cookie = null;
  await mkdir(output, { recursive: true });
  await writeFile(resolve(output, 'http-report.json'), JSON.stringify({ schemaVersion: 1,
    scope: 'local-fixture-http-ssr-only', startedAt, completedAt: new Date().toISOString(),
    runner: 'node scripts/audit-r5-fixtures.mjs', nodeVersion: process.version,
    result: failure === null ? 'passed' : 'failed', checksPassed: checks.length, checks, failure,
    methods: ['GET', 'HEAD'], automaticRedirects: false, browserExecuted: false,
    cookieStoredInReport: false, bodiesStoredInReport: false, requests, sitemapPages,
  }, null, 2) + '\n');
  process.stdout.write(`${checks.length} comprobaciones HTTP/SSR correctas${failure ? `; fallo: ${failure}` : ''}; informe en ${output}/http-report.json\n`);
}
