import { describe, expect, it } from 'vitest';
import {
  MARKET_PUBLICATION_LIMITS,
  MarketPublicationContractError,
  defineMarketPublicationSnapshot,
  defineMarketPublicationPolicy,
  previewMarketPublication,
  type MarketCatalog,
  type MarketPublicationPolicy,
  type MarketPublicationProduct,
  type MarketPublicationRule,
  type MarketPublicationSnapshot,
  type MarketPublicationVariant,
} from '../src/modules/markets';

const markets = (): MarketCatalog => ({
  schemaVersion: 1, id: 'fixture.markets', version: 3,
  markets: [
    { id: 'ES', countryCodes: ['ES'], defaultLocale: 'es-ES', currency: 'EUR', domains: [] },
    { id: 'FR', countryCodes: ['FR'], defaultLocale: 'fr-FR', currency: 'EUR', domains: [] },
  ],
  fallback: { strategy: 'market', marketId: 'ES' },
});
const variant = (overrides: Partial<MarketPublicationVariant> = {}): MarketPublicationVariant => ({
  id: 11, productId: 1, status: 'active', ...overrides,
});
const product = (overrides: Partial<MarketPublicationProduct> = {}): MarketPublicationProduct => ({
  id: 1, active: true,
  variants: [variant(), variant({ id: 12 }), variant({ id: 13, status: 'draft' }), variant({ id: 14, status: 'archived' })],
  ...overrides,
});
const catalog = (overrides: Partial<MarketPublicationSnapshot> = {}): MarketPublicationSnapshot => ({
  schemaVersion: 1, ref: 'fixture.catalog', capturedAt: '2026-10-03T12:00:00.000Z',
  products: [product(), product({ id: 2, variants: [variant({ id: 21, productId: 2 })] })], ...overrides,
});
const rule = (overrides: Partial<MarketPublicationRule> = {}): MarketPublicationRule => ({
  marketId: 'ES', channel: 'storefront', productId: 1, state: 'published', variantIds: [12, 13, 14], ...overrides,
});
const policy = (overrides: Partial<MarketPublicationPolicy> = {}): MarketPublicationPolicy => ({
  schemaVersion: 1, id: 'fixture.publication', version: 7, channels: ['storefront', 'b2b'], rules: [rule()], ...overrides,
});
const input = () => ({ markets: markets(), catalog: catalog(), policy: policy(), context: { marketId: 'ES', channel: 'storefront' } });

function assertFrozen(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) assertFrozen(child);
}

