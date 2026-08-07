import type { ProductAdminRepository, ProductAdminRow } from '../application/product-admin';

export function createD1ProductAdminRepository(db: D1Database): ProductAdminRepository {
  return {
    async list() {
      const { results } = await db.prepare(
        'SELECT id, slug, name, price_cents, stock, category, active FROM products ORDER BY category, name',
      ).all<ProductAdminRow>();
      return results;
    },
    find(id) {
      return db.prepare(
        'SELECT id, slug, name, price_cents, stock, category, active FROM products WHERE id = ?',
      ).bind(id).first<ProductAdminRow>();
    },
  };
}
