import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  VARIANT_QUANTITY_LIMITS, VariantQuantityContractError, defineQuantityCatalogSnapshot,
  defineVariantQuantityPolicy, defineVariantQuantityRequest, previewVariantQuantities,
  type VariantQuantityContractReason,
} from '../src/modules/companies';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const MAX = Number.MAX_SAFE_INTEGER;
const CATALOG_REF = { ref: 'catalog.fixture', capturedAt: '2026-10-03T12:00:00.000Z' };
const POLICY_REF = { id: 'quantity.fixture', version: 3 };
function catalog() {
  return { schemaVersion: 1, source: 'fixture', ...CATALOG_REF, products: [
    { id: 1, variants: [{ id: 11, productId: 1 }, { id: 12, productId: 1 }] },
    { id: 2, variants: [{ id: 21, productId: 2 }] }, { id: 3, variants: [{ id: 31, productId: 3 }] },
  ] };
}
function rule() { return { productId: 1, variantId: 11, orderUnit: 'unit', unitsPerBox: 1, minUnits: 5, maxUnits: 17, multipleUnits: 4 }; }
function policy() { return { schemaVersion: 1, source: 'fixture', ...POLICY_REF, catalogRef: { ...CATALOG_REF }, rules: [rule()] }; }
function request() {
  return { schemaVersion: 1, id: 'request.fixture', catalogRef: { ...CATALOG_REF }, policyRef: { ...POLICY_REF },
    lines: [{ productId: 1, variantId: 11, requestedCount: 8 }] };
}
function input() { return { catalog: catalog(), policy: policy(), request: request() }; }
function expectReason(operation: () => unknown, reason: VariantQuantityContractReason): void {
  try { operation(); expect.fail('Expected quantity contract error'); }
  catch (error) {
    expect(error).toBeInstanceOf(VariantQuantityContractError);
    expect(error).toMatchObject({ code: 'variant_quantity_contract_invalid', reason });
    expect(error).not.toHaveProperty('cause');
  }
}
function frozen(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) frozen(child);
}