describe('publicación exacta por mercado, canal y variantes R5.9a', () => {
  it('publica solo las variantes seleccionadas activas y conserva cada motivo de exclusión', () => {
    const result = previewMarketPublication(input());
    expect(result).toEqual({
      markets: { id: 'fixture.markets', version: 3 },
      catalog: { ref: 'fixture.catalog', capturedAt: '2026-10-03T12:00:00.000Z' },
      policy: { id: 'fixture.publication', version: 7 },
      context: { marketId: 'ES', channel: 'storefront' },
      products: [
        { productId: 1, publication: 'published', visible: true, reasons: [], visibleVariantIds: [12], variants: [
          { variantId: 11, selected: false, visible: false, reasons: ['variant_not_selected'] },
          { variantId: 12, selected: true, visible: true, reasons: [] },
          { variantId: 13, selected: true, visible: false, reasons: ['variant_draft'] },
          { variantId: 14, selected: true, visible: false, reasons: ['variant_archived'] },
        ] },
        { productId: 2, publication: 'unconfigured', visible: false, reasons: ['unconfigured'], visibleVariantIds: [], variants: [
          { variantId: 21, selected: false, visible: false, reasons: ['unconfigured'] },
        ] },
      ],
    });
    assertFrozen(result);
  });

  it('distingue una retirada explícita de la ausencia de configuración', () => {
    const result = previewMarketPublication({ ...input(), policy: policy({ rules: [rule({ state: 'unpublished', variantIds: [] })] }) });
    expect(result.products.map(({ publication, reasons }) => ({ publication, reasons }))).toEqual([
      { publication: 'unpublished', reasons: ['unpublished'] },
      { publication: 'unconfigured', reasons: ['unconfigured'] },
    ]);
    expect(result.products[0]!.variants[2]).toEqual({
      variantId: 13, selected: false, visible: false, reasons: ['unpublished', 'variant_draft'],
    });
  });

  it('aísla las tuplas de mercado y canal, sin herencia ni fallback de publicación', () => {
    const multi = policy({ rules: [rule(), rule({ marketId: 'FR', variantIds: [11] }),
      rule({ channel: 'b2b', state: 'unpublished', variantIds: [] }),
      rule({ marketId: 'FR', channel: 'b2b', productId: 2, variantIds: [21] })] });
    const visible = (marketId: string, channel: string) => previewMarketPublication({
      ...input(), policy: multi, context: { marketId, channel },
    }).products.map(({ publication, visibleVariantIds }) => ({ publication, visibleVariantIds }));
    expect(visible('ES', 'storefront')).toEqual([
      { publication: 'published', visibleVariantIds: [12] }, { publication: 'unconfigured', visibleVariantIds: [] },
    ]);
    expect(visible('FR', 'storefront')).toEqual([
      { publication: 'published', visibleVariantIds: [11] }, { publication: 'unconfigured', visibleVariantIds: [] },
    ]);
    expect(visible('ES', 'b2b')).toEqual([
      { publication: 'unpublished', visibleVariantIds: [] }, { publication: 'unconfigured', visibleVariantIds: [] },
    ]);
    expect(visible('FR', 'b2b')).toEqual([
      { publication: 'unconfigured', visibleVariantIds: [] }, { publication: 'published', visibleVariantIds: [21] },
    ]);
  });

  it('una variante nueva activa no amplía la selección publicada', () => {
    const result = previewMarketPublication({ ...input(), catalog: catalog({
      products: [product({ variants: [...product().variants, variant({ id: 15 })] })],
    }) });
    expect(result.products[0]!.visibleVariantIds).toEqual([12]);
    expect(result.products[0]!.variants.at(-1)).toEqual({ variantId: 15, selected: false, visible: false, reasons: ['variant_not_selected'] });
  });

  it('un producto inactivo excluye incluso las variantes seleccionadas activas', () => {
    const result = previewMarketPublication({ ...input(), catalog: catalog({ products: [product({ active: false })] }) }).products[0]!;
    expect(result).toMatchObject({ publication: 'published', visible: false, reasons: ['product_inactive'], visibleVariantIds: [] });
    expect(result.variants[1]).toEqual({ variantId: 12, selected: true, visible: false, reasons: ['product_inactive'] });
    expect(result.variants[0]!.reasons).toEqual(['product_inactive', 'variant_not_selected']);
    expect(result.variants[2]!.reasons).toEqual(['product_inactive', 'variant_draft']);
  });

  it('diagnostica una publicación sin variantes visibles sin elegir otra variante activa', () => {
    const result = previewMarketPublication({ ...input(), policy: policy({ rules: [rule({ variantIds: [13, 14] })] }) }).products[0]!;
    expect(result).toMatchObject({ publication: 'published', visible: false, reasons: ['no_visible_variants'], visibleVariantIds: [] });
    expect(result.variants[0]!.selected).toBe(false);
  });

  it('los bloqueos se acumulan en orden estable sin sustituir la configuración', () => {
    const result = previewMarketPublication({ ...input(), catalog: catalog({ products: [product({ active: false })] }), policy: policy({ rules: [] }) });
    expect(result.products[0]!.reasons).toEqual(['product_inactive', 'unconfigured']);
    expect(result.products[0]!.variants[3]!.reasons).toEqual(['product_inactive', 'unconfigured', 'variant_archived']);
  });

  it('evalúa las mismas decisiones con otros metadatos temporales y moneda/idioma de mercado', () => {
    const other = input();
    other.markets = { ...other.markets, markets: other.markets.markets.map((market) => ({ ...market, currency: 'JPY', defaultLocale: 'ja-JP' })) };
    other.catalog = catalog({ ref: 'another.snapshot', capturedAt: '2000-01-01T00:00:00.000Z' });
    other.policy = policy({ version: 999 });
    expect(previewMarketPublication(other).products).toEqual(previewMarketPublication(input()).products);
  });

  it('admite catálogo vacío y política sin reglas sin inventar productos', () => {
    expect(previewMarketPublication({ ...input(), catalog: catalog({ products: [] }), policy: policy({ rules: [] }) }).products).toEqual([]);
    expect(previewMarketPublication({ ...input(), policy: policy({ rules: [] }) }).products.every((value) => value.publication === 'unconfigured')).toBe(true);
  });

  it('no incluye precios, stock, variante por defecto ni autorización de compra en el resultado', () => {
    const serialized = JSON.stringify(previewMarketPublication(input()));
    for (const field of ['price', 'stock', 'purchasable', 'is_default', 'currency', 'locale']) expect(serialized).not.toContain(field);
  });
});

