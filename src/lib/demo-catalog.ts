/**
 * Catálogo inmutable de los escaparates públicos.
 *
 * Se construye desde los mismos seeds versionados que documentan cada tema,
 * pero NO consulta D1. Así las demos visuales pueden renderizar catálogo y
 * fichas sin compartir estado ni superficie de ataque con el backoffice.
 */
import { collectionSeedProducts } from '../../seed/collections/index.ts';
import { imageVariants } from '../../seed/image-variants.ts';
import { seedProducts, type SeedProduct } from '../../seed/products.ts';
import type { ProductRow, SortOption } from './db';

const DEFAULT_COLLECTION = 'demo';

function rowsFromSeed(products: readonly SeedProduct[]): ProductRow[] {
  const perCategory: Record<string, number> = {};
  return products.map((product, index) => {
    const collection = product.collection ?? DEFAULT_COLLECTION;
    const categoryIndex = perCategory[product.category] ?? 0;
    perCategory[product.category] = categoryIndex + 1;
    const variant = (categoryIndex % (imageVariants[product.category] ?? 1)) + 1;
    const suffix = variant === 1 ? '' : `-${variant}`;
    const image =
      product.image ??
      (collection === DEFAULT_COLLECTION
        ? `/images/products/${product.category}${suffix}.webp`
        : `/images/collections/${collection}/${product.slug}.webp`);

    return {
      id: index + 1,
      slug: product.slug,
      name: product.name,
      description: product.description,
      price_cents: product.price_cents,
      stock: product.stock,
      image,
      category: product.category,
      active: product.active ?? 1,
      created_at: '2026-01-01 00:00:00',
      collection,
      subtitle: product.subtitle ?? null,
      compare_at_price_cents: product.compare_at_price_cents ?? null,
      specs_json: product.specs ? JSON.stringify(product.specs) : null,
    };
  });
}

const demoProducts = rowsFromSeed([...seedProducts, ...collectionSeedProducts]);

export function getDemoProducts(
  collection: string,
  opts: {
    category?: string | undefined;
    sort?: SortOption | undefined;
    search?: string | undefined;
  } = {},
): ProductRow[] {
  const search = opts.search?.trim().toLocaleLowerCase('es');
  const rows = demoProducts.filter((product) => {
    if (product.collection !== collection || product.active !== 1) return false;
    if (opts.category && product.category !== opts.category) return false;
    if (!search) return true;
    return `${product.name} ${product.description}`.toLocaleLowerCase('es').includes(search);
  });

  return rows.toSorted((a, b) => {
    if (opts.sort === 'price-asc') return a.price_cents - b.price_cents || a.name.localeCompare(b.name, 'es');
    if (opts.sort === 'price-desc') return b.price_cents - a.price_cents || a.name.localeCompare(b.name, 'es');
    if (opts.sort === 'name') return a.name.localeCompare(b.name, 'es');
    return a.category.localeCompare(b.category, 'es') || a.id - b.id;
  });
}

export function getDemoProduct(collection: string, slug: string): ProductRow | null {
  return demoProducts.find(
    (product) => product.collection === collection && product.slug === slug && product.active === 1,
  ) ?? null;
}

export function getDemoRelated(product: ProductRow, limit = 4): ProductRow[] {
  return demoProducts
    .filter(
      (candidate) =>
        candidate.collection === product.collection &&
        candidate.category === product.category &&
        candidate.slug !== product.slug &&
        candidate.active === 1,
    )
    .slice(0, limit);
}

export type DemoProductSummary = Pick<
  ProductRow,
  'slug' | 'name' | 'price_cents' | 'stock' | 'image'
>;

export function getDemoProductSummaries(collection: string): DemoProductSummary[] {
  return getDemoProducts(collection).map(({ slug, name, price_cents, stock, image }) => ({
    slug,
    name,
    price_cents,
    stock,
    image,
  }));
}

/** JSON seguro para incrustar dentro de `<script type="application/json">`. */
export function demoJson(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}
