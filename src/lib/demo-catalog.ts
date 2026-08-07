/**
 * Catálogo inmutable de los escaparates públicos.
 *
 * No conoce seeds ni D1. Recibe fixtures por el composition root para que las
 * demos visuales puedan renderizar catálogo y fichas sin invertir dependencias
 * ni compartir estado o superficie de ataque con el backoffice.
 */
import type { ProductRow, SortOption } from './db';

const DEFAULT_COLLECTION = 'demo';

export type DemoCatalogProduct = Readonly<{
  slug: string;
  name: string;
  description: string;
  price_cents: number;
  stock: number;
  category: string;
  collection?: string;
  image?: string;
  active?: number;
  subtitle?: string;
  compare_at_price_cents?: number;
  specs?: readonly Readonly<{ label: string; value: string }>[];
}>;

export type DemoCatalogInput = Readonly<{
  products: readonly DemoCatalogProduct[];
  imageVariants: Readonly<Record<string, number>>;
}>;

export type DemoCatalogQuery = Readonly<{
  category?: string | undefined;
  sort?: SortOption | undefined;
  search?: string | undefined;
}>;

function rowsFromFixtures(
  products: readonly DemoCatalogProduct[],
  imageVariants: Readonly<Record<string, number>>,
): ProductRow[] {
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

export type DemoProductSummary = Pick<
  ProductRow,
  'slug' | 'name' | 'price_cents' | 'stock' | 'image'
>;

export type DemoCatalog = Readonly<{
  getProducts: (collection: string, opts?: DemoCatalogQuery) => ProductRow[];
  getProduct: (collection: string, slug: string) => ProductRow | null;
  getRelated: (product: ProductRow, limit?: number) => ProductRow[];
  getProductSummaries: (collection: string) => DemoProductSummary[];
}>;

export function createDemoCatalog(input: DemoCatalogInput): DemoCatalog {
  const products = rowsFromFixtures(input.products, input.imageVariants);

  const getProducts = (collection: string, opts: DemoCatalogQuery = {}): ProductRow[] => {
    const search = opts.search?.trim().toLocaleLowerCase('es');
    const rows = products.filter((product) => {
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
  };

  const getProduct = (collection: string, slug: string): ProductRow | null =>
    products.find(
      (product) => product.collection === collection && product.slug === slug && product.active === 1,
    ) ?? null;

  const getRelated = (product: ProductRow, limit = 4): ProductRow[] =>
    products
      .filter(
        (candidate) =>
          candidate.collection === product.collection &&
          candidate.category === product.category &&
          candidate.slug !== product.slug &&
          candidate.active === 1,
      )
      .slice(0, limit);

  const getProductSummaries = (collection: string): DemoProductSummary[] =>
    getProducts(collection).map(({ slug, name, price_cents, stock, image }) => ({
      slug,
      name,
      price_cents,
      stock,
      image,
    }));

  return Object.freeze({ getProducts, getProduct, getRelated, getProductSummaries });
}

/** JSON seguro para incrustar dentro de `<script type="application/json">`. */
export function demoJson(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}