describe('integridad referencial completa del preview', () => {
  it.each([
    { marketId: 'UNKNOWN', channel: 'storefront' }, { marketId: 'ES', channel: 'unknown' },
    { marketId: 'es', channel: 'storefront' }, { marketId: 'ES', channel: 'Storefront' },
    { marketId: 'ES' }, { channel: 'storefront' }, { marketId: 'ES', channel: 'storefront', locale: 'es' },
    { by: 'country', countryCode: 'ES' },
  ])('rechaza el contexto inválido %j incluso si el catálogo declara fallback', (context) => {
    expect(() => previewMarketPublication({ ...input(), context })).toThrow(MarketPublicationContractError);
  });

  it.each([
    { marketId: 'UNKNOWN' }, { productId: 999 }, { variantIds: [999] }, { variantIds: [21] },
    { marketId: 'FR', variantIds: [21] }, { channel: 'b2b', variantIds: [999] },
    { productId: 999, state: 'unpublished', variantIds: [] },
  ] as Partial<MarketPublicationRule>[])('rechaza referencias inválidas aunque la regla no sea del contexto: %j', (overrides) => {
    expect(() => previewMarketPublication({ ...input(), policy: policy({ rules: [rule(overrides)] }) })).toThrow(MarketPublicationContractError);
  });

  it('no devuelve resultados parciales cuando otra regla válida en forma tiene referencias corruptas', () => {
    expect(() => previewMarketPublication({ ...input(), policy: policy({ rules: [rule(), rule({ marketId: 'FR', productId: 999 })] }) }))
      .toThrow(/producto desconocido/);
    // El normalizador de política no afirma integridad contra un catálogo que no recibe.
    expect(defineMarketPublicationPolicy(policy({ rules: [rule({ marketId: 'FR', productId: 999 })] })).rules).toHaveLength(1);
  });

  it('traduce errores del catálogo de mercados a la familia del contrato de publicación', () => {
    expect(() => previewMarketPublication({ ...input(), markets: {} })).toThrow(MarketPublicationContractError);
  });
});

