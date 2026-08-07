export type ProductAdminRow = Readonly<{
  id: number;
  slug: string;
  name: string;
  price_cents: number;
  stock: number;
  category: string;
  active: number;
}>;

export type ProductPatch = Readonly<{
  name?: string | undefined;
  price_cents?: number | undefined;
  stock?: number | undefined;
  active?: boolean | undefined;
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
