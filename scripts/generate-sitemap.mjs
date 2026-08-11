/**
 * Genera el sitemap desde el HTML REAL emitido por Astro.
 *
 * Solo entra una página cuando el artefacto final tiene canonical absoluta del
 * propio dominio, no tiene noindex ni meta-refresh, y canonical coincide con
 * su ruta de salida. El lastmod sale del último commit sustancial de la página
 * o de sus dependencias locales; una fuente sin commit usa su mtime real.
 */
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import {
  inspectIndexablePage,
  parseSitemap,
  renderSitemap,
} from '../src/modules/storefront/application/sitemap.ts';

const repoRoot = resolve(import.meta.dirname, '..');
const distRoot = join(repoRoot, 'dist');
const pagesRoot = join(repoRoot, 'src/pages');
// lastmod representa cambios sustanciales de contenido/estructura. Las hojas
// CSS globales cambian a menudo al añadir un tema aislado de /demo y no deben
// fingir que se reescribieron todas las páginas comerciales ese día.
const sourceExtensions = ['.astro', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.json'];
const dependencyCache = new Map();
const dateCache = new Map();

function walkFiles(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? walkFiles(path) : [path];
  });
}

function outputPathname(file) {
  const output = relative(distRoot, file).split(sep).join('/');
  if (output === 'index.html') return '/';
  if (output.endsWith('/index.html')) return `/${output.slice(0, -'index.html'.length)}`;
  return `/${output.slice(0, -'.html'.length)}`;
}

function routePattern(file) {
  let route = relative(pagesRoot, file).split(sep).join('/').replace(/\.astro$/, '');
  if (route === 'index') route = '';
  else route = route.replace(/\/index$/, '');

  const staticSegments = route.split('/').filter(Boolean).filter((segment) => !segment.startsWith('[')).length;
  const expression = route
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      if (/^\[\.\.\..+\]$/.test(segment)) return '.+';
      if (/^\[.+\]$/.test(segment)) return '[^/]+';
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { file, regex: new RegExp(`^/${expression}$`), staticSegments };
}

const pageRoutes = walkFiles(pagesRoot)
  .filter((file) => extname(file) === '.astro' && !file.startsWith(join(pagesRoot, 'api') + sep))
  .map(routePattern);

function sourceRouteFor(pathname) {
  const normalized = pathname === '/' ? '/' : pathname.replace(/\/$/, '');
  const matches = pageRoutes.filter((route) => route.regex.test(normalized));
  matches.sort((left, right) => right.staticSegments - left.staticSegments);
  return matches[0]?.file ?? null;
}

function resolveLocalImport(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  const cleanSpecifier = specifier.split(/[?#]/, 1)[0];
  if (!cleanSpecifier) return null;
  if (cleanSpecifier.endsWith('.css')) return null;
  const unresolved = resolve(dirname(fromFile), cleanSpecifier);
  const candidates = [
    unresolved,
    ...sourceExtensions.map((extension) => `${unresolved}${extension}`),
    ...sourceExtensions.map((extension) => join(unresolved, `index${extension}`)),
  ];
  const match = candidates.find((candidate) => existsSync(candidate) && lstatSync(candidate).isFile());
  return match ? realpathSync(match) : null;
}

function localDependencies(file) {
  const canonicalFile = realpathSync(file);
  const cached = dependencyCache.get(canonicalFile);
  if (cached) return cached;

  const dependencies = new Set([canonicalFile]);
  dependencyCache.set(canonicalFile, dependencies);
  const source = readFileSync(canonicalFile, 'utf8');
  const importPattern = /(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(importPattern)) {
    const imported = match[1] ? resolveLocalImport(canonicalFile, match[1]) : null;
    if (!imported) continue;
    // Recorremos el árbol visual de componentes Astro. Los módulos TS directos
    // solo cuentan si son fuentes editoriales reconocibles. Así un cambio de
    // pagos, inventario o configuración del panel no falsea el lastmod público.
    if (extname(imported) === '.astro') {
      dependencies.add(imported);
      for (const nested of localDependencies(imported)) dependencies.add(nested);
    } else {
      const localPath = relative(repoRoot, imported).split(sep).join('/');
      const isEditorialData =
        localPath.startsWith('seed/') ||
        localPath.startsWith('src/content/') ||
        localPath.startsWith('src/collections/') ||
        [
          'src/lib/contact.ts',
          'src/lib/demo-themes.ts',
          'src/lib/nav.ts',
          'src/lib/theme-catalog.ts',
        ].includes(localPath);
      if (isEditorialData) dependencies.add(imported);
    }
  }
  return dependencies;
}

function isoDate(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function sourceDate(file) {
  const cached = dateCache.get(file);
  if (cached) return cached;

  const relativeFile = relative(repoRoot, file);
  let date = '';
  try {
    const status = execFileSync('git', ['status', '--porcelain', '--', relativeFile], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim();
    if (status) {
      date = isoDate(lstatSync(file).mtimeMs);
    } else {
      date = execFileSync('git', ['log', '-1', '--format=%cs', '--', relativeFile], {
        cwd: repoRoot,
        encoding: 'utf8',
      }).trim();
    }
  } catch {
    // Un source exportado sin .git conserva como mínimo su fecha real de mtime.
  }
  if (!date) date = isoDate(lstatSync(file).mtimeMs);
  dateCache.set(file, date);
  return date;
}

function lastmodFor(sourceRoute) {
  const datedSources = [...localDependencies(sourceRoute)].map((file) => ({ file, date: sourceDate(file) }));
  datedSources.sort((left, right) => left.date.localeCompare(right.date));
  if (process.env.SITEMAP_DEBUG === '1') {
    const latest = datedSources.at(-1)?.date;
    for (const source of datedSources.filter((candidate) => candidate.date === latest)) {
      console.log(`lastmod source: ${relative(repoRoot, source.file)}`);
    }
  }
  return datedSources.at(-1)?.date;
}

const entries = [];
for (const file of walkFiles(distRoot).filter((candidate) => extname(candidate) === '.html')) {
  const pathname = outputPathname(file);
  const loc = inspectIndexablePage({ pathname, html: readFileSync(file, 'utf8') });
  if (!loc) continue;
  const sourceRoute = sourceRouteFor(pathname);
  if (!sourceRoute) throw new Error(`No se puede resolver el source de ${pathname}`);
  const lastmod = lastmodFor(sourceRoute);
  if (!lastmod) throw new Error(`No se puede resolver lastmod de ${pathname}`);
  entries.push({ loc, lastmod });
}

entries.sort((left, right) => left.loc.localeCompare(right.loc, 'es'));
if (entries.length > 50_000) {
  throw new Error('El sitemap supera 50.000 URLs; hay que generar un índice antes de desplegar');
}

const xml = renderSitemap(entries);
if (Buffer.byteLength(xml) > 50 * 1024 * 1024) {
  throw new Error('El sitemap supera 50 MB sin comprimir; hay que generar un índice antes de desplegar');
}
const parsed = parseSitemap(xml);
if (parsed.length !== entries.length) throw new Error('La verificación XML perdió entradas');

writeFileSync(join(distRoot, 'sitemap.xml'), xml, 'utf8');
console.log(`sitemap.xml: ${entries.length} URLs canónicas e indexables`);
for (const entry of entries) console.log(`${entry.lastmod}  ${entry.loc}`);