describe('unidades de pedido explícitas y aritmética exacta', () => {
  it.each([
    [0, ['below_minimum']], [1, ['below_minimum', 'not_multiple']], [4, ['below_minimum']],
    [5, ['not_multiple']], [8, []], [12, []], [16, []], [17, ['not_multiple']],
    [18, ['above_maximum', 'not_multiple']], [20, ['above_maximum']],
  ])('unidad count %i comprueba múltiplo absoluto y límites inclusivos', (count, reasons) => {
    const source = input(); source.request.lines[0]!.requestedCount = count as number;
    const result = previewVariantQuantities(source);
    expect(result.lines[0]).toMatchObject({ productId: 1, variantId: 11, requestedCount: count,
      orderUnit: 'unit', unitsPerBox: 1, quantityUnits: count, reasons,
      outcome: (reasons as string[]).length ? 'blocked' : 'satisfied' });
    expect(result.lines[0]!.rule).toEqual(defineVariantQuantityPolicy(source.policy).rules[0]);
    expect(result).not.toHaveProperty('totals');
    expect(result).not.toHaveProperty('purchasable');
  });

  it.each([[0, 0, ['below_minimum']], [1, 6, ['not_multiple']], [2, 12, []], [3, 18, ['not_multiple']], [4, 24, ['above_maximum']]])(
    'caja de seis count %i conserva %i unidades sin ajustar a un múltiplo', (count, units, reasons) => {
      const source = input(); Object.assign(source.policy.rules[0]!, { orderUnit: 'box', unitsPerBox: 6, minUnits: 6, maxUnits: 18 });
      source.request.lines[0]!.requestedCount = count as number;
      expect(previewVariantQuantities(source).lines[0]).toMatchObject({ requestedCount: count, orderUnit: 'box', unitsPerBox: 6,
        quantityUnits: units, reasons, outcome: (reasons as string[]).length ? 'blocked' : 'satisfied' });
    });

  it('el intervalo debe contener una cantidad expresable en cajas y múltiplo, no solo un múltiplo', () => {
    const source = policy(); Object.assign(source.rules[0]!, { orderUnit: 'box', unitsPerBox: 6, minUnits: 6, maxUnits: 11 });
    // Ocho es múltiplo de cuatro, pero no puede pedirse como una cantidad entera de cajas de seis.
    expectReason(() => defineVariantQuantityPolicy(source), 'infeasible_rule');
    source.rules[0]!.maxUnits = 12;
    expect(defineVariantQuantityPolicy(source).rules[0]!.maxUnits).toBe(12);
  });

  it.each([
    [1, 5, 17, 4], [1, 7, 7, 7], [1, 5, 7, 4],
    [6, 6, 18, 4], [6, 6, 11, 4], [6, 12, 12, 4],
    [7, 1, 34, 5], [7, 1, 35, 5], [8, 31, 47, 6], [8, 48, 48, 6],
  ])('factibilidad contrastada por enumeración: factor %i, intervalo %i..%i, múltiplo %i', (factor, min, max, multiple) => {
    const source = policy(); Object.assign(source.rules[0]!, { orderUnit: factor === 1 ? 'unit' : 'box',
      unitsPerBox: factor, minUnits: min, maxUnits: max, multipleUnits: multiple });
    const validCounts = Array.from({ length: max + 1 }, (_, count) => count).filter(count =>
      count * factor >= min && count * factor <= max && count * factor % multiple === 0);
    if (validCounts.length === 0) expectReason(() => defineVariantQuantityPolicy(source), 'infeasible_rule');
    else {
      expect(defineVariantQuantityPolicy(source).rules).toHaveLength(1);
      for (let count = 0; count <= max + 1; count++) {
        const query = request(); query.lines[0]!.requestedCount = count;
        const result = previewVariantQuantities({ catalog: catalog(), policy: source, request: query }).lines[0]!;
        expect(result.quantityUnits).toBe(count * factor);
        expect(result.outcome === 'satisfied').toBe(validCounts.includes(count));
      }
    }
  });

  it('preserva MAX_SAFE y ceil exacto sin sumar con Number ni redondear la conversión', () => {
    const source = input(); Object.assign(source.policy.rules[0]!, { minUnits: MAX - 1, maxUnits: MAX, multipleUnits: MAX });
    source.request.lines[0]!.requestedCount = MAX;
    expect(previewVariantQuantities(source).lines[0]).toMatchObject({ requestedCount: MAX, quantityUnits: MAX, outcome: 'satisfied' });
    Object.assign(source.policy.rules[0]!, { orderUnit: 'box', unitsPerBox: MAX, minUnits: MAX, multipleUnits: 1 });
    source.request.lines[0]!.requestedCount = 1;
    expect(previewVariantQuantities(source).lines[0]).toMatchObject({ quantityUnits: MAX, outcome: 'satisfied' });
    source.request.lines[0]!.requestedCount = 2;
    expectReason(() => previewVariantQuantities(source), 'quantity_overflow');
    source.request.lines[0]!.requestedCount = MAX;
    expectReason(() => previewVariantQuantities(source), 'quantity_overflow');
  });

  it('LCM superior al rango no se redondea a una configuración aparentemente factible', () => {
    const source = policy(); Object.assign(source.rules[0]!, { orderUnit: 'box', unitsPerBox: 2, minUnits: 1, maxUnits: MAX, multipleUnits: MAX });
    expectReason(() => defineVariantQuantityPolicy(source), 'infeasible_rule');
    Object.assign(source.rules[0]!, { unitsPerBox: MAX, multipleUnits: MAX - 1 });
    expectReason(() => defineVariantQuantityPolicy(source), 'infeasible_rule');
  });

  it('sin regla no inventa unidad ni interpreta cero como eliminación o pedido libre', () => {
    const source = input(); source.policy.rules = [];
    for (const count of [0, 8, MAX]) {
      source.request.lines[0]!.requestedCount = count;
      expect(previewVariantQuantities(source).lines[0]).toEqual({ productId: 1, variantId: 11, requestedCount: count,
        orderUnit: null, unitsPerBox: null, quantityUnits: null, rule: null, outcome: 'blocked', reasons: ['unconfigured'] });
    }
  });

  it('no acepta una elección alternativa de unidad dentro de la petición', () => {
    const source = request(); Object.assign(source.lines[0]!, { orderUnit: 'box' });
    expectReason(() => defineVariantQuantityRequest(source), 'invalid_data');
    for (const patch of [{ orderUnit: 'unit', unitsPerBox: 2 }, { orderUnit: 'box', unitsPerBox: 1 }, { orderUnit: 'pack', unitsPerBox: 6 }]) {
      const candidate = policy(); Object.assign(candidate.rules[0]!, patch);
      expectReason(() => defineVariantQuantityPolicy(candidate), 'invalid_data');
    }
  });
});

