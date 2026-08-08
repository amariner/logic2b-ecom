import type { ProductAdminRepository, ProductAdminRow } from '../application/product-admin';

export function createD1ProductAdminRepository(db: D1Database): ProductAdminRepository {
  const select = `
    SELECT p.id, p.slug, p.name, p.price_cents, p.compare_at_price_cents,
           p.stock, p.category, p.active,
           pv.id AS default_variant_id, pv.sku AS default_sku,
           pv.gtin AS default_gtin, pv.mpn AS default_mpn,
           pv.title AS default_variant_title, pv.status AS default_variant_status,
           pv.price_cents AS default_variant_price_cents,
           pv.compare_at_price_cents AS default_variant_compare_at_price_cents,
           (SELECT count(*) FROM product_variants all_pv WHERE all_pv.product_id = p.id) AS variant_count
    FROM products p
    LEFT JOIN product_variants pv ON pv.product_id = p.id AND pv.is_default = 1`;
  return {
    async list() {
      const { results } = await db.prepare(
        `${select} ORDER BY p.category, p.name`,
      ).all<ProductAdminRow>();
      return results;
    },
    find(id) {
      return db.prepare(
        `${select} WHERE p.id = ?`,
      ).bind(id).first<ProductAdminRow>();
    },
  };
}
