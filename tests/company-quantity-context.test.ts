import { afterEach, describe, expect, it, vi } from 'vitest';
import { previewCompanyQuantities } from '../src/composition/company-quantity-context';
import { previewCompanyCatalogContext } from '../src/composition/company-catalog-context';
import { VariantQuantityContractError } from '../src/modules/companies';

const AT = '2026-10-04T12:00:00.000Z';
const COMPANY = 'company.alpha';
const MAX = Number.MAX_SAFE_INTEGER;
const catalogRef = () => ({ ref: 'catalog.fixture', capturedAt: AT });
const directoryRef = () => ({ id: 'directory.fixture', version: 1, capturedAt: AT });
const policyRef = () => ({ id: 'quantities.fixture', version: 1 });
function unitRule(productId = 1, variantId = 12) {
  return { productId, variantId, orderUnit: 'unit', unitsPerBox: 1, minUnits: 5, maxUnits: 17, multipleUnits: 4 };
}
function input() {
  return {
    catalogContext: {
      directory: { schemaVersion: 1, source: 'fixture', ...directoryRef(), companies: [
        { id: COMPANY, displayName: 'Empresa A', state: 'active', vatId: null },
        { id: 'company.beta', displayName: 'Empresa B', state: 'inactive', vatId: null },
        { id: 'company.unbound', displayName: 'Empresa sin tarifa', state: 'active', vatId: null },
      ], sites: [], contacts: [], roles: [], assignments: [] },
      markets: { schemaVersion: 1, id: 'markets.fixture', version: 1, fallback: { strategy: 'none' }, markets: [
        { id: 'ES', countryCodes: ['ES'], defaultLocale: 'es-ES', currency: 'EUR', domains: ['es.example.test'] },
        { id: 'JP', countryCodes: ['JP'], defaultLocale: 'ja-JP', currency: 'JPY', domains: ['jp.example.test'] },
      ] },
      catalog: { schemaVersion: 1, source: 'fixture', ...catalogRef(), currency: 'EUR', products: [
        { id: 1, active: true, variants: [
          { id: 11, productId: 1, status: 'active', priceCents: 1000 },
          { id: 12, productId: 1, status: 'active', priceCents: 1500 },
          { id: 13, productId: 1, status: 'draft', priceCents: 2000 },
          { id: 14, productId: 1, status: 'archived', priceCents: 2500 },
        ] },
        { id: 2, active: true, variants: [{ id: 21, productId: 2, status: 'active', priceCents: 3000 }] },
      ] },
      companyPolicy: { schemaVersion: 1, source: 'fixture', id: 'policy.company', version: 1,
        directoryRef: directoryRef(), catalogRef: catalogRef(), rules: [
          { companyId: COMPANY, productId: 1, state: 'included', variantIds: [12, 13, 14] },
          { companyId: COMPANY, productId: 2, state: 'included', variantIds: [21] },
          { companyId: 'company.beta', productId: 1, state: 'included', variantIds: [12, 13, 14] },
          { companyId: 'company.unbound', productId: 1, state: 'included', variantIds: [12, 13, 14] },
        ] },
      publicationPolicy: { schemaVersion: 1, id: 'publication.fixture', version: 1, channels: ['professional'], rules: [
        { marketId: 'ES', channel: 'professional', productId: 1, state: 'published', variantIds: [12, 13, 14] },
        { marketId: 'ES', channel: 'professional', productId: 2, state: 'published', variantIds: [21] },
        { marketId: 'JP', channel: 'professional', productId: 1, state: 'published', variantIds: [12, 13, 14] },
      ] },
      context: { companyId: COMPANY, marketId: 'ES', channel: 'professional' },
    },
    policy: { schemaVersion: 1, source: 'fixture', ...policyRef(), catalogRef: catalogRef(), rules: [
      unitRule(), { productId: 2, variantId: 21, orderUnit: 'box', unitsPerBox: 6, minUnits: 6, maxUnits: 18, multipleUnits: 4 },
    ] },
    request: { schemaVersion: 1, id: 'request.fixture', catalogRef: catalogRef(), policyRef: policyRef(),
      lines: [{ productId: 1, variantId: 12, requestedCount: 8 }] },
  };
}
function rejected(data: unknown, reason?: string) {
  try { previewCompanyQuantities(data); throw new Error('Expected rejection'); }
  catch (error) {
    expect(error).toBeInstanceOf(VariantQuantityContractError);
    expect(error).toMatchObject({ code: 'variant_quantity_contract_invalid', ...(reason ? { reason } : {}) });
    expect(error).not.toHaveProperty('cause');
    return error as VariantQuantityContractError;
  }
}
function frozen(value: unknown): boolean {
  return value === null || typeof value !== 'object' || Object.isFrozen(value) && Object.values(value).every(frozen);
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('cantidades de variante en contexto empresarial fixture', () => {
  it('evalúa la variante explícita y conserva solo referencias y diagnósticos, sin precios ni permisos', () => {
    const result = previewCompanyQuantities(input());
    expect(result).toMatchObject({ source: 'fixture', directoryRef: directoryRef(), catalogRef: catalogRef(),
      companyPolicyRef: { id: 'policy.company', version: 1 }, policyRef: policyRef(), requestId: 'request.fixture',
      context: { companyId: COMPANY, marketId: 'ES', channel: 'professional' }, company: { id: COMPANY, state: 'active' },
      lines: [{ productId: 1, variantId: 12, outcome: 'satisfied', reasons: [],
        quantity: { requestedCount: 8, orderUnit: 'unit', unitsPerBox: 1, quantityUnits: 8, outcome: 'satisfied', reasons: [] },
        visibility: { visible: true, companyReasons: [], marketReasons: [], intersectionReason: null } }] });
    expect(Object.keys(result).sort()).toEqual(['catalogRef', 'company', 'companyPolicyRef', 'context', 'directoryRef',
      'lines', 'marketsRef', 'policyRef', 'publicationPolicyRef', 'requestId', 'source']);
    expect(JSON.stringify(result)).not.toMatch(/price|currency|stock|total|binding|permission|purchas|authorized|displayName/i);
  });

  it('normaliza y devuelve dos productos ordenados sin mezclar cajas y unidades', () => {
    const data = input();
    data.request.lines.unshift({ productId: 2, variantId: 21, requestedCount: 2 });
    const result = previewCompanyQuantities(data);
    expect(result.lines.map(line => [line.productId, line.quantity.orderUnit, line.quantity.requestedCount, line.quantity.quantityUnits, line.outcome]))
      .toEqual([[1, 'unit', 8, 8, 'satisfied'], [2, 'box', 2, 12, 'satisfied']]);
  });

  it.each([
    [0, ['below_minimum']], [4, ['below_minimum']], [5, ['not_multiple']],
    [8, []], [16, []], [17, ['not_multiple']], [20, ['above_maximum']],
  ] as const)('unidad: conserva count %s y aplica límites/múltiplo absolutos', (requestedCount, reasons) => {
    const data = input(); data.request.lines[0]!.requestedCount = requestedCount;
    const line = previewCompanyQuantities(data).lines[0]!;
    expect(line.quantity.quantityUnits).toBe(requestedCount);
    expect(line.quantity.reasons).toEqual(reasons);
    expect(line.reasons).toEqual(reasons);
    expect(line.outcome).toBe(reasons.length === 0 ? 'satisfied' : 'blocked');
  });

  it.each([
    [0, 0, ['below_minimum']], [1, 6, ['not_multiple']], [2, 12, []],
    [3, 18, ['not_multiple']], [4, 24, ['above_maximum']], [5, 30, ['above_maximum', 'not_multiple']],
  ] as const)('caja: count %s produce %s unidades sin redondeo ni corrección', (requestedCount, quantityUnits, reasons) => {
    const data = input(); data.request.lines = [{ productId: 2, variantId: 21, requestedCount }];
    const line = previewCompanyQuantities(data).lines[0]!;
    expect(line.quantity.quantityUnits).toBe(quantityUnits);
    expect(line.quantity.reasons).toEqual(reasons);
    expect(line.visibility.visible).toBe(true);
  });

  it('una variante sin regla queda unconfigured, nunca interpreta el count como unidades implícitas', () => {
    const data = input(); data.policy.rules = [];
    expect(previewCompanyQuantities(data).lines[0]).toMatchObject({ outcome: 'blocked', reasons: ['unconfigured'],
      quantity: { requestedCount: 8, orderUnit: null, unitsPerBox: null, quantityUnits: null, rule: null,
        outcome: 'blocked', reasons: ['unconfigured'] }, visibility: { visible: true } });
  });

  it('sin vinculación de precios puede satisfacer cantidades y visibilidad sin afirmar compra', () => {
    const data = input(); data.catalogContext.context.companyId = 'company.unbound';
    const result = previewCompanyQuantities(data);
    expect(result.lines[0]).toMatchObject({ outcome: 'satisfied', reasons: [], visibility: { visible: true } });
    expect(JSON.stringify(result)).not.toMatch(/binding|price|purchas|authorized|permission/i);
  });

  it('un mercado JPY visible no hereda el bloqueo de precios EUR y no expone moneda', () => {
    const data = input(); data.catalogContext.context.marketId = 'JP';
    const result = previewCompanyQuantities(data);
    expect(result.context.marketId).toBe('JP');
    expect(result.lines[0]).toMatchObject({ outcome: 'satisfied', reasons: [], quantity: { quantityUnits: 8 } });
    expect(JSON.stringify(result)).not.toMatch(/currency|EUR|JPY|price/i);
  });

  it('importe de catálogo cambia sin afectar diagnósticos de cantidades', () => {
    const data = input(); const before = previewCompanyQuantities(data);
    for (const product of data.catalogContext.catalog.products) for (const variant of product.variants) variant.priceCents = 0;
    expect(previewCompanyQuantities(data)).toEqual(before);
  });

  it('empresa inactiva conserva cantidad satisfecha pero bloquea la visibilidad por separado', () => {
    const data = input(); data.catalogContext.context.companyId = 'company.beta';
    const line = previewCompanyQuantities(data).lines[0]!;
    expect(line).toMatchObject({ outcome: 'blocked', reasons: ['variant_not_visible'],
      quantity: { outcome: 'satisfied', reasons: [], quantityUnits: 8 },
      visibility: { visible: false, companyReasons: ['company_inactive'], marketReasons: [] } });
  });

  it('la intersección vacía no sustituye la variante elegida por la publicada', () => {
    const data = input(); data.catalogContext.publicationPolicy.rules[0]!.variantIds = [11];
    const line = previewCompanyQuantities(data).lines[0]!;
    expect(line).toMatchObject({ variantId: 12, outcome: 'blocked', reasons: ['variant_not_visible'],
      quantity: { outcome: 'satisfied', quantityUnits: 8 },
      visibility: { visible: false, companyReasons: [], intersectionReason: 'no_common_variants' } });
    expect(line.visibility.marketReasons.length).toBeGreaterThan(0);
  });

  it.each([13, 14])('variante lifecycle no activa %s sigue presente para cantidad y recibe bloqueo de visibilidad', variantId => {
    const data = input(); data.policy.rules.push(unitRule(1, variantId)); data.request.lines[0]!.variantId = variantId;
    expect(previewCompanyQuantities(data).lines[0]).toMatchObject({ variantId, outcome: 'blocked',
      reasons: ['variant_not_visible'], quantity: { outcome: 'satisfied', quantityUnits: 8 }, visibility: { visible: false } });
  });

  it('mantiene ambas dimensiones bloqueadas sin esconder motivos de cantidades', () => {
    const data = input(); data.catalogContext.catalog.products[0]!.active = false; data.request.lines[0]!.requestedCount = 5;
    expect(previewCompanyQuantities(data).lines[0]).toMatchObject({ outcome: 'blocked',
      reasons: ['not_multiple', 'variant_not_visible'], quantity: { reasons: ['not_multiple'], quantityUnits: 5 },
      visibility: { visible: false } });
  });

  it('regla ausente en variante oculta permanece desconocida, no se filtra antes del cálculo', () => {
    const data = input(); data.request.lines[0]!.variantId = 11;
    expect(previewCompanyQuantities(data).lines[0]).toMatchObject({ variantId: 11, outcome: 'blocked',
      reasons: ['unconfigured', 'variant_not_visible'], quantity: { quantityUnits: null, orderUnit: null } });
  });

  it.each(['policy', 'request'] as const)('rechaza ref de catálogo ajena en %s', field => {
    const data = input(); data[field].catalogRef.ref = 'catalog.other'; rejected(data, 'reference_mismatch');
  });
  it.each(['policy', 'request'] as const)('capturedAt distinto en %s no queda oculto por empresa inactiva', field => {
    const data = input(); data.catalogContext.context.companyId = 'company.beta';
    data[field].catalogRef.capturedAt = '2026-10-04T12:00:01.000Z'; rejected(data, 'reference_mismatch');
  });
  it.each(['id', 'version'] as const)('rechaza referencia de política %s antigua', field => {
    const data = input();
    if (field === 'id') data.request.policyRef.id = 'quantities.other'; else data.request.policyRef.version++;
    rejected(data, 'reference_mismatch');
  });

  it.each(['unknown', 'foreign'] as const)('rechaza regla %s no seleccionada aunque no haya líneas', kind => {
    const data = input(); data.request.lines = [];
    data.policy.rules = [unitRule(1, kind === 'unknown' ? 999 : 21)];
    rejected(data, kind === 'unknown' ? 'unknown_reference' : 'cross_product_reference');
  });
  it.each(['unknown', 'foreign'] as const)('rechaza variante solicitada %s en contexto inactivo', kind => {
    const data = input(); data.catalogContext.context.companyId = 'company.beta';
    data.request.lines[0]!.variantId = kind === 'unknown' ? 999 : 21;
    rejected(data, kind === 'unknown' ? 'unknown_reference' : 'cross_product_reference');
  });

  it('rechaza política inviable no seleccionada incluso sin líneas y con empresa inactiva', () => {
    const data = input(); data.request.lines = []; data.catalogContext.context.companyId = 'company.beta';
    data.policy.rules[1]!.maxUnits = 11; rejected(data, 'infeasible_rule');
  });

  it.each(['inactive-company', 'hidden-variant', 'inactive-product'] as const)('overflow se valida antes de bloqueo %s', mode => {
    const data = input();
    data.policy.rules[0] = { ...unitRule(), orderUnit: 'box', unitsPerBox: MAX, minUnits: MAX, maxUnits: MAX, multipleUnits: 1 };
    data.request.lines[0]!.requestedCount = 2;
    if (mode === 'inactive-company') data.catalogContext.context.companyId = 'company.beta';
    if (mode === 'hidden-variant') data.catalogContext.publicationPolicy.rules[0]!.variantIds = [11];
    if (mode === 'inactive-product') data.catalogContext.catalog.products[0]!.active = false;
    rejected(data, 'quantity_overflow');
  });

  it('MAX_SAFE en caja es exacto al pedir una caja; no pasa por multiplicación float', () => {
    const data = input();
    data.policy.rules[0] = { ...unitRule(), orderUnit: 'box', unitsPerBox: MAX, minUnits: MAX, maxUnits: MAX, multipleUnits: 1 };
    data.request.lines[0]!.requestedCount = 1;
    expect(previewCompanyQuantities(data).lines[0]).toMatchObject({ outcome: 'satisfied', quantity: { quantityUnits: MAX } });
  });

  it.each(['snapshot', 'company-policy', 'publication-policy', 'directory'] as const)('valida corrupción ajena de %s antes de salida sin líneas', kind => {
    const data = input(); data.request.lines = [];
    if (kind === 'snapshot') data.catalogContext.catalog.products[0]!.variants[2]!.priceCents = -1;
    if (kind === 'company-policy') data.catalogContext.companyPolicy.rules[2]!.variantIds = [999];
    if (kind === 'publication-policy') data.catalogContext.publicationPolicy.rules[2]!.variantIds = [999];
    if (kind === 'directory') data.catalogContext.directory.companies[1]!.state = 'forged';
    rejected(data);
  });

  it('conserva referencia exacta de política empresarial al validar el catálogo único', () => {
    const data = input(); data.catalogContext.companyPolicy.catalogRef.capturedAt = '2026-10-04T13:00:00.000Z';
    rejected(data, 'reference_mismatch');
  });

  it('no acepta un preview externo fingido ni otro catálogo, binding, precio o permiso adicional', () => {
    const data = input();
    rejected({ ...data, catalogContext: previewCompanyCatalogContext(data.catalogContext) });
    for (const key of ['catalog', 'bindings', 'priceLists', 'price', 'authorized', 'at']) rejected({ ...data, [key]: {} });
    rejected({ ...data, catalogContext: { ...data.catalogContext, quantityCatalog: {} } });
  });

  it('una variante por producto: rechaza dos líneas aunque soliciten variantes distintas', () => {
    const data = input(); data.request.lines.push({ productId: 1, variantId: 11, requestedCount: 8 });
    rejected(data, 'duplicate_line');
  });

  it('acepta cero líneas sin omitir normalización del contexto y políticas', () => {
    const data = input(); data.request.lines = [];
    expect(previewCompanyQuantities(data)).toMatchObject({ lines: [], catalogRef: catalogRef(), policyRef: policyRef() });
  });

  it('100 líneas válidas se conservan; la 101 se rechaza aunque no sea visible', () => {
    const data = input();
    data.catalogContext.catalog.products = Array.from({ length: 101 }, (_, index) => ({ id: index + 1, active: false,
      variants: [{ id: (index + 1) * 10 + 1, productId: index + 1, status: 'active', priceCents: 0 }] }));
    data.catalogContext.companyPolicy.rules = []; data.catalogContext.publicationPolicy.rules = [];
    data.policy.rules = data.catalogContext.catalog.products.map(product => unitRule(product.id, product.variants[0]!.id));
    data.request.lines = data.catalogContext.catalog.products.slice(0, 100).map(product => ({
      productId: product.id, variantId: product.variants[0]!.id, requestedCount: 8 }));
    const result = previewCompanyQuantities(data);
    expect(result.lines).toHaveLength(100);
    expect(result.lines.every(line => line.quantity.outcome === 'satisfied' && line.outcome === 'blocked')).toBe(true);
    data.request.lines.push({ productId: 101, variantId: 1011, requestedCount: 8 }); rejected(data, 'invalid_data');
  });

  it('devuelve copias recursivamente congeladas independientes del llamador', () => {
    const data = input(); const result = previewCompanyQuantities(data); const before = JSON.stringify(result);
    expect(frozen(result)).toBe(true);
    data.policy.rules[0]!.unitsPerBox = 99; data.request.lines[0]!.requestedCount = 999;
    data.catalogContext.companyPolicy.rules[0]!.variantIds.length = 0;
    data.catalogContext.catalog.products[0]!.variants[1]!.id = 999;
    data.catalogContext.context.companyId = 'company.beta'; data.policy.version++;
    expect(JSON.stringify(result)).toBe(before);
  });

  it('deriva identidad y visibilidad de la misma copia normalizada sin releer el catálogo original', () => {
    const data = input();
    const policy = new Proxy(data.policy, { getOwnPropertyDescriptor(target, key) {
      data.catalogContext.catalog.products[0]!.variants[1]!.id = 999;
      data.catalogContext.catalog.products[0]!.active = false;
      data.catalogContext.context.companyId = 'company.beta';
      return Reflect.getOwnPropertyDescriptor(target, key);
    } });
    const result = previewCompanyQuantities({ ...data, policy });
    expect(data.catalogContext.catalog.products[0]!.variants[1]!.id).toBe(999);
    expect(result.context.companyId).toBe(COMPANY);
    expect(result.lines[0]).toMatchObject({ variantId: 12, outcome: 'satisfied',
      quantity: { variantId: 12, quantityUnits: 8 }, visibility: { visible: true } });
  });

  it('rechaza getters en todas las fronteras sin ejecutarlos ni filtrar sus valores', () => {
    let getterCalls = 0;
    const targets: Array<(data: ReturnType<typeof input>) => [object, string]> = [
      data => [data, 'catalogContext'], data => [data.catalogContext, 'catalog'],
      data => [data.catalogContext.catalog.products[0]!.variants[2]!, 'priceCents'],
      data => [data.policy, 'rules'], data => [data.policy.rules, '1'],
      data => [data.policy.rules[1]!, 'multipleUnits'], data => [data.request, 'catalogRef'],
      data => [data.request.lines[0]!, 'requestedCount'],
    ];
    for (const target of targets) {
      const data = input(); const [object, key] = target(data);
      Object.defineProperty(object, key, { enumerable: true, get() { getterCalls++; throw new Error('private-vat-secret'); } });
      expect(rejected(data).message).not.toContain('private-vat-secret');
    }
    expect(getterCalls).toBe(0);
  });

  it('redacta errores arbitrarios de Proxy y errores falsificados sin propagar cause ni mensajes', () => {
    const fakeError = new VariantQuantityContractError('unknown_reference');
    Object.defineProperty(fakeError, 'reason', { get() { throw new Error('private-value'); } });
    for (const thrown of [new Error('private-value'), fakeError, new Proxy({}, { getPrototypeOf() { throw new Error('private-value'); } })]) {
      const data = input();
      const hostile = new Proxy(data, { ownKeys() { throw thrown; } });
      const error = rejected(hostile, 'invalid_data');
      expect(error.message).not.toContain('private-value'); expect(error).not.toHaveProperty('cause');
    }
  });

  it('objetos propios null-prototype válidos sí se copian; prototipos, símbolos y campos ocultos se rechazan', () => {
    const data = input();
    expect(previewCompanyQuantities(Object.assign(Object.create(null), data))).toEqual(previewCompanyQuantities(data));
    rejected(Object.assign(Object.create({ inherited: true }), data));
    rejected({ ...data, [Symbol('extra')]: true });
    const hidden = { ...data }; Object.defineProperty(hidden, 'hidden', { value: true }); rejected(hidden);
  });

  it('no lee reloj, red, storage ni temporizadores para evaluar snapshots explícitos', () => {
    const forbidden = vi.fn(() => { throw new Error('Unexpected effect'); });
    vi.spyOn(Date, 'now').mockImplementation(forbidden);
    for (const key of ['fetch', 'setTimeout', 'setInterval', 'requestAnimationFrame']) vi.stubGlobal(key, forbidden);
    vi.stubGlobal('localStorage', { getItem: forbidden, setItem: forbidden });
    vi.stubGlobal('sessionStorage', { getItem: forbidden, setItem: forbidden });
    expect(previewCompanyQuantities(input()).lines[0]!.outcome).toBe('satisfied');
    expect(forbidden).not.toHaveBeenCalled();
  });
});