describe('referencias completas y ownership antes de evaluar', () => {
  it.each(['policy.ref', 'policy.capturedAt', 'request.ref', 'request.capturedAt', 'request.policyId', 'request.policyVersion'])('rechaza referencia distinta %s', mismatch => {
    const source = input();
    if (mismatch === 'policy.ref') source.policy.catalogRef.ref = 'other.catalog';
    if (mismatch === 'policy.capturedAt') source.policy.catalogRef.capturedAt = '2026-10-03T13:00:00.000Z';
    if (mismatch === 'request.ref') source.request.catalogRef.ref = 'other.catalog';
    if (mismatch === 'request.capturedAt') source.request.catalogRef.capturedAt = '2026-10-03T13:00:00.000Z';
    if (mismatch === 'request.policyId') source.request.policyRef.id = 'other.policy';
    if (mismatch === 'request.policyVersion') source.request.policyRef.version = 4;
    expectReason(() => previewVariantQuantities(source), 'reference_mismatch');
  });

  it('una revisión distinta que cambia unidad no reinterpreta la petición previa', () => {
    const source = input(); source.request.lines[0]!.requestedCount = 2;
    Object.assign(source.policy.rules[0]!, { orderUnit: 'box', unitsPerBox: 6, minUnits: 6, maxUnits: 18 });
    source.policy.version = 4;
    expectReason(() => previewVariantQuantities(source), 'reference_mismatch');
    source.request.policyRef.version = 4;
    expect(previewVariantQuantities(source).lines[0]).toMatchObject({ requestedCount: 2, orderUnit: 'box', quantityUnits: 12, outcome: 'satisfied' });
  });

  it('valida reglas ajenas a la selección, también sin líneas y con count cero', () => {
    for (const lines of [[], [{ productId: 1, variantId: 11, requestedCount: 0 }]]) {
      const source = input(); source.request.lines = lines;
      source.policy.rules.push({ ...rule(), productId: 2, variantId: 21, maxUnits: 7 });
      expectReason(() => previewVariantQuantities(source), 'infeasible_rule');
      source.policy.rules[1]!.maxUnits = 17; source.policy.rules[1]!.variantId = 999;
      expectReason(() => previewVariantQuantities(source), 'unknown_reference');
      source.policy.rules[1]!.variantId = 12;
      expectReason(() => previewVariantQuantities(source), 'cross_product_reference');
      source.policy.rules[1]!.variantId = 21; source.policy.rules[1]!.productId = 999;
      expectReason(() => previewVariantQuantities(source), 'unknown_reference');
    }
  });

  it('el factory permite referencias pendientes pero el preview rechaza producto/variante ajenos', () => {
    const source = input(); source.request.lines[0]!.variantId = 21;
    expect(defineVariantQuantityRequest(source.request).lines[0]!.variantId).toBe(21);
    expectReason(() => previewVariantQuantities(source), 'cross_product_reference');
    source.request.lines[0]!.variantId = 999;
    expectReason(() => previewVariantQuantities(source), 'unknown_reference');
    source.request.lines[0]!.variantId = 11; source.request.lines[0]!.productId = 999;
    expectReason(() => previewVariantQuantities(source), 'unknown_reference');
  });

  it('prohíbe reglas repetidas y múltiples variantes o cantidades por producto, sin sumar ni clampar', () => {
    const duplicateRule = policy(); duplicateRule.rules.push({ ...rule(), productId: 2 });
    expectReason(() => defineVariantQuantityPolicy(duplicateRule), 'duplicate_rule');
    for (const variantId of [11, 12]) {
      const duplicateLine = request(); duplicateLine.lines.push({ productId: 1, variantId, requestedCount: 8 });
      expectReason(() => defineVariantQuantityRequest(duplicateLine), 'duplicate_line');
    }
    const aboveRuntime = input(); Object.assign(aboveRuntime.policy.rules[0]!, { minUnits: 1, maxUnits: 1000, multipleUnits: 1 });
    aboveRuntime.request.lines[0]!.requestedCount = 100;
    expect(previewVariantQuantities(aboveRuntime).lines[0]!.quantityUnits).toBe(100);
    // Es un diagnóstico fixture independiente; no modifica ni llama al runtime que limita a 99.
  });

  it('snapshot completo conserva identidad y rechaza duplicados o propiedad cruzada', () => {
    const duplicateProduct = catalog(); duplicateProduct.products.push(structuredClone(duplicateProduct.products[0]!));
    expectReason(() => defineQuantityCatalogSnapshot(duplicateProduct), 'invalid_data');
    const duplicateVariant = catalog(); duplicateVariant.products[1]!.variants[0]!.id = 11;
    expectReason(() => defineQuantityCatalogSnapshot(duplicateVariant), 'invalid_data');
    const foreign = catalog(); foreign.products[1]!.variants[0]!.productId = 1;
    expectReason(() => defineQuantityCatalogSnapshot(foreign), 'cross_product_reference');
    expectReason(() => defineQuantityCatalogSnapshot({ ...catalog(), currency: 'EUR' }), 'invalid_data');
  });

  it('los artefactos vacíos son válidos sin fabricar un resultado global de compra', () => {
    const source = input(); source.catalog.products = []; source.policy.rules = []; source.request.lines = [];
    expect(previewVariantQuantities(source)).toEqual({ source: 'fixture', catalogRef: CATALOG_REF, policyRef: POLICY_REF,
      requestId: 'request.fixture', lines: [] });
  });
});

