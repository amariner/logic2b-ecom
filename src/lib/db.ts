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
  /** Tienda del escaparate a la que pertenece (migración 0002). */
  collection: string;

  // — Capacidades OPCIONALES de producto (migración 0002) —
  // Nullable y ignorables: un tema las usa o no existen para él.

  /** Subtítulo técnico bajo el nombre. Lo usa Industrial. */
  subtitle: string | null;
  /**
   * Precio anterior tachado. Lo usa Natural.
   *
   * ⚠️ ES EXCLUSIVAMENTE PRESENTACIÓN. No entra en el subtotal, ni en el umbral
   * de envío gratis, ni en los line_items de Stripe. El precio real es
   * `price_cents` y solo él. Lo fija `tests/pricing-guard.test.ts`.
   */
  compare_at_price_cents: number | null;
  /** Filas de ficha técnica, JSON `[{label,value}]`. Lo usa Specs. Ver `parseSpecs`. */
  specs_json: string | null;
};

/** Fila de ficha técnica ya validada. */
export type ProductSpec = { label: string; value: string };

/**
 * Lee `specs_json` de forma defensiva: es TEXT libre en D1, así que se valida la
 * forma antes de renderizar y cualquier cosa rara se descarta en silencio (una
 * ficha técnica malformada no debe tumbar la página de producto).
 */
export function parseSpecs(specsJson: string | null): ProductSpec[] {
  if (!specsJson) return [];
  try {
    const parsed: unknown = JSON.parse(specsJson);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((row): ProductSpec[] => {
      if (typeof row !== 'object' || row === null) return [];
      const { label, value } = row as Record<string, unknown>;
      return typeof label === 'string' && typeof value === 'string' ? [{ label, value }] : [];
    });
  } catch {
    return [];
  }
}

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

/** Escapa %, _ y \ para que un LIKE ... ESCAPE '\' trate el término de búsqueda como literal. */
export function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * Catálogo de UNA colección.
 *
 * `collection` es obligatorio a propósito: así el compilador obliga a cada punto
 * de lectura a declarar de qué tienda está tirando, y ningún tema puede leer la
 * tabla entera por olvido. Debe venir ya validado contra el registro de
 * `lib/collections.ts` (que es quien lo resuelve desde la URL).
 */
export async function getActiveProducts(
  db: D1Database,
  collection: string,
  opts: { category?: string | undefined; sort?: SortOption | undefined; search?: string | undefined } = {},
): Promise<ProductRow[]> {
  const sort = SORT_SQL[opts.sort ?? 'featured'];
  const conditions = ['active = 1', 'collection = ?'];
  const params: string[] = [collection];
  if (opts.category) {
    conditions.push('category = ?');
    params.push(opts.category);
  }
  if (opts.search) {
    const escaped = escapeLikePattern(opts.search);
    conditions.push("(name LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')");
    params.push(`%${escaped}%`, `%${escaped}%`);
  }
  const stmt = db.prepare(`SELECT * FROM products WHERE ${conditions.join(' AND ')} ORDER BY ${sort}`);
  const { results } = await stmt.bind(...params).all<ProductRow>();
  return results;
}

/**
 * Ficha de producto DENTRO de su colección.
 *
 * El slug es único global (ver migración 0002), así que la colección no hace
 * falta para encontrarlo — pero sí para que `/demo/tiendas/street/aove-picual`
 * sea un 404 en vez de enseñar el producto de otra tienda bajo la URL de Street.
 */
export async function getProductBySlug(
  db: D1Database,
  collection: string,
  slug: string,
): Promise<ProductRow | null> {
  return await db
    .prepare('SELECT * FROM products WHERE slug = ? AND collection = ? AND active = 1')
    .bind(slug, collection)
    .first<ProductRow>();
}

/**
 * Lee varios productos por slug (para revalidar carritos). Devuelve solo los activos.
 *
 * Deliberadamente AGNÓSTICO de colección: el slug es la clave del carrito y del
 * checkout, y es única global. Meter la colección aquí obligaría a propagarla a
 * `cart-client.ts`, a `/api/cart/quote` y a `/api/checkout/session` — es decir, a
 * bifurcar la ruta de cobro, que es lo único que esta arquitectura no permite.
 */
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
