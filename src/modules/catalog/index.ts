import { createProductAdminService } from './application/product-admin';
import { createD1ProductAdminRepository } from './infrastructure/d1-product-admin';

export type { ProductAdminRow, ProductPatch } from './application/product-admin';

export const createProductAdmin = (db: D1Database) =>
  createProductAdminService(createD1ProductAdminRepository(db));
