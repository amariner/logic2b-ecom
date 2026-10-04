import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COMPANY_QUICK_ORDER_HISTORY_LIMITS, CompanyQuickOrderHistoryContractError,
  defineCompanyQuickOrderHistory, previewCompanyQuickOrderHistory,
  type CompanyQuickOrderHistory, type CompanyQuickOrderCatalog, type CompanyQuickOrderHistoryContractReason,
} from '../src/modules/companies';
import * as quickOrder from '../src/modules/companies/domain/company-quick-order';

type Mutable<T> = T extends readonly (infer U)[] ? Mutable<U>[] : T extends object ? { -readonly [K in keyof T]: Mutable<T[K]> } : T;
function copy<T>(value: T): Mutable<T> { return structuredClone(value) as Mutable<T>; }
function origin(): Mutable<CompanyQuickOrderCatalog> {
  return { schemaVersion: 1, source: 'fixture', profile: 'company-quick-order-identity-v1', ref: 'demo.history.origin',
    capturedAt: '2026-10-01T10:00:00.000Z', products: [
      { id: 1, variants: [[11, 'KEEP'], [12, 'RENAME'], [13, 'GONE'], [14, 'RECYCLE'], [15, 'MOVE-OLD'], [16, 'SHARED'], [17, 'FOREIGN'],
        [18, 'ORIGIN-COLLISION'], [19, 'ORIGIN-COLLISION']].map(([id, sku]) => ({ id: id as number, productId: 1, sku: sku as string })) },
      { id: 2, variants: [{ id: 21, productId: 2, sku: 'UNDECLARED' }] },
    ] };
}
function compared(): Mutable<CompanyQuickOrderCatalog> {
  return { schemaVersion: 1, source: 'fixture', profile: 'company-quick-order-identity-v1', ref: 'demo.history.compared',
    capturedAt: '2026-10-03T10:00:00.000Z', products: [
      { id: 1, variants: [[11, 'KEEP'], [12, 'RENAME-NEW'], [15, 'MOVE-NEW'], [16, 'SHARED'], [18, 'ORIGIN-COLLISION'], [19, 'ORIGIN-COLLISION']]
        .map(([id, sku]) => ({ id: id as number, productId: 1, sku: sku as string })) },
      { id: 2, variants: [{ id: 21, productId: 2, sku: 'UNDECLARED' }] },
      { id: 9, variants: [[17, 'FOREIGN'], [95, 'MOVE-OLD'], [96, 'SHARED'], [99, 'RECYCLE']]
        .map(([id, sku]) => ({ id: id as number, productId: 9, sku: sku as string })) },
    ] };
}
function history(): Mutable<CompanyQuickOrderHistory> {
  const originCatalog = origin();
  const rows: Array<[string, string, number, number | null]> = [
    ['same', 'KEEP', 2, 11], ['renamed', 'RENAME', 3, 12], ['missing', 'GONE', 1, 13], ['reused', 'RECYCLE', 4, 14],
    ['renamed-reused', 'MOVE-OLD', 5, 15], ['ambiguous', 'SHARED', 6, 16], ['undeclared', 'UNDECLARED', 7, null],
    ['zero', 'KEEP', 0, 11], ['large', 'KEEP', Number.MAX_SAFE_INTEGER, 11], ['other-owner', 'FOREIGN', 1, 17],
    ['origin-collision', 'ORIGIN-COLLISION', 2, 18], ['undeclared-absent', 'ABSENT-IN-ORIGIN', 3, null],
  ];
  return { schemaVersion: 1, source: 'fixture', profile: 'company-quick-order-history-v1', id: 'demo.quick-history', version: 2,
    originCatalogRef: { ref: originCatalog.ref, capturedAt: originCatalog.capturedAt }, originCatalog,
    lines: rows.map(([id, sku, quantityUnits, variantId]) => ({ id: `line.${id}`, sku, quantityUnits,
      identity: variantId === null ? null : { productId: 1, variantId } })) };
}
function preview(value: unknown = history(), catalog: unknown = compared()) {
  return previewCompanyQuickOrderHistory({ history: value, comparedCatalog: catalog, identityRelation: 'same_declared_space' });
}
function expectError(operation: () => unknown, reason: CompanyQuickOrderHistoryContractReason = 'invalid_data') {
  try { operation(); } catch (error) {
    expect(error).toBeInstanceOf(CompanyQuickOrderHistoryContractError);
    expect(error).toMatchObject({ code: 'company_quick_order_history_contract_invalid', reason });
    expect(error).not.toHaveProperty('cause');
    return error as CompanyQuickOrderHistoryContractError;
  }
  throw new Error('Se esperaba un error de contrato.');
}
function assertFrozen(value: unknown): void {
  if (value !== null && typeof value === 'object') { expect(Object.isFrozen(value)).toBe(true); Object.values(value).forEach(assertFrozen); }
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('identidad histórica explícita y comparación independiente del SKU', () => {
  it('preserves all twelve rows and compares the declared tuple without retargeting it to a textual match', () => {
    const input = history(); const result = preview(input);
    expect(result.history.lines).toEqual(input.lines);
    expect(result.lines.map(row => [row.position, row.line.id, row.identityComparison])).toEqual([
      [1, 'line.same', { outcome: 'found', comparedSku: 'KEEP', skuRelation: 'same' }],
      [2, 'line.renamed', { outcome: 'found', comparedSku: 'RENAME-NEW', skuRelation: 'different' }],
      [3, 'line.missing', { outcome: 'not_found', comparedSku: null, skuRelation: null }],
      [4, 'line.reused', { outcome: 'not_found', comparedSku: null, skuRelation: null }],
      [5, 'line.renamed-reused', { outcome: 'found', comparedSku: 'MOVE-NEW', skuRelation: 'different' }],
      [6, 'line.ambiguous', { outcome: 'found', comparedSku: 'SHARED', skuRelation: 'same' }],
      [7, 'line.undeclared', { outcome: 'not_provided', comparedSku: null, skuRelation: null }],
      [8, 'line.zero', { outcome: 'found', comparedSku: 'KEEP', skuRelation: 'same' }],
      [9, 'line.large', { outcome: 'found', comparedSku: 'KEEP', skuRelation: 'same' }],
      [10, 'line.other-owner', { outcome: 'not_found', comparedSku: null, skuRelation: null }],
      [11, 'line.origin-collision', { outcome: 'found', comparedSku: 'ORIGIN-COLLISION', skuRelation: 'same' }],
      [12, 'line.undeclared-absent', { outcome: 'not_provided', comparedSku: null, skuRelation: null }],
    ]);
    expect(result.lines.map(row => [row.skuComparison.outcome, row.skuComparison.reason, row.skuComparison.matchCount,
      row.skuComparison.identity, row.skuComparison.relationToHistoricalIdentity])).toEqual([
      ['resolved', null, 1, { productId: 1, variantId: 11 }, 'same'],
      ['unresolved', 'sku_not_found', 0, null, null], ['unresolved', 'sku_not_found', 0, null, null],
      ['resolved', null, 1, { productId: 9, variantId: 99 }, 'different'],
      ['resolved', null, 1, { productId: 9, variantId: 95 }, 'different'],
      ['unresolved', 'sku_ambiguous', 2, null, null],
      ['resolved', null, 1, { productId: 2, variantId: 21 }, 'not_provided'],
      ['resolved', null, 1, { productId: 1, variantId: 11 }, 'same'],
      ['resolved', null, 1, { productId: 1, variantId: 11 }, 'same'],
      ['resolved', null, 1, { productId: 9, variantId: 17 }, 'different'],
      ['unresolved', 'sku_ambiguous', 2, null, null], ['unresolved', 'sku_not_found', 0, null, null],
    ]);
    expect(result.lines[3]!.line.identity).toEqual({ productId: 1, variantId: 14 });
    expect(result.lines[9]!.line.identity).toEqual({ productId: 1, variantId: 17 });
    expect(Object.keys(result).sort()).toEqual(['comparedCatalog', 'history', 'identityRelation', 'lines', 'profile', 'source']);
    expect(JSON.stringify(result)).not.toContain('"origin":"structured"');
    assertFrozen(result);
  });

  it('never fills a missing historical tuple, even with a unique match in origin and comparison', () => {
    const input = history(); input.lines = [input.lines[6]!, input.lines[11]!];
    const result = preview(input);
    expect(result.history.lines.every(line => line.identity === null)).toBe(true);
    expect(result.lines.map(row => row.identityComparison.outcome)).toEqual(['not_provided', 'not_provided']);
    expect(result.lines[0]!.skuComparison).toMatchObject({ outcome: 'resolved', identity: { productId: 2, variantId: 21 }, relationToHistoricalIdentity: 'not_provided' });
    expect(result.lines[1]!.skuComparison.reason).toBe('sku_not_found');
  });

  it('permits an explicit historical identity when its origin SKU collides, without choosing ambiguous current candidates', () => {
    const input = history(); input.lines = [input.lines[10]!];
    expect(defineCompanyQuickOrderHistory(input).lines[0]!.identity).toEqual({ productId: 1, variantId: 18 });
    const row = preview(input).lines[0]!;
    expect(row.identityComparison.outcome).toBe('found');
    expect(row.skuComparison).toEqual({ outcome: 'unresolved', reason: 'sku_ambiguous', matchCount: 2, identity: null, relationToHistoricalIdentity: null });
  });

  it('does not interpret references or time as proof of shared IDs, chronology or current validity', () => {
    const input = history(); const target = compared();
    target.ref = input.originCatalog.ref; target.capturedAt = input.originCatalog.capturedAt;
    expect(preview(input, target).lines[1]!.identityComparison.skuRelation).toBe('different');
    target.ref = 'catalog.before'; target.capturedAt = '0000-02-29T00:00:00.000Z';
    expect(preview(input, target).comparedCatalog.capturedAt).toBe('0000-02-29T00:00:00.000Z');
    for (const identityRelation of [undefined, null, 'not_declared', 'same', true]) {
      expectError(() => previewCompanyQuickOrderHistory({ history: input, comparedCatalog: target, identityRelation }));
    }
    expectError(() => previewCompanyQuickOrderHistory({ history: input, comparedCatalog: target }));
  });

  it('preserves zero, repeated tuples and multiple MAX_SAFE intentions without totals or an adapted list', () => {
    const input = history(); input.lines = [input.lines[7]!, input.lines[8]!, { ...input.lines[8]!, id: 'line.large-again' }];
    const result = preview(input);
    expect(result.lines.map(row => row.line.quantityUnits)).toEqual([0, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]);
    for (const key of ['list', 'newList', 'total', 'ready', 'eligible', 'available', 'currentQuantity', 'order']) expect(result).not.toHaveProperty(key);
    expect(result.history.lines).toEqual(input.lines);
  });

  it('canonicalizes each catalog internally while keeping historical row order and catalog roles distinct', () => {
    const input = history(); const target = compared(); const expected = preview(input, target);
    input.originCatalog.products.reverse().forEach(product => product.variants.reverse());
    target.products.reverse().forEach(product => product.variants.reverse());
    expect(preview(input, target)).toEqual(expected);
    input.lines.reverse(); const reversed = preview(input, target);
    expect(reversed.lines.map(row => row.line.id)).toEqual([...expected.lines].reverse().map(row => row.line.id));
    expect(reversed.lines.map(row => row.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(preview(history(), origin()).lines[2]!.identityComparison.outcome).toBe('found');
    expect(expected.lines[2]!.identityComparison.outcome).toBe('not_found');
  });

  it('uses real catalog/list normalizers solely for source validation, never an automatic target list or SKU inference', () => {
    const catalogNormalizer = vi.spyOn(quickOrder, 'defineCompanyQuickOrderCatalog');
    const listNormalizer = vi.spyOn(quickOrder, 'defineCompanyQuickOrderList');
    const skuPreview = vi.spyOn(quickOrder, 'previewCompanyQuickOrderList');
    const input = history(); const result = preview(input);
    expect(catalogNormalizer).toHaveBeenCalledTimes(2); expect(listNormalizer).toHaveBeenCalledTimes(1); expect(skuPreview).not.toHaveBeenCalled();
    expect(listNormalizer.mock.calls[0]![0]).toMatchObject({ id: input.id, version: input.version, catalogRef: input.originCatalogRef,
      lines: input.lines.map(({ id, sku, quantityUnits }) => ({ id, sku, quantityUnits })) });
    expect(result.history.originCatalog).toBe(catalogNormalizer.mock.results[0]!.value);
    expect(result.comparedCatalog).toBe(catalogNormalizer.mock.results[1]!.value);
  });
});

describe('correlación íntegra del origen y validación previa a diagnósticos', () => {
  it.each([
    [{ productId: 999, variantId: 11 }, 'unknown_origin_identity'],
    [{ productId: 1, variantId: 999 }, 'unknown_origin_identity'],
    [{ productId: 2, variantId: 11 }, 'cross_product_reference'],
  ] as const)('rejects an inconsistent declared tuple %j without looking up a replacement', (identity, reason) => {
    const input = history(); input.lines[0]!.identity = identity;
    expectError(() => preview(input), reason);
  });

  it('requires the historical SKU to equal the explicit origin identity literally, not the compared SKU', () => {
    const input = history(); input.lines[1]!.sku = 'RENAME-NEW';
    expectError(() => preview(input), 'origin_sku_mismatch');
    input.lines[1]!.sku = 'rename'; expectError(() => defineCompanyQuickOrderHistory(input), 'origin_sku_mismatch');
    input.lines[1]!.sku = 'RENAME '; expectError(() => defineCompanyQuickOrderHistory(input), 'origin_sku_mismatch');
  });

  it('correlates both origin reference fields even with an empty or wholly unidentified history', () => {
    for (const lines of [[], history().lines.map(line => ({ ...line, identity: null }))]) {
      for (const originCatalogRef of [{ ref: 'other', capturedAt: origin().capturedAt }, { ref: origin().ref, capturedAt: '2026-10-01T11:00:00.000Z' }]) {
        expectError(() => preview({ ...history(), lines, originCatalogRef }), 'origin_reference_mismatch');
      }
    }
    const input = history(); input.lines = [];
    expect(preview(input, { ...compared(), products: [] }).lines).toEqual([]);
    input.originCatalogRef.capturedAt = input.originCatalog.capturedAt = '0000-02-29T00:00:00.000Z';
    expect(defineCompanyQuickOrderHistory(input).originCatalogRef.capturedAt).toBe('0000-02-29T00:00:00.000Z');
  });

  it('validates corrupt unselected origin and comparison records, including histories with no usable identity', () => {
    for (const lines of [[], history().lines.map(line => ({ ...line, identity: null }))]) {
      const input = history(); input.lines = lines;
      input.originCatalog.products[1]!.variants[0]!.productId = 1;
      expectError(() => preview(input));
      const target = compared(); target.products[2]!.variants[0]!.sku = '';
      expectError(() => preview({ ...history(), lines }, target));
    }
    const input = history(); input.lines[11]!.identity = { productId: 1, variantId: 999 };
    expectError(() => preview(input), 'unknown_origin_identity');
    const duplicateVariant = history(); duplicateVariant.originCatalog.products[1]!.variants[0]!.id = 11;
    expectError(() => preview(duplicateVariant));
  });

  it('applies validation and reference precedence before comparing even when the other catalog is corrupt', () => {
    const input = history(); input.originCatalogRef.ref = 'other'; input.lines[0]!.identity = { productId: 1, variantId: 999 };
    expectError(() => preview(input, null), 'origin_reference_mismatch');
    input.lines[1]!.id = input.lines[0]!.id;
    expectError(() => preview(input, null), 'duplicate_line_id');
    input.originCatalog.products[1]!.variants[0]!.sku = '';
    expectError(() => preview(input, null));
  });

  it.each([undefined, {}, { productId: 1 }, { variantId: 11 }, { productId: 1, variantId: 11, sku: 'KEEP' },
    { productId: 0, variantId: 11 }, { productId: -0, variantId: 11 }, { productId: 2_147_483_648, variantId: 11 },
    { productId: 1, variantId: -0 }, { productId: 1, variantId: 1.5 }, { productId: 1, variantId: '11' },
    { productId: 1, variantId: Number.MAX_SAFE_INTEGER + 1 }])('rejects a missing, partial or unsafe identity %j', identity => {
    expectError(() => defineCompanyQuickOrderHistory({ ...history(), lines: [{ ...history().lines[0], identity }] }));
  });

  it('inherits the exact base-field profile of a without introducing quantity or SKU coercion', () => {
    for (const quantityUnits of [-0, -1, 0.5, '2', Number.MAX_SAFE_INTEGER + 1]) {
      expectError(() => defineCompanyQuickOrderHistory({ ...history(), lines: [{ ...history().lines[0], quantityUnits }] }));
    }
    for (const change of [{ version: 0 }, { version: Number.MAX_SAFE_INTEGER + 1 }, { id: 'UPPER' }, { id: 'a'.repeat(101) }]) {
      expectError(() => defineCompanyQuickOrderHistory({ ...history(), ...change }));
    }
    const input = history(); input.version = Number.MAX_SAFE_INTEGER;
    input.originCatalog.products = [{ id: 2_147_483_647, variants: [{ id: Number.MAX_SAFE_INTEGER, productId: 2_147_483_647, sku: ' MAX ' }] }];
    input.lines = [{ id: 'line.max', sku: ' MAX ', quantityUnits: Number.MAX_SAFE_INTEGER, identity: { productId: 2_147_483_647, variantId: Number.MAX_SAFE_INTEGER } }];
    expect(preview(input, input.originCatalog).lines[0]!.identityComparison).toMatchObject({ outcome: 'found', comparedSku: ' MAX ' });
  });

  it('preserves literal case, NFC/NFD and spaces as comparison data rather than identity aliases', () => {
    const input = history(); input.originCatalog.products = [{ id: 1, variants: [{ id: 11, productId: 1, sku: 'Á' }] }];
    input.lines = [{ id: 'line.a', sku: 'Á', quantityUnits: 0, identity: { productId: 1, variantId: 11 } }];
    const target = copy(input.originCatalog); target.products[0]!.variants[0]!.sku = 'A\u0301';
    const result = preview(input, target).lines[0]!;
    expect(result.identityComparison).toEqual({ outcome: 'found', comparedSku: 'A\u0301', skuRelation: 'different' });
    expect(result.skuComparison.reason).toBe('sku_not_found');
  });
});

describe('límites simultáneos, aislamiento y frontera desconocida', () => {
  it('supports both full maximum catalogs and 100 repeated rows without candidate expansion or sums', () => {
    const input = history(); let id = 0;
    input.originCatalog.products = Array.from({ length: 1000 }, (_, index) => ({ id: index + 1,
      variants: Array.from({ length: index < 90 ? 100 : index === 90 ? 91 : 1 }, () => ({ id: ++id, productId: index + 1, sku: 'COLLISION' })) }));
    expect(id).toBe(10000);
    input.lines = Array.from({ length: 100 }, (_, index) => ({ id: `line.${index}`, sku: 'COLLISION', quantityUnits: Number.MAX_SAFE_INTEGER,
      identity: { productId: 1, variantId: 1 } }));
    const target = copy(input.originCatalog); target.ref = 'catalog.full-comparison';
    const result = preview(input, target);
    expect(result.history.originCatalog.products).toHaveLength(1000); expect(result.comparedCatalog.products).toHaveLength(1000);
    expect(result.lines).toHaveLength(100);
    for (const row of result.lines) {
      expect(row.identityComparison.outcome).toBe('found');
      expect(row.skuComparison).toEqual({ outcome: 'unresolved', reason: 'sku_ambiguous', matchCount: 10000, identity: null, relationToHistoricalIdentity: null });
      expect(row.line.quantityUnits).toBe(Number.MAX_SAFE_INTEGER);
      expect(Object.keys(row).sort()).toEqual(['identityComparison', 'line', 'position', 'skuComparison']);
    }
    expectError(() => preview({ ...input, lines: [...input.lines, { ...input.lines[0]!, id: 'line.extra' }] }, target));
    target.products[999]!.variants.push({ id: 10001, productId: 1000, sku: 'COLLISION' });
    expectError(() => preview({ ...input, lines: [] }, target));
    expectError(() => defineCompanyQuickOrderHistory({ ...input, originCatalog: target, lines: [] }));
    expect(Object.isFrozen(COMPANY_QUICK_ORDER_HISTORY_LIMITS)).toBe(true);
  });

  it('rejects added operational fields instead of silently ignoring them', () => {
    expectError(() => defineCompanyQuickOrderHistory({ ...history(), orderId: 'real-order' }));
    expectError(() => defineCompanyQuickOrderHistory({ ...history(), lines: [{ ...history().lines[0], unitPriceCents: 100 }] }));
    expectError(() => previewCompanyQuickOrderHistory({ history: history(), comparedCatalog: compared(), identityRelation: 'same_declared_space', newList: {} }));
    const target = compared(); target.products[0]!.variants[0] = { ...target.products[0]!.variants[0]!, status: 'active' } as typeof target.products[0]['variants'][0];
    expectError(() => preview(history(), target));
  });

  it('rejects own accessors without executing them at the wrapper, row, identity or array boundary', () => {
    let calls = 0; const getter = () => { calls++; throw new Error('private-input'); };
    const wrapper = { history: history(), comparedCatalog: compared(), identityRelation: 'same_declared_space' };
    Object.defineProperty(wrapper, 'history', { enumerable: true, get: getter }); expectError(() => previewCompanyQuickOrderHistory(wrapper));
    const nested = history(); Object.defineProperty(nested.lines[0]!.identity!, 'variantId', { enumerable: true, get: getter });
    expectError(() => defineCompanyQuickOrderHistory(nested));
    const row = history(); Object.defineProperty(row.lines[11]!, 'sku', { enumerable: true, get: getter });
    expectError(() => defineCompanyQuickOrderHistory(row));
    const array = history(); Object.defineProperty(array.lines, '0', { enumerable: true, get: getter });
    expectError(() => defineCompanyQuickOrderHistory(array)); expect(calls).toBe(0);
  });

  it('requires exact records and dense data arrays, while accepting detached null-prototype records', () => {
    expectError(() => defineCompanyQuickOrderHistory(Object.assign(Object.create({ inherited: true }), history())));
    const symbol = history(); Object.defineProperty(symbol, Symbol('extra'), { value: true }); expectError(() => defineCompanyQuickOrderHistory(symbol));
    const hidden = history(); Object.defineProperty(hidden, 'version', { value: hidden.version, enumerable: false }); expectError(() => defineCompanyQuickOrderHistory(hidden));
    const sparse = history(); delete sparse.lines[1]; expectError(() => defineCompanyQuickOrderHistory(sparse));
    const extra = history(); Object.defineProperty(extra.lines, 'extra', { value: true }); expectError(() => defineCompanyQuickOrderHistory(extra));
    const badPrototype = history(); Object.setPrototypeOf(badPrototype.lines, null); expectError(() => defineCompanyQuickOrderHistory(badPrototype));
    expect(defineCompanyQuickOrderHistory(Object.assign(Object.create(null), history()))).toEqual(defineCompanyQuickOrderHistory(history()));
  });

  it('captures origin and identity data before later Proxy introspection and returns frozen detached copies', () => {
    const input = history(); const expected = preview(input);
    const target = new Proxy(compared(), { ownKeys(value) {
      input.originCatalog.products[0]!.variants[0]!.sku = 'LATE'; input.lines[0]!.sku = 'LATE';
      input.lines[0]!.identity!.variantId = 99; input.lines[0]!.quantityUnits = 0; return Reflect.ownKeys(value);
    } });
    expect(preview(input, target)).toEqual(expected);
    const second = history(); const baseline = defineCompanyQuickOrderHistory(second);
    second.originCatalogRef = new Proxy(second.originCatalogRef, { ownKeys(value) {
      second.lines[0]!.identity!.variantId = 999; second.lines[0]!.sku = 'LATE'; return Reflect.ownKeys(value);
    } });
    expect(defineCompanyQuickOrderHistory(second)).toEqual(baseline);
    assertFrozen(expected); expect(expected.history.originCatalog).not.toBe(input.originCatalog);
  });

  it('redacts arbitrary errors and never invokes reason getters when mapping sibling failures', () => {
    let calls = 0;
    const foreign = new quickOrder.CompanyQuickOrderContractError('invalid_data');
    Object.defineProperty(foreign, 'reason', { get() { calls++; throw new Error('private-token'); } });
    vi.spyOn(quickOrder, 'defineCompanyQuickOrderList').mockImplementation(() => { throw foreign; });
    expectError(() => defineCompanyQuickOrderHistory(history())); vi.restoreAllMocks();
    const own = new CompanyQuickOrderHistoryContractError('invalid_data');
    Object.defineProperty(own, 'reason', { get() { calls++; throw new Error('private-token'); } });
    for (const thrown of [new Error('private-token'), own, new Proxy({}, { getPrototypeOf() { throw new Error('private-token'); } })]) {
      const hostile = new Proxy(history(), { ownKeys() { throw thrown; } });
      const error = expectError(() => defineCompanyQuickOrderHistory(hostile));
      expect(error.message).toBe('Los datos no cumplen el contrato de intención histórica de ejemplo.');
      expect(error.stack).not.toContain('private-token');
    }
    expect(calls).toBe(0);
    expect(new CompanyQuickOrderHistoryContractError('__proto__' as CompanyQuickOrderHistoryContractReason).reason).toBe('invalid_data');
  });

  it('evaluates only supplied fixture snapshots without IO, storage, timers, IDs or implicit time', () => {
    const fail = vi.fn(() => { throw new Error('Unexpected effect'); });
    for (const key of ['fetch', 'setTimeout', 'setInterval', 'localStorage', 'sessionStorage', 'crypto']) vi.stubGlobal(key, fail);
    const NativeDate = Date;
    vi.stubGlobal('Date', new Proxy(NativeDate, {
      construct(target, args) { if (args.length !== 1 || typeof args[0] !== 'string') return fail(); return Reflect.construct(target, args); },
      apply() { return fail(); }, get(target, key, receiver) { if (key === 'now') return fail; return Reflect.get(target, key, receiver); },
    }));
    expect(preview().lines).toHaveLength(12); expect(fail).not.toHaveBeenCalled();
  });
});
