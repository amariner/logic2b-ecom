/**
 * Línea base estática y reproducible de los escaparates públicos.
 *
 * No importa módulos de la aplicación ni levanta Astro: compara los registros
 * explícitos y mide únicamente archivos versionados. De ese modo también puede
 * detectar que un registro olvidó un tema. Los bytes de assets son el total del
 * directorio de la colección (techo aproximado, no transferencia de red) y los
 * bytes JS son fuente cruda dentro de <script> (no bundle comprimido).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPORT_DIR = 'docs/audits';
const REPORT_MD = `${REPORT_DIR}/THEME_BASELINE.md`;
const REPORT_JSON = `${REPORT_DIR}/theme-baseline.json`;
const REQUIRED_CAPTURES = ['catalog', 'mobile', 'product', 'card560', 'card900'];
const SURFACE_COMPONENTS = {
  product: 'ProductPage',
  cart: 'CartPage',
  checkout: 'CheckoutPage',
  thanks: 'ThanksPage',
};

function read(root, path) {
  return readFileSync(join(root, path), 'utf8');
}

function walk(root, path) {
  const absolute = join(root, path);
  if (!existsSync(absolute)) return [];
  const files = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) files.push(...walk(root, child));
    else files.push(child);
  }
  return files.toSorted();
}

function byteSize(root, paths) {
  return paths.reduce((total, path) => total + statSync(join(root, path)).size, 0);
}

function sliceBalanced(source, marker, opener, closer, occurrence = 0) {
  let markerAt = -1;
  let from = 0;
  for (let index = 0; index <= occurrence; index += 1) {
    markerAt = source.indexOf(marker, from);
    if (markerAt < 0) throw new Error(`No se encontró el marcador: ${marker}`);
    from = markerAt + marker.length;
  }
  // Las declaraciones TypeScript pueden llevar el mismo delimitador en el
  // tipo (`DemoTheme[]`). El valor empieza después del `=` de la declaración.
  const assignment = source.indexOf('=', markerAt + marker.length);
  const start = source.indexOf(opener, assignment >= 0 ? assignment + 1 : markerAt + marker.length);
  if (start < 0) throw new Error(`No se encontró ${opener} tras ${marker}`);

  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === opener) depth += 1;
    if (char === closer) {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`No se pudo cerrar ${marker}`);
}

function stringLiterals(source) {
  return [...source.matchAll(/['"]([a-z0-9-]+)['"]/g)].map((match) => match[1]);
}

function idsInObjects(source) {
  return [...source.matchAll(/\bid:\s*['"]([a-z0-9-]+)['"]/g)].map((match) => match[1]);
}

function unique(values) {
  return [...new Set(values)].toSorted();
}

function difference(expected, actual) {
  const haystack = new Set(actual);
  return expected.filter((value) => !haystack.has(value));
}

function registryDiff(themeIds, ids) {
  return { count: ids.length, missing: difference(themeIds, ids), extra: difference(ids, themeIds) };
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
}

function scriptBytes(source) {
  return [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .reduce((total, match) => total + Buffer.byteLength(match[1].trim()), 0);
}

function storageKeys(source) {
  const direct = [...source.matchAll(/localStorage\.(?:getItem|setItem|removeItem)\(\s*['"]([^'"]+)['"]/g)]
    .map((match) => match[1]);
  const aliases = [...source.matchAll(/\b(?:key|cartKey)\s*=\s*['"]([^'"]*(?:cart|basket)[^'"]*)['"]/gi)]
    .map((match) => match[1]);
  return unique([...direct, ...aliases]);
}

function themeEntry(source, id) {
  const marker = `\n    id: '${id}',`;
  const start = source.indexOf(marker);
  if (start < 0) return '';
  const next = source.indexOf('\n    id: ', start + marker.length);
  return source.slice(start, next < 0 ? source.indexOf('// new-theme:themes', start) : next);
}

function addFinding(findings, severity, id, title, themes, evidence, destination) {
  findings.push({ severity, id, title, themes: unique(themes), evidence, destination });
}

/**
 * Gate de integridad del escaparate. Mantiene el diagnóstico rico del informe,
 * pero separa las divergencias que nunca deben llegar a una rama verde.
 */
