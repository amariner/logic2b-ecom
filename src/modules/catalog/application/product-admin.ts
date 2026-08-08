export type ProductAdminRow = Readonly<{
  id: number;
  slug: string;
  name: string;
  price_cents: number;
  compare_at_price_cents: number | null;
  stock: number;
  category: string;
  active: number;
  default_variant_id: number | null;
  default_sku: string | null;
  default_gtin: string | null;
  default_mpn: string | null;
  default_variant_title: string | null;
  default_variant_status: 'draft' | 'active' | 'archived' | null;
  default_variant_price_cents: number | null;
  default_variant_compare_at_price_cents: number | null;
  variant_count: number;
}>;

export type ProductPatch = Readonly<{
  name?: string | undefined;
  price_cents?: number | undefined;
  stock?: number | undefined;
  active?: boolean | undefined;
  compare_at_price_cents?: number | null | undefined;
  sku?: string | undefined;
  gtin?: string | null | undefined;
  mpn?: string | null | undefined;
  variant_title?: string | undefined;
  variant_status?: 'draft' | 'active' | 'archived' | undefined;
}>;

export interface ProductAdminRepository {
  list(): Promise<readonly ProductAdminRow[]>;
  find(id: number): Promise<ProductAdminRow | null>;
}

export function createProductAdminService(repository: ProductAdminRepository) {
  return Object.freeze({
    list: () => repository.list(),
    find: (id: number) => repository.find(id),
  });
}