describe('validación y límites del snapshot mínimo', () => {
  it.each([
    ['schemaVersion', 2], ['ref', ''], ['ref', 'Fixture.Catalog'], ['ref', 'a'.repeat(101)], ['ref', 'x/y'],
    ['capturedAt', '2026-02-29T00:00:00.000Z'], ['capturedAt', '2026-10-03T12:00:00Z'],
    ['capturedAt', '2026-10-03T12:00:00.000+00:00'], ['capturedAt', '2026-10-03T24:00:00.000Z'],
    ['capturedAt', '2026-10-03T12:00:00.000000Z'], ['capturedAt', 1], ['extra', 1],
  ])('rechaza %s=%s', (key, value) => {
    expect(() => defineMarketPublicationSnapshot({ ...catalog(), [key]: value })).toThrow(MarketPublicationContractError);
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, '1', null])('rechaza un ID de producto o variante no seguro: %s', (id) => {
    expect(() => defineMarketPublicationSnapshot({ ...catalog(), products: [{ ...product(), id }] })).toThrow(MarketPublicationContractError);
    expect(() => defineMarketPublicationSnapshot({ ...catalog(), products: [{ ...product(), variants: [{ ...variant(), id }] }] })).toThrow(MarketPublicationContractError);
    expect(() => defineMarketPublicationSnapshot({ ...catalog(), products: [{ ...product(), variants: [{ ...variant(), productId: id }] }] })).toThrow(MarketPublicationContractError);
  });

  it('acepta el último entero seguro sin redondearlo', () => {
    const id = Number.MAX_SAFE_INTEGER;
    const result = defineMarketPublicationSnapshot(catalog({ products: [product({ id, variants: [variant({ id, productId: id })] })] }));
    expect(result.products[0]!.variants[0]).toEqual({ id, productId: id, status: 'active' });
  });

  it('rechaza producto repetido, propiedad ajena y variante repetida incluso entre productos', () => {
    expect(() => defineMarketPublicationSnapshot(catalog({ products: [product(), product()] }))).toThrow(/producto duplicado/);
    expect(() => defineMarketPublicationSnapshot(catalog({ products: [product({ variants: [variant({ productId: 2 })] })] }))).toThrow(/otro producto/);
    expect(() => defineMarketPublicationSnapshot(catalog({ products: [product({ variants: [variant(), variant()] })] }))).toThrow(/variante duplicada/);
    expect(() => defineMarketPublicationSnapshot(catalog({ products: [product(), product({ id: 2, variants: [variant({ productId: 2 })] })] })))
      .toThrow(/variante duplicada/);
  });

  it.each([['active', 1], ['active', 'true'], ['variants', []], ['price_cents', 100], ['is_default', true]])('rechaza producto %s=%s', (key, value) => {
    expect(() => defineMarketPublicationSnapshot({ ...catalog(), products: [{ ...product(), [key]: value }] })).toThrow(MarketPublicationContractError);
  });

  it.each(['published', 'ACTIVE', '', null, 1])('rechaza estado de variante fuera del vocabulario: %s', (status) => {
    expect(() => defineMarketPublicationSnapshot({ ...catalog(), products: [{ ...product(), variants: [{ ...variant(), status }] }] }))
      .toThrow(MarketPublicationContractError);
  });

  it('acepta exactamente los límites de productos y variantes por producto', () => {
    const products = Array.from({ length: MARKET_PUBLICATION_LIMITS.products }, (_, index) => product({
      id: index + 1, variants: [variant({ id: index + 1, productId: index + 1 })],
    }));
    expect(defineMarketPublicationSnapshot(catalog({ products })).products).toHaveLength(MARKET_PUBLICATION_LIMITS.products);
    expect(() => defineMarketPublicationSnapshot(catalog({ products: [...products, product()] }))).toThrow(/entre 0 y 1000/);
    const variants = Array.from({ length: MARKET_PUBLICATION_LIMITS.perProductVariants }, (_, index) => variant({ id: index + 1 }));
    expect(defineMarketPublicationSnapshot(catalog({ products: [product({ variants })] })).products[0]!.variants).toHaveLength(100);
    expect(() => defineMarketPublicationSnapshot(catalog({ products: [product({ variants: [...variants, variant({ id: 101 })] })] }))).toThrow(/entre 1 y 100/);
  });

  it('aplica el presupuesto total de variantes además de los límites individuales', () => {
    const products = Array.from({ length: 100 }, (_, productIndex) => product({
      id: productIndex + 1,
      variants: Array.from({ length: 100 }, (_, index) => variant({ id: productIndex * 100 + index + 1, productId: productIndex + 1 })),
    }));
    expect(defineMarketPublicationSnapshot(catalog({ products })).products.flatMap((value) => value.variants)).toHaveLength(10000);
    expect(() => defineMarketPublicationSnapshot(catalog({ products: [...products, product({
      id: 101, variants: [variant({ id: 10001, productId: 101 })],
    })] }))).toThrow(/límite total/);
  });
});