export function themeIntegrityErrors(report) {
  const errors = [];
  for (const [name, registry] of Object.entries(report.registries)) {
    const details = [];
    if (registry.missing.length > 0) details.push(`faltan: ${registry.missing.join(', ')}`);
    if (registry.extra.length > 0) details.push(`sobran: ${registry.extra.join(', ')}`);
    if (details.length > 0) errors.push(`registro ${name} — ${details.join(' · ')}`);
  }
  for (const theme of report.themes) {
    const missingCaptures = REQUIRED_CAPTURES.filter((name) => !theme.evidence.captures[name]);
    if (missingCaptures.length > 0) errors.push(`capturas ${theme.id} — faltan: ${missingCaptures.join(', ')}`);
    if (theme.catalog.missingAssets.length > 0) {
      errors.push(`assets ${theme.id} — faltan: ${theme.catalog.missingAssets.join(', ')}`);
    }
  }
  return errors;
}

export function buildThemeBaseline(rootDir = process.cwd()) {
  const root = resolve(rootDir);
  const themeSource = read(root, 'src/lib/demo-themes.ts');
  const themeArray = sliceBalanced(themeSource, 'export const demoThemes', '[', ']');
  const themeIds = idsInObjects(themeArray).filter((id) => id !== 'base');

  const collectionSource = read(root, 'src/collections/index.ts');
  const collectionArray = sliceBalanced(collectionSource, 'export const collections', '[', ']');
  const collectionIds = unique(
    [...collectionArray.matchAll(/^\s{2}([a-z][A-Za-z0-9]*)Collection,/gm)]
      .map((match) => match[1])
      .filter((id) => id !== 'demo'),
  );

  const seedSource = read(root, 'seed/collections/index.ts');
  const seedArray = sliceBalanced(seedSource, 'export const collectionSeedProducts', '[', ']');
  const seedIds = unique([...seedArray.matchAll(/^\s{2}\.\.\.([a-z][A-Za-z0-9]*)SeedProducts,/gm)].map((match) => match[1]));

  const catalogSource = read(root, 'src/components/store/CatalogPage.astro');
  const catalogObject = sliceBalanced(catalogSource, 'const catalogViews', '{', '}');
  const catalogIds = unique([...catalogObject.matchAll(/^\s{2}(?:['"])?([a-z0-9-]+)(?:['"])?:/gm)].map((match) => match[1]));

  const a11ySource = read(root, 'scripts/a11y-audit.mjs');
  const a11yIds = unique(idsInObjects(sliceBalanced(a11ySource, 'const STORES', '[', ']')).filter((id) => id !== 'demo'));

  const captureSource = read(root, 'scripts/capture-screens.mjs');
  const captureIds = unique(idsInObjects(sliceBalanced(captureSource, 'const STORES', '[', ']')).filter((id) => id !== 'demo'));
  const captureProductIds = unique(idsInObjects(sliceBalanced(captureSource, 'const FICHAS', '[', ']')).filter((id) => id !== 'demo'));

  const homeSource = read(root, 'src/pages/index.astro');
  const galleryIds = unique(stringLiterals(sliceBalanced(homeSource, 'const galleryOrder', '[', ']')).filter((id) => id !== 'demo'));
  const docsIds = walk(root, 'docs/temas').filter((path) => path.endsWith('.md')).map((path) => path.split('/').pop().replace(/\.md$/, ''));
  const componentIds = walk(root, 'src/components/themes')
    .map((path) => relative('src/components/themes', dirname(path)).split('/')[0])
    .filter(Boolean);

  const registries = {
    themes: registryDiff(themeIds, themeIds),
    collections: registryDiff(themeIds, collectionIds),
    seeds: registryDiff(themeIds, seedIds),
    catalogViews: registryDiff(themeIds, catalogIds),
    a11y: registryDiff(themeIds, a11yIds),
    captureCatalog: registryDiff(themeIds, captureIds),
    captureProduct: registryDiff(themeIds, captureProductIds),
    homeGallery: registryDiff(themeIds, galleryIds),
    docs: registryDiff(themeIds, unique(docsIds)),
    components: registryDiff(themeIds, unique(componentIds)),
  };

  const dynamicRoutes = {
    product: read(root, 'src/pages/demo/tiendas/[collection]/[slug].astro'),
    cart: read(root, 'src/pages/demo/tiendas/[collection]/carrito.astro'),
    checkout: read(root, 'src/pages/demo/tiendas/[collection]/checkout.astro'),
    thanks: read(root, 'src/pages/demo/tiendas/[collection]/gracias.astro'),
  };
  const shopLayoutSource = read(root, 'src/layouts/Shop.astro');
  const sharedCanonical = shopLayoutSource.includes('canonicalPath={Astro.url.pathname}');

  const themes = themeIds.map((id) => {
    const entry = themeEntry(themeSource, id);
    const customRouteDir = `src/pages/demo/tiendas/${id}`;
    const customRouteFiles = walk(root, customRouteDir).filter((path) => path.endsWith('.astro'));
    const routeSources = customRouteFiles.length > 0
      ? Object.fromEntries(Object.keys(SURFACE_COMPONENTS).map((surface) => {
          const file = surface === 'product' ? '[slug].astro' : `${surface === 'cart' ? 'carrito' : surface === 'thanks' ? 'gracias' : surface}.astro`;
          const path = join(customRouteDir, file);
          return [surface, existsSync(join(root, path)) ? read(root, path) : ''];
        }))
      : dynamicRoutes;
    const sharedSurfaces = Object.fromEntries(
      Object.entries(SURFACE_COMPONENTS).map(([surface, component]) => [surface, routeSources[surface].includes(component)]),
    );
    const themeFiles = [
      ...walk(root, `src/components/themes/${id}`),
      `src/collections/${id}.ts`,
      `seed/collections/${id}.ts`,
      ...customRouteFiles,
    ].filter((path) => existsSync(join(root, path)) && statSync(join(root, path)).isFile());
    const sources = themeFiles.map((path) => read(root, path));
    const combinedSource = sources.join('\n');
    const assets = walk(root, `public/images/collections/${id}`).filter((path) => !path.endsWith('.gitkeep'));
    const formats = {};
    for (const asset of assets) {
      const extension = extname(asset).toLowerCase().slice(1) || 'none';
      formats[extension] = (formats[extension] ?? 0) + 1;
    }
    const capturePaths = {
      catalog: `public/images/screens/store-${id}-catalog.webp`,
      mobile: `public/images/screens/store-${id}-catalog-m.webp`,
      product: `public/images/screens/store-${id}-product.webp`,
      card560: `public/images/screens/store-${id}-catalog-560.webp`,
      card900: `public/images/screens/store-${id}-catalog-900.webp`,
    };
    const captures = Object.fromEntries(Object.entries(capturePaths).map(([name, path]) => [name, existsSync(join(root, path))]));
    const seedFile = `seed/collections/${id}.ts`;
    const seedText = existsSync(join(root, seedFile)) ? read(root, seedFile) : '';
    const referencedAssets = unique([...seedText.matchAll(/['"](\/images\/collections\/[^'"]+)['"]/g)].map((match) => match[1]));
    const missingAssets = referencedAssets.filter((path) => !existsSync(join(root, `public${path}`)));
    const configuredCartKey = a11ySource.match(new RegExp(`id: '${id}'[^\\n]*cartKey: '([^']+)'`))?.[1] ?? null;
    const discoveredStorageKeys = storageKeys(combinedSource);
    const expectedCartKey = `ecom-cart:${id}`;
    const privateStorageKeys = unique([configuredCartKey, ...discoveredStorageKeys]
      .filter(Boolean)
      .filter((key) => key !== expectedCartKey));
    const referenceFile = entry.match(/reference:\s*\{[^}]*file:\s*'([^']+)'/)?.[1] ?? null;
    const samplePath = entry.match(/sample:\s*'([^']+)'/)?.[1] ?? null;
    const status = entry.match(/status:\s*'([^']+)'/)?.[1] ?? 'unknown';

    return {
      id,
      status,
      registries: Object.fromEntries(Object.entries(registries).map(([name, registry]) => [name, !registry.missing.includes(id)])),
      routes: {
        mode: customRouteFiles.length > 0 ? 'custom' : 'dynamic',
        sharedSurfaces,
        sharedContract: Object.values(sharedSurfaces).every(Boolean),
        customFiles: customRouteFiles,
      },
      storage: { expectedCartKey, configuredCartKey, privateKeys: privateStorageKeys },
      metadata: {
        noindex: Object.values(routeSources).every((source) => source.includes('Shop') || Object.values(SURFACE_COMPONENTS).some((name) => source.includes(name))),
        description: Object.values(routeSources).every((source) => source.includes('description=') || Object.values(SURFACE_COMPONENTS).some((name) => source.includes(name))),
        canonical: Object.values(routeSources).every((source) =>
          source.includes('canonicalPath=')
          || source.includes('rel="canonical"')
          || (sharedCanonical && (source.includes('Shop') || Object.values(SURFACE_COMPONENTS).some((name) => source.includes(name)))),
        ),
        productJsonLd: routeSources.product.includes('ProductPage') || routeSources.product.includes('application/ld+json'),
      },
      evidence: {
        doc: existsSync(join(root, `docs/temas/${id}.md`)),
        reference: Boolean(referenceFile) && existsSync(join(root, `public/images/referencias/${referenceFile}`)),
        referenceFile,
        sample: Boolean(samplePath) && existsSync(join(root, `public${samplePath}`)),
        samplePath,
        captures,
      },
      catalog: { products: (seedText.match(/\bslug:\s*['"]/g) ?? []).length, missingAssets },
      assets: { files: assets.length, bytes: byteSize(root, assets), formats },
      source: {
        files: themeFiles.length,
        bytes: byteSize(root, themeFiles),
        scriptBlocks: (combinedSource.match(/<script(?:\s[^>]*)?>/g) ?? []).length,
        scriptBytes: sources.reduce((total, source) => total + scriptBytes(source), 0),
      },
    };
  });

  const findings = [];
  const brokenCore = themes.filter((theme) => !theme.registries.collections || !theme.registries.seeds || !theme.registries.catalogViews || theme.catalog.missingAssets.length > 0);
  if (brokenCore.length > 0) addFinding(findings, 'P0', 'TH0.2-P0-01', 'Escaparate sin registro o asset de producto esencial', brokenCore.map((theme) => theme.id), 'Falta colección, seed, vista de catálogo o un asset referenciado por el seed.', 'Corregir antes de abrir TH0.3.');

  const registryDrift = themes.filter((theme) => Object.entries(theme.registries)
    .some(([name, present]) => !present && !['themes', 'components'].includes(name)));
  if (registryDrift.length > 0) addFinding(findings, 'P1', 'TH0.2-P1-01', 'Deriva entre registros explícitos', registryDrift.map((theme) => theme.id), 'Algún tema no está en colección, seed, catálogo, auditor, capturas, galería o ficha.', 'TH0.4 · guardas contra deriva.');

  const privateCommerce = themes.filter((theme) => !theme.routes.sharedContract || theme.storage.privateKeys.length > 0);
  if (privateCommerce.length > 0) addFinding(findings, 'P1', 'TH0.2-P1-02', 'Recorrido comercial o storage privado', privateCommerce.map((theme) => theme.id), privateCommerce.map((theme) => `${theme.id}: ${theme.storage.privateKeys.join(', ') || 'superficie propia'}`).join(' · '), 'TH0.5 · migración al contrato local común.');

  const missingJsonLd = themes.filter((theme) => !theme.metadata.productJsonLd);
  if (missingJsonLd.length > 0) addFinding(findings, 'P1', 'TH0.2-P1-03', 'Ficha sin Product + Offer compartido', missingJsonLd.map((theme) => theme.id), 'Las rutas privadas no componen ProductPage ni emiten JSON-LD propio.', 'TH0.5 · migración al contrato local común.');

  const missingCaptures = themes.filter((theme) => REQUIRED_CAPTURES.some((name) => !theme.evidence.captures[name]));
  if (missingCaptures.length > 0) addFinding(findings, 'P1', 'TH0.2-P1-04', 'Evidencia visual incompleta', missingCaptures.map((theme) => theme.id), missingCaptures.map((theme) => `${theme.id}: ${REQUIRED_CAPTURES.filter((name) => !theme.evidence.captures[name]).join(', ')}`).join(' · '), 'TH0.3 · auditoría visual y regeneración de evidencia.');

  const noCanonical = themes.filter((theme) => !theme.metadata.canonical);
  if (noCanonical.length > 0) addFinding(findings, 'P2', 'TH0.2-P2-01', 'Demos noindex sin canonical explícita', noCanonical.map((theme) => theme.id), 'Shop activa noindex,follow pero no entrega canonicalPath al layout Base.', 'TH0.6 · consolidación del contrato SEO compartido.');

  const heavyAssets = themes.filter((theme) => theme.assets.bytes >= 2.5 * 1024 ** 2);
  if (heavyAssets.length > 0) addFinding(findings, 'P2', 'TH0.2-P2-02', 'Directorio de assets por encima de 2,5 MB', heavyAssets.map((theme) => theme.id), heavyAssets.map((theme) => `${theme.id}: ${formatBytes(theme.assets.bytes)}`).join(' · '), 'TH0.3 · medir payload servido y priorizar optimización.');

  const legacyFormats = themes.filter((theme) => Object.keys(theme.assets.formats).some((format) => !['webp', 'avif'].includes(format)));
  if (legacyFormats.length > 0) addFinding(findings, 'P2', 'TH0.2-P2-03', 'Assets raster/vídeo fuera del formato base', legacyFormats.map((theme) => theme.id), legacyFormats.map((theme) => `${theme.id}: ${Object.entries(theme.assets.formats).map(([format, count]) => `${format}×${count}`).join(', ')}`).join(' · '), 'TH0.3 · validar necesidad, compresión y carga real por viewport.');

  const highJs = themes.filter((theme) => theme.source.scriptBytes >= 12 * 1024);
  if (highJs.length > 0) addFinding(findings, 'P2', 'TH0.2-P2-04', 'JavaScript propio por encima de 12 KB de fuente', highJs.map((theme) => theme.id), highJs.map((theme) => `${theme.id}: ${formatBytes(theme.source.scriptBytes)}`).join(' · '), 'TH0.3 · perfilar bundle y justificar mejora de tarea.');

  const missingFallback = themes.filter((theme) => !theme.evidence.sample);
  if (missingFallback.length > 0) addFinding(findings, 'P3', 'TH0.2-P3-01', 'Muestra estática de fallback ausente', missingFallback.map((theme) => theme.id), 'La tarjeta de /temas funciona por captura viva, pero el fallback sample declarado no existe.', 'TH5.2 · productización de /temas.');

  const docsThemeCount = Number(read(root, 'docs/TEMAS.md').match(/son\s+(\d+)\s+direcciones/i)?.[1] ?? themeIds.length);
  if (docsThemeCount !== themeIds.length) addFinding(findings, 'P3', 'TH0.2-P3-02', 'Recuento editorial de temas desactualizado', [], `docs/TEMAS.md declara ${docsThemeCount}; el registro contiene ${themeIds.length}.`, 'TH0.6 · actualización de contratos y documentación.');

  findings.sort((a, b) => a.severity.localeCompare(b.severity) || a.id.localeCompare(b.id));
  return {
    schemaVersion: 1,
    scope: { themes: themeIds.length, ids: themeIds },
    methodology: {
      assetBytes: 'Suma de archivos bajo public/images/collections/<id>; techo de inventario, no transferencia de red.',
      scriptBytes: 'Contenido fuente de bloques <script> en componentes y rutas propias; no bundle ni gzip.',
      requiredCaptures: REQUIRED_CAPTURES,
    },
    registries,
    summary: {
      severities: Object.fromEntries(['P0', 'P1', 'P2', 'P3'].map((severity) => [severity, findings.filter((finding) => finding.severity === severity).length])),
      sharedContract: themes.filter((theme) => theme.routes.sharedContract).length,
      privateCommerce: privateCommerce.length,
      completeCaptureSets: themes.filter((theme) => REQUIRED_CAPTURES.every((name) => theme.evidence.captures[name])).length,
      assetBytes: themes.reduce((total, theme) => total + theme.assets.bytes, 0),
      scriptBytes: themes.reduce((total, theme) => total + theme.source.scriptBytes, 0),
    },
    findings,
    themes,
  };
}

function mark(value) {
  return value ? '✓' : '—';
}

export function renderThemeBaselineMarkdown(report) {
  const lines = [
    `# Línea base automática de los ${report.scope.themes} temas`,
    '',
    '> Generado por `node scripts/theme-baseline.mjs --write`. No editar las tablas a mano.',
    '',
    '## Alcance y método',
    '',
    `El informe cubre **${report.scope.themes} escaparates** (Base y la colección transaccional \`demo\` quedan fuera). El análisis es estático y reproducible: compara registros versionados, rutas, fichas, capturas y assets sin arrancar Astro ni consultar D1.`,
    '',
    `- Assets: ${report.methodology.assetBytes}`,
    `- JavaScript: ${report.methodology.scriptBytes}`,
    '- Metadatos: se comprueba `noindex`, descripción, canonical y Product + Offer por composición de ruta.',
    '',
    '## Resumen',
    '',
    `- Registros canónicos: ${Object.entries(report.registries).map(([name, value]) => `${name} ${value.count}/${report.scope.themes}`).join(' · ')}`,
    `- Contrato compartido completo: **${report.summary.sharedContract}/${report.scope.themes}** · recorrido/storage privado: **${report.summary.privateCommerce}**.`,
    `- Evidencia completa (catálogo, móvil, ficha, 560 y 900): **${report.summary.completeCaptureSets}/${report.scope.themes}**.`,
    `- Inventario de assets: **${formatBytes(report.summary.assetBytes)}** · JS propio crudo: **${formatBytes(report.summary.scriptBytes)}**.`,
    `- Hallazgos: **P0 ${report.summary.severities.P0} · P1 ${report.summary.severities.P1} · P2 ${report.summary.severities.P2} · P3 ${report.summary.severities.P3}**.`,
    '',
    '## Hallazgos P0–P3',
    '',
  ];

  for (const severity of ['P0', 'P1', 'P2', 'P3']) {
    lines.push(`### ${severity}`, '');
    const findings = report.findings.filter((finding) => finding.severity === severity);
    if (findings.length === 0) lines.push('- Sin hallazgos.', '');
    for (const finding of findings) {
      lines.push(`- **${finding.id} · ${finding.title}.** ${finding.themes.length > 0 ? `Temas: ${finding.themes.join(', ')}. ` : ''}${finding.evidence} Destino: ${finding.destination}`, '');
    }
  }

  lines.push(
    '## Inventario por tema',
    '',
    '| Tema | Registros | Ruta/contrato | SEO | Capturas | Productos | Assets | Fuente / JS |',
    '|---|---:|---|---|---|---:|---:|---:|',
  );
  for (const theme of report.themes) {
    const registryCount = Object.values(theme.registries).filter(Boolean).length;
    const captureState = REQUIRED_CAPTURES.map((name) => mark(theme.evidence.captures[name])).join('');
    const formats = Object.entries(theme.assets.formats).map(([format, count]) => `${format}×${count}`).join(' ');
    lines.push(`| ${theme.id} | ${registryCount}/${Object.keys(theme.registries).length} | ${theme.routes.mode} / ${theme.routes.sharedContract ? 'común' : 'privado'} | N${mark(theme.metadata.noindex)} C${mark(theme.metadata.canonical)} J${mark(theme.metadata.productJsonLd)} | ${captureState} | ${theme.catalog.products} | ${formatBytes(theme.assets.bytes)} · ${formats || '—'} | ${formatBytes(theme.source.bytes)} / ${formatBytes(theme.source.scriptBytes)} |`);
  }
  lines.push(
    '',
    'Leyenda de SEO: N `noindex`, C canonical, J Product + Offer. Capturas: catálogo, móvil, ficha, tarjeta 560 y tarjeta 900, en ese orden.',
    '',
    '## Divergencias entre registros',
    '',
    '| Registro | Presentes | Faltan | Sobran |',
    '|---|---:|---|---|',
  );
  for (const [name, registry] of Object.entries(report.registries)) {
    lines.push(`| ${name} | ${registry.count} | ${registry.missing.join(', ') || '—'} | ${registry.extra.join(', ') || '—'} |`);
  }
  lines.push('', 'El detalle máquina-legible vive en `docs/audits/theme-baseline.json`.', '');
  return lines.join('\n');
}

function writeReport(root, report) {
  const markdown = renderThemeBaselineMarkdown(report);
  mkdirSync(join(root, REPORT_DIR), { recursive: true });
  writeFileSync(join(root, REPORT_MD), markdown);
  writeFileSync(join(root, REPORT_JSON), `${JSON.stringify(report, null, 2)}\n`);
  return { markdown, json: `${JSON.stringify(report, null, 2)}\n` };
}

function main() {
  const root = process.cwd();
  const report = buildThemeBaseline(root);
  const markdown = renderThemeBaselineMarkdown(report);
  const args = new Set(process.argv.slice(2));
  if (args.has('--write')) {
    writeReport(root, report);
    process.stdout.write(`Escritos ${REPORT_MD} y ${REPORT_JSON}\n`);
    return;
  }
  if (args.has('--check')) {
    const integrityErrors = themeIntegrityErrors(report);
    if (integrityErrors.length > 0) {
      process.stderr.write(`Deriva de temas detectada:\n${integrityErrors.map((error) => `  - ${error}`).join('\n')}\n`);
      process.stderr.write('Ejecuta pnpm new:theme <id> para alinear registros y genera sus capturas antes de continuar.\n');
      process.exitCode = 1;
      return;
    }
    const expectedJson = `${JSON.stringify(report, null, 2)}\n`;
    const currentMarkdown = existsSync(join(root, REPORT_MD)) ? read(root, REPORT_MD) : '';
    const currentJson = existsSync(join(root, REPORT_JSON)) ? read(root, REPORT_JSON) : '';
    if (currentMarkdown !== markdown || currentJson !== expectedJson) {
      process.stderr.write('La línea base de temas está desactualizada; ejecuta pnpm audit:themes.\n');
      process.exitCode = 1;
    } else process.stdout.write('Línea base de temas actualizada.\n');
    return;
  }
  process.stdout.write(args.has('--json') ? `${JSON.stringify(report, null, 2)}\n` : markdown);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
