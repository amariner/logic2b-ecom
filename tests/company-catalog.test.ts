import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COMPANY_CATALOG_LIMITS, CompanyCatalogContractError, defineCompanyCatalogPolicy, defineCompanyCatalogSnapshot,
  previewCompanyCatalogRestrictions, type CompanyCatalogContractReason,
} from '../src/modules/companies';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const AT = '2026-10-03T12:00:00.000Z';
const DIRECTORY_REF = { id: 'directory.fixture', version: 2, capturedAt: AT };
const CATALOG_REF = { ref: 'catalog.fixture', capturedAt: AT };
function directory() {
  return { schemaVersion: 1, source: 'fixture', ...DIRECTORY_REF,
    companies: [{ id: 'company.alpha', displayName: 'Empresa A', state: 'active', vatId: null },
      { id: 'company.beta', displayName: 'Empresa B', state: 'inactive', vatId: null }],
    sites: [], contacts: [], roles: [], assignments: [] };
}
function catalog() {
  return { schemaVersion: 1, source: 'fixture', ...CATALOG_REF, currency: 'EUR', products: [
    { id: 1, active: true, variants: [
      { id: 11, productId: 1, status: 'active', priceCents: 0 },
      { id: 12, productId: 1, status: 'active', priceCents: 2499 },
      { id: 13, productId: 1, status: 'draft', priceCents: 2999 },
      { id: 14, productId: 1, status: 'archived', priceCents: 10_000_000 },
    ] },
    { id: 2, active: false, variants: [{ id: 21, productId: 2, status: 'active', priceCents: 3500 }] },
    { id: 3, active: true, variants: [{ id: 31, productId: 3, status: 'active', priceCents: 6500 }] },
  ] };
}
function policy() {
  return { schemaVersion: 1, source: 'fixture', id: 'company.catalog.policy', version: 3,
    directoryRef: { ...DIRECTORY_REF }, catalogRef: { ...CATALOG_REF }, rules: [
      { companyId: 'company.alpha', productId: 1, state: 'included', variantIds: [12, 13, 14] },
      { companyId: 'company.alpha', productId: 2, state: 'excluded', variantIds: [] },
      { companyId: 'company.beta', productId: 1, state: 'included', variantIds: [11] },
    ] };
}
function input() { return { directory: directory(), catalog: catalog(), policy: policy(), companyId: 'company.alpha' }; }
function expectReason(operation: () => unknown, reason: CompanyCatalogContractReason): void {
  try { operation(); expect.fail('Expected contract error'); }
  catch (error) {
    expect(error).toBeInstanceOf(CompanyCatalogContractError);
    expect(error).toMatchObject({ code: 'company_catalog_contract_invalid', reason });
    expect(error).not.toHaveProperty('cause');
  }
}
function frozen(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) frozen(child);
}

