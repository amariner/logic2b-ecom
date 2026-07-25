/**
 * Descarga la imaginería de la tienda `natural` (ROMER) generada con Higgsfield
 * y la optimiza a WebP en `public/images/collections/natural/`.
 *
 * EJECUTAR EN LOCAL: la política de red de las sesiones cloud deniega el CDN de
 * Higgsfield (todos los dominios, 000). Sin dependencias npm nuevas — convierte
 * con `cwebp`, el binario de sistema que ya usa `scripts/capture-screens.mjs`.
 *
 *   node scripts/fetch-natural-images.mjs [--only=<substr>]
 *
 * La receta de `docs/TEMAS.md § 5` para este tema es «bote blanco mate + caja de
 * color (teal, oliva, arena, rojo) sobre gris cálido, luz difusa suave, sombra
 * hacia la derecha». El fondo se pide EXPLÍCITO y con el código exacto del token
 * (`--surface-product: #f0f0ee`): la tarjeta pinta la caja de imagen de ese gris
 * y usa `object-fit: contain`, así que cualquier otro fondo se vería como un
 * recuadro dentro de la celda (la lección que costó tres regeneraciones en
 * Industrial). Las cajas van SIN texto ni logotipo a propósito: un rótulo
 * generado sería tipografía inventada sobre un envase de marca ajena.
 *
 * El HERO es la única imagen que no es de producto: la foto de estilo de vida a
 * sangre de la columna derecha del hero partido (16:9, fondo verde plano). El
 * texto del hero vive en la columna BLANCA de al lado, nunca encima de la foto,
 * así que aquí no hay problema de contraste sobre imagen.
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
const outDir = join(root, 'public', 'images', 'collections', 'natural');
const tmpDir = join(root, '.wrangler', 'tmp-natural-images');

const CDN = 'https://d8j0ntlcm91z4.cloudfront.net/user_3EwueYuQyj9CIIhuP4eF24jbxo5';

/** fichero destino (= slug del producto, sin extensión) → { cdn, width }. */
const IMAGES = {
  // ── Rostro (3) ────────────────────────────────────────────────────
  'nat-crema-rostro': { cdn: 'hf_20260725_153243_c6f8f954-9adf-4f35-8380-6e4255f02412', width: 800 },
  'nat-serum-niacinamida': { cdn: 'hf_20260725_153246_360d7dbe-5ee9-4c02-adea-febe2a80d7d0', width: 800 },
  'nat-limpiador-facial': { cdn: 'hf_20260725_153248_59a39a51-63d0-4699-a4c6-a6e7092e6edb', width: 800 },

  // ── Cuerpo (3) ────────────────────────────────────────────────────
  // Regenerada: la primera tirada del bote de leche corporal falló en el
  // proveedor (`status: failed`), no por el prompt.
  'nat-leche-corporal': { cdn: 'hf_20260725_153917_0d1b5e3f-f0b8-48eb-ae3e-0f56c85ea0c7', width: 800 },
  'nat-aceite-corporal': { cdn: 'hf_20260725_153256_7a402937-6416-46f1-b6b1-8c87233b8ad1', width: 800 },
  'nat-exfoliante-sal': { cdn: 'hf_20260725_153258_82ab5a78-57eb-4008-96a6-9520e855d6aa', width: 800 },

  // ── Cabello (3) ───────────────────────────────────────────────────
  'nat-champu-nutritivo': { cdn: 'hf_20260725_153301_35118550-be10-4232-8930-a8e43ce6107f', width: 800 },
  'nat-acondicionador': { cdn: 'hf_20260725_153303_a88c5639-d98b-4e7f-abab-9b4b2048820e', width: 800 },
  'nat-aceite-capilar': { cdn: 'hf_20260725_153620_9e7ac286-232c-44be-bd4a-f6ed3a68aa76', width: 800 },

  // ── Kits (3) ──────────────────────────────────────────────────────
  'nat-kit-rostro': { cdn: 'hf_20260725_153623_aadd2ad4-2bbe-4111-89b6-8d69f035aafc', width: 800 },
  'nat-kit-cuerpo': { cdn: 'hf_20260725_153625_9acb22bd-5121-47db-9aac-6808962b5b3c', width: 800 },
  'nat-neceser-regalo': { cdn: 'hf_20260725_153627_45807209-4214-4210-9281-fc605b6f0acc', width: 800 },

  // ── Hero del catálogo (16:9, a sangre en la columna derecha) ──────
  hero: { cdn: 'hf_20260725_153634_78e55478-983d-49c9-afb6-57ba0153cacf', width: 1376, quality: 72 },
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

console.log(`\n${ok} imágenes escritas en public/images/collections/natural/.`);
if (failures > 0) {
  console.error(`${failures} descargas fallaron — regenerar y actualizar el id del CDN.`);
  process.exit(1);
}
