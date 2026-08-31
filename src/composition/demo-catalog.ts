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
import { inlogemCatalog } from '../proposals/inlogem/catalog';

const inlogemSeedProducts = inlogemCatalog.map((item) => ({
  slug: item.slug,
  name: item.name,
  description: item.description,
  price_cents: item.demoPriceCents,
  stock: item.stockSnapshot,
  category: item.category,
  collection: 'proposal-inlogem',
  image: item.image,
  subtitle: `${item.brand} · Ref. ${item.sourceReference}`,
  specs: [
    { label: 'Código', value: item.sourceCode },
    { label: 'Referencia', value: item.sourceReference },
    { label: 'Marca', value: item.brand },
    { label: 'Unidad de venta', value: item.saleUnit },
    ...(item.ean ? [{ label: 'EAN', value: item.ean }] : []),
    ...(item.dimensionsMm ? [{ label: 'Dimensiones', value: `${item.dimensionsMm} mm` }] : []),
    ...(item.weightGrams ? [{ label: 'Peso', value: `${item.weightGrams} g` }] : []),
    ...item.specs,
  ],
}));

const catalog = createDemoCatalog({
  products: [...seedProducts, ...collectionSeedProducts, ...inlogemSeedProducts],
  imageVariants,
});

export const getDemoProducts = catalog.getProducts;
export const getDemoProduct = catalog.getProduct;
export const getDemoRelated = catalog.getRelated;
export const getDemoProductSummaries = catalog.getProductSummaries;

export { demoJson } from '../lib/demo-catalog';
export type { DemoProductSummary } from '../lib/demo-catalog';
