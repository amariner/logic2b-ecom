/**
 * Descarga la imaginería de la tienda `street` (ASFALTO) generada con Higgsfield
 * y la optimiza a WebP en `public/images/collections/street/`.
 *
 * EJECUTAR EN LOCAL: la política de red de las sesiones cloud deniega el CDN de
 * Higgsfield (todos los dominios, 000). Sin dependencias npm nuevas — convierte
 * con `cwebp`, el binario de sistema que ya usa `scripts/capture-screens.mjs`.
 *
 *   node scripts/fetch-street-images.mjs [--only=<substr>]
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
const outDir = join(root, 'public', 'images', 'collections', 'street');
const tmpDir = join(root, '.wrangler', 'tmp-street-images');

const CDN = 'https://d8j0ntlcm91z4.cloudfront.net/user_3EwueYuQyj9CIIhuP4eF24jbxo5';

/**
 * fichero destino (sin extensión) → { cdn, width, quality }.
 *
 * · Productos: 800×800, igual que el resto de colecciones.
 * · Hero a sangre: 1920 de ancho — es la única imagen de página completa.
 * · Tarjetas editoriales de categoría: 720 de ancho, retrato 4:5.
 */
const IMAGES = {
  // ── Producto (12) ─────────────────────────────────────────────────
  'str-vuelta-9': { cdn: 'hf_20260725_125412_0ef2c254-cacf-4dfa-a8bf-55547c9d4753', width: 800 },
  'str-ronda-trail': { cdn: 'hf_20260725_125422_349da940-62bb-41c2-ab10-25ce9f3a7b77', width: 800 },
  'str-plaza-lo': { cdn: 'hf_20260725_125423_cebc3b04-4153-494c-92c6-eb988fae7a19', width: 800 },
  'str-sudadera-turno': { cdn: 'hf_20260725_125427_8460e3e5-fbfb-4bbc-a2cc-30d284944aa5', width: 800 },
  'str-cortavientos-nocturno': { cdn: 'hf_20260725_125429_85f2b07c-2f4d-4c01-8ca5-19e22da6e81e', width: 800 },
  'str-camiseta-tempo': { cdn: 'hf_20260725_125437_5ed1da1f-9195-485e-8604-af93017b3d6d', width: 800 },
  'str-mallas-medianoche': { cdn: 'hf_20260725_125438_e88faf3e-3dbe-44d7-b4c5-5c1c7aef40f6', width: 800 },
  'str-short-split-5': { cdn: 'hf_20260725_125441_2d980e10-c1da-4150-8287-532a3b138247', width: 800 },
  'str-mallas-ritmo': { cdn: 'hf_20260725_125534_2b639928-3422-465b-83d4-34bb6ce6f99c', width: 800 },
  'str-gorra-cinco-paneles': { cdn: 'hf_20260725_125535_f789d0b5-8f71-46c1-aa6a-2d7d7819ea55', width: 800 },
  'str-rinonera-vuelta': { cdn: 'hf_20260725_125537_659e8fcc-99e6-47bb-aaee-e1310dbf1a06', width: 800 },
  'str-calcetines-pack': { cdn: 'hf_20260725_125539_7e2d6f90-590d-4e77-a193-5802829168d6', width: 800 },

  // ── Hero a sangre (1) ─────────────────────────────────────────────
  // Lleva copy encima: se generó con hueco vacío arriba y abajo a la izquierda
  // y el tema añade además un velo. Ver la nota de contraste en docs/temas/street.md.
  hero: { cdn: 'hf_20260725_125624_1e353383-0033-413e-a9ed-a852d98f3826', width: 1920, quality: 72 },

  // ── Tarjetas editoriales de categoría (3) ─────────────────────────
  'cat-prendas': { cdn: 'hf_20260725_125627_b30e400b-fd4e-4931-9356-2dd2cae40db9', width: 720 },
  'cat-calzado': { cdn: 'hf_20260725_125629_2c6119a8-050c-40cc-9be1-6dd9fb47bca8', width: 720 },
  'cat-club': { cdn: 'hf_20260725_125631_1008fb19-e0f8-4545-a612-78457b201b17', width: 720 },
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

console.log(`\n${ok} imágenes escritas en public/images/collections/street/.`);
if (failures > 0) {
  console.error(`${failures} descargas fallaron — regenerar y actualizar el id del CDN.`);
  process.exit(1);
}
