import { afterEach, describe, expect, it, vi } from 'vitest';
import { previewCompanyCatalogContext } from '../src/composition/company-catalog-context';
import { CompanyCatalogContractError, selectCompanyDirectoryEntry } from '../src/modules/companies';

const AT = '2026-10-04T12:00:00.000Z';
function input() {
  const directory = { schemaVersion: 1, source: 'fixture', id: 'directory.fixture', version: 2, capturedAt: AT,
    companies: [
      { id: 'company.alpha', displayName: 'Empresa A', state: 'active', vatId: null },
      { id: 'company.beta', displayName: 'Empresa B', state: 'inactive', vatId: null },
    ], sites: [{ id: 'site.beta', companyId: 'company.beta', label: 'Sede B', state: 'inactive', countryCode: null }],
    contacts: [], roles: [], assignments: [] };
  const catalog = { schemaVersion: 1, source: 'fixture', ref: 'catalog.fixture', capturedAt: AT, currency: 'EUR',
    products: [1, 2, 3].map(id => ({ id, active: id !== 3, variants: (id === 1 ? ['active', 'active', 'draft', 'archived'] : ['active'])
      .map((status, index) => ({ id: id * 10 + index + 1, productId: id, status, priceCents: index === 1 ? 0 : id * 1000 + index * 100 })) })) };
  return { directory, catalog,
    markets: { schemaVersion: 1, id: 'markets.fixture', version: 3,
      markets: [
        { id: 'ES', countryCodes: ['ES'], currency: 'EUR', defaultLocale: 'es-ES', domains: ['es.example.test'] },
        { id: 'FR', countryCodes: ['FR'], currency: 'USD', defaultLocale: 'fr-FR', domains: ['fr.example.test'] },
      ], fallback: { strategy: 'market', marketId: 'ES' } },
    companyPolicy: { schemaVersion: 1, source: 'fixture', id: 'company.policy', version: 4,
      directoryRef: { id: directory.id, version: directory.version, capturedAt: AT },
      catalogRef: { ref: catalog.ref, capturedAt: AT }, rules: [
        { companyId: 'company.alpha', productId: 1, state: 'included', variantIds: [11, 12, 13, 14] },
        { companyId: 'company.alpha', productId: 2, state: 'excluded', variantIds: [] },
        { companyId: 'company.beta', productId: 1, state: 'included', variantIds: [12] },
      ] },
    publicationPolicy: { schemaVersion: 1, id: 'publication.fixture', version: 5, channels: ['storefront', 'professional'],
      rules: [
        { marketId: 'ES', channel: 'storefront', productId: 1, state: 'published', variantIds: [12, 13, 14] },
        { marketId: 'ES', channel: 'storefront', productId: 2, state: 'published', variantIds: [21] },
        { marketId: 'ES', channel: 'storefront', productId: 3, state: 'published', variantIds: [31] },
        { marketId: 'FR', channel: 'professional', productId: 1, state: 'unpublished', variantIds: [] },
      ] }, context: { companyId: 'company.alpha', marketId: 'ES', channel: 'storefront' } };
}
function rejected(value: unknown, reason?: string) {
  try { previewCompanyCatalogContext(value); throw new Error('Expected rejection'); }
  catch (error) {
    expect(error).toBeInstanceOf(CompanyCatalogContractError);
    expect(error).toMatchObject({ code: 'company_catalog_contract_invalid', ...(reason ? { reason } : {}) });
    expect(error).not.toHaveProperty('cause');
  }
}
function frozen(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) frozen(child);
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('intersección catálogo de empresa y publicación R6.2a', () => {
  it('conserva referencias, todos los productos y precios propios de cada variante, incluido cero', () => {
    const result = previewCompanyCatalogContext(input());
    expect(result).toMatchObject({ source: 'fixture', currency: 'EUR',
      directoryRef: { id: 'directory.fixture', version: 2, capturedAt: AT }, catalogRef: { ref: 'catalog.fixture', capturedAt: AT },
      companyPolicyRef: { id: 'company.policy', version: 4 }, publicationPolicyRef: { id: 'publication.fixture', version: 5 },
      marketsRef: { id: 'markets.fixture', version: 3 }, company: { id: 'company.alpha', state: 'active' },
      market: { id: 'ES', currency: 'EUR' }, context: { companyId: 'company.alpha', marketId: 'ES', channel: 'storefront' } });
    expect(result.products.map(product => product.productId)).toEqual([1, 2, 3]);
    const first = result.products[0]!;
    expect(first).toMatchObject({ visible: true, companyEligible: true, marketVisible: true, intersectionReason: null, visibleVariantIds: [12] });
    expect(first.variants.map(({ id, priceCents }) => ({ id, priceCents }))).toEqual([
      { id: 11, priceCents: 1000 }, { id: 12, priceCents: 0 }, { id: 13, priceCents: 1200 }, { id: 14, priceCents: 1300 },
    ]);
    expect(first.variants[1]).toEqual({ id: 12, productId: 1, status: 'active', priceCents: 0,
      companySelected: true, marketSelected: true, companyEligible: true, marketVisible: true, visible: true,
      companyReasons: [], marketReasons: [] });
    for (const key of ['stock', 'purchasable', 'authenticated', 'totalCents', 'vatId', 'contacts']) expect(result).not.toHaveProperty(key);
  });

  it('nunca recupera variantes omitidas, draft o archived aunque la empresa las incluya', () => {
    const first = previewCompanyCatalogContext(input()).products[0]!;
    expect(first.variants[0]).toMatchObject({ visible: false, companyReasons: [], marketReasons: ['variant_not_selected'] });
    expect(first.variants[2]).toMatchObject({ visible: false, companyReasons: [], marketReasons: ['variant_draft'] });
    expect(first.variants[3]).toMatchObject({ visible: false, companyReasons: [], marketReasons: ['variant_archived'] });
  });

  it('rechaza visibilidad del producto cuando las selecciones de variantes no se intersectan', () => {
    const data = input(); data.companyPolicy.rules[0]!.variantIds = [11];
    const result = previewCompanyCatalogContext(data).products[0]!;
    expect(result).toMatchObject({ companyEligible: true, marketVisible: true, companyReasons: [], marketReasons: [],
      visible: false, visibleVariantIds: [], intersectionReason: 'no_common_variants' });
    expect(result.variants[0]).toMatchObject({ companyEligible: true, marketVisible: false, visible: false });
    expect(result.variants[1]).toMatchObject({ companyEligible: false, marketVisible: true, visible: false,
      companyReasons: ['company_variant_not_selected'] });
  });

  it('conserva bloqueos de empresa y mercado independientes, sin convertir uno en otro', () => {
    const result = previewCompanyCatalogContext(input());
    expect(result.products[1]).toMatchObject({ restriction: 'excluded', publication: 'published', visible: false,
      companyReasons: ['company_excluded'], marketReasons: [], intersectionReason: null });
    expect(result.products[2]).toMatchObject({ restriction: 'unconfigured', publication: 'published', visible: false,
      companyReasons: ['company_unconfigured'], marketReasons: ['product_inactive'], intersectionReason: null });
    expect(result.products[2]!.variants[0]).toMatchObject({ companyReasons: ['company_unconfigured'], marketReasons: ['product_inactive'] });
  });

  it('cierra empresa inactiva sin eliminar datos del directorio descriptivo', () => {
    const data = input(); data.context.companyId = 'company.beta';
    const before = selectCompanyDirectoryEntry({ directory: data.directory, companyId: data.context.companyId });
    const result = previewCompanyCatalogContext(data);
    expect(result.company.state).toBe('inactive');
    expect(result.products.every(product => !product.visible && product.variants.every(variant => !variant.visible))).toBe(true);
    expect(result.products[0]).toMatchObject({ companyReasons: ['company_inactive'], marketVisible: true, intersectionReason: null });
    expect(selectCompanyDirectoryEntry({ directory: data.directory, companyId: data.context.companyId })).toEqual(before);
    expect(before.sites).toHaveLength(1);
  });

  it('no hereda reglas entre empresas, mercados o canales ni usa fallback del mercado', () => {
    const data = input(); data.context.marketId = 'FR'; data.context.channel = 'professional';
    expect(previewCompanyCatalogContext(data).products[0]).toMatchObject({ visible: false, publication: 'unpublished', marketReasons: ['unpublished'] });
    data.context.channel = 'storefront';
    expect(previewCompanyCatalogContext(data).products[0]).toMatchObject({ visible: false, publication: 'unconfigured', marketReasons: ['unconfigured'] });
    data.context.marketId = 'ZZ'; rejected(data, 'unknown_reference');
    data.context.marketId = 'ES'; data.context.channel = 'unknown'; rejected(data, 'unknown_reference');
    data.context.companyId = 'company.unknown'; rejected(data, 'unknown_company');
  });

  it('la moneda del mercado no convierte ni cambia la etiqueta EUR del snapshot', () => {
    const data = input(); data.markets.markets[0]!.currency = 'KWD';
    const result = previewCompanyCatalogContext(data);
    expect(result).toMatchObject({ currency: 'EUR', market: { currency: 'KWD' } });
    expect(result.products).toEqual(previewCompanyCatalogContext(input()).products);
  });

  it.each(['directory', 'catalog'] as const)('exige la referencia completa %s, incluida su fecha', (kind) => {
    const data = input();
    if (kind === 'directory') data.companyPolicy.directoryRef.capturedAt = '2026-10-03T12:00:00.000Z';
    else data.companyPolicy.catalogRef.capturedAt = '2026-10-03T12:00:00.000Z';
    rejected(data, 'reference_mismatch');
  });

  it('valida datos no elegidos: empresas ajenas, precios invisibles y reglas de otro contexto', () => {
    const malformedDirectory = input(); malformedDirectory.directory.sites[0]!.companyId = 'company.absent'; rejected(malformedDirectory);
    const invalidPrice = input(); invalidPrice.catalog.products[0]!.variants[3]!.priceCents = -1; rejected(invalidPrice, 'invalid_data');
    const wrongCompany = input(); wrongCompany.companyPolicy.rules[2]!.variantIds = [21]; rejected(wrongCompany, 'cross_product_reference');
    for (const patch of [{ marketId: 'ZZ' }, { productId: 999 }, { state: 'published', variantIds: [21] }]) {
      const data = input(); Object.assign(data.publicationPolicy.rules[3]!, patch); rejected(data, 'unknown_reference');
    }
  });

  it('admite catálogo vacío explícito, valida igualmente contexto y no inventa filas', () => {
    const data = input(); data.catalog.products = []; data.companyPolicy.rules = []; data.publicationPolicy.rules = [];
    expect(previewCompanyCatalogContext(data).products).toEqual([]);
    data.context.channel = 'unknown'; rejected(data, 'unknown_reference');
  });

  it('copia, ordena y congela todo el resultado sin retener referencias mutables', () => {
    const data = input(); data.catalog.products.reverse(); data.catalog.products[2]!.variants.reverse();
    const result = previewCompanyCatalogContext(data); const previous = JSON.stringify(result);
    frozen(result);
    data.directory.companies[0]!.state = 'inactive'; data.catalog.products[2]!.variants[0]!.priceCents = 999;
    data.companyPolicy.rules[0]!.variantIds = []; data.publicationPolicy.rules[0]!.variantIds = [11];
    expect(JSON.stringify(result)).toBe(previous);
    expect(result.products.map(product => product.productId)).toEqual([1, 2, 3]);
    expect(result.products[0]!.variants.map(variant => variant.id)).toEqual([11, 12, 13, 14]);
  });

  it('rechaza campos extra, un segundo snapshot, IDs parciales y arrays ambiguos', () => {
    for (const data of [null, {}, { ...input(), marketCatalog: {} }, { ...input(), context: { companyId: 'company.alpha', marketId: 'ES' } },
      { ...input(), context: { ...input().context, variantId: 12 } }, { ...input(), context: { ...input().context, marketId: 1 } }]) rejected(data, 'invalid_data');
    const hole = input(); delete hole.catalog.products[0]!.variants[2]; rejected(hole, 'invalid_data');
    const extra = input(); Object.defineProperty(extra.publicationPolicy.rules, 'extra', { value: true }); rejected(extra, 'invalid_data');
  });

  it('no ejecuta getters de campos seleccionados o no seleccionados', () => {
    const getter = vi.fn(() => { throw new Error('Getter must not run'); });
    const targets = [
      (data: ReturnType<typeof input>) => [data, 'directory'] as const,
      (data: ReturnType<typeof input>) => [data.context, 'companyId'] as const,
      (data: ReturnType<typeof input>) => [data.markets.markets[1]!, 'currency'] as const,
      (data: ReturnType<typeof input>) => [data.publicationPolicy.rules[3]!, 'variantIds'] as const,
      (data: ReturnType<typeof input>) => [data.companyPolicy.rules[2]!, 'state'] as const,
      (data: ReturnType<typeof input>) => [data.catalog.products[0]!.variants[3]!, 'priceCents'] as const,
    ];
    for (const target of targets) { const data = input(); const [row, key] = target(data); Object.defineProperty(row, key, { enumerable: true, get: getter }); rejected(data); }
    expect(getter).not.toHaveBeenCalled();
  });

  it('redacta excepciones y causas arbitrarias de introspección', () => {
    const secret = 'PRIVATE_INPUT_SHOULD_NOT_LEAK';
    const hostile = new Proxy({}, { getPrototypeOf() { throw new Error(secret); } });
    const candidates = [hostile, { ...input(), markets: hostile }, { ...input(), publicationPolicy: hostile },
      { ...input(), companyPolicy: hostile }, { ...input(), catalog: hostile }, { ...input(), directory: hostile }];
    for (const candidate of candidates) {
      try { previewCompanyCatalogContext(candidate); throw new Error('Expected rejection'); }
      catch (error) { expect(error).toBeInstanceOf(CompanyCatalogContractError); expect(String(error)).not.toContain(secret); expect(JSON.stringify(error)).not.toContain(secret); expect(error).not.toHaveProperty('cause'); }
    }
  });

  it('es determinista sin reloj, red, almacenamiento, temporizadores ni logs', () => {
    const expected = previewCompanyCatalogContext(input());
    const forbidden = vi.fn(() => { throw new Error('Unexpected effect'); });
    vi.spyOn(Date, 'now').mockImplementation(forbidden);
    for (const key of ['fetch', 'setTimeout', 'setInterval', 'queueMicrotask']) vi.stubGlobal(key, forbidden);
    for (const key of ['localStorage', 'sessionStorage']) vi.stubGlobal(key, { getItem: forbidden, setItem: forbidden });
    for (const key of ['log', 'warn', 'error'] as const) vi.spyOn(console, key).mockImplementation(forbidden);
    expect(previewCompanyCatalogContext(input())).toEqual(expected); expect(forbidden).not.toHaveBeenCalled();
  });
});
