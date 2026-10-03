import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  projectMarketPublicationSnapshot,
  type MarketPublicationSnapshotProjectionInput,
} from '../src/composition/market-publication-snapshot';
import { createCatalogEntry, projectDefaultVariant, type CatalogEntry, type ProductVariantStatus } from '../src/modules/catalog';
import {
  MARKET_PUBLICATION_LIMITS,
  MarketPublicationContractError,
  previewMarketPublication,
} from '../src/modules/markets';

const AT = '2026-10-03T12:00:00.000Z';

function entry(id = 1, active = true): CatalogEntry {
  return createCatalogEntry({
    product: { id, slug: `product-${id}`, name: `Product ${id}`, description: 'Complete editorial content',
      image: '/example.webp', category: 'Example', collection: 'Fixture', active, subtitle: null,
      specs_json: null, created_at: AT },
    variants: (['active', 'active', 'draft', 'archived'] as ProductVariantStatus[]).map((status, index) => ({
      id: id * 10 + index + 1, product_id: id, sku: `SKU-${id}-${index}`, gtin: null, mpn: null,
      title: `Variant ${index}`, price_cents: 1000 + index * 100, compare_at_price_cents: null,
      status, is_default: index === 0, option_signature: JSON.stringify([index + 1]),
      options: [{ option_id: 1, option_name: 'Finish', option_position: 0, value_id: index + 1,
        value: `Finish ${index}`, value_position: index }], created_at: AT, updated_at: AT,
    })),
    available_stock: 3,
  });
}

function input(entries: readonly CatalogEntry[] = [entry()]): MarketPublicationSnapshotProjectionInput {
  return { ref: 'qa.catalog.1', capturedAt: AT, entries };
}

function project(value: unknown) {
  return projectMarketPublicationSnapshot(value as MarketPublicationSnapshotProjectionInput);
}

function mutableEntry() {
  return structuredClone(entry());
}

function markets() {
  return { schemaVersion: 1, id: 'qa-markets', version: 1,
    markets: [{ id: 'ES', countryCodes: ['ES'], currency: 'EUR', defaultLocale: 'es-ES', domains: ['es.example.test'] }],
    fallback: { strategy: 'none' } };
}

