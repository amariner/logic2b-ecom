import { readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

/** Comprueba HTML realmente prerenderizado: un binding no puede reescribirlo. */
export function assertDemoBuild(config, pages) {
  if (config.vars?.DEMO_MODE !== 'true') return { checked: false, pages: 0, forms: 0 };
  if ((config.triggers?.crons ?? []).length !== 0) throw new Error('La demo no admite cron triggers.');
  if (pages.length === 0) throw new Error('Faltan los documentos HTML de la demo.');
  let forms = 0;
  for (const { path, html } of pages) {
    if (/static\.cloudflareinsights\.com|data-cf-beacon/iu.test(html)) {
      throw new Error(`La demo contiene analítica activa en ${path}.`);
    }
    for (const [, tag, source] of html.matchAll(/<([a-z][a-z0-9:-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/giu)) {
      const attributes = new Map();
      for (const [, name, quoted, singleQuoted, unquoted] of source.matchAll(/([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu)) {
        const key = name.toLowerCase();
        // El navegador conserva la primera aparición de un atributo duplicado.
        if (!attributes.has(key)) attributes.set(key, quoted ?? singleQuoted ?? unquoted ?? '');
      }
      if (attributes.has('formaction') || attributes.has('formmethod')) {
        throw new Error(`La demo contiene una sustitución de envío de formulario en ${path}.`);
      }
      if (tag.toLowerCase() !== 'form') continue;
      const method = (attributes.get('method') ?? 'get').toLowerCase();
      if (method !== 'get' && method !== 'dialog') throw new Error(`La demo contiene un formulario mutante en ${path}.`);
      if (attributes.has('data-project-form')) {
        forms++;
        if (method !== 'dialog' || attributes.get('data-project-demo') !== 'true' || attributes.has('action')) {
          throw new Error(`El formulario de proyecto de ${path} no es una simulación local.`);
        }
      }
    }
  }
  if (forms === 0) throw new Error('No se encontró la muestra local del formulario de proyecto.');
  return { checked: true, pages: pages.length, forms };
}

async function htmlPages(directory, prefix = '') {
  const pages = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('_')) continue;
    const name = join(prefix, entry.name);
    if (entry.isDirectory()) pages.push(...await htmlPages(join(directory, entry.name), name));
    else if (entry.name.endsWith('.html')) pages.push({ path: name, html: await readFile(join(directory, entry.name), 'utf8') });
  }
  return pages;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(import.meta.dirname, '..');
  const parsed = ts.parseConfigFileTextToJson('wrangler.jsonc', await readFile(join(root, 'wrangler.jsonc'), 'utf8'));
  if (parsed.error) throw new Error('No se pudo validar la configuración de despliegue.');
  const result = assertDemoBuild(parsed.config, await htmlPages(join(root, 'dist')));
  console.log(result.checked
    ? `demo: ${result.pages} HTML y ${result.forms} formularios locales verificados; sin envíos, beacon ni cron`
    : 'demo: verificación de fixtures no aplicable a la configuración cliente');
}
