import type { ProductAdminRepository, ProductAdminRow, ProductPatch } from '../application/product-admin';

export function createD1ProductAdminRepository(db: D1Database): ProductAdminRepository {
  return {
    async list() {
      const { results } = await db.prepare(
        'SELECT id, slug, name, price_cents, stock, category, active FROM products ORDER BY category, name',
      ).all<ProductAdminRow>();
      return results;
    },
    async update(id: number, patch: ProductPatch) {
      const sets: string[] = [];
      const binds: (string | number)[] = [];
      if (patch.name !== undefined) { sets.push('name = ?'); binds.push(patch.name); }
      if (patch.price_cents !== undefined) { sets.push('price_cents = ?'); binds.push(patch.price_cents); }
      if (patch.stock !== undefined) { sets.push('stock = ?'); binds.push(patch.stock); }
      if (patch.active !== undefined) { sets.push('active = ?'); binds.push(patch.active ? 1 : 0); }
      binds.push(id);
      const result = await db.prepare(`UPDATE products SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
      return result.meta.changes > 0;
    },
  };
}
