/**
 * Agregador de catálogos POR COLECCIÓN (tiendas del escaparate de estilos).
 *
 * Cada tienda declara su catálogo en `seed/collections/<id>.ts` y lo registra
 * aquí. `seed/seed.ts` consume este índice una sola vez: una sesión de tema
 * NUNCA toca `seed.ts`, solo su fichero y esta lista.
 *
 * OJO (gotcha del seed): este fichero corre bajo `node seed/generate.ts` con
 * type-stripping — los imports relativos llevan extensión `.ts` OBLIGATORIA.
 */
import type { SeedProduct } from '../products.ts';

import { minimalSeedProducts } from './minimal.ts';
import { editorialSeedProducts } from './editorial.ts';
import { guideSeedProducts } from './guide.ts';
import { launchSeedProducts } from './launch.ts';
import { irisSeedProducts } from './iris.ts';
// new-theme:seed-imports — no borrar: `pnpm new:theme <id>` añade aquí su import.

export const collectionSeedProducts: readonly SeedProduct[] = [
  ...minimalSeedProducts,
  ...editorialSeedProducts,
  ...guideSeedProducts,
  ...launchSeedProducts,
  ...irisSeedProducts,
  // new-theme:seed-entries — no borrar: `pnpm new:theme <id>` añade aquí su spread.
];
