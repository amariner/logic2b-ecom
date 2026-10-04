import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COMPANY_QUICK_ORDER_LIMITS, CompanyQuickOrderContractError,
  defineCompanyQuickOrderCatalog, defineCompanyQuickOrderList, previewCompanyQuickOrderList,
  type CompanyQuickOrderCatalog, type CompanyQuickOrderList, type CompanyQuickOrderContractReason,
} from '../src/modules/companies';

const CAPTURED = '2026-10-03T10:00:00.000Z';
const PROFILE = 'company-quick-order-identity-v1';
type Mutable<T> = T extends readonly (infer U)[] ? Mutable<U>[] : T extends object ? { -readonly [K in keyof T]: Mutable<T[K]> } : T;
function copy<T>(value: T): Mutable<T> { return structuredClone(value) as Mutable<T>; }
function catalog(): Mutable<CompanyQuickOrderCatalog> {
  return { schemaVersion: 1, source: 'fixture', profile: PROFILE, ref: 'demo.quick-list.catalog', capturedAt: CAPTURED,
    products: [
      { id: 1, variants: [{ id: 11, productId: 1, sku: 'KIT-A' }, { id: 12, productId: 1, sku: 'KIT-B' }] },
      { id: 2, variants: [{ id: 21, productId: 2, sku: 'DUP' }] },
      { id: 3, variants: [{ id: 31, productId: 3, sku: 'DUP' }] },
      { id: 4, variants: [{ id: 41, productId: 4, sku: 'kit-a' }] },
      { id: 5, variants: [{ id: 51, productId: 5, sku: ' KIT-A' }, { id: 52, productId: 5, sku: 'Á-1' }, { id: 53, productId: 5, sku: 'A\u0301-1' }] },
    ] };
}
function list(): Mutable<CompanyQuickOrderList> {
  return { schemaVersion: 1, source: 'fixture', profile: PROFILE, id: 'demo.quick-list.intent', version: 1, origin: 'structured',
    catalogRef: { ref: 'demo.quick-list.catalog', capturedAt: CAPTURED }, lines: [
      { id: 'line.one', sku: 'KIT-A', quantityUnits: 2 }, { id: 'line.two', sku: 'KIT-A', quantityUnits: 3 },
      { id: 'line.three', sku: 'KIT-B', quantityUnits: 0 }, { id: 'line.four', sku: 'MISSING', quantityUnits: 5 },
      { id: 'line.five', sku: 'DUP', quantityUnits: 4 }, { id: 'line.six', sku: 'kit-a', quantityUnits: Number.MAX_SAFE_INTEGER },
      { id: 'line.seven', sku: ' KIT-A', quantityUnits: 1 }, { id: 'line.eight', sku: 'DUP', quantityUnits: 6 },
      { id: 'line.nine', sku: 'Á-1', quantityUnits: 2 }, { id: 'line.ten', sku: 'A\u0301-1', quantityUnits: 1 },
    ] };
}
function preview(inputCatalog: unknown = catalog(), inputList: unknown = list()) {
  return previewCompanyQuickOrderList({ catalog: inputCatalog, list: inputList });
}
function expectError(operation: () => unknown, reason: CompanyQuickOrderContractReason = 'invalid_data') {
  try { operation(); } catch (error) {
    expect(error).toBeInstanceOf(CompanyQuickOrderContractError);
    expect(error).toMatchObject({ code: 'company_quick_order_contract_invalid', reason });
    expect(error).not.toHaveProperty('cause');
    return error as CompanyQuickOrderContractError;
  }
  throw new Error('Se esperaba un error de contrato.');
}
function assertFrozen(input: unknown): void {
  if (input !== null && typeof input === 'object') { expect(Object.isFrozen(input)).toBe(true); Object.values(input).forEach(assertFrozen); }
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('lista de intención y resolución de identidad', () => {
  it('preserves the ten-row intention and returns identities without selecting ambiguous candidates', () => {
    const input = list(); const result = preview(catalog(), input);
    expect(result.list.lines).toEqual(input.lines);
    expect(result.lines.map(row => [row.position, row.line.id, row.outcome, row.reason, row.matchCount, row.identity])).toEqual([
      [1, 'line.one', 'resolved', null, 1, { productId: 1, variantId: 11 }],
      [2, 'line.two', 'resolved', null, 1, { productId: 1, variantId: 11 }],
      [3, 'line.three', 'resolved', null, 1, { productId: 1, variantId: 12 }],
      [4, 'line.four', 'unresolved', 'sku_not_found', 0, null],
      [5, 'line.five', 'unresolved', 'sku_ambiguous', 2, null],
      [6, 'line.six', 'resolved', null, 1, { productId: 4, variantId: 41 }],
      [7, 'line.seven', 'resolved', null, 1, { productId: 5, variantId: 51 }],
      [8, 'line.eight', 'unresolved', 'sku_ambiguous', 2, null],
      [9, 'line.nine', 'resolved', null, 1, { productId: 5, variantId: 52 }],
      [10, 'line.ten', 'resolved', null, 1, { productId: 5, variantId: 53 }],
    ]);
    expect(result.lines.map(row => row.diagnostics)).toEqual([
      [{ code: 'repeated_sku', relatedLineIds: ['line.two'] }, { code: 'multiple_variants_for_product', relatedLineIds: ['line.two', 'line.three'] }],
      [{ code: 'repeated_sku', relatedLineIds: ['line.one'] }, { code: 'multiple_variants_for_product', relatedLineIds: ['line.one', 'line.three'] }],
      [{ code: 'multiple_variants_for_product', relatedLineIds: ['line.one', 'line.two'] }], [],
      [{ code: 'repeated_sku', relatedLineIds: ['line.eight'] }], [],
      [{ code: 'multiple_variants_for_product', relatedLineIds: ['line.nine', 'line.ten'] }],
      [{ code: 'repeated_sku', relatedLineIds: ['line.five'] }],
      [{ code: 'multiple_variants_for_product', relatedLineIds: ['line.seven', 'line.ten'] }],
      [{ code: 'multiple_variants_for_product', relatedLineIds: ['line.seven', 'line.nine'] }],
    ]);
    expect(Object.keys(result).sort()).toEqual(['catalog', 'lines', 'list', 'profile', 'source']);
    assertFrozen(result);
  });

  it('canonicalizes only the catalog; a new row order retains its own positions and related row order', () => {
    const source = catalog(); source.products.reverse().forEach(product => product.variants.reverse());
    expect(preview(source)).toEqual(preview());
    const input = list(); input.lines.reverse();
    const result = preview(source, input);
    expect(result.list.lines).toEqual(input.lines);
    expect(result.lines[0]).toMatchObject({ position: 1, line: { id: 'line.ten' },
      diagnostics: [{ code: 'multiple_variants_for_product', relatedLineIds: ['line.nine', 'line.seven'] }] });
    expect(result.lines[9]).toMatchObject({ position: 10, line: { id: 'line.one' }, diagnostics: [
      { code: 'repeated_sku', relatedLineIds: ['line.two'] }, { code: 'multiple_variants_for_product', relatedLineIds: ['line.three', 'line.two'] },
    ] });
  });

  it('diagnoses repeated missing and ambiguous SKUs without assigning a product to them', () => {
    const input = list(); input.lines = [
      { id: 'missing.one', sku: 'MISSING', quantityUnits: 0 }, { id: 'ambiguous.one', sku: 'DUP', quantityUnits: 2 },
      { id: 'missing.two', sku: 'MISSING', quantityUnits: 3 }, { id: 'ambiguous.two', sku: 'DUP', quantityUnits: 4 },
    ];
    const result = preview(catalog(), input);
    expect(result.lines.map(row => row.diagnostics)).toEqual([
      [{ code: 'repeated_sku', relatedLineIds: ['missing.two'] }], [{ code: 'repeated_sku', relatedLineIds: ['ambiguous.two'] }],
      [{ code: 'repeated_sku', relatedLineIds: ['missing.one'] }], [{ code: 'repeated_sku', relatedLineIds: ['ambiguous.one'] }],
    ]);
    expect(result.lines.every(row => row.identity === null)).toBe(true);
  });

  it('does not call repeated copies of one resolved variant multiple distinct variants', () => {
    const input = list(); input.lines = input.lines.slice(0, 2);
    expect(preview(catalog(), input).lines.every(row => row.diagnostics.length === 1 && row.diagnostics[0]!.code === 'repeated_sku')).toBe(true);
  });

  it('retains same-product collisions without choosing a first variant or treating them as resolved peers', () => {
    const source = catalog(); source.products[0]!.variants[1]!.sku = 'KIT-A';
    const result = preview(source);
    expect(result.lines[0]).toMatchObject({ outcome: 'unresolved', reason: 'sku_ambiguous', matchCount: 2, identity: null,
      diagnostics: [{ code: 'repeated_sku', relatedLineIds: ['line.two'] }] });
    expect(result.lines[2]).toMatchObject({ reason: 'sku_not_found', diagnostics: [] });
  });

  it('preserves zero and multiple MAX_SAFE quantities with no aggregate, correction or removal', () => {
    const input = list(); input.lines = [
      { id: 'zero', sku: 'KIT-A', quantityUnits: 0 },
      { id: 'large.one', sku: 'KIT-A', quantityUnits: Number.MAX_SAFE_INTEGER },
      { id: 'large.two', sku: 'KIT-B', quantityUnits: Number.MAX_SAFE_INTEGER },
    ];
    const result = preview(catalog(), input);
    expect(result.lines.map(row => row.line.quantityUnits)).toEqual([0, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]);
    expect(result.lines.every(row => row.outcome === 'resolved')).toBe(true);
    for (const key of ['total', 'quantityTotal', 'eligible', 'visible', 'available', 'price', 'ready']) expect(result).not.toHaveProperty(key);
  });

  it('accepts empty intent and empty declared catalog, but still requires full reference equality', () => {
    const source = catalog(); source.products = [];
    const input = list(); input.lines = [];
    expect(preview(source, input).lines).toEqual([]);
    expect(preview(source, list()).lines.every(row => row.reason === 'sku_not_found')).toBe(true);
    input.catalogRef.ref = 'catalog.other';
    expectError(() => preview(source, input), 'reference_mismatch');
  });

  it('treats ref/date as declared metadata, not a content fingerprint or evidence of freshness', () => {
    const source = catalog(); source.products[0]!.variants[0]!.sku = 'NEW';
    expect(preview(source).lines[0]!.reason).toBe('sku_not_found');
    const input = list(); input.version = Number.MAX_SAFE_INTEGER;
    source.capturedAt = input.catalogRef.capturedAt = '0000-02-29T00:00:00.000Z';
    expect(preview(source, input).catalog.capturedAt).toBe('0000-02-29T00:00:00.000Z');
  });
});

describe('literal SKU profile', () => {
  it.each(['KIT-A', 'kit-a', ' KIT-A', 'KIT-A ', 'Á-1', 'A\u0301-1', '=A1+1', '__proto__', 'constructor', 'https://fixture.test/item', '𐐀'.repeat(50), 'x'.repeat(100)])(
    'preserves exact SKU %j in both the snapshot and the input', literal => {
      const source = catalog(); source.products = [{ id: 1, variants: [{ id: 11, productId: 1, sku: literal }] }];
      const input = list(); input.lines = [{ id: 'literal', sku: literal, quantityUnits: 1 }];
      const result = preview(source, input);
      expect(result.lines[0]).toMatchObject({ outcome: 'resolved', line: { sku: literal }, identity: { productId: 1, variantId: 11 } });
      expect(result.catalog.products[0]!.variants[0]!.sku).toBe(literal);
    },
  );

  it.each(['', ' ', '\u0301', ' \u0301 ', 'x'.repeat(101), '𐐀'.repeat(50) + 'x', '\ud800', '\udfff', 'A\n', 'A\t', 'A\u0000',
    'A\u00a0', 'A\u2028', 'A\u200b', 'A\u034f', 'A\ufe0f', 'A\u3164', 'A\u202e'])('rejects invalid literal %j in catalog and list alike', literal => {
    const source = catalog(); source.products[0]!.variants[0]!.sku = literal;
    const input = list(); input.lines[0]!.sku = literal;
    expectError(() => defineCompanyQuickOrderCatalog(source));
    expectError(() => defineCompanyQuickOrderList(input));
  });

  it('never performs trim, case folding, Unicode normalization, numeric coercion or prefix matching', () => {
    const source = catalog(); source.products = [{ id: 1, variants: [{ id: 11, productId: 1, sku: 'A-1' }] }];
    const input = list(); input.lines = ['a-1', ' A-1', 'A-1 ', 'A', 'A-01'].map((sku, index) => ({ id: `line.${index}`, sku, quantityUnits: 1 }));
    expect(preview(source, input).lines.every(row => row.reason === 'sku_not_found')).toBe(true);
    expectError(() => defineCompanyQuickOrderList({ ...input, lines: [{ id: 'line', sku: 42, quantityUnits: 1 }] }));
  });
});

describe('complete validation and bounds', () => {
  it('rejects duplicate identities and cross-product ownership even when no row requests them', () => {
    const input = list(); input.lines = [];
    const duplicateProduct = catalog(); duplicateProduct.products.push(copy(duplicateProduct.products[0]!));
    expectError(() => preview(duplicateProduct, input), 'duplicate_product');
    const duplicateVariant = catalog(); duplicateVariant.products[4]!.variants[0]!.id = 11;
    expectError(() => preview(duplicateVariant, input), 'duplicate_variant');
    const foreign = catalog(); foreign.products[4]!.variants[0]!.productId = 1;
    expectError(() => preview(foreign, input), 'cross_product_reference');
    const repeated = list(); repeated.lines[9]!.id = repeated.lines[0]!.id;
    expectError(() => defineCompanyQuickOrderList(repeated), 'duplicate_line_id');
  });

  it('validates all shapes before mismatched refs and diagnostics', () => {
    const source = catalog(); const input = list(); input.catalogRef.ref = 'other';
    source.products[4]!.variants[0]!.sku = '';
    expectError(() => preview(source, input));
    const duplicate = list(); duplicate.catalogRef.ref = 'other'; duplicate.lines[1]!.id = duplicate.lines[0]!.id;
    expectError(() => preview(catalog(), duplicate), 'duplicate_line_id');
    for (const catalogRef of [{ ref: 'other', capturedAt: CAPTURED }, { ref: 'demo.quick-list.catalog', capturedAt: '2026-10-03T10:00:01.000Z' }]) {
      expectError(() => preview(catalog(), { ...list(), catalogRef }), 'reference_mismatch');
    }
  });

  it.each([-0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN, '2', null])('rejects noncanonical quantity %j', quantityUnits => {
    expectError(() => defineCompanyQuickOrderList({ ...list(), lines: [{ id: 'line', sku: 'KIT-A', quantityUnits }] }));
  });

  it('uses explicit product/variant/version/id bounds instead of legacy quantity or price limits', () => {
    const source = catalog(); source.products = [{ id: 2_147_483_647, variants: [{ id: Number.MAX_SAFE_INTEGER, productId: 2_147_483_647, sku: 'MAX' }] }];
    const input = list(); input.id = 'a'.repeat(100); input.version = Number.MAX_SAFE_INTEGER;
    input.lines = [{ id: 'z'.repeat(100), sku: 'MAX', quantityUnits: 10_001 }];
    expect(preview(source, input).lines[0]!.identity).toEqual({ productId: 2_147_483_647, variantId: Number.MAX_SAFE_INTEGER });
    for (const value of [0, -0, 2_147_483_648]) expectError(() => defineCompanyQuickOrderCatalog({ ...source, products: [{ ...source.products[0], id: value }] }));
    for (const value of [0, -0, Number.MAX_SAFE_INTEGER + 1]) {
      expectError(() => defineCompanyQuickOrderList({ ...input, version: value }));
      expectError(() => defineCompanyQuickOrderCatalog({ ...source, products: [{ id: 1, variants: [{ id: value, productId: 1, sku: 'MAX' }] }] }));
    }
    for (const value of ['', 'a'.repeat(101), 'Company', 'a..b', 'a/b', 'a\n', '__proto__']) expectError(() => defineCompanyQuickOrderList({ ...input, id: value }));
  });

  it.each(['2026-02-30T00:00:00.000Z', '1900-02-29T00:00:00.000Z', '2026-10-03T10:00:00Z', '2026-10-03T10:00:00.000+00:00', '+010000-01-01T00:00:00.000Z'])('rejects a noncanonical catalog timestamp %s on both sides', capturedAt => {
    expectError(() => defineCompanyQuickOrderCatalog({ ...catalog(), capturedAt }));
    expectError(() => defineCompanyQuickOrderList({ ...list(), catalogRef: { ref: 'catalog', capturedAt } }));
  });

  it('handles all maxima together, preserving 100 repeated intentions without duplicating 10000 candidates per row', () => {
    const source = catalog(); let nextVariant = 1;
    source.products = Array.from({ length: 1000 }, (_, index) => ({ id: index + 1,
      variants: Array.from({ length: index < 90 ? 100 : index === 90 ? 91 : 1 }, () => ({ id: nextVariant++, productId: index + 1, sku: 'COLLISION' })) }));
    expect(nextVariant).toBe(10001);
    const input = list(); input.lines = Array.from({ length: 100 }, (_, index) => ({ id: `line.${index}`, sku: 'COLLISION', quantityUnits: Number.MAX_SAFE_INTEGER }));
    const result = preview(source, input);
    expect(result.catalog.products).toHaveLength(1000); expect(result.lines).toHaveLength(100);
    for (const row of result.lines) {
      expect(row).toMatchObject({ outcome: 'unresolved', reason: 'sku_ambiguous', matchCount: 10000, identity: null });
      expect(row.diagnostics).toHaveLength(1); expect(row.diagnostics[0]!.relatedLineIds).toHaveLength(99);
      expect(Object.keys(row).sort()).toEqual(['diagnostics', 'identity', 'line', 'matchCount', 'outcome', 'position', 'reason']);
    }
    expectError(() => defineCompanyQuickOrderList({ ...input, lines: [...input.lines, { id: 'overflow', sku: 'COLLISION', quantityUnits: 1 }] }));
    source.products[999]!.variants.push({ id: 10001, productId: 1000, sku: 'COLLISION' });
    expectError(() => defineCompanyQuickOrderCatalog(source));
  });

  it('enforces independent array limits and requires a variant for every declared product', () => {
    const source = catalog(); source.products = Array.from({ length: 1001 }, (_, index) => ({ id: index + 1, variants: [{ id: index + 1, productId: index + 1, sku: 'X' }] }));
    expectError(() => defineCompanyQuickOrderCatalog(source));
    source.products = [{ id: 1, variants: Array.from({ length: 101 }, (_, index) => ({ id: index + 1, productId: 1, sku: 'X' })) }];
    expectError(() => defineCompanyQuickOrderCatalog(source));
    source.products[0]!.variants = [];
    expectError(() => defineCompanyQuickOrderCatalog(source));
    expect(Object.isFrozen(COMPANY_QUICK_ORDER_LIMITS)).toBe(true);
  });
});

describe('strict unknown boundaries, immutable data and pure evaluation', () => {
  it('rejects extensions instead of assigning money, lifecycle, defaults or identities to the intent', () => {
    expectError(() => defineCompanyQuickOrderCatalog({ ...catalog(), currency: 'EUR' }));
    expectError(() => defineCompanyQuickOrderList({ ...list(), origin: 'csv' }));
    for (const extra of [{ status: 'active' }, { isDefault: true }, { priceCents: 1000 }, { stock: 10 }]) {
      const source = catalog(); source.products[4]!.variants[0] = { ...source.products[4]!.variants[0]!, ...extra };
      expectError(() => preview(source));
    }
    expectError(() => defineCompanyQuickOrderList({ ...list(), lines: [{ ...list().lines[0], variantId: 11 }] }));
    expectError(() => previewCompanyQuickOrderList({ catalog: catalog(), list: list(), result: {} }));
  });

  it('rejects accessors at each boundary without invoking them', () => {
    let calls = 0;
    const getter = () => { calls++; throw new Error('private-sku'); };
    const source = catalog(); Object.defineProperty(source.products[4]!.variants[0]!, 'sku', { enumerable: true, get: getter });
    const input = list(); Object.defineProperty(input.lines[0]!, 'quantityUnits', { enumerable: true, get: getter });
    const wrapper = { catalog: catalog(), list: list() }; Object.defineProperty(wrapper, 'catalog', { enumerable: true, get: getter });
    expectError(() => defineCompanyQuickOrderCatalog(source)); expectError(() => defineCompanyQuickOrderList(input));
    expectError(() => previewCompanyQuickOrderList(wrapper));
    const arrayInput = list(); Object.defineProperty(arrayInput.lines, '0', { enumerable: true, get: getter });
    expectError(() => defineCompanyQuickOrderList(arrayInput));
    expect(calls).toBe(0);
  });

  it('requires exact plain own-data records and dense ordinary arrays', () => {
    expectError(() => defineCompanyQuickOrderList(Object.assign(Object.create({ inherited: true }), list())));
    const symbolInput = list(); Object.defineProperty(symbolInput, Symbol('extra'), { value: true });
    expectError(() => defineCompanyQuickOrderList(symbolInput));
    const hiddenInput = list(); Object.defineProperty(hiddenInput, 'id', { value: hiddenInput.id, enumerable: false });
    expectError(() => defineCompanyQuickOrderList(hiddenInput));
    const sparse = list(); delete sparse.lines[1]; expectError(() => defineCompanyQuickOrderList(sparse));
    const extra = list(); Object.defineProperty(extra.lines, 'extra', { value: true }); expectError(() => defineCompanyQuickOrderList(extra));
    const arrayPrototype = list(); Object.setPrototypeOf(arrayPrototype.lines, null); expectError(() => defineCompanyQuickOrderList(arrayPrototype));
    const validNull = Object.assign(Object.create(null), list());
    expect(defineCompanyQuickOrderList(validNull)).toEqual(defineCompanyQuickOrderList(list()));
  });

  it('returns only detached deeply frozen copies and captures catalog before later input introspection', () => {
    const source = catalog(); const input = list(); const result = preview(source, input);
    source.products[0]!.variants[0]!.sku = 'MUTATED'; input.lines[0]!.quantityUnits = 0;
    expect(result.catalog.products[0]!.variants[0]!.sku).toBe('KIT-A'); expect(result.lines[0]!.line.quantityUnits).toBe(2);
    assertFrozen(result); expect(result.list).not.toBe(input); expect(result.catalog).not.toBe(source);
    const original = catalog(); const expected = preview(original);
    const late = new Proxy(list(), { ownKeys(target) {
      original.products[0]!.variants[0]!.sku = 'LATE'; original.ref = 'late'; return Reflect.ownKeys(target);
    } });
    expect(preview(original, late)).toEqual(expected);
  });

  it('redacts arbitrary Proxy errors and hostile error.reason accessors', () => {
    let calls = 0;
    const hostileError = new CompanyQuickOrderContractError('invalid_data');
    Object.defineProperty(hostileError, 'reason', { get() { calls++; throw new Error('private-ref'); } });
    for (const thrown of [new Error('private-sku'), hostileError, new Proxy({}, { getPrototypeOf() { throw new Error('private-ref'); } })]) {
      const input = new Proxy(list(), { ownKeys() { throw thrown; } });
      const error = expectError(() => defineCompanyQuickOrderList(input));
      expect(error.message).toBe('Los datos no cumplen el contrato de lista rápida de identidad.');
      expect(error.stack).not.toContain('private-sku'); expect(error.stack).not.toContain('private-ref');
    }
    expect(calls).toBe(0);
    expect(new CompanyQuickOrderContractError('__proto__' as CompanyQuickOrderContractReason).reason).toBe('invalid_data');
  });

  it('uses only explicitly supplied capture dates and has no clock, IO, storage or timers', () => {
    const fail = vi.fn(() => { throw new Error('Unexpected effect'); });
    for (const key of ['fetch', 'setTimeout', 'setInterval', 'localStorage', 'sessionStorage', 'crypto']) vi.stubGlobal(key, fail);
    const NativeDate = Date;
    vi.stubGlobal('Date', new Proxy(NativeDate, {
      construct(target, args) { if (args.length !== 1 || typeof args[0] !== 'string') return fail(); return Reflect.construct(target, args); },
      apply() { return fail(); }, get(target, key, receiver) { if (key === 'now') return fail; return Reflect.get(target, key, receiver); },
    }));
    expect(preview().lines).toHaveLength(10);
    expect(fail).not.toHaveBeenCalled();
  });
});
