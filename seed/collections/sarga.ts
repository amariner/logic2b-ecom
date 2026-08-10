/** Catálogo ficticio de SARGA. Todos los slugs están namespaceados. */
import type { SeedProduct } from '../products.ts';

const c = (prod: Omit<SeedProduct, 'collection'>): SeedProduct => ({
  ...prod,
  collection: 'sarga',
});

export const sargaSeedProducts: readonly SeedProduct[] = [
  c({ slug: 'sar-blazer-negro', name: 'Blazer Línea 01', description: 'Blazer de hombro marcado y largo extendido en sarga de lana negra. Cierre de un botón y bolsillos con tapeta.', price_cents: 21900, stock: 9, category: 'sar-chaquetas' }),
  c({ slug: 'sar-pantalon-palazzo', name: 'Pantalón Pliegue', description: 'Pantalón palazzo de talle alto con doble pinza frontal, caída amplia y acabado mate.', price_cents: 12900, stock: 14, category: 'sar-pantalones' }),
  c({ slug: 'sar-blazer-azul', name: 'Blazer Hielo 02', description: 'Blazer amplio de una botonadura en azul hielo, confeccionado en sarga ligera con forro tonal.', price_cents: 22900, stock: 7, category: 'sar-chaquetas' }),
  c({ slug: 'sar-chaleco-negro', name: 'Chaleco Vector', description: 'Chaleco entallado de cinco botones, escote profundo y bajo en punta para superponer o llevar solo.', price_cents: 11900, stock: 11, category: 'sar-chalecos' }),
];