describe('política versionada explícita', () => {
  it.each([
    ['schemaVersion', 2], ['id', ''], ['id', 'Publication'], ['id', 'a'.repeat(101)],
    ['version', 0], ['version', -1], ['version', 1.5], ['version', Number.MAX_SAFE_INTEGER + 1], ['version', '1'],
    ['channels', []], ['channels', ['storefront', 'storefront']], ['channels', ['Storefront']],
    ['channels', ['*']], ['channels', ['a']], ['channels', ['a'.repeat(41)]], ['channels', [' web']],
    ['channels', ['web--shop']], ['channels', ['web/shop']], ['extra', true],
  ])('rechaza policy.%s=%s', (key, value) => {
    expect(() => defineMarketPublicationPolicy({ ...policy(), [key]: value })).toThrow(MarketPublicationContractError);
  });

  it.each([
    ['marketId', '*'], ['marketId', 'es'], ['marketId', 'E'], ['marketId', 'A'.repeat(41)],
    ['marketId', 'ES--RETAIL'], ['channel', 'undeclared'], ['productId', 0], ['state', 'unconfigured'],
    ['variantIds', []], ['variantIds', [11, 11]], ['variantIds', ['11']], ['variantIds', [Number.MAX_SAFE_INTEGER + 1]],
    ['version', 1],
  ])('rechaza rule.%s=%s', (key, value) => {
    expect(() => defineMarketPublicationPolicy({ ...policy(), rules: [{ ...rule(), [key]: value }] })).toThrow(MarketPublicationContractError);
  });

  it('prohíbe variantes en unpublished y tuplas repetidas aunque tengan decisiones diferentes', () => {
    expect(() => defineMarketPublicationPolicy(policy({ rules: [rule({ state: 'unpublished' })] }))).toThrow(MarketPublicationContractError);
    expect(() => defineMarketPublicationPolicy(policy({ rules: [rule(), rule({ state: 'unpublished', variantIds: [] })] }))).toThrow(/tupla/);
  });

  it('limita canales y reglas sin imponer defaults operativos', () => {
    const channels = Array.from({ length: 20 }, (_, index) => `channel-${index}`);
    expect(defineMarketPublicationPolicy(policy({ channels, rules: [] })).channels).toHaveLength(20);
    expect(() => defineMarketPublicationPolicy(policy({ channels: [...channels, 'other'], rules: [] }))).toThrow(/entre 1 y 20/);
    const rules = Array.from({ length: 10000 }, (_, index) => rule({ productId: index + 1 }));
    expect(defineMarketPublicationPolicy(policy({ rules })).rules).toHaveLength(10000);
    expect(() => defineMarketPublicationPolicy(policy({ rules: [...rules, rule({ productId: 10001 })] }))).toThrow(/entre 0 y 10000/);
  });

  it('acepta canales canónicos compatibles y versiones seguras sin inferir un canal principal', () => {
    const result = defineMarketPublicationPolicy(policy({ version: Number.MAX_SAFE_INTEGER, channels: ['b2b', 'web.shop', 'store_front', 'a'.repeat(40)], rules: [] }));
    expect(result.version).toBe(Number.MAX_SAFE_INTEGER);
    expect(result.channels).toHaveLength(4);
  });
});

