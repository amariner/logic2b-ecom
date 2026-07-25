/**
 * Descarga la imaginería de la tienda `industrial` (METRIA) generada con
 * Higgsfield y la optimiza a WebP en `public/images/collections/industrial/`.
 *
 * EJECUTAR EN LOCAL: la política de red de las sesiones cloud deniega el CDN de
 * Higgsfield (todos los dominios, 000). Sin dependencias npm nuevas — convierte
 * con `cwebp`, el binario de sistema que ya usa `scripts/capture-screens.mjs`.
 *
 *   node scripts/fetch-industrial-images.mjs [--only=<substr>]
 *
 * Todas las imágenes son de PRODUCTO a 800×800: el tema 02 no tiene hero
 * (`layout.hero === 'none'`) ni tarjetas editoriales de categoría. La receta de
 * `docs/TEMAS.md § 5` para este tema es «instrumento técnico sobre blanco puro,
 * luz plana neutra, sin sombra dramática, estética de catálogo de fabricante»;
 * el fondo blanco es lo que permite que la rejilla sin gap del tema se lea como
 * una tabla continua (`--surface-product: #ffffff`).
 *
 * Las URLs del CDN CADUCAN. Si una descarga da 403/404, hay que regenerar desde
 * la biblioteca de Higgsfield y actualizar el id aquí; el fichero ya bajado no
 * se toca (el script solo escribe lo que descarga con éxito).
 */
import { execFile } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'images', 'collections', 'industrial');
const tmpDir = join(root, '.wrangler', 'tmp-industrial-images');

const CDN = 'https://d8j0ntlcm91z4.cloudfront.net/user_3EwueYuQyj9CIIhuP4eF24jbxo5';

/** fichero destino (= slug del producto, sin extensión) → { cdn, width }. */
const IMAGES = {
  // ── Visión e inspección (3) ───────────────────────────────────────
  'ind-mv-320': { cdn: 'hf_20260725_143221_4032ee6a-e6d7-4dbb-8d7d-d2fdc8f0ddf0', width: 800 },
  'ind-mv-160-flex': { cdn: 'hf_20260725_143223_2c4885e0-0ca0-4229-80e2-d7e8a915afe9', width: 800 },
  // Regenerada por fondo no-blanco, igual que la mesa Z-90 y el monitor.
  'ind-mv-560-lab': { cdn: 'hf_20260725_144849_dcd45b9c-4c7a-4477-9518-3833b4b367d2', width: 800 },

  // ── Soportes y mesas (3) ──────────────────────────────────────────
  'ind-brazo-flex-a2': { cdn: 'hf_20260725_143228_f5a3e5ec-dfcf-42bf-80cc-110ca7cc148f', width: 800 },
  // Regenerada: la primera tirada salió con fondo #efefef y en la rejilla sin gap
  // el «letterbox» del `object-fit: contain` se veía como un recuadro gris.
  'ind-mesa-z-90': { cdn: 'hf_20260725_144112_3547d79f-644c-4d9b-80f8-a6e08750e6a1', width: 800 },
  'ind-mesa-xy-160': { cdn: 'hf_20260725_143232_1a443f99-a01a-4825-9947-959ad0d457ea', width: 800 },

  // ── Iluminación (2) ───────────────────────────────────────────────
  'ind-anillo-led-72': { cdn: 'hf_20260725_143235_4fa807b5-3588-4f18-bd3d-92fb9a3f44a7', width: 800 },
  'ind-luz-coaxial-k1': { cdn: 'hf_20260725_143237_07bd1a66-6a32-4bbb-af6a-34979caf2893', width: 800 },

  // ── Ópticas y accesorios (2) ──────────────────────────────────────
  // El monitor es el producto que ocupa la celda DOBLE de la rejilla irregular
  // (igual que en la referencia TAGARNO). Regenerado por el mismo motivo que la
  // mesa Z-90: en la celda doble el fondo tiene que ser BLANCO PURO o se ve el
  // recuadro de la imagen contra la celda.
  'ind-monitor-mv-24': { cdn: 'hf_20260725_144025_925e1bde-7466-4a90-a67a-8ed70daf0d07', width: 800 },
  'ind-lente-x3': { cdn: 'hf_20260725_143420_bd64154e-a966-405b-b1f4-be5ae9ff2351', width: 800 },
};

const only = process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length);

await mkdir(outDir, { recursive: true });
await mkdir(tmpDir, { recursive: true });

let ok = 0;
let failures = 0;
for (const [name, cfg] of Object.entries(IMAGES)) {
  if (only && !name.includes(only)) continue;
  const url = `${CDN}/${cfg.cdn}.png`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`✗ ${name}: HTTP ${res.status}`);
    failures++;
    continue;
  }
  const png = join(tmpDir, `${name}.png`);
  await writeFile(png, Buffer.from(await res.arrayBuffer()));
  const webp = join(outDir, `${name}.webp`);
  await execFileP('cwebp', [
    '-quiet',
    '-q', String(cfg.quality ?? 76),
    '-resize', String(cfg.width), '0',
    png, '-o', webp,
  ]);
  console.log(`✓ ${name}.webp`);
  ok++;
}

await rm(tmpDir, { recursive: true, force: true });

console.log(`\n${ok} imágenes escritas en public/images/collections/industrial/.`);
if (failures > 0) {
  console.error(`${failures} descargas fallaron — regenerar y actualizar el id del CDN.`);
  process.exit(1);
}
