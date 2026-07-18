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
  opts: { category?: string | undefined; sort?: SortOption | undefined; search?: string | undefined } = {},
): Promise<ProductRow[]> {
  const sort = SORT_SQL[opts.sort ?? 'featured'];
  const conditions = ['active = 1'];
  const params: string[] = [];
  if (opts.category) {
    conditions.push('category = ?');
    params.push(opts.category);
  }
  if (opts.search) {
    // LIKE con escape propio para que %, _ y \ del usuario sean literales.
    const escaped = opts.search.replace(/[\\%_]/g, (ch) => `\\${ch}`);
    conditions.push("(name LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')");
    params.push(`%${escaped}%`, `%${escaped}%`);
  }
  const stmt = db.prepare(`SELECT * FROM products WHERE ${conditions.join(' AND ')} ORDER BY ${sort}`);
  const { results } = await (params.length > 0 ? stmt.bind(...params) : stmt).all<ProductRow>();
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
