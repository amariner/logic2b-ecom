import { afterEach, describe, expect, it, vi } from 'vitest';
import { projectCompanyCatalogSnapshot } from '../src/composition/company-catalog-snapshot';
import { createCatalogEntry, projectDefaultVariant, type ProductVariantStatus } from '../src/modules/catalog';
import { COMPANY_CATALOG_LIMITS, CompanyCatalogContractError } from '../src/modules/companies';

const AT = '2026-10-04T12:00:00.000Z';
function entry(id = 1) {
  return createCatalogEntry({ product: { id, slug: `item-${id}`, name: `Example ${id}`, description: 'Fixture',
    image: '/example.webp', category: 'Example', collection: 'Fixture', active: id !== 2, subtitle: null, specs_json: null, created_at: AT },
  variants: (['active', 'active', 'draft', 'archived'] as ProductVariantStatus[]).map((status, index) => ({
    id: id * 10 + index + 1, product_id: id, sku: `EXAMPLE-${id}-${index}`, gtin: null, mpn: null, title: `Variant ${index}`,
    price_cents: [1000, 0, 2300, 10_000_000][index]!, compare_at_price_cents: null, status,
    is_default: index === 0, option_signature: JSON.stringify([index + 1]),
    options: [{ option_id: 1, option_name: 'Finish', option_position: 0, value_id: index + 1, value: `Finish ${index}`, value_position: index }],
    created_at: AT, updated_at: AT,
  })), available_stock: 2 });
}
function input() { return { ref: 'catalog.fixture', capturedAt: AT, currency: 'EUR', entries: [structuredClone(entry())] }; }
function reject(value: unknown) { expect(() => projectCompanyCatalogSnapshot(value)).toThrow(CompanyCatalogContractError); }
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('proyección de precios propios del catálogo completo R6.2a', () => {
  it('incluye todas las variantes y su precio propio EUR, incluso cero y el máximo del contrato', () => {
    expect(projectCompanyCatalogSnapshot(input())).toEqual({ schemaVersion: 1, source: 'fixture', ref: 'catalog.fixture', capturedAt: AT, currency: 'EUR',
      products: [{ id: 1, active: true, variants: [
        { id: 11, productId: 1, status: 'active', priceCents: 1000 }, { id: 12, productId: 1, status: 'active', priceCents: 0 },
        { id: 13, productId: 1, status: 'draft', priceCents: 2300 }, { id: 14, productId: 1, status: 'archived', priceCents: 10_000_000 },
      ] }] });
    expect(projectCompanyCatalogSnapshot({ ...input(), entries: [entry(2)] }).products[0]).toMatchObject({ active: false });
  });

  it('no valida ni lee campos CMS descartados, precio legacy, default, inventario o metadatos ajenos', () => {
    const data = input(); const getter = vi.fn(() => { throw new Error('Unexpected discarded field'); });
    const product = data.entries[0]!.product;
    for (const key of ['available_stock', 'reader', 'currency']) Object.defineProperty(data.entries[0]!, key, { enumerable: true, get: getter });
    for (const key of ['name', 'description', 'price_cents', 'currency']) Object.defineProperty(product, key, { enumerable: true, get: getter });
    for (const variant of product.variants) for (const key of ['is_default', 'options', 'sku', 'compare_at_price_cents']) Object.defineProperty(variant, key, { enumerable: true, get: getter });
    expect(projectCompanyCatalogSnapshot(data)).toEqual(projectCompanyCatalogSnapshot(input())); expect(getter).not.toHaveBeenCalled();
  });

  it('no admite un listado que haya perdido las variantes completas ni inventa base desde producto/default', () => {
    reject({ ...input(), entries: [projectDefaultVariant(entry())] });
    const data = input(); Reflect.deleteProperty(data.entries[0]!.product.variants[1]!, 'price_cents');
    Object.assign(data.entries[0]!.product, { price_cents: 999 }); reject(data);
  });

  it.each([-1, -0, 0.5, 10_000_001, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY, '1000', null])('rechaza precio inválido %s también en archived no elegida', (price) => {
    const data = input(); Object.assign(data.entries[0]!.product.variants[3]!, { price_cents: price }); reject(data);
  });

  it('admite catálogo vacío explícito y exige moneda, referencia y fecha aportadas', () => {
    expect(projectCompanyCatalogSnapshot({ ...input(), entries: [] })).toEqual({ schemaVersion: 1, source: 'fixture', ref: 'catalog.fixture', capturedAt: AT, currency: 'EUR', products: [] });
    for (const patch of [{ currency: 'JPY' }, { currency: null }, { ref: '' }, { capturedAt: '' }, { capturedAt: '2026-02-30T12:00:00.000Z' }]) reject({ ...input(), ...patch });
    reject({ entries: [] }); reject({ ...input(), source: 'fixture' });
  });

  it('valida duplicados, ownership, estado y todos los registros antes de devolver proyección', () => {
    reject({ ...input(), entries: [entry(), entry()] });
    for (const patch of [{ id: 11 }, { product_id: 2 }, { status: 'published' }]) {
      const data = input(); Object.assign(data.entries[0]!.product.variants[3]!, patch); reject(data);
    }
    const inactive = input(); Object.assign(inactive.entries[0]!.product, { active: 1 }); reject(inactive);
  });

  it('rechaza getters de todos los campos proyectados sin ejecutarlos', () => {
    const getter = vi.fn(() => { throw new Error('Getter must not run'); });
    const targets = [
      (data: ReturnType<typeof input>) => [data, 'currency'] as const,
      (data: ReturnType<typeof input>) => [data.entries[0]!, 'product'] as const,
      (data: ReturnType<typeof input>) => [data.entries[0]!.product, 'variants'] as const,
      (data: ReturnType<typeof input>) => [data.entries[0]!.product, 'active'] as const,
      (data: ReturnType<typeof input>) => [data.entries[0]!.product.variants[3]!, 'price_cents'] as const,
    ];
    for (const target of targets) { const data = input(); const [row, key] = target(data); Object.defineProperty(row, key, { enumerable: true, get: getter }); reject(data); }
    const arrayGetter = input(); Object.defineProperty(arrayGetter.entries, '0', { enumerable: true, get: getter }); reject(arrayGetter);
    expect(getter).not.toHaveBeenCalled();
  });

  it('rechaza arrays dispersos, decorados o con límites superados sin recorrer campos innecesarios', () => {
    const hole = input(); delete hole.entries[0]; reject(hole);
    const extra = input(); Object.defineProperty(extra.entries, 'extra', { value: true }); reject(extra);
    reject({ ...input(), entries: new Array(COMPANY_CATALOG_LIMITS.products + 1) });
    const excess = input(); Object.assign(excess.entries[0]!.product, { variants: new Array(COMPANY_CATALOG_LIMITS.perProductVariants + 1) }); reject(excess);
  });

  it('copia y congela precios y referencias sin retener entrada mutable', () => {
    const data = input(); const result = projectCompanyCatalogSnapshot(data); const previous = JSON.stringify(result);
    Object.assign(data.entries[0]!.product.variants[1]!, { price_cents: 999 }); data.ref = 'other.catalog';
    expect(JSON.stringify(result)).toBe(previous);
    for (const object of [result, result.products, result.products[0], result.products[0]!.variants, ...result.products[0]!.variants]) expect(Object.isFrozen(object)).toBe(true);
  });

  it('solo consulta descriptores propios, sin usar getters Proxy ordinarios', () => {
    const get = vi.fn(() => { throw new Error('Unexpected proxy get'); });
    const data = input(); const product = data.entries[0]!.product;
    Object.assign(product, { variants: new Proxy(product.variants.map(variant => new Proxy(variant, { get })), { get }) });
    data.entries[0] = new Proxy({ product: new Proxy(product, { get }), available_stock: 2 }, { get });
    const result = projectCompanyCatalogSnapshot(new Proxy(data, { get }));
    expect(result.products[0]!.variants[1]!.priceCents).toBe(0); expect(get).not.toHaveBeenCalled();
  });

  it('redacta fallos hostiles sin causas y no consulta reloj ni efectos', () => {
    const secret = 'PRIVATE_PROJECTION_DATA';
    const hostile = new Proxy({}, { ownKeys() { throw new Error(secret); } });
    try { projectCompanyCatalogSnapshot(hostile); throw new Error('Expected rejection'); }
    catch (error) { expect(error).toBeInstanceOf(CompanyCatalogContractError); expect(String(error)).not.toContain(secret); expect(JSON.stringify(error)).not.toContain(secret); expect(error).not.toHaveProperty('cause'); }
    const expected = projectCompanyCatalogSnapshot(input()); const forbidden = vi.fn(() => { throw new Error('Unexpected effect'); });
    vi.spyOn(Date, 'now').mockImplementation(forbidden);
    for (const key of ['fetch', 'setTimeout', 'setInterval']) vi.stubGlobal(key, forbidden);
    expect(projectCompanyCatalogSnapshot(input())).toEqual(expected); expect(forbidden).not.toHaveBeenCalled();
  });
});
