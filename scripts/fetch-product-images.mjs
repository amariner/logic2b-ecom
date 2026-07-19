/**
 * Descarga las 18 variantes de foto de producto generadas con Higgsfield
 * (Marketing Studio, 2026-07-19), las optimiza a WebP 800×800 y actualiza
 * `seed/image-variants.ts` para que el seed las reparta por el catálogo.
 *
 * EJECUTAR EN LOCAL (la sesión cloud no puede descargar del CDN de Higgsfield
 * por política de red). Requiere `sharp`:
 *
 *   pnpm add -D sharp && node scripts/fetch-product-images.mjs && pnpm remove sharp
 *
 * Después: `pnpm db:reset` en local, y para producción re-sembrar la D1 remota
 * (o esperar al cron de reset) tras `pnpm deploy`.
 */
import { writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CDN = 'https://d8j0ntlcm91z4.cloudfront.net/user_3EwueYuQyj9CIIhuP4eF24jbxo5';

/** fichero destino (sin extensión) → nombre en el CDN */
const IMAGES = {
  'aceites-2': 'hf_20260719_031613_6ca2cbb2-48ca-4938-a94f-eba60e127b9e',
  'aceites-3': 'hf_20260719_031626_b5115a5f-dd3b-4718-8a74-109c997a0207',
  'aceites-4': 'hf_20260719_031628_fe721fdd-99cd-4b0a-841e-c5cd5bc9930e',
  'embutidos-2': 'hf_20260719_031629_7fc7a3cc-3420-4c63-9ba4-dc00ee27981c',
  'embutidos-3': 'hf_20260719_031631_c84537f6-954d-4689-bbd1-48cdef17e06a',
  'embutidos-4': 'hf_20260719_031632_d0cae881-c300-4361-a7d0-68a9b7729932',
  'mieles-2': 'hf_20260719_031635_5f39560f-58c5-402c-837a-88664203f40c',
  'mieles-3': 'hf_20260719_031640_786c4888-68cb-4da9-aa32-81196f018205',
  'mieles-4': 'hf_20260719_031644_80da8742-85a0-43ee-86a0-ccbc9f158944',
  'vinos-2': 'hf_20260719_031800_2e10e091-4b2e-4939-a249-a743a65da598',
  'vinos-3': 'hf_20260719_031801_947b3f37-668c-4d92-85f0-a353d759c04a',
  'vinos-4': 'hf_20260719_031803_9c9440f5-bac5-480f-a933-4332c884a4e5',
  'conservas-2': 'hf_20260719_031804_79d83942-c042-4e6b-84d0-9ca05c8af1db',
  'conservas-3': 'hf_20260719_031806_d1061680-3281-411b-95c8-7f49b7507569',
  'conservas-4': 'hf_20260719_031807_797816e8-68fa-41f8-a724-0a8589ec7cd3',
  'quesos-2': 'hf_20260719_031813_6876bc3f-4032-4c0f-96dc-eba335977aca',
  'quesos-3': 'hf_20260719_031814_cffe2288-8497-46d1-8e63-174b14525ce9',
  'quesos-4': 'hf_20260719_032014_f55cddfb-4a26-4763-a66d-f2d4537c36f1',
};

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'images', 'products');

let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.error('Falta sharp. Instálalo temporalmente: pnpm add -D sharp');
  process.exit(1);
}

let failures = 0;
for (const [name, cdnFile] of Object.entries(IMAGES)) {
  const url = `${CDN}/${cdnFile}.png`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`✗ ${name}: HTTP ${res.status} (${url})`);
    failures++;
    continue;
  }
  const png = Buffer.from(await res.arrayBuffer());
  const out = join(outDir, `${name}.webp`);
  await sharp(png).resize(800, 800).webp({ quality: 78 }).toFile(out);
  console.log(`✓ ${name}.webp`);
}

if (failures > 0) {
  console.error(`\n${failures} descargas fallaron; seed/image-variants.ts NO se ha tocado.`);
  console.error('Si el CDN ha expirado, re-descarga desde la biblioteca de Higgsfield (Marketing Studio).');
  process.exit(1);
}

const variantsFile = join(root, 'seed', 'image-variants.ts');
await writeFile(
  variantsFile,
  `/**
 * Nº de variantes de foto disponibles por categoría en /public/images/products.
 * La variante 1 es \`{categoria}.webp\`; las siguientes, \`{categoria}-2.webp\`, etc.
 * El seed las reparte entre los productos de la categoría (round-robin).
 *
 * Actualizado por \`scripts/fetch-product-images.mjs\` — no subir los contadores
 * a mano sin que existan los ficheros, o el catálogo mostraría imágenes rotas.
 */
export const imageVariants: Record<string, number> = {
  aceites: 4,
  embutidos: 4,
  mieles: 4,
  vinos: 4,
  conservas: 4,
  quesos: 4,
};
`,
);
console.log('\nseed/image-variants.ts actualizado a 4 variantes por categoría.');
console.log('Siguiente paso: pnpm db:reset (local) y re-seed remoto tras pnpm deploy.');
