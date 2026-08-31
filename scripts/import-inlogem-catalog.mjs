#!/usr/bin/env node
/**
 * Snapshot manual del catálogo público que hoy sirve Inlogem mediante Liderpapel.
 * Nunca se ejecuta en build ni en runtime. `--refresh` es obligatorio para
 * sustituir un snapshot existente y conserva los precios demo por código.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = join(ROOT, 'src/proposals/inlogem/catalog.json');
const IMAGE_DIR = join(ROOT, 'public/images/proposals/inlogem/products');
const REFRESH = process.argv.includes('--refresh');
const CAPTURED_AT = new Date().toISOString().slice(0, 10);
const HEADERS = {
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  'accept-language': 'es-ES,es;q=0.9',
  referer: 'https://www.liderpapel.com/',
};

export const categorySources = Object.freeze([
  { id: 'inl-escritura', code: '3', slug: 'escritura', base: 190, spread: 1800 },
  { id: 'inl-papel', code: '6', slug: 'papel-y-etiquetas', base: 490, spread: 3600 },
  { id: 'inl-archivo', code: '5', slug: 'archivo', base: 290, spread: 3200 },
  { id: 'inl-tecnologia', code: '2', slug: 'informatica', base: 1290, spread: 23800 },
  { id: 'inl-mobiliario', code: '29', slug: 'mobiliario', base: 4990, spread: 29400 },
  { id: 'inl-embalaje', code: '7', slug: 'embalaje', base: 390, spread: 6500 },
  { id: 'inl-escolar', code: '8', slug: 'escolar', base: 150, spread: 3800 },
  { id: 'inl-servicios', code: '252', slug: 'servicios-generales', base: 290, spread: 7600 },
]);

function decodeEntities(value) {
  const named = { amp: '&', quot: '"', apos: "'", nbsp: ' ', lt: '<', gt: '>', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ' };
  return value
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_m, n) => String.fromCodePoint(Number.parseInt(n, 16)))
    .replace(/&([a-zA-Z]+);/g, (match, name) => named[name] ?? match);
}
export function cleanText(value = '') {
  return decodeEntities(value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
}
function slugify(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 74);
}
async function fetchLatin1(url) {
  const response = await fetch(url, { headers: HEADERS });
  if (!response.ok) throw new Error(`${response.status} al leer ${url}`);
  return new TextDecoder('iso-8859-15').decode(await response.arrayBuffer());
}
export function parseCategoryLinks(html) {
  const links = new Map();
  for (const match of html.matchAll(/href=['"]([^'"]*o=product_b2c[^'"]*codProduct=(\d+)[^'"]*)['"]/g)) {
    if (!links.has(match[2])) {
      const raw = match[1].replace(/PStores;jsessionid=[^?]+\?/, 'PStores?');
      links.set(match[2], new URL(raw, 'https://www.liderpapel.com/').href);
    }
  }
  return [...links.entries()].map(([code, url]) => ({ code, url }));
}
export function parseProduct(html, input) {
  const title = cleanText(html.match(/<meta property="og:title" content="([\s\S]*?)\| INLOGEM S\.L\."/i)?.[1] ?? '');
  const image = cleanText(html.match(/<meta property="og:image" content="([\s\S]*?)"/i)?.[1] ?? '');
  const description = cleanText(html.match(/id="p1c1-descLargaCuerpo">([\s\S]*?)<\/div>/i)?.[1] ?? title);
  const stock = Number(html.match(/class="stockDisp">\s*(\d+)/i)?.[1] ?? 0);
  const purchase = html.match(/id="p1c1-datosCompraCuerpo"[\s\S]*?<div>\s*(\d+)\s*<\/div>[\s\S]*?<div>\s*([^<]+?)\s*<\/div>/i);
  const sourceReference = cleanText(purchase?.[2] ?? input.code);
  const characteristicPairs = [...html.matchAll(/<li><span class="title cab-close">([^<]+)<\/span>[\s\S]*?<span class="title">([^<]+)<\/span>[\s\S]*?<\/li>/gi)]
    .slice(0, 8)
    .map((match) => ({ label: cleanText(match[1]), value: cleanText(match[2]) }));
  const brand = characteristicPairs.find((item) => item.label.toLocaleUpperCase('es') === 'MARCA')?.value ?? 'Sin marca';
  const logistics = html.match(/Unidad de venta:<\/div>[\s\S]*?<span>([^<]+)<\/span>[\s\S]*?<span>([^<]+)<\/span>[\s\S]*?<span>([^<]+)<\/span>[\s\S]*?<span>\s*(\d{8,14})<\/span>/i);
  const recommended = html.match(/Cantidad recomendada de compra:<\/div>[\s\S]*?<span>(\d+)<\/span>/i);
  const urlSlug = new URL(input.url).searchParams.get('descProduct') ?? title;
  if (!title || !image || !description || stock <= 0) return null;
  return {
    sourceCode: input.code,
    sourceReference,
    slug: `inl-${input.code}-${slugify(urlSlug)}`,
    name: title.toLocaleLowerCase('es').replace(/(^|[.!?]\s+)(\p{L})/gu, (_m, p, c) => p + c.toLocaleUpperCase('es')),
    brand: brand.toLocaleUpperCase('es'),
    description,
    category: input.category.id,
    ean: logistics?.[4] ?? null,
    saleUnit: logistics ? `${cleanText(logistics[1])} ud.` : '1 ud.',
    recommendedQuantity: recommended ? Number(recommended[1]) : null,
    dimensionsMm: logistics ? cleanText(logistics[2]) : null,
    weightGrams: logistics ? cleanText(logistics[3]) : null,
    stockSnapshot: stock,
    demoPriceCents: input.demoPriceCents,
    image: `/images/proposals/inlogem/products/${input.code}.webp`,
    sourceUrl: input.url,
    sourceImageUrl: image,
    capturedAt: CAPTURED_AT,
    specs: characteristicPairs.filter((item) => item.label.toLocaleUpperCase('es') !== 'MARCA'),
  };
}
function demoPrice(category, code) {
  const numeric = Number(code);
  return category.base + (Number.isFinite(numeric) ? numeric % category.spread : 0);
}
async function saveWebp(url, code) {
  const response = await fetch(url, { headers: HEADERS });
  if (!response.ok) throw new Error(`${response.status} al descargar imagen ${code}`);
  const temporary = join(IMAGE_DIR, `${code}.source`);
  writeFileSync(temporary, Buffer.from(await response.arrayBuffer()));
  const output = join(IMAGE_DIR, `${code}.webp`);
  const python = spawnSync('python3', ['-c', "from PIL import Image; import sys; im=Image.open(sys.argv[1]).convert('RGB'); im.thumbnail((1000,1000)); im.save(sys.argv[2],'WEBP',quality=82,method=6)", temporary, output], { encoding: 'utf8' });
  rmSync(temporary, { force: true });
  if (python.status !== 0) throw new Error(`Pillow no pudo convertir ${code}: ${python.stderr}`);
}

async function main() {
  const previous = existsSync(OUTPUT) ? JSON.parse(readFileSync(OUTPUT, 'utf8')) : [];
  if (previous.length > 0 && !REFRESH) throw new Error('Ya existe un snapshot. Usa --refresh para regenerarlo.');
  const previousPrices = new Map(previous.map((item) => [item.sourceCode, item.demoPriceCents]));
  mkdirSync(dirname(OUTPUT), { recursive: true });
  mkdirSync(IMAGE_DIR, { recursive: true });
  const result = [];
  for (const category of categorySources) {
    const categoryUrl = `https://www.liderpapel.com/PStores?s=7132&o=searchEngine_b2c&p=1&seHeadOption=catB&elementByPage=48&flagVista=C&flagRecursiveTree=S&codCategory=${category.code}&descCategory=${category.slug}`;
    const candidates = parseCategoryLinks(await fetchLatin1(categoryUrl));
    for (const candidate of candidates) {
      if (result.filter((item) => item.category === category.id).length >= 9) break;
      const product = parseProduct(await fetchLatin1(candidate.url), {
        ...candidate, category,
        demoPriceCents: previousPrices.get(candidate.code) ?? demoPrice(category, candidate.code),
      });
      if (!product) continue;
      await saveWebp(product.sourceImageUrl, product.sourceCode);
      result.push(product);
      process.stdout.write(`✓ ${category.id} ${product.sourceCode}\n`);
    }
  }
  if (result.length !== 72) throw new Error(`Snapshot incompleto: ${result.length}/72 productos.`);
  writeFileSync(OUTPUT, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`Snapshot escrito en ${OUTPUT}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
}
