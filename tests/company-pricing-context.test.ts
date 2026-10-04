import { afterEach, describe, expect, it, vi } from 'vitest';
import { COMPANY_PRICING_LIMITS, previewCompanyPrices } from '../src/composition/company-pricing-context';
import { CompanyCatalogContractError } from '../src/modules/companies';
import { PRICE_LIST_STATES } from '../src/modules/pricing';

const AT = '2026-10-04T12:00:00.000Z';
const HASH = 'a'.repeat(64);
const OTHER_HASH = 'b'.repeat(64);
const COMPANY = 'company.alpha';
function directory() {
  return { schemaVersion: 1, source: 'fixture', id: 'directory.fixture', version: 1, capturedAt: AT,
    companies: [
      { id: COMPANY, displayName: 'Empresa A', state: 'active', vatId: null },
      { id: 'company.beta', displayName: 'Empresa B', state: 'inactive', vatId: null },
    ], sites: [], contacts: [], roles: [], assignments: [] };
}
function directoryRef() { return { id: 'directory.fixture', version: 1, capturedAt: AT }; }
function catalogRef() { return { ref: 'catalog.fixture', capturedAt: AT }; }
function list() {
  return { id: 'general-list', version: 1, label: 'Tarifa de ejemplo', state: 'active', priority: 100,
    currency: 'EUR', activeFrom: null as string | null, activeUntil: null as string | null,
    markets: ['ES'], channels: ['professional'], companyKeyHashes: [] as string[],
    prices: [{ productId: 1, priceCents: 900 }] };
}
function input() {
  return {
    catalogContext: {
      directory: directory(),
      markets: { schemaVersion: 1, id: 'markets.fixture', version: 1, fallback: { strategy: 'none' }, markets: [
        { id: 'ES', countryCodes: ['ES'], defaultLocale: 'es-ES', currency: 'EUR', domains: ['es.example.test'] },
        { id: 'FR', countryCodes: ['FR'], defaultLocale: 'fr-FR', currency: 'EUR', domains: ['fr.example.test'] },
        { id: 'JP', countryCodes: ['JP'], defaultLocale: 'ja-JP', currency: 'JPY', domains: ['jp.example.test'] },
      ] },
      catalog: { schemaVersion: 1, source: 'fixture', ...catalogRef(), currency: 'EUR', products: [
        { id: 1, active: true, variants: [
          { id: 11, productId: 1, status: 'active', priceCents: 1000 },
          { id: 12, productId: 1, status: 'active', priceCents: 1450 },
          { id: 13, productId: 1, status: 'draft', priceCents: 1900 },
          { id: 14, productId: 1, status: 'archived', priceCents: 1950 },
        ] },
        { id: 2, active: true, variants: [{ id: 21, productId: 2, status: 'active', priceCents: 2000 }] },
        { id: 3, active: true, variants: [{ id: 31, productId: 3, status: 'active', priceCents: 3000 }] },
      ] },
      companyPolicy: { schemaVersion: 1, source: 'fixture', id: 'policy.company', version: 1,
        directoryRef: directoryRef(), catalogRef: catalogRef(), rules: [
          { companyId: COMPANY, productId: 1, state: 'included', variantIds: [12, 13, 14] },
          { companyId: COMPANY, productId: 2, state: 'included', variantIds: [21] },
          { companyId: COMPANY, productId: 3, state: 'included', variantIds: [31] },
        ] },
      publicationPolicy: { schemaVersion: 1, id: 'publication.fixture', version: 1,
        channels: ['storefront', 'professional'], rules: [
          { marketId: 'ES', channel: 'professional', productId: 1, state: 'published', variantIds: [12, 13, 14] },
          { marketId: 'ES', channel: 'professional', productId: 2, state: 'published', variantIds: [21] },
          { marketId: 'ES', channel: 'professional', productId: 3, state: 'published', variantIds: [31] },
        ] },
      context: { companyId: COMPANY, marketId: 'ES', channel: 'professional' },
    },
    bindings: { schemaVersion: 1, source: 'fixture', id: 'bindings.fixture', version: 1,
      directoryRef: directoryRef(), bindings: [{ companyId: COMPANY, companyKeyHash: HASH }] },
    priceLists: [list()], at: AT, lines: [{ productId: 1, variantId: 12 }],
  };
}
function expandedInput(count: number) {
  const data = input();
  data.catalogContext.catalog.products = Array.from({ length: count }, (_, index) => {
    const id = index + 1;
    return { id, active: true, variants: [{ id: id * 10 + 1, productId: id, status: 'active', priceCents: 1000 }] };
  });
  data.catalogContext.companyPolicy.rules = data.catalogContext.catalog.products.map(product => ({
    companyId: COMPANY, productId: product.id, state: 'included', variantIds: [product.variants[0]!.id],
  }));
  data.catalogContext.publicationPolicy.rules = data.catalogContext.catalog.products.map(product => ({
    marketId: 'ES', channel: 'professional', productId: product.id, state: 'published', variantIds: [product.variants[0]!.id],
  }));
  data.lines = data.catalogContext.catalog.products.slice(0, 100).map(product => ({ productId: product.id, variantId: product.variants[0]!.id }));
  return data;
}
function rejected(data: unknown, reason?: string) {
  try { previewCompanyPrices(data); throw new Error('Expected rejection'); }
  catch (error) {
    expect(error).toBeInstanceOf(CompanyCatalogContractError);
    expect(error).toMatchObject({ code: 'company_catalog_contract_invalid', ...(reason ? { reason } : {}) });
    expect(error).not.toHaveProperty('cause');
  }
}
function deepFrozen(value: unknown): boolean {
  return value === null || typeof value !== 'object' ||
    Object.isFrozen(value) && Object.values(value).every(deepFrozen);
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('precios de catálogo por empresa sobre fixtures R6.2a', () => {
  it('usa la variante explícita no predeterminada y devuelve todo el catálogo, sin totales ni claves', () => {
    const data = input(); data.priceLists = [];
    const result = previewCompanyPrices(data);
    expect(result).toMatchObject({ source: 'fixture', bindingsRef: { id: 'bindings.fixture', version: 1 }, at: AT,
      lines: [{ productId: 1, variantId: 12, outcome: 'priced', reasons: [], price: {
        catalogUnitPriceCents: 1450, baseUnitPriceCents: 1450, origin: { type: 'catalog', fallback_depth: 2 },
      }, evaluations: [] }] });
    expect(result.catalog.products).toHaveLength(3);
    expect(result.catalog.products[0]?.variants).toHaveLength(4);
    expect(result.catalog.products[0]?.variants.find(variant => variant.id === 11)?.visible).toBe(false);
    expect(Object.keys(result).sort()).toEqual(['at', 'bindingsRef', 'catalog', 'lines', 'source']);
    expect(JSON.stringify(result)).not.toContain(HASH);
    expect(JSON.stringify(result)).not.toContain('companyKeyHash');
    expect(result).not.toHaveProperty('total');
  });

  it('conserva el override por producto aunque cambie la variante elegida y permite precios superiores', () => {
    const data = input(); data.priceLists[0]!.prices[0]!.priceCents = 2200;
    data.catalogContext.companyPolicy.rules[0]!.variantIds.push(11);
    data.catalogContext.publicationPolicy.rules[0]!.variantIds.push(11);
    const first = previewCompanyPrices(data).lines[0]!;
    data.lines[0]!.variantId = 11;
    const second = previewCompanyPrices(data).lines[0]!;
    expect(first.price).toMatchObject({ catalogUnitPriceCents: 1450, baseUnitPriceCents: 2200 });
    expect(second.price).toMatchObject({ catalogUnitPriceCents: 1000, baseUnitPriceCents: 2200 });
    expect(first.price?.origin).toMatchObject({ type: 'price_list', price_list_id: 'general-list', fallback_depth: 1 });
  });

  it('conserva company→general→catalog por producto y prioridad/ID dentro del nivel', () => {
    const data = input(); data.lines.push({ productId: 2, variantId: 21 }, { productId: 3, variantId: 31 });
    data.priceLists = [
      { ...list(), id: 'general-first', priority: 1, prices: [{ productId: 1, priceCents: 999 }, { productId: 2, priceCents: 1800 }] },
      { ...list(), id: 'company-b', priority: 40, companyKeyHashes: [HASH], prices: [{ productId: 1, priceCents: 700 }] },
      { ...list(), id: 'company-a', priority: 40, companyKeyHashes: [HASH], prices: [{ productId: 1, priceCents: 800 }] },
    ];
    const result = previewCompanyPrices(data);
    expect(result.lines.map(line => [line.price?.baseUnitPriceCents, line.price?.origin.type, line.price?.origin.fallback_depth]))
      .toEqual([[800, 'price_list', 0], [1800, 'price_list', 1], [3000, 'catalog', 2]]);
    expect(result.lines[0]?.price?.origin).toMatchObject({ price_list_id: 'company-a', company_scoped: true });
    expect(result.lines[1]?.evaluations).toContainEqual({ productId: 2, priceListId: 'company-a', version: 1, status: 'fallback_missing_product' });
    expect(result.lines[0]?.evaluations).toContainEqual({ productId: 1, priceListId: 'company-b', version: 1, status: 'fallback_lower_priority' });
  });

  it('no infiere tarifa general si falta vinculación empresarial', () => {
    const data = input(); data.bindings.bindings = [];
    expect(previewCompanyPrices(data).lines).toEqual([{ productId: 1, variantId: 12, outcome: 'blocked',
      reasons: ['pricing_binding_missing'], price: null, evaluations: [] }]);
  });

  it('hash ajeno opaco no necesita FK; queda excluded_company', () => {
    const data = input(); data.priceLists[0]!.companyKeyHashes = [OTHER_HASH];
    const result = previewCompanyPrices(data).lines[0]!;
    expect(result.price?.baseUnitPriceCents).toBe(1450);
    expect(result.evaluations).toEqual([{ productId: 1, priceListId: 'general-list', version: 1, status: 'excluded_company' }]);
  });

  it('dos empresas pueden compartir la cohorte de tarifa sin compartir catálogo', () => {
    const data = input(); data.catalogContext.directory.companies[1]!.state = 'active';
    data.bindings.bindings.push({ companyId: 'company.beta', companyKeyHash: HASH });
    data.priceLists[0]!.companyKeyHashes = [HASH];
    expect(previewCompanyPrices(data).lines[0]?.outcome).toBe('priced');
    data.catalogContext.context.companyId = 'company.beta';
    expect(previewCompanyPrices(data).lines[0]).toMatchObject({ outcome: 'blocked', price: null, reasons: ['variant_not_visible'] });
    data.catalogContext.companyPolicy.rules.push({ companyId: 'company.beta', productId: 1, state: 'included', variantIds: [12] });
    expect(previewCompanyPrices(data).lines[0]?.price).toMatchObject({ baseUnitPriceCents: 900,
      origin: { company_scoped: true, fallback_depth: 0 } });
  });

  it.each([11, 13, 14])('variante %s oculta/no activa no recibe precio ni evaluaciones', variantId => {
    const data = input(); data.lines[0]!.variantId = variantId;
    expect(previewCompanyPrices(data).lines[0]).toMatchObject({ outcome: 'blocked', price: null,
      reasons: ['variant_not_visible'], evaluations: [] });
  });

  it('producto inactivo y listas disponibles siguen sin permitir precio', () => {
    const data = input(); data.catalogContext.catalog.products[0]!.active = false;
    expect(previewCompanyPrices(data).lines[0]).toMatchObject({ outcome: 'blocked', price: null, reasons: ['variant_not_visible'] });
  });

  it('empresa inactiva, binding ausente, moneda ajena y variante oculta acumulan motivos sin precio', () => {
    const data = input(); data.catalogContext.directory.companies[0]!.state = 'inactive';
    data.bindings.bindings = []; data.catalogContext.context.marketId = 'JP';
    expect(previewCompanyPrices(data).lines[0]).toMatchObject({ outcome: 'blocked', price: null, evaluations: [],
      reasons: ['company_inactive', 'pricing_binding_missing', 'currency_mismatch', 'variant_not_visible'] });
  });

  it('mercado no EUR bloquea aun cuando catálogo y publicación permiten la variante', () => {
    const data = input(); data.catalogContext.context.marketId = 'JP';
    data.catalogContext.publicationPolicy.rules[0]!.marketId = 'JP';
    expect(previewCompanyPrices(data).lines[0]).toMatchObject({ outcome: 'blocked', price: null, reasons: ['currency_mismatch'] });
  });

  it.each(['JPY', 'USD', 'KWD'])('lista en %s se valida y excluye sin convertir ni renombrar moneda', currency => {
    const data = input(); data.priceLists[0]!.currency = currency;
    const result = previewCompanyPrices(data).lines[0]!;
    expect(result.price).toMatchObject({ catalogUnitPriceCents: 1450, baseUnitPriceCents: 1450, origin: { type: 'catalog' } });
    expect(result.evaluations).toEqual([{ productId: 1, priceListId: 'general-list', version: 1, status: 'excluded_context' }]);
  });

  it.each(['disabled', 'archived'])('lista %s preserva exclusión del motor existente', state => {
    const data = input(); data.priceLists[0]!.state = state;
    expect(previewCompanyPrices(data).lines[0]?.evaluations[0]?.status).toBe('excluded_context');
  });

  it.each([
    ['2026-10-04T11:59:59.999Z', 'excluded_context'], [AT, 'selected'],
    ['2026-10-04T12:59:59.999Z', 'selected'], ['2026-10-04T13:00:00.000Z', 'excluded_context'],
  ])('ventana de tarifas semiabierta en %s', (at, expected) => {
    const data = input(); data.at = at!; data.priceLists[0]!.activeFrom = AT;
    data.priceLists[0]!.activeUntil = '2026-10-04T13:00:00Z';
    expect(previewCompanyPrices(data).lines[0]?.evaluations[0]?.status).toBe(expected);
  });

  it('admite UTC legacy sin milisegundos y comodines sin inferir mercado de fallback', () => {
    const data = input(); data.at = '2026-10-04T12:00:00Z';
    data.priceLists[0]!.markets = ['*']; data.priceLists[0]!.channels = ['*'];
    expect(previewCompanyPrices(data)).toMatchObject({ at: data.at, lines: [{ outcome: 'priced' }] });
    data.catalogContext.context.marketId = 'ZZ';
    rejected(data);
  });

  it.each(['2026-02-30T12:00:00Z', '2026-10-04T24:00:00Z', '2026-10-04T12:00:00+00:00', ' 2026-10-04T12:00:00Z'])('rechaza instante no canónico %s incluso bloqueado', at => {
    const data = input(); data.bindings.bindings = []; data.at = at;
    rejected(data, 'invalid_data');
    data.at = AT; data.priceLists[0]!.activeFrom = at;
    rejected(data, 'invalid_data');
  });

  it('fecha final igual a inicio no es una lista válida', () => {
    const data = input(); data.priceLists[0]!.activeFrom = AT; data.priceLists[0]!.activeUntil = AT;
    rejected(data, 'invalid_data');
  });

  it.each(['directory', 'catalog', 'binding'] as const)('capturedAt forma parte de la referencia %s', target => {
    const data = input(); const changed = '2026-10-04T12:00:01.000Z';
    if (target === 'directory') data.catalogContext.companyPolicy.directoryRef.capturedAt = changed;
    if (target === 'catalog') data.catalogContext.companyPolicy.catalogRef.capturedAt = changed;
    if (target === 'binding') data.bindings.directoryRef.capturedAt = changed;
    rejected(data, 'reference_mismatch');
  });

  it('valida también referencias de reglas empresariales/publicación y bindings no seleccionados', () => {
    const fixtures = [input(), input(), input()];
    fixtures[0]!.catalogContext.companyPolicy.rules.push({ companyId: 'company.beta', productId: 999, state: 'excluded', variantIds: [] });
    fixtures[1]!.catalogContext.publicationPolicy.rules.push({ marketId: 'FR', channel: 'professional', productId: 999, state: 'unpublished', variantIds: [] });
    fixtures[2]!.bindings.bindings.push({ companyId: 'company.unknown', companyKeyHash: OTHER_HASH });
    for (const data of fixtures) { data.bindings.bindings = data.bindings.bindings.filter(binding => binding.companyId !== COMPANY); rejected(data, 'unknown_reference'); }
  });

  it.each(['product', 'market', 'channel'] as const)('lista extranjera desactivada con referencia %s inválida sigue siendo error', field => {
    const data = input(); data.priceLists[0]!.state = 'disabled'; data.priceLists[0]!.currency = 'USD';
    data.bindings.bindings = [];
    if (field === 'product') data.priceLists[0]!.prices[0]!.productId = 999;
    if (field === 'market') data.priceLists[0]!.markets = ['*', 'ZZ'];
    if (field === 'channel') data.priceLists[0]!.channels = ['*', 'unknown'];
    rejected(data, 'unknown_reference');
  });

  it.each([
    [{ productId: 999, variantId: 12 }, 'unknown_reference'],
    [{ productId: 1, variantId: 999 }, 'unknown_reference'],
    [{ productId: 1, variantId: 21 }, 'cross_product_reference'],
  ] as const)('no oculta una selección ajena o desconocida %o bajo bloqueo', (line, reason) => {
    const data = input(); data.bindings.bindings = []; data.lines = [{ ...line }]; rejected(data, reason);
  });

  it('una sola variante por producto; nunca inferir variante de una selección incompleta', () => {
    const data = input(); data.lines.push({ productId: 1, variantId: 11 }); rejected(data, 'duplicate_id');
    rejected({ ...input(), lines: [{ productId: 1 }] }, 'invalid_data');
    rejected({ ...input(), lines: [{ productId: 1, variantId: 12, qty: 2 }] }, 'invalid_data');
  });

  it('cero líneas no evita validación y cien líneas explícitas se admiten', () => {
    const empty = input(); empty.lines = [];
    expect(previewCompanyPrices(empty).lines).toEqual([]);
    empty.priceLists[0]!.prices[0]!.priceCents = 0; rejected(empty, 'invalid_data');
    const full = expandedInput(101); expect(previewCompanyPrices(full).lines).toHaveLength(100);
    full.lines.push({ productId: 101, variantId: 1011 }); rejected(full, 'invalid_data');
  });

  it('admite precio catálogo cero y extremos legacy, pero no lista gratuita, negativos, -0 o fracciones', () => {
    const data = input(); data.priceLists = []; data.catalogContext.catalog.products[0]!.variants[1]!.priceCents = 0;
    expect(previewCompanyPrices(data).lines[0]?.price?.baseUnitPriceCents).toBe(0);
    for (const priceCents of [1, 10_000_000]) {
      const valid = input(); valid.priceLists[0]!.prices[0]!.priceCents = priceCents;
      expect(previewCompanyPrices(valid).lines[0]?.price?.baseUnitPriceCents).toBe(priceCents);
    }
    for (const priceCents of [-0, 0, -1, 0.1, 10_000_001, Number.MAX_SAFE_INTEGER]) {
      const invalid = input(); invalid.priceLists[0]!.prices[0]!.priceCents = priceCents; rejected(invalid, 'invalid_data');
    }
    for (const priceCents of [-0, -1, 0.1, 10_000_001]) {
      const invalid = input(); invalid.catalogContext.catalog.products[0]!.variants[1]!.priceCents = priceCents;
      rejected(invalid, 'invalid_data');
    }
  });

  it('IDs producto respetan techo legacy; variante permite entero seguro', () => {
    const data = expandedInput(1); const max = 2_147_483_647; const variantId = Number.MAX_SAFE_INTEGER;
    data.catalogContext.catalog.products[0]!.id = max;
    data.catalogContext.catalog.products[0]!.variants[0] = { id: variantId, productId: max, status: 'active', priceCents: 10_000_000 };
    data.catalogContext.companyPolicy.rules[0]!.productId = max; data.catalogContext.companyPolicy.rules[0]!.variantIds = [variantId];
    data.catalogContext.publicationPolicy.rules[0]!.productId = max; data.catalogContext.publicationPolicy.rules[0]!.variantIds = [variantId];
    data.priceLists[0]!.prices[0]!.productId = max; data.lines = [{ productId: max, variantId }];
    expect(previewCompanyPrices(data).lines[0]?.outcome).toBe('priced');
    data.lines[0]!.productId = max + 1; rejected(data, 'invalid_data');
  });

  it('límites de listas, precios por lista y precios totales son explícitos', () => {
    const manyLists = input(); manyLists.priceLists = Array.from({ length: 100 }, (_, index) => ({ ...list(), id: `list-${index}` }));
    expect(previewCompanyPrices(manyLists).lines[0]?.evaluations).toHaveLength(100);
    manyLists.priceLists.push({ ...list(), id: 'list-overflow' }); rejected(manyLists, 'invalid_data');
    const manyPrices = expandedInput(1000); manyPrices.lines = [];
    const prices = manyPrices.catalogContext.catalog.products.map(product => ({ productId: product.id, priceCents: 900 }));
    manyPrices.priceLists = Array.from({ length: 10 }, (_, index) => ({ ...list(), id: `list-${index}`, prices }));
    expect(previewCompanyPrices(manyPrices).lines).toEqual([]);
    manyPrices.priceLists.push({ ...list(), id: 'list-overflow' }); rejected(manyPrices, 'invalid_data');
    manyPrices.priceLists = [{ ...list(), prices: [...prices, { productId: 1, priceCents: 950 }] }]; rejected(manyPrices, 'invalid_data');
    expect(Object.isFrozen(COMPANY_PRICING_LIMITS)).toBe(true);
  });

  it('límites de hashes, mercados y canales no se eluden con duplicados ni comodines', () => {
    const data = input(); data.priceLists[0]!.companyKeyHashes = Array.from({ length: 100 }, (_, index) => index.toString(16).padStart(64, '0'));
    expect(previewCompanyPrices(data).lines[0]?.outcome).toBe('priced');
    data.priceLists[0]!.companyKeyHashes.push('f'.repeat(64)); rejected(data, 'invalid_data');
    const markets = input(); markets.priceLists[0]!.markets = Array(101).fill('*') as string[]; rejected(markets, 'invalid_data');
    const channels = input(); channels.priceLists[0]!.channels = Array(21).fill('*') as string[]; rejected(channels, 'invalid_data');
  });

  it('admite cien mercados conocidos y veinte canales declarados, con wildcard solo cuando es explícito', () => {
    const data = input();
    data.catalogContext.markets.markets = Array.from({ length: 100 }, (_, index) => ({
      id: index === 0 ? 'ES' : `MARKET${index}`, countryCodes: ['ES'], defaultLocale: 'es-ES', currency: 'EUR', domains: [],
    }));
    data.catalogContext.publicationPolicy.channels = Array.from({ length: 20 }, (_, index) => index === 0 ? 'professional' : `channel${index}`);
    data.priceLists[0]!.markets = data.catalogContext.markets.markets.map(market => market.id);
    data.priceLists[0]!.channels = [...data.catalogContext.publicationPolicy.channels];
    expect(previewCompanyPrices(data).lines[0]?.price?.baseUnitPriceCents).toBe(900);
  });

  it('conserva rechazo legacy de IDs, prioridades, versiones y duplicados de listas/precios/contextos/hashes', () => {
    const fixtures = [input(), input(), input(), input(), input(), input(), input(), input()];
    fixtures[0]!.priceLists[0]!.id = 'bad.id';
    fixtures[1]!.priceLists[0]!.priority = 100_001;
    fixtures[2]!.priceLists[0]!.version = 1_000_001;
    fixtures[3]!.priceLists.push(list());
    fixtures[4]!.priceLists[0]!.prices.push({ productId: 1, priceCents: 800 });
    fixtures[5]!.priceLists[0]!.markets.push('ES');
    fixtures[6]!.priceLists[0]!.channels.push('professional');
    fixtures[7]!.priceLists[0]!.companyKeyHashes = [HASH, HASH];
    for (const data of fixtures) rejected(data);
  });

  it('no amplía vocabulario por mutación del enum legacy exportado', () => {
    const states = PRICE_LIST_STATES as unknown as string[];
    states.push('rogue');
    try { const data = input(); data.priceLists[0]!.state = 'rogue'; rejected(data, 'invalid_data'); }
    finally { states.pop(); }
  });

  it('copia y congela todos los resultados, manteniendo etiquetas suministradas pero sin campos de claves', () => {
    const data = input(); data.priceLists[0]!.companyKeyHashes = [HASH];
    const result = previewCompanyPrices(data); const snapshot = JSON.stringify(result);
    expect(deepFrozen(result)).toBe(true);
    data.priceLists[0]!.label = 'Modificada'; data.priceLists[0]!.prices[0]!.priceCents = 999;
    data.catalogContext.catalog.products[0]!.variants[1]!.priceCents = 9999;
    data.bindings.bindings[0]!.companyKeyHash = OTHER_HASH;
    expect(JSON.stringify(result)).toBe(snapshot);
    const labelled = input(); labelled.priceLists[0]!.label = HASH;
    expect(previewCompanyPrices(labelled).lines[0]?.price?.origin).toMatchObject({ label: HASH });
    labelled.priceLists[0]!.label = '  ' + 'x'.repeat(120) + '  ';
    expect(previewCompanyPrices(labelled).lines[0]?.price?.origin).toMatchObject({ label: 'x'.repeat(120) });
  });

  it('datos propios estrictos en toda la frontera; no getters incluso en listas ajenas y selección bloqueada', () => {
    const getter = vi.fn(() => { throw new Error('Private getter'); });
    const paths = [
      (data: ReturnType<typeof input>) => Object.defineProperty(data, 'at', { get: getter }),
      (data: ReturnType<typeof input>) => Object.defineProperty(data.priceLists[0]!, 'label', { get: getter }),
      (data: ReturnType<typeof input>) => Object.defineProperty(data.priceLists[0]!.prices[0]!, 'priceCents', { get: getter }),
      (data: ReturnType<typeof input>) => Object.defineProperty(data.priceLists[0]!.markets, '0', { get: getter }),
      (data: ReturnType<typeof input>) => Object.defineProperty(data.lines[0]!, 'variantId', { get: getter }),
      (data: ReturnType<typeof input>) => Object.defineProperty(data.bindings.bindings[0]!, 'companyKeyHash', { get: getter }),
    ];
    for (const mutate of paths) { const data = input(); data.catalogContext.directory.companies[0]!.state = 'inactive'; mutate(data); rejected(data); }
    expect(getter).not.toHaveBeenCalled();
  });

  it('rechaza propiedades extra/ocultas/símbolos, arrays dispersos y prototipos custom', () => {
    rejected({ ...input(), companyKeyHash: HASH });
    rejected({ ...input(), presented: { currency: 'USD', amountMinor: 1 } });
    const fixtures = [input(), input(), input(), input(), input()];
    Object.defineProperty(fixtures[0]!.priceLists[0]!, 'hidden', { value: 1 });
    Object.defineProperty(fixtures[1]!.priceLists[0]!, Symbol('hidden'), { value: 1 });
    delete (fixtures[2]!.priceLists as Array<unknown>)[0];
    Object.setPrototypeOf(fixtures[3]!.priceLists[0]!, { companyKeyHash: HASH });
    Object.defineProperty(fixtures[4]!.priceLists[0]!.prices, 'extra', { value: 1, enumerable: true });
    for (const data of fixtures) rejected(data, 'invalid_data');
  });

  it('no propaga errores/causas/valores privados de proxies, ni ejecuta getters del error', () => {
    const secret = 'PRIVATE VAT EMAIL ID';
    const errorGetter = vi.fn(() => { throw new Error(secret); });
    const hostileError = Object.defineProperty({}, 'reason', { get: errorGetter });
    const hostile = new Proxy({}, { getPrototypeOf() { throw hostileError; } });
    const tests = [hostile, { ...input(), bindings: hostile }, { ...input(), catalogContext: hostile },
      { ...input(), priceLists: [hostile] }, { ...input(), at: secret }];
    for (const data of tests) {
      try { previewCompanyPrices(data); throw new Error('Expected rejection'); }
      catch (error) {
        expect(error).toBeInstanceOf(CompanyCatalogContractError);
        expect(String(error)).not.toContain(secret); expect(JSON.stringify(error)).not.toContain(secret);
        expect(error).not.toHaveProperty('cause');
      }
    }
    expect(errorGetter).not.toHaveBeenCalled();
  });

  it('no IO, almacenamiento, temporizadores, logs ni reloj implícito', () => {
    const expected = previewCompanyPrices(input()); const forbidden = () => { throw new Error('Unexpected effect'); };
    vi.spyOn(Date, 'now').mockImplementation(forbidden);
    const logs = [vi.spyOn(console, 'log').mockImplementation(forbidden), vi.spyOn(console, 'warn').mockImplementation(forbidden),
      vi.spyOn(console, 'error').mockImplementation(forbidden)];
    for (const key of ['fetch', 'setTimeout', 'setInterval', 'requestAnimationFrame']) vi.stubGlobal(key, forbidden);
    for (const key of ['localStorage', 'sessionStorage']) vi.stubGlobal(key, { getItem: forbidden, setItem: forbidden });
    expect(previewCompanyPrices(input())).toEqual(expected);
    const blocked = input(); blocked.bindings.bindings = [];
    expect(previewCompanyPrices(blocked).lines[0]?.outcome).toBe('blocked');
    for (const log of logs) expect(log).not.toHaveBeenCalled();
  });
});