describe('contratos de datos propios, determinismo e inmutabilidad', () => {
  it('ordena por identificador y tupla con independencia del orden de entrada', () => {
    const ordered = input();
    ordered.policy = policy({ rules: [rule(), rule({ marketId: 'FR', channel: 'b2b', productId: 2, variantIds: [21] })] });
    const reversed = {
      ...ordered,
      catalog: { ...ordered.catalog, products: [...ordered.catalog.products].reverse().map((value) => ({ ...value, variants: [...value.variants].reverse() })) },
      policy: { ...ordered.policy, channels: [...ordered.policy.channels].reverse(), rules: [...ordered.policy.rules].reverse().map((value) => ({ ...value, variantIds: [...value.variantIds].reverse() })) },
    };
    expect(defineMarketPublicationSnapshot(reversed.catalog)).toEqual(defineMarketPublicationSnapshot(ordered.catalog));
    expect(defineMarketPublicationPolicy(reversed.policy)).toEqual(defineMarketPublicationPolicy(ordered.policy));
    expect(previewMarketPublication(reversed)).toEqual(previewMarketPublication(ordered));
  });

  it('crea copias congeladas profundas y acepta volver a validarlas', () => {
    const sourceProducts = [product()];
    const sourceIds = [12];
    const sourceRules = [rule({ variantIds: sourceIds })];
    const sourceCatalog = catalog({ products: sourceProducts });
    const sourcePolicy = policy({ rules: sourceRules });
    const normalizedCatalog = defineMarketPublicationSnapshot(sourceCatalog);
    const normalizedPolicy = defineMarketPublicationPolicy(sourcePolicy);
    const result = previewMarketPublication({ ...input(), catalog: sourceCatalog, policy: sourcePolicy });
    sourceProducts.pop(); sourceIds.push(11); sourceRules.pop();
    expect(normalizedCatalog.products).toHaveLength(1);
    expect(normalizedPolicy.rules[0]!.variantIds).toEqual([12]);
    expect(result.products[0]!.visibleVariantIds).toEqual([12]);
    for (const value of [normalizedCatalog, normalizedPolicy, result, MARKET_PUBLICATION_LIMITS]) assertFrozen(value);
    expect(defineMarketPublicationSnapshot(normalizedCatalog)).toEqual(normalizedCatalog);
    expect(defineMarketPublicationPolicy(normalizedPolicy)).toEqual(normalizedPolicy);
  });

  it('exige todos los campos en cada nivel y rechaza extras', () => {
    const cases: Array<[Record<string, unknown>, (value: unknown) => unknown]> = [
      [catalog(), defineMarketPublicationSnapshot], [policy(), defineMarketPublicationPolicy], [input(), previewMarketPublication],
      [product(), (value) => defineMarketPublicationSnapshot({ ...catalog(), products: [value] })],
      [variant(), (value) => defineMarketPublicationSnapshot({ ...catalog(), products: [{ ...product(), variants: [value] }] })],
      [rule(), (value) => defineMarketPublicationPolicy({ ...policy(), rules: [value] })],
      [input().context, (value) => previewMarketPublication({ ...input(), context: value })],
    ];
    for (const [record, run] of cases) {
      for (const key of Object.keys(record)) {
        const missing = { ...record }; delete missing[key];
        expect(() => run(missing)).toThrow(MarketPublicationContractError);
      }
      expect(() => run({ ...record, unknown: 1 })).toThrow(MarketPublicationContractError);
    }
  });

  it('rechaza prototipos personalizados, símbolos, campos ocultos y getters sin ejecutarlos', () => {
    let calls = 0;
    const getter = { ...product() };
    Object.defineProperty(getter, 'active', { enumerable: true, get() { calls++; return true; } });
    const getterArray = [variant()];
    Object.defineProperty(getterArray, '0', { enumerable: true, get() { calls++; return variant(); } });
    const accessorPolicy = { ...policy() };
    Object.defineProperty(accessorPolicy, 'channels', { enumerable: true, get() { calls++; return ['storefront']; } });
    const accessorInput = { ...input() };
    Object.defineProperty(accessorInput, 'catalog', { enumerable: true, get() { calls++; return catalog(); } });
    for (const value of [getter, Object.assign(Object.create({ inherited: true }), product()),
      { ...product(), [Symbol('hidden')]: 1 }, Object.defineProperty({ ...product() }, 'active', { enumerable: false, value: true })]) {
      expect(() => defineMarketPublicationSnapshot({ ...catalog(), products: [value] })).toThrow(MarketPublicationContractError);
    }
    expect(() => defineMarketPublicationSnapshot(catalog({ products: [product({ variants: getterArray })] }))).toThrow(MarketPublicationContractError);
    expect(() => defineMarketPublicationPolicy(accessorPolicy)).toThrow(MarketPublicationContractError);
    expect(() => previewMarketPublication(accessorInput)).toThrow(MarketPublicationContractError);
    expect(calls).toBe(0);
  });

  it('rechaza arrays dispersos, propiedades adicionales y subclases', () => {
    class ProductArray extends Array<MarketPublicationProduct> {}
    for (const products of [new Array(1), Object.assign([product()], { extra: true }), new ProductArray(product())]) {
      expect(() => defineMarketPublicationSnapshot({ ...catalog(), products })).toThrow(MarketPublicationContractError);
    }
    expect(() => defineMarketPublicationPolicy({ ...policy(), channels: Object.assign(['storefront'], { extra: true }) })).toThrow(MarketPublicationContractError);
    expect(() => defineMarketPublicationPolicy({ ...policy(), rules: [rule({ variantIds: new Array(1) })] })).toThrow(MarketPublicationContractError);
  });

  it('acepta records propios de prototipo nulo y comunica un código de error estable', () => {
    expect(defineMarketPublicationSnapshot(Object.assign(Object.create(null), catalog()))).toEqual(defineMarketPublicationSnapshot(catalog()));
    try { previewMarketPublication(null); throw new Error('no rechazó el input'); }
    catch (error) {
      expect(error).toBeInstanceOf(MarketPublicationContractError);
      expect(error).toMatchObject({ name: 'MarketPublicationContractError', code: 'market_publication_contract_invalid' });
    }
  });
});