describe('límites, inmutabilidad y fronteras hostiles', () => {
  it('comprueba los máximos simultáneos de catálogo/reglas/líneas y sus desbordamientos', () => {
    const source = input();
    source.catalog.products = Array.from({ length: 1000 }, (_, index) => ({ id: index + 1,
      variants: Array.from({ length: 10 }, (_, offset) => ({ id: index * 10 + offset + 1, productId: index + 1 })) }));
    source.policy.rules = source.catalog.products.flatMap(product => product.variants.map(variant => ({ ...rule(), productId: product.id, variantId: variant.id })));
    source.request.lines = source.catalog.products.slice(0, 100).map(product => ({ productId: product.id, variantId: product.variants[0]!.id, requestedCount: 8 }));
    expect(defineQuantityCatalogSnapshot(source.catalog).products).toHaveLength(VARIANT_QUANTITY_LIMITS.products);
    expect(defineVariantQuantityPolicy(source.policy).rules).toHaveLength(VARIANT_QUANTITY_LIMITS.rules);
    expect(previewVariantQuantities(source).lines).toHaveLength(VARIANT_QUANTITY_LIMITS.lines);
    const tooManyVariants = structuredClone(source.catalog); tooManyVariants.products[0]!.variants.push({ id: 10001, productId: 1 });
    expectReason(() => defineQuantityCatalogSnapshot(tooManyVariants), 'invalid_data');
    source.catalog.products.push({ id: 1001, variants: [{ id: 10001, productId: 1001 }] });
    expectReason(() => defineQuantityCatalogSnapshot(source.catalog), 'invalid_data');
    source.policy.rules.push({ ...rule(), productId: 1001, variantId: 10001 });
    expectReason(() => defineVariantQuantityPolicy(source.policy), 'invalid_data');
    source.request.lines.push({ productId: 101, variantId: 1001, requestedCount: 8 });
    expectReason(() => defineVariantQuantityRequest(source.request), 'invalid_data');
    const perProduct = catalog(); perProduct.products = [{ id: 1, variants: Array.from({ length: 100 }, (_, index) => ({ id: index + 1, productId: 1 })) }];
    expect(defineQuantityCatalogSnapshot(perProduct).products[0]!.variants).toHaveLength(100);
    perProduct.products[0]!.variants.push({ id: 101, productId: 1 });
    expectReason(() => defineQuantityCatalogSnapshot(perProduct), 'invalid_data');
  });

  it.each([-0, -1, 0.5, MAX + 1, Infinity, NaN, '1', null])('requestedCount %s no es entero seguro no negativo', requestedCount => {
    const source = request(); Object.assign(source.lines[0]!, { requestedCount });
    expectReason(() => defineVariantQuantityRequest(source), 'invalid_data');
  });

  it('todos los parámetros de regla son enteros positivos seguros y sin coerción', () => {
    for (const key of ['minUnits', 'maxUnits', 'multipleUnits', 'unitsPerBox']) for (const value of [-0, 0, -1, 1.5, MAX + 1, NaN, '4']) {
      const source = policy(); Object.assign(source.rules[0]!, { [key]: value });
      expectReason(() => defineVariantQuantityPolicy(source), 'invalid_data');
    }
    const reversed = policy(); Object.assign(reversed.rules[0]!, { minUnits: 20, maxUnits: 17 });
    expectReason(() => defineVariantQuantityPolicy(reversed), 'invalid_data');
    const invalidProduct = catalog(); invalidProduct.products[0]!.id = 2_147_483_648;
    expectReason(() => defineQuantityCatalogSnapshot(invalidProduct), 'invalid_data');
    const edge = catalog(); edge.products = [{ id: 2_147_483_647, variants: [{ id: MAX, productId: 2_147_483_647 }] }];
    expect(defineQuantityCatalogSnapshot(edge).products[0]!.variants[0]!.id).toBe(MAX);
  });

  it('valida metadata, forma exacta y fechas UTC canónicas sin normalización silenciosa', () => {
    for (const patch of [{ source: 'runtime' }, { schemaVersion: 2 }, { ref: 'Bad Ref' }, { ref: 'a'.repeat(101) },
      { capturedAt: '2026-02-30T12:00:00.000Z' }, { capturedAt: '2026-10-03T12:00:00Z' }, { capturedAt: '2026-10-03T12:00:00.000+00:00' }]) {
      expectReason(() => defineQuantityCatalogSnapshot({ ...catalog(), ...patch }), 'invalid_data');
    }
    expectReason(() => defineVariantQuantityRequest({ ...request(), source: 'fixture' }), 'invalid_data');
    expectReason(() => defineVariantQuantityPolicy({ ...policy(), version: -0 }), 'invalid_data');
    const fields = policy(); Object.assign(fields.rules[0]!, { companyId: 'company.alpha' });
    expectReason(() => defineVariantQuantityPolicy(fields), 'invalid_data');
    expectReason(() => previewVariantQuantities({ ...input(), at: CATALOG_REF.capturedAt }), 'invalid_data');
  });

  it('normaliza permutaciones, copia el contenido y congela todas las salidas', () => {
    const source = input(); source.policy.rules.push({ ...rule(), productId: 2, variantId: 21 });
    source.request.lines.push({ productId: 2, variantId: 21, requestedCount: 12 });
    const baseline = previewVariantQuantities(source);
    source.catalog.products.reverse(); source.catalog.products[2]!.variants.reverse(); source.policy.rules.reverse(); source.request.lines.reverse();
    const result = previewVariantQuantities(source);
    expect(result).toEqual(baseline);
    expect(result.lines.map(line => line.productId)).toEqual([1, 2]);
    source.request.lines[0]!.requestedCount = 0; source.policy.rules[0]!.minUnits = 999;
    expect(result.lines[1]!.requestedCount).toBe(12); expect(result.lines[1]!.rule?.minUnits).toBe(5);
    frozen(result); frozen(defineQuantityCatalogSnapshot(catalog())); frozen(defineVariantQuantityPolicy(policy())); frozen(defineVariantQuantityRequest(request()));
    expect(previewVariantQuantities(Object.assign(Object.create(null), input()))).toEqual(previewVariantQuantities(input()));
  });

  it('rechaza getters, arrays dispersos, prototipos, claves ocultas y símbolos sin ejecutarlos', () => {
    const getter = vi.fn(() => 8);
    const source = request(); Object.defineProperty(source.lines[0]!, 'requestedCount', { enumerable: true, get: getter });
    expectReason(() => defineVariantQuantityRequest(source), 'invalid_data');
    const ruleGetter = policy(); Object.defineProperty(ruleGetter.rules, '0', { enumerable: true, get: getter });
    expectReason(() => defineVariantQuantityPolicy(ruleGetter), 'invalid_data');
    const wrapper = input(); Object.defineProperty(wrapper, 'policy', { enumerable: true, get: getter });
    expectReason(() => previewVariantQuantities(wrapper), 'invalid_data');
    const holes = request(); delete (holes.lines as Array<unknown>)[0];
    expectReason(() => defineVariantQuantityRequest(holes), 'invalid_data');
    const extra = request(); Object.assign(extra.lines, { extra: true });
    expectReason(() => defineVariantQuantityRequest(extra), 'invalid_data');
    for (const value of [Object.assign(Object.create({ inherited: true }), policy()), { ...policy(), [Symbol('hidden')]: true },
      Object.defineProperty(policy(), 'id', { value: POLICY_REF.id, enumerable: false })]) {
      expectReason(() => defineVariantQuantityPolicy(value), 'invalid_data');
    }
    expect(getter).not.toHaveBeenCalled();
  });

  it('redacta errores arbitrarios y no permite mensajes o causas inyectados', () => {
    const proxy = new Proxy({}, { ownKeys() { throw new Error('private:person@example.test'); } });
    const operations = [() => defineQuantityCatalogSnapshot(proxy), () => defineVariantQuantityPolicy(proxy),
      () => defineVariantQuantityRequest(proxy), () => previewVariantQuantities(proxy)];
    for (const call of operations) {
      expectReason(call, 'invalid_data');
      try { call(); } catch (error) { expect(String(error)).not.toContain('person@example.test'); }
    }
    const getter = vi.fn(() => 'quantity_overflow');
    expect(new VariantQuantityContractError(Object.defineProperty({}, 'toString', { get: getter }) as never).reason).toBe('invalid_data');
    expect(getter).not.toHaveBeenCalled();
  });

  it('la identidad neutra no añade moneda, precio, stock, permisos o efectos externos', () => {
    class ExplicitDate extends Date {
      constructor(value?: string | number) { if (value === undefined) throw new Error('Implicit clock'); super(value); }
      static override now(): never { throw new Error('Implicit clock'); }
    }
    const forbidden = vi.fn(() => { throw new Error('Unexpected effect'); });
    vi.stubGlobal('Date', ExplicitDate);
    for (const name of ['fetch', 'setTimeout', 'setInterval']) vi.stubGlobal(name, forbidden);
    for (const name of ['localStorage', 'sessionStorage']) vi.stubGlobal(name, { getItem: forbidden, setItem: forbidden });
    const result = previewVariantQuantities(input());
    expect(result).toEqual(previewVariantQuantities(input()));
    expect(JSON.stringify(result)).not.toMatch(/price|currency|stock|purchasable|grant|total|discount/);
    expect(forbidden).not.toHaveBeenCalled();
  });
});
