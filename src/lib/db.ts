/** Acceso tipado a D1. Único punto donde se escriben SQL de lectura de catálogo. */

export type ProductRow = {
  id: number;
  slug: string;
  name: string;
  description: string;
  price_cents: number;
  stock: number;
  image: string;
  category: string;
  active: number;
  created_at: string;
};

export type ShippingRateRow = {
  id: number;
  zone: string;
  label: string;
  price_cents: number;
  free_over_cents: number | null;
  active: number;
};

export type SortOption = 'featured' | 'price-asc' | 'price-desc' | 'name';

const SORT_SQL: Record<SortOption, string> = {
  featured: 'category, id',
  'price-asc': 'price_cents ASC, name',
  'price-desc': 'price_cents DESC, name',
  name: 'name COLLATE NOCASE',
};

export function isSortOption(value: string): value is SortOption {
  return value in SORT_SQL;
}

export async function getActiveProducts(
  db: D1Database,
  opts: { category?: string | undefined; sort?: SortOption | undefined } = {},
): Promise<ProductRow[]> {
  const sort = SORT_SQL[opts.sort ?? 'featured'];
  const where = opts.category ? 'active = 1 AND category = ?' : 'active = 1';
  const stmt = db.prepare(`SELECT * FROM products WHERE ${where} ORDER BY ${sort}`);
  const bound = opts.category ? stmt.bind(opts.category) : stmt;
  const { results } = await bound.all<ProductRow>();
  return results;
}

export async function getProductBySlug(db: D1Database, slug: string): Promise<ProductRow | null> {
  return await db
    .prepare('SELECT * FROM products WHERE slug = ? AND active = 1')
    .bind(slug)
    .first<ProductRow>();
}

/** Lee varios productos por slug (para revalidar carritos). Devuelve solo los activos. */
export async function getProductsBySlugs(db: D1Database, slugs: string[]): Promise<ProductRow[]> {
  if (slugs.length === 0) return [];
  const placeholders = slugs.map(() => '?').join(',');
  const { results } = await db
    .prepare(`SELECT * FROM products WHERE slug IN (${placeholders}) AND active = 1`)
    .bind(...slugs)
    .all<ProductRow>();
  return results;
}

export async function getRateForZone(db: D1Database, zone: string): Promise<ShippingRateRow | null> {
  return await db
    .prepare('SELECT * FROM shipping_rates WHERE zone = ? AND active = 1 ORDER BY price_cents LIMIT 1')
    .bind(zone)
    .first<ShippingRateRow>();
}
