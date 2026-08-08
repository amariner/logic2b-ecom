import { createCompatibleCatalogReader, type CatalogReadMode } from './application/catalog-reader';
import { createProductAdminService } from './application/product-admin';
import { createD1CatalogRepository } from './infrastructure/d1-catalog-repository';
import { createD1LegacyCatalogReader } from './infrastructure/d1-legacy-catalog-reader';
import { createD1ProductAdminRepository } from './infrastructure/d1-product-admin';

export type { ProductAdminRow, ProductPatch } from './application/product-admin';

export {
  CATALOG_READ_MODES,
  CatalogReadConfigurationError,
  CatalogShadowReadMismatchError,
  escapeCatalogSearch,
  isCatalogSortOption,
  projectDefaultVariant,
  resolveCatalogReadMode,
  type CanonicalCatalogRepository,
  type CatalogQuery,
  type CatalogReader,
  type CatalogReadMode,
  type CatalogSortOption,
  type StorefrontProductRow,
} from './application/catalog-reader';

export {
  CatalogInvariantError,
  PRODUCT_VARIANT_STATUSES,
  createCatalogEntry,
  defaultProductVariant,
  optionSignature,
  type CatalogEntry,
  type Product,
  type ProductOptionSelection,
  type ProductVariant,
  type ProductVariantStatus,
} from './domain/product';

export { createD1CatalogRepository } from './infrastructure/d1-catalog-repository';

export const createCatalogReader = (db: D1Database, mode: CatalogReadMode) =>
  createCompatibleCatalogReader(
    createD1LegacyCatalogReader(db),
    createD1CatalogRepository(db),
    mode,
  );

export const createProductAdmin = (db: D1Database) =>
  createProductAdminService(createD1ProductAdminRepository(db));
