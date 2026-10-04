import type { CatalogEntry } from '../modules/catalog';
import {
  COMPANY_CATALOG_LIMITS, CompanyCatalogContractError, defineCompanyCatalogSnapshot,
  type CompanyCatalogSnapshot, type CompanyCatalogContractReason,
} from '../modules/companies';

export type CompanyCatalogSnapshotProjectionInput = Readonly<{
  ref: string; capturedAt: string; currency: 'EUR'; entries: readonly CatalogEntry[];
}>;

function invalid(): never { throw new CompanyCatalogContractError('invalid_data'); }
function record(input: unknown): object {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return invalid();
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return invalid();
  return input;
}
function field(input: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(input, key);
  if (!descriptor?.enumerable || !('value' in descriptor)) return invalid();
  return descriptor.value;
}
function array(input: unknown, maximum: number): readonly unknown[] {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) return invalid();
  const descriptor = Object.getOwnPropertyDescriptor(input, 'length');
  if (!descriptor || !('value' in descriptor) || typeof descriptor.value !== 'number' || descriptor.value > maximum) return invalid();
  const length = descriptor.value;
  if (Reflect.ownKeys(input).length !== length + 1) return invalid();
  const result: unknown[] = [];
  for (let index = 0; index < length; index++) result.push(field(input, String(index)));
  return result;
}

/**
 * Proyecta exclusivamente datos propios de cada variante del agregado completo.
 * No valida contenido editorial descartado ni consulta lectores, stock, default
 * o precio legacy. EUR/ref/capturedAt son declaraciones explícitas del llamador.
 */
export function projectCompanyCatalogSnapshot(input: unknown): CompanyCatalogSnapshot {
  try {
    const row = record(input);
    const keys = Reflect.ownKeys(row);
    if (keys.length !== 4 || keys.some(key => typeof key !== 'string' || !['ref', 'capturedAt', 'currency', 'entries'].includes(key))) return invalid();
    const ref = field(row, 'ref');
    const capturedAt = field(row, 'capturedAt');
    const currency = field(row, 'currency');
    const entries = array(field(row, 'entries'), COMPANY_CATALOG_LIMITS.products);
    let variantCount = 0;
    const products = entries.map(entry => {
      const product = record(field(record(entry), 'product'));
      const variants = array(field(product, 'variants'), COMPANY_CATALOG_LIMITS.perProductVariants);
      variantCount += variants.length;
      if (variantCount > COMPANY_CATALOG_LIMITS.variants) return invalid();
      return { id: field(product, 'id'), active: field(product, 'active'), variants: variants.map(inputVariant => {
        const variant = record(inputVariant);
        return { id: field(variant, 'id'), productId: field(variant, 'product_id'),
          status: field(variant, 'status'), priceCents: field(variant, 'price_cents') };
      }) };
    });
    return defineCompanyCatalogSnapshot({ schemaVersion: 1, source: 'fixture', ref, capturedAt, currency, products });
  } catch (error) {
    let reason: CompanyCatalogContractReason = 'invalid_data';
    try {
      if (error instanceof CompanyCatalogContractError) {
        const descriptor = Object.getOwnPropertyDescriptor(error, 'reason');
        if (descriptor && 'value' in descriptor && typeof descriptor.value === 'string') reason = descriptor.value as CompanyCatalogContractReason;
      }
    } catch { /* Ningún error de introspección ni causa atraviesa esta frontera. */ }
    throw new CompanyCatalogContractError(reason);
  }
}
