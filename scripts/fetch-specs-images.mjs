/**
 * Descarga la imaginería de la tienda `specs` (KALIBRE) generada con Higgsfield
 * y la optimiza a WebP en `public/images/collections/specs/`.
 *
 * EJECUTAR EN LOCAL: la política de red de las sesiones cloud deniega el CDN de
 * Higgsfield (todos los dominios, 000). Sin dependencias npm nuevas — convierte
 * con `cwebp`, el binario de sistema que ya usa `scripts/capture-screens.mjs`.
 *
 *   node scripts/fetch-specs-images.mjs [--only=<substr>]
 *
 * La receta de `docs/TEMAS.md § 5` para este tema es «componente sobre gris
 * medio uniforme, macro técnico, greyscale total, sombra mínima; estética de
 * despiece de ingeniería». El fondo se pide EXPLÍCITO y con el código exacto del
 * token (`--surface-product: #e8e8e8`): la tarjeta pinta la caja de imagen de
 * ese gris y usa `object-fit: contain`, así que cualquier otro fondo se vería
 * como un recuadro dentro de la celda.
 *
 * Todas las piezas van SIN grabados ni marcas a propósito: un rótulo generado
 * sería tipografía inventada sobre un componente de marca ajena.
 *
 * Este tema NO tiene hero (`layout.hero === 'none'`): la referencia arranca
 * directamente con el rótulo y el filete. Nueve imágenes, ni una más.
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
const outDir = join(root, 'public', 'images', 'collections', 'specs');
const tmpDir = join(root, '.wrangler', 'tmp-specs-images');

const CDN = 'https://d8j0ntlcm91z4.cloudfront.net/user_3EwueYuQyj9CIIhuP4eF24jbxo5';

/** fichero destino (= slug del producto, sin extensión) → { cdn, width }. */
const IMAGES = {
  // ── Platinas y puentes (2) ────────────────────────────────────────
  'spe-platina-base': { cdn: 'hf_20260725_203942_1b0da1fa-bdb9-4a43-8da0-855513e91e73', width: 800 },
  'spe-puente-rodaje': { cdn: 'hf_20260725_203943_f50c6115-5e40-486a-b4d0-83fb1eb2f276', width: 800 },

  // ── Escape y rodaje (3) ───────────────────────────────────────────
  'spe-barrilete': { cdn: 'hf_20260725_203946_c714d73a-5fc6-4f59-8e52-45dec85f52ea', width: 800 },
  // Regenerada: la primera tirada del volante falló en el proveedor
  // (`status: failed`), no por el prompt. Pasa ~1 de cada 10.
  'spe-volante-espiral': { cdn: 'hf_20260725_204856_fe419e3e-f67b-4859-b7f4-7db1441aa81a', width: 800 },
  'spe-ancora-escape': { cdn: 'hf_20260725_203951_95c5532b-2b1f-4899-bf45-19581b24a343', width: 800 },

  // ── Caja y bisel (2) ──────────────────────────────────────────────
  'spe-caja-titanio': { cdn: 'hf_20260725_203953_2639cab1-f2e0-4879-af77-6486b998871e', width: 800 },
  'spe-bisel-estriado': { cdn: 'hf_20260725_203955_d61ce837-18d0-4d5a-b37e-20f462ff5fe4', width: 800 },

  // ── Esfera y agujas (2) ───────────────────────────────────────────
  'spe-esfera-guilloche': { cdn: 'hf_20260725_203958_7252e95c-6dc4-4e10-975b-95ff81361d2c', width: 800 },
  'spe-agujas-dauphine': { cdn: 'hf_20260725_204236_4ac40184-96f2-41d1-88c7-a61071da01cd', width: 800 },
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

console.log(`\n${ok} imágenes escritas en public/images/collections/specs/.`);
if (failures > 0) {
  console.error(`${failures} descargas fallaron — regenerar y actualizar el id del CDN.`);
  process.exit(1);
}