describe('snapshot monetario completo y política por empresa', () => {
  it('conserva todos los precios y estados sin elegir default ni convertir moneda', () => {
    const result = defineCompanyCatalogSnapshot(catalog());
    expect(result.currency).toBe('EUR');
    expect(result.products[0]!.variants.map(({ id, priceCents, status }) => ({ id, priceCents, status }))).toEqual([
      { id: 11, priceCents: 0, status: 'active' }, { id: 12, priceCents: 2499, status: 'active' },
      { id: 13, priceCents: 2999, status: 'draft' }, { id: 14, priceCents: 10_000_000, status: 'archived' },
    ]);
    expect(result.products[1]!.active).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/stock|default|vat|profile/);
    const edge = catalog(); edge.products = [{ id: 2_147_483_647, active: false,
      variants: [{ id: Number.MAX_SAFE_INTEGER, productId: 2_147_483_647, status: 'active', priceCents: 10_000_000 }] }];
    expect(defineCompanyCatalogSnapshot(edge).products[0]!.variants[0]!.id).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('normaliza orden sin mutar ni compartir arrays del llamador', () => {
    const source = catalog(); source.products.reverse(); source.products[2]!.variants.reverse();
    const rules = policy(); rules.rules.reverse(); rules.rules[2]!.variantIds.reverse();
    const normalized = defineCompanyCatalogSnapshot(source); const normalizedPolicy = defineCompanyCatalogPolicy(rules);
    expect(normalized).toEqual(defineCompanyCatalogSnapshot(catalog()));
    expect(normalizedPolicy).toEqual(defineCompanyCatalogPolicy(policy()));
    expect(source.products[0]!.id).toBe(3);
    source.products[2]!.variants[0]!.priceCents = 99;
    rules.rules[2]!.variantIds[0] = 999;
    expect(normalized.products[0]!.variants[3]!.priceCents).toBe(10_000_000);
    expect(normalizedPolicy.rules[0]!.variantIds).toEqual([12, 13, 14]);
    frozen(normalized); frozen(normalizedPolicy);
  });

  it.each([-0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, 10_000_001])('rechaza precio %s también en variante archivada no seleccionada', priceCents => {
    const source = input(); source.catalog.products[0]!.variants[3]!.priceCents = priceCents;
    expectReason(() => previewCompanyCatalogRestrictions(source), 'invalid_data');
  });

  it('rechaza IDs, moneda, estados y booleanos fuera del perfil aunque no se usen', () => {
    const variants = [
      { ...catalog(), currency: 'JPY' }, { ...catalog(), currency: 'eur' }, { ...catalog(), source: 'runtime' },
      { ...catalog(), schemaVersion: 2 }, { ...catalog(), capturedAt: '2026-02-30T12:00:00.000Z' },
      { ...catalog(), capturedAt: '2026-10-03T12:00:00Z' },
    ];
    for (const value of variants) expectReason(() => defineCompanyCatalogSnapshot(value), 'invalid_data');
    for (const productId of [-0, 0, 2_147_483_648, 1.5]) {
      const value = catalog(); value.products[0]!.id = productId;
      expectReason(() => defineCompanyCatalogSnapshot(value), 'invalid_data');
    }
    for (const patch of [{ active: 1 }, { variants: [] }, { active: undefined }]) {
      const value = catalog(); Object.assign(value.products[0]!, patch);
      expectReason(() => defineCompanyCatalogSnapshot(value), 'invalid_data');
    }
    const invalidState = catalog(); invalidState.products[0]!.variants[3]!.status = 'pending';
    expectReason(() => defineCompanyCatalogSnapshot(invalidState), 'invalid_data');
  });

  it('rechaza producto duplicado, ID de variante global repetido y ownership cruzado', () => {
    const productDuplicate = catalog(); productDuplicate.products.push(structuredClone(productDuplicate.products[0]!));
    expectReason(() => defineCompanyCatalogSnapshot(productDuplicate), 'duplicate_id');
    const variantDuplicate = catalog(); variantDuplicate.products[1]!.variants[0]!.id = 11;
    expectReason(() => defineCompanyCatalogSnapshot(variantDuplicate), 'duplicate_id');
    const crossed = catalog(); crossed.products[1]!.variants[0]!.productId = 1;
    expectReason(() => defineCompanyCatalogSnapshot(crossed), 'cross_product_reference');
  });

  it('incluido exige selección explícita, excluido vacía y la tupla no admite versiones repetidas', () => {
    const empty = policy(); empty.rules[0]!.variantIds = [];
    expectReason(() => defineCompanyCatalogPolicy(empty), 'invalid_data');
    const excluded = policy(); excluded.rules[1]!.variantIds = [21];
    expectReason(() => defineCompanyCatalogPolicy(excluded), 'invalid_data');
    const duplicate = policy(); duplicate.rules.push({ ...duplicate.rules[0]!, state: 'excluded', variantIds: [] });
    expectReason(() => defineCompanyCatalogPolicy(duplicate), 'duplicate_rule');
    const variants = policy(); variants.rules[0]!.variantIds = [12, 12];
    expectReason(() => defineCompanyCatalogPolicy(variants), 'duplicate_id');
    const extra = policy(); Object.assign(extra.rules[0]!, { version: 2 });
    expectReason(() => defineCompanyCatalogPolicy(extra), 'invalid_data');
  });

  it('los normalizadores no inventan referencias externas: el preview valida su existencia', () => {
    const source = input(); source.policy.rules[2]!.companyId = 'company.unknown';
    expect(defineCompanyCatalogPolicy(source.policy).rules).toHaveLength(3);
    expectReason(() => previewCompanyCatalogRestrictions(source), 'unknown_reference');
  });
});

describe('restricciones completas y referencias exactas', () => {
  it('preview incluye todos los productos y variantes, con ausencia y exclusión distintas', () => {
    const result = previewCompanyCatalogRestrictions(input());
    expect(result).toMatchObject({ source: 'fixture', directoryRef: DIRECTORY_REF, catalogRef: CATALOG_REF,
      policyRef: { id: 'company.catalog.policy', version: 3 }, company: { id: 'company.alpha', state: 'active' } });
    expect(result.products.map(({ productId, restriction, eligible, reasons }) => ({ productId, restriction, eligible, reasons }))).toEqual([
      { productId: 1, restriction: 'included', eligible: true, reasons: [] },
      { productId: 2, restriction: 'excluded', eligible: false, reasons: ['company_excluded'] },
      { productId: 3, restriction: 'unconfigured', eligible: false, reasons: ['company_unconfigured'] },
    ]);
    expect(result.products[0]!.variants).toEqual([
      { variantId: 11, selected: false, eligible: false, reasons: ['company_variant_not_selected'] },
      { variantId: 12, selected: true, eligible: true, reasons: [] },
      { variantId: 13, selected: true, eligible: true, reasons: [] },
      { variantId: 14, selected: true, eligible: true, reasons: [] },
    ]);
    expect(result.products[0]!.selectedVariantIds).toEqual([12, 13, 14]);
    frozen(result);
  });

  it('elegibilidad empresa no suplanta lifecycle ni visibilidad por mercado', () => {
    const source = input(); source.policy.rules[1] = { companyId: 'company.alpha', productId: 2, state: 'included', variantIds: [21] };
    const result = previewCompanyCatalogRestrictions(source);
    expect(result.products[1]!.eligible).toBe(true);
    expect(result.products[0]!.variants.find(variant => variant.variantId === 13)!.eligible).toBe(true);
    expect(result.products[0]!.variants.find(variant => variant.variantId === 14)!.eligible).toBe(true);
    expect(result.products[0]).not.toHaveProperty('visible');
    expect(result).not.toHaveProperty('price');
    expect(result).not.toHaveProperty('grants');
  });

  it('empresa inactiva conserva todas las decisiones pero bloquea la elegibilidad comercial', () => {
    const result = previewCompanyCatalogRestrictions({ ...input(), companyId: 'company.beta' });
    expect(result.company.state).toBe('inactive');
    expect(result.products).toHaveLength(3);
    expect(result.products[0]).toMatchObject({ restriction: 'included', eligible: false, selectedVariantIds: [11], reasons: ['company_inactive'] });
    expect(result.products[0]!.variants[0]).toMatchObject({ selected: true, eligible: false, reasons: ['company_inactive'] });
    expect(result.products[0]!.variants[1]!.reasons).toEqual(['company_inactive', 'company_variant_not_selected']);
    expect(result.products[1]!.reasons).toEqual(['company_inactive', 'company_unconfigured']);
    expect(result.products.every(product => product.variants.every(variant => !variant.eligible))).toBe(true);
  });

  it.each(['id', 'version', 'capturedAt'] as const)('directoryRef.%s debe coincidir exactamente', key => {
    const source = input(); Object.assign(source.policy.directoryRef, { [key]: key === 'version' ? 3 : key === 'id' ? 'other.directory' : '2026-10-03T13:00:00.000Z' });
    expectReason(() => previewCompanyCatalogRestrictions(source), 'reference_mismatch');
  });
  it.each(['ref', 'capturedAt'] as const)('catalogRef.%s debe coincidir exactamente', key => {
    const source = input(); source.policy.catalogRef[key] = key === 'ref' ? 'other.catalog' : '2026-10-03T13:00:00.000Z';
    expectReason(() => previewCompanyCatalogRestrictions(source), 'reference_mismatch');
  });

  it('no oculta corrupción ajena tras empresa inactiva ni selección sin reglas', () => {
    for (const companyId of ['company.alpha', 'company.beta']) {
      const badCompany = input(); badCompany.policy.rules[2]!.companyId = 'company.missing';
      expectReason(() => previewCompanyCatalogRestrictions({ ...badCompany, companyId }), 'unknown_reference');
      const badProduct = input(); badProduct.policy.rules[2]!.productId = 999;
      expectReason(() => previewCompanyCatalogRestrictions({ ...badProduct, companyId }), 'unknown_reference');
      const foreignVariant = input(); foreignVariant.policy.rules[2]!.variantIds = [21];
      expectReason(() => previewCompanyCatalogRestrictions({ ...foreignVariant, companyId }), 'cross_product_reference');
      const missingVariant = input(); missingVariant.policy.rules[2]!.variantIds = [999];
      expectReason(() => previewCompanyCatalogRestrictions({ ...missingVariant, companyId }), 'unknown_reference');
    }
    expectReason(() => previewCompanyCatalogRestrictions({ ...input(), companyId: 'company.missing' }), 'unknown_company');
  });

  it('directorio completo se valida incluso con catálogo y reglas vacíos', () => {
    const source = input(); source.catalog.products = []; source.policy.rules = [];
    expect(previewCompanyCatalogRestrictions(source).products).toEqual([]);
    Object.assign(source.directory, { sites: [{ id: 'site.bad', companyId: 'company.missing', label: 'Sede', state: 'inactive', countryCode: null }] });
    expectReason(() => previewCompanyCatalogRestrictions(source), 'invalid_data');
  });
});

describe('límites inclusivos y entradas de datos hostiles', () => {
  it('aplica máximos de producto, variantes por producto y variantes totales antes de proyectar', () => {
    const source = catalog();
    source.products = Array.from({ length: 1000 }, (_, index) => ({ id: index + 1, active: true,
      variants: Array.from({ length: 10 }, (_, offset) => ({ id: index * 10 + offset + 1, productId: index + 1, status: 'active', priceCents: 0 })) }));
    expect(defineCompanyCatalogSnapshot(source).products).toHaveLength(COMPANY_CATALOG_LIMITS.products);
    const totalOverflow = structuredClone(source); totalOverflow.products[0]!.variants.push({ id: 10001, productId: 1, status: 'active', priceCents: 0 });
    expectReason(() => defineCompanyCatalogSnapshot(totalOverflow), 'invalid_data');
    source.products.push({ id: 1001, active: false, variants: [{ id: 10001, productId: 1001, status: 'active', priceCents: 0 }] });
    expectReason(() => defineCompanyCatalogSnapshot(source), 'invalid_data');
    source.products = [{ id: 1, active: true, variants: Array.from({ length: 100 }, (_, index) => ({ id: index + 1, productId: 1, status: 'active', priceCents: 0 })) }];
    expect(defineCompanyCatalogSnapshot(source).products[0]!.variants).toHaveLength(100);
    source.products[0]!.variants.push({ id: 101, productId: 1, status: 'active', priceCents: 0 });
    expectReason(() => defineCompanyCatalogSnapshot(source), 'invalid_data');
  });

  it('admite 10000 reglas y 100000 referencias y rechaza cada máximo más uno', () => {
    const source = input();
    source.directory.companies = Array.from({ length: 100 }, (_, index) => ({ id: `company.c${index}`, displayName: `Empresa ${index}`, state: 'active', vatId: null }));
    source.catalog.products = Array.from({ length: 100 }, (_, index) => ({ id: index + 1, active: true,
      variants: Array.from({ length: 10 }, (_, offset) => ({ id: index * 10 + offset + 1, productId: index + 1, status: 'active', priceCents: 0 })) }));
    source.policy.rules = source.directory.companies.flatMap(company => source.catalog.products.map(product => ({
      companyId: company.id, productId: product.id, state: 'included', variantIds: product.variants.map(variant => variant.id),
    })));
    expect(defineCompanyCatalogPolicy(source.policy).rules).toHaveLength(10000);
    expect(previewCompanyCatalogRestrictions({ ...source, companyId: 'company.c0' }).products).toHaveLength(100);
    const tooManyRefs = structuredClone(source.policy); tooManyRefs.rules[0]!.variantIds.push(1001);
    expectReason(() => defineCompanyCatalogPolicy(tooManyRefs), 'invalid_data');
    source.policy.rules.push({ companyId: 'company.extra', productId: 1, state: 'excluded', variantIds: [] });
    expectReason(() => defineCompanyCatalogPolicy(source.policy), 'invalid_data');
  });

  it('exige records exactos y arrays densos sin metadatos ejecutables', () => {
    for (const value of [null, [], {}, { ...catalog(), extra: true }, Object.assign(Object.create({ inherited: true }), catalog())]) {
      expectReason(() => defineCompanyCatalogSnapshot(value), 'invalid_data');
    }
    const getter = vi.fn(() => 42);
    const withGetter = catalog(); Object.defineProperty(withGetter.products[0]!.variants[0]!, 'priceCents', { enumerable: true, get: getter });
    expectReason(() => defineCompanyCatalogSnapshot(withGetter), 'invalid_data');
    const itemGetter = catalog(); Object.defineProperty(itemGetter.products, '0', { enumerable: true, get: getter });
    expectReason(() => defineCompanyCatalogSnapshot(itemGetter), 'invalid_data');
    const holes = catalog(); delete (holes.products as Array<unknown>)[0];
    expectReason(() => defineCompanyCatalogSnapshot(holes), 'invalid_data');
    const arrayExtra = catalog(); Object.assign(arrayExtra.products, { extra: true });
    expectReason(() => defineCompanyCatalogSnapshot(arrayExtra), 'invalid_data');
    const symbol = { ...catalog(), [Symbol('hidden')]: true };
    expectReason(() => defineCompanyCatalogSnapshot(symbol), 'invalid_data');
    const hidden = catalog(); Object.defineProperty(hidden, 'ref', { value: CATALOG_REF.ref, enumerable: false });
    expectReason(() => defineCompanyCatalogSnapshot(hidden), 'invalid_data');
    expect(getter).not.toHaveBeenCalled();
    expect(defineCompanyCatalogSnapshot(Object.assign(Object.create(null), catalog()))).toEqual(defineCompanyCatalogSnapshot(catalog()));
  });

  it('redacta errores arbitrarios de introspección y valida wrappers sin acceso a getters', () => {
    const secret = 'private:person@example.test';
    const proxy = new Proxy({}, { ownKeys() { throw new Error(secret); } });
    for (const call of [() => defineCompanyCatalogSnapshot(proxy), () => defineCompanyCatalogPolicy(proxy),
      () => previewCompanyCatalogRestrictions(proxy), () => previewCompanyCatalogRestrictions({ ...input(), directory: proxy })]) {
      expectReason(call, 'invalid_data');
      try { call(); } catch (error) { expect(String(error)).not.toContain(secret); }
    }
    const getter = vi.fn(() => catalog());
    const value = input(); Object.defineProperty(value, 'catalog', { enumerable: true, get: getter });
    expectReason(() => previewCompanyCatalogRestrictions(value), 'invalid_data');
    expect(getter).not.toHaveBeenCalled();
    const hostileReason = Object.defineProperty({}, 'toString', { get: getter });
    const error = new CompanyCatalogContractError(hostileReason as never);
    expect(error.reason).toBe('invalid_data'); expect(getter).not.toHaveBeenCalled();
  });

  it('opera sin reloj implícito, red, almacenamiento ni temporizadores', () => {
    class ExplicitDate extends Date {
      constructor(value?: string | number) { if (value === undefined) throw new Error('Implicit clock'); super(value); }
      static override now(): never { throw new Error('Implicit clock'); }
    }
    const forbidden = vi.fn(() => { throw new Error('Unexpected effect'); });
    vi.stubGlobal('Date', ExplicitDate);
    for (const name of ['fetch', 'setTimeout', 'setInterval']) vi.stubGlobal(name, forbidden);
    for (const name of ['localStorage', 'sessionStorage']) vi.stubGlobal(name, { getItem: forbidden, setItem: forbidden });
    expect(previewCompanyCatalogRestrictions(input()).products).toHaveLength(3);
    expect(previewCompanyCatalogRestrictions(input())).toEqual(previewCompanyCatalogRestrictions(input()));
    expect(forbidden).not.toHaveBeenCalled();
  });
});
