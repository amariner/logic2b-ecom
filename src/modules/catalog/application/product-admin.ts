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

export type ProductOptionValueAdminRow = Readonly<{
  id: number;
  option_id: number;
  value: string;
  position: number;
}>;

export type ProductOptionAdminRow = Readonly<{
  id: number;
  product_id: number;
  name: string;
  position: number;
  values: readonly ProductOptionValueAdminRow[];
}>;

export type ProductVariantAdminRow = Readonly<{
  id: number;
  product_id: number;
  sku: string;
  gtin: string | null;
  mpn: string | null;
  title: string;
  price_cents: number;
  compare_at_price_cents: number | null;
  status: 'draft' | 'active' | 'archived';
  is_default: boolean;
  option_signature: string | null;
  option_value_ids: readonly number[];
  order_item_count: number;
  created_at: string;
  updated_at: string;
}>;

export type ProductVariantAdminDetails = Readonly<{
  product: ProductAdminRow;
  options: readonly ProductOptionAdminRow[];
  variants: readonly ProductVariantAdminRow[];
}>;

export type ProductOptionSnapshot = Readonly<{
  id: number;
  product_id: number;
  product_slug: string;
  name: string;
  position: number;
  value_count: number;
  variant_count: number;
}>;

export type ProductOptionValueSnapshot = Readonly<{
  id: number;
  option_id: number;
  product_id: number;
  product_slug: string;
  value: string;
  position: number;
  variant_count: number;
}>;

export interface ProductAdminRepository {
  list(): Promise<readonly ProductAdminRow[]>;
  find(id: number): Promise<ProductAdminRow | null>;
  details(id: number): Promise<ProductVariantAdminDetails | null>;
  findOption(id: number): Promise<ProductOptionSnapshot | null>;
  findOptionValue(id: number): Promise<ProductOptionValueSnapshot | null>;
  findVariant(id: number): Promise<ProductVariantAdminRow | null>;
}

export function createProductAdminService(repository: ProductAdminRepository) {
  return Object.freeze({
    list: () => repository.list(),
    find: (id: number) => repository.find(id),
    details: (id: number) => repository.details(id),
    findOption: (id: number) => repository.findOption(id),
    findOptionValue: (id: number) => repository.findOptionValue(id),
    findVariant: (id: number) => repository.findVariant(id),
  });
}