function policy(variantIds = [12]) {
  return { schemaVersion: 1, id: 'qa-publication', version: 1, channels: ['storefront'],
    rules: [{ marketId: 'ES', channel: 'storefront', productId: 1, state: 'published', variantIds }] };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('proyección del catálogo completo para publicación por mercado R5.9a', () => {
  it('conserva todas las variantes, incluso no default, draft y archived', () => {
    expect(projectMarketPublicationSnapshot(input())).toEqual({
      schemaVersion: 1, ref: 'qa.catalog.1', capturedAt: AT,
      products: [{ id: 1, active: true, variants: [
        { id: 11, productId: 1, status: 'active' }, { id: 12, productId: 1, status: 'active' },
        { id: 13, productId: 1, status: 'draft' }, { id: 14, productId: 1, status: 'archived' },
      ] }],
    });
  });

  it('conserva el producto inactivo sin filtrar sus variantes ni inventar versión', () => {
    const result = projectMarketPublicationSnapshot(input([entry(2, false)]));
    expect(result.products[0]).toMatchObject({ id: 2, active: false });
    expect(result.products[0]!.variants).toHaveLength(4);
    expect(result.products[0]).not.toHaveProperty('version');
    expect(result.products[0]!.variants[0]).not.toHaveProperty('version');
  });

  it('admite captura vacía explícita y no usa reloj ni fabrica metadatos', () => {
    expect(projectMarketPublicationSnapshot(input([]))).toEqual({ schemaVersion: 1, ref: 'qa.catalog.1', capturedAt: AT, products: [] });
    expect(() => project({ entries: [] })).toThrow(MarketPublicationContractError);
  });

  it('copia y congela recursivamente sin retener referencias del catálogo', () => {
    const original = mutableEntry();
    const request = input([original]);
    const snapshot = projectMarketPublicationSnapshot(request);
    Object.assign(original.product, { active: false, id: 99 });
    Object.assign(original.product.variants[0]!, { id: 999, status: 'archived' });
    Object.assign(request, { ref: 'qa.changed', capturedAt: '2026-10-04T12:00:00.000Z' });
    expect(snapshot).toMatchObject({ ref: 'qa.catalog.1', capturedAt: AT });
    expect(snapshot.products[0]).toMatchObject({ id: 1, active: true });
    expect(snapshot.products[0]!.variants[0]).toEqual({ id: 11, productId: 1, status: 'active' });
    for (const value of [snapshot, snapshot.products, snapshot.products[0], snapshot.products[0]!.variants,
      ...snapshot.products[0]!.variants]) expect(Object.isFrozen(value)).toBe(true);
    expect(() => { (snapshot.products[0] as { active: boolean }).active = false; }).toThrow();
  });

  it('precio, stock, contenido y variante default no cambian el snapshot', () => {
    const original = entry();
    const changed = createCatalogEntry({ product: { ...original.product, name: 'Different editorial copy',
      description: 'Other copy', image: '/another.webp' },
    variants: original.product.variants.map((variant, index) => ({ ...variant,
      price_cents: index === 0 ? 0 : 999999, is_default: index === 1 })), available_stock: 0 });
    expect(projectMarketPublicationSnapshot(input([changed]))).toEqual(projectMarketPublicationSnapshot(input([original])));
  });

  it('no lee getters ajenos de precio, stock, moneda ni contenido editorial', () => {
    const original = mutableEntry();
    const getter = vi.fn(() => { throw new Error('Unexpected unrelated field'); });
    for (const key of ['available_stock', 'currency']) Object.defineProperty(original, key, { enumerable: true, get: getter });
    for (const key of ['name', 'description', 'currency']) Object.defineProperty(original.product, key, { enumerable: true, get: getter });
    for (const key of ['price_cents', 'is_default', 'options']) Object.defineProperty(original.product.variants[0]!, key, { enumerable: true, get: getter });
    expect(projectMarketPublicationSnapshot(input([original]))).toEqual(projectMarketPublicationSnapshot(input()));
    expect(getter).not.toHaveBeenCalled();
  });

  it('rechaza filas de escaparate que han perdido las variantes no default', () => {
    expect(() => project(input([projectDefaultVariant(entry()) as unknown as CatalogEntry]))).toThrow(MarketPublicationContractError);
  });

  it('selecciona una variante activa no default y explica draft/archived sin publicarlas', () => {
    const result = previewMarketPublication({ markets: markets(), catalog: projectMarketPublicationSnapshot(input()),
      policy: policy([12, 13, 14]), context: { marketId: 'ES', channel: 'storefront' } });
    expect(result).toMatchObject({ markets: { id: 'qa-markets', version: 1 },
      catalog: { ref: 'qa.catalog.1', capturedAt: AT }, policy: { id: 'qa-publication', version: 1 },
      context: { marketId: 'ES', channel: 'storefront' }, products: [{ productId: 1, publication: 'published',
        visible: true, reasons: [], visibleVariantIds: [12], variants: [
          { variantId: 11, selected: false, visible: false, reasons: ['variant_not_selected'] },
          { variantId: 12, selected: true, visible: true, reasons: [] },
          { variantId: 13, selected: true, visible: false, reasons: ['variant_draft'] },
          { variantId: 14, selected: true, visible: false, reasons: ['variant_archived'] },
        ] }] });
  });

  it('un producto inactivo sigue bloqueado aunque se seleccione una variante activa', () => {
    const result = previewMarketPublication({ markets: markets(),
      catalog: projectMarketPublicationSnapshot(input([entry(1, false)])), policy: policy(),
      context: { marketId: 'ES', channel: 'storefront' } });
    expect(result.products[0]).toMatchObject({ visible: false, visibleVariantIds: [], reasons: ['product_inactive'] });
    expect(result.products[0]!.variants.find((variant) => variant.variantId === 12))
      .toEqual({ variantId: 12, selected: true, visible: false, reasons: ['product_inactive'] });
  });

  it('seleccionar solo draft/archived conserva sus motivos y deja el producto sin variantes visibles', () => {
    const result = previewMarketPublication({ markets: markets(), catalog: projectMarketPublicationSnapshot(input()),
      policy: policy([13, 14]), context: { marketId: 'ES', channel: 'storefront' } });
    expect(result.products[0]).toMatchObject({ visible: false, visibleVariantIds: [], reasons: ['no_visible_variants'] });
  });

  it('una nueva variante activa no hereda la publicación de otra variante', () => {
    const original = entry();
    const seed = original.product.variants[0]!;
    const expanded = createCatalogEntry({ product: original.product, available_stock: 999,
      variants: [...original.product.variants, { ...seed, id: 15, sku: 'SKU-new', is_default: false,
        option_signature: '[5]', options: [{ ...seed.options[0]!, value_id: 5, value: 'New', value_position: 4 }] }] });
    const result = previewMarketPublication({ markets: markets(), catalog: projectMarketPublicationSnapshot(input([expanded])),
      policy: policy(), context: { marketId: 'ES', channel: 'storefront' } });
    expect(result.products[0]!.visibleVariantIds).toEqual([12]);
    expect(result.products[0]!.variants.find((variant) => variant.variantId === 15))
      .toEqual({ variantId: 15, selected: false, visible: false, reasons: ['variant_not_selected'] });
  });

  it.each([
    { marketId: 'MISSING' }, { productId: 999 }, { variantIds: [999] }, { variantIds: [21] },
    { channel: 'undeclared' },
  ])('valida referencias de todas las reglas, también fuera del contexto seleccionado: %o', (invalid) => {
    const catalog = projectMarketPublicationSnapshot(input([entry(), entry(2)]));
    const supplied = policy();
    const rules = [...supplied.rules, { ...supplied.rules[0]!, channel: 'wholesale', ...invalid }];
    expect(() => previewMarketPublication({ markets: markets(), catalog,
      policy: { ...supplied, channels: ['storefront', 'wholesale'], rules },
      context: { marketId: 'ES', channel: 'storefront' } })).toThrow(MarketPublicationContractError);
  });

  it('moneda, precio y stock no conceden ni bloquean visibilidad', () => {
    const original = entry();
    const withoutStock = createCatalogEntry({ product: original.product, available_stock: 0,
      variants: original.product.variants.map((variant) => ({ ...variant, price_cents: 0 })) });
    const baseline = previewMarketPublication({ markets: markets(), catalog: projectMarketPublicationSnapshot(input()),
      policy: policy(), context: { marketId: 'ES', channel: 'storefront' } });
    const differentCurrency = markets();
    differentCurrency.markets[0]!.currency = 'USD';
    const result = previewMarketPublication({ markets: differentCurrency,
      catalog: projectMarketPublicationSnapshot(input([withoutStock])), policy: policy(),
      context: { marketId: 'ES', channel: 'storefront' } });
    expect(result).toEqual(baseline);
    expect(result.products[0]!.visibleVariantIds).toEqual([12]);
    for (const key of ['currency', 'price', 'stock', 'purchasable']) expect(result).not.toHaveProperty(key);
  });

  it.each([
    { ref: '' }, { ref: 'UPPER' }, { ref: 'a'.repeat(101) }, { ref: 'unsafe value' },
    { capturedAt: '' }, { capturedAt: '2026-02-30T12:00:00.000Z' },
    { capturedAt: '2026-10-03T12:00:00Z' }, { capturedAt: '2026-10-03T12:00:00+00:00' },
  ])('exige metadata explícita válida: %o', (invalid) => {
    expect(() => project({ ...input(), ...invalid })).toThrow(MarketPublicationContractError);
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '1'])('rechaza ID de producto inseguro %s', (id) => {
    const original = mutableEntry();
    Object.assign(original.product, { id });
    expect(() => project(input([original]))).toThrow(MarketPublicationContractError);
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '11'])('rechaza ID de variante inseguro %s', (id) => {
    const original = mutableEntry();
    Object.assign(original.product.variants[0]!, { id });
    expect(() => project(input([original]))).toThrow(MarketPublicationContractError);
  });

  it('rechaza ownership ajeno, estados no tipados y active no booleano', () => {
    for (const patch of [{ product_id: 2 }, { product_id: '1' }, { status: 'published' }, { status: null }]) {
      const original = mutableEntry();
      Object.assign(original.product.variants[0]!, patch);
      expect(() => project(input([original]))).toThrow(MarketPublicationContractError);
    }
    const original = mutableEntry();
    Object.assign(original.product, { active: 1 });
    expect(() => project(input([original]))).toThrow(MarketPublicationContractError);
  });

  it('rechaza producto duplicado y variante duplicada dentro o fuera de su producto', () => {
    expect(() => project(input([entry(), entry()]))).toThrow(MarketPublicationContractError);
    const duplicated = mutableEntry();
    Object.assign(duplicated.product.variants[1]!, { id: 11 });
    expect(() => project(input([duplicated]))).toThrow(MarketPublicationContractError);
    const second = structuredClone(entry(2));
    Object.assign(second.product.variants[0]!, { id: 11 });
    expect(() => project(input([entry(), second]))).toThrow(MarketPublicationContractError);
  });

  it.each([null, {}, { ...input(), entries: null }, { ...input(), entries: [{}] },
    { ...input(), entries: [{ product: null }] }, { ...input(), entries: [{ product: { id: 1, active: true, variants: [] } }] },
  ])('rechaza estructura incompleta sin fabricar catálogo: %o', (invalid) => {
    expect(() => project(invalid)).toThrow(MarketPublicationContractError);
  });

  it('rechaza getters en todo campo proyectado sin ejecutarlos', () => {
    const getter = vi.fn(() => { throw new Error('Unexpected input getter'); });
    const targets = ['ref', 'capturedAt', 'entries', 'entry', 'product', 'id', 'active', 'variants',
      'variant', 'variantId', 'product_id', 'status'];
    for (const target of targets) {
      const original = mutableEntry();
      const request = { ...input([original]) };
      const entryArray = request.entries;
      const variants = original.product.variants;
      const [object, key] = target === 'entry' ? [entryArray, '0'] : target === 'variant' ? [variants, '0']
        : target === 'product' ? [original, 'product'] : target === 'variantId' ? [variants[0]!, 'id']
          : ['product_id', 'status'].includes(target) ? [variants[0]!, target]
            : ['id', 'active', 'variants'].includes(target) ? [original.product, target] : [request, target];
      Object.defineProperty(object, key as string, { enumerable: true, get: getter });
      expect(() => project(request), target).toThrow(MarketPublicationContractError);
    }
    expect(getter).not.toHaveBeenCalled();
  });

  it('rechaza arrays dispersos o con iteradores añadidos sin ejecutarlos', () => {
    const sparse = new Array(1);
    expect(() => project({ ...input(), entries: sparse })).toThrow(MarketPublicationContractError);
    const getter = vi.fn(() => { throw new Error('Unexpected iterator'); });
    const entries = [entry()];
    Object.defineProperty(entries, Symbol.iterator, { get: getter });
    expect(() => project(input(entries))).toThrow(MarketPublicationContractError);
    expect(getter).not.toHaveBeenCalled();
  });

  it('aplica límites antes de proyectar un catálogo sobredimensionado', () => {
    const entries = Array.from({ length: MARKET_PUBLICATION_LIMITS.products + 1 }, () => entry());
    expect(() => project(input(entries))).toThrow(MarketPublicationContractError);
    const original = mutableEntry();
    Object.assign(original.product, { variants: Array.from({ length: MARKET_PUBLICATION_LIMITS.perProductVariants + 1 }, () => original.product.variants[0]) });
    expect(() => project(input([original]))).toThrow(MarketPublicationContractError);
  });

  it('cuenta todas las variantes al aplicar el límite total, sin quedarse solo con default', () => {
    const complete = Array.from({ length: 101 }, (_, index) => {
      const original = entry(index + 1);
      const seed = original.product.variants[0]!;
      return createCatalogEntry({ product: original.product, available_stock: 0,
        variants: Array.from({ length: 100 }, (_, variantIndex) => ({ ...seed,
          id: (index + 1) * 1000 + variantIndex, sku: `LIMIT-${index}-${variantIndex}`,
          is_default: variantIndex === 0, option_signature: JSON.stringify([variantIndex + 1]),
          options: [{ ...seed.options[0]!, value_id: variantIndex + 1, value: `Option ${variantIndex}`,
            value_position: variantIndex }],
        })) });
    });
    const limit = projectMarketPublicationSnapshot(input(complete.slice(0, 100)));
    expect(limit.products.reduce((count, product) => count + product.variants.length, 0)).toBe(MARKET_PUBLICATION_LIMITS.variants);
    expect(() => projectMarketPublicationSnapshot(input(complete))).toThrow(MarketPublicationContractError);
  });

  it('es pura y determinista sin reloj actual, red, temporizadores ni almacenamiento', () => {
    const request = input();
    const expected = projectMarketPublicationSnapshot(request);
    const unexpected = () => { throw new Error('Unexpected effect'); };
    vi.spyOn(Date, 'now').mockImplementation(unexpected);
    vi.stubGlobal('fetch', unexpected);
    vi.stubGlobal('setTimeout', unexpected);
    vi.stubGlobal('localStorage', { getItem: unexpected, setItem: unexpected });
    vi.stubGlobal('sessionStorage', { getItem: unexpected, setItem: unexpected });
    expect(projectMarketPublicationSnapshot(request)).toEqual(expected);
  });
});
