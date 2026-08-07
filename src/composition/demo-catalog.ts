/**
 * Composition root del catálogo público simulado.
 *
 * Los seeds son un adaptador de fixtures versionados. El módulo de catálogo
 * demo solo conoce su contrato; este fichero es el único que conecta ambos.
 */
import { collectionSeedProducts } from '../../seed/collections/index.ts';
import { imageVariants } from '../../seed/image-variants.ts';
import { seedProducts } from '../../seed/products.ts';
import { createDemoCatalog } from '../lib/demo-catalog';

const catalog = createDemoCatalog({
  products: [...seedProducts, ...collectionSeedProducts],
  imageVariants,
});

export const getDemoProducts = catalog.getProducts;
export const getDemoProduct = catalog.getProduct;
export const getDemoRelated = catalog.getRelated;
export const getDemoProductSummaries = catalog.getProductSummaries;

export { demoJson } from '../lib/demo-catalog';
export type { DemoProductSummary } from '../lib/demo-catalog';
