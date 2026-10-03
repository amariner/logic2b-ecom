import type { CatalogEntry } from '../modules/catalog';
import {
  MARKET_PUBLICATION_LIMITS,
  MarketPublicationContractError,
  defineMarketPublicationSnapshot,
  type MarketPublicationSnapshot,
} from '../modules/markets';

export type MarketPublicationSnapshotProjectionInput = Readonly<{
  ref: string;
  capturedAt: string;
  entries: readonly CatalogEntry[];
}>;

function invalid(field: string): never {
  throw new MarketPublicationContractError(`${field} requiere datos propios del catálogo completo.`);
}

function field(value: unknown, name: string, path: string): unknown {
  if (value === null || typeof value !== 'object') return invalid(path);
  const descriptor = Object.getOwnPropertyDescriptor(value, name);
  if (!descriptor?.enumerable || !('value' in descriptor)) return invalid(path);
  return descriptor.value;
}

function record(value: unknown, path: string): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return invalid(path);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return invalid(path);
  return value;
}

function list(value: unknown, maximum: number, path: string): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum ||
    Reflect.ownKeys(value).length !== value.length + 1) return invalid(path);
  // El bucle lee índices propios, sin invocar iteradores ni getters de entrada.
  const items: unknown[] = [];
  for (let index = 0; index < value.length; index++) items.push(field(value, String(index), `${path}[${index}]`));
  return items;
}

/**
 * Proyección interna de agregados CatalogEntry completos, sin I/O.
 * Conserva TODAS las variantes y sus estados; default, precio y stock no deciden
 * publicación. No es un validador editorial de Catalog ni un lector de D1.
 * El llamador aporta ref/capturedAt: Product no tiene una versión que inferir.
 */
export function projectMarketPublicationSnapshot(
  input: MarketPublicationSnapshotProjectionInput,
): MarketPublicationSnapshot {
  const source = record(input, 'input');
  const ref = field(source, 'ref', 'ref');
  const capturedAt = field(source, 'capturedAt', 'capturedAt');
  const entries = list(field(source, 'entries', 'entries'), MARKET_PUBLICATION_LIMITS.products, 'entries');
  let variantCount = 0;
  const products = entries.map((entry, productIndex) => {
    const path = `entries[${productIndex}]`;
    const product = record(field(record(entry, path), 'product', `${path}.product`), `${path}.product`);
    const variants = list(field(product, 'variants', `${path}.product.variants`),
      MARKET_PUBLICATION_LIMITS.perProductVariants, `${path}.product.variants`);
    variantCount += variants.length;
    if (variantCount > MARKET_PUBLICATION_LIMITS.variants) return invalid('entries.variants');
    return {
      id: field(product, 'id', `${path}.product.id`),
      active: field(product, 'active', `${path}.product.active`),
      variants: variants.map((variant, variantIndex) => {
        const variantPath = `${path}.product.variants[${variantIndex}]`;
        const row = record(variant, variantPath);
        return {
          id: field(row, 'id', `${variantPath}.id`),
          productId: field(row, 'product_id', `${variantPath}.product_id`),
          status: field(row, 'status', `${variantPath}.status`),
        };
      }),
    };
  });
  // Un único contrato de snapshot valida IDs seguros, ownership, duplicados,
  // estados, límites, metadatos y congela las copias devueltas.
  return defineMarketPublicationSnapshot({ schemaVersion: 1, ref, capturedAt, products });
}
