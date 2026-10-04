import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CompanyQuickOrderDemoContractError, canShowCompanyQuickOrderDemo, createCompanyQuickOrderDemo,
  configureCompanyQuickOrderDemo, getCompanyQuickOrderDemoView,
  type CompanyQuickOrderDemoScenarioId, type CompanyQuickOrderDemoResolutionRow,
  type CompanyQuickOrderDemoHistoryRow,
} from '../src/composition/company-quick-order-demo';
import * as companies from '../src/modules/companies';
import { createPlatform } from '../src/composition/create-platform';
import { createPublicDemoManifest, createPresetManifest } from '../src/platform/configuration';

const create = createCompanyQuickOrderDemo; const configure = configureCompanyQuickOrderDemo; const view = getCompanyQuickOrderDemoView;
const OPTIONS = [
  ['sku-identified', 'SKU · Identificado'], ['sku-not-found', 'SKU · Espacios significativos'],
  ['sku-ambiguous', 'SKU · Varias coincidencias'], ['list-repeated', 'Lista · Filas conservadas'],
  ['csv-valid', 'CSV · Texto interpretable'], ['csv-invalid-field', 'CSV · Cantidad escrita no válida'],
  ['csv-invalid-structure', 'CSV · Comilla sin cerrar'], ['history-same-and-renamed', 'Histórico · SKU conservado o cambiado'],
  ['history-reused', 'Histórico · SKU reutilizado'], ['history-ambiguous-and-undeclared', 'Histórico · Ambigüedad y datos ausentes'],
] as const;
const INITIAL = { tone: 'info', code: 'initial', message: 'Ejemplo local preparado. Los datos se conservan por fila.' } as const;
const CHANGED = { tone: 'info', code: 'selection_changed', message: 'Ejemplo cambiado. El resultado corresponde a la entrada seleccionada.' } as const;
const selected = (scenarioId: CompanyQuickOrderDemoScenarioId) => configure(create(), { scenarioId });
const render = (scenarioId: CompanyQuickOrderDemoScenarioId) => view(selected(scenarioId));
const KIT_A = { productLabel: 'Kit de muestra', variantLabel: 'Esencial' };
const KIT_B = { productLabel: 'Kit de muestra', variantLabel: 'Ampliado' };
const ALT_C = { productLabel: 'Muestra alternativa', variantLabel: 'Serie C alternativa' };
const ALT_D = { productLabel: 'Muestra alternativa', variantLabel: 'Serie D alternativa' };

type Mutable<T> = T extends readonly (infer U)[] ? Mutable<U>[] : T extends object ? { -readonly [K in keyof T]: Mutable<T[K]> } : T;
function copy<T>(value: T): Mutable<T> { return structuredClone(value) as Mutable<T>; }
function frozen(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true); for (const child of Object.values(value)) frozen(child);
}
function invalid(operation: () => unknown): void {
  try { operation(); } catch (error) {
    expect(error).toBeInstanceOf(CompanyQuickOrderDemoContractError);
    expect(error).toMatchObject({ code: 'company_quick_order_demo_invalid', message: 'Los datos no pertenecen al ejemplo de listas y repetición.' });
    expect(error).not.toHaveProperty('cause'); return;
  }
  throw new Error('Se esperaba error propio redactado.');
}
function privateProjection(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    expect(['source', 'profile', 'ref', 'capturedAt', 'catalogRef', 'originCatalogRef', 'list', 'history', 'catalog',
      'productId', 'variantId', 'lineId', 'request', 'candidates', 'priceCents', 'total', 'available', 'eligible']).not.toContain(key);
    privateProjection(child);
  }
  expect(JSON.stringify(value)).not.toContain('demo.quick-order.');
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('lectura declarada por fila', () => {
  it('starts with the exact scenario, options and a descriptive identity', () => {
    const state = create(); const current = view(state);
    expect(state).toEqual({ selection: { scenarioId: 'sku-identified' }, feedback: INITIAL });
    expect(current.scenarioOptions).toEqual(OPTIONS.map(([id, label]) => ({ id, label })));
    expect(current.input).toEqual({ kind: 'rows', label: 'Fila aportada', catalogLabel: 'Catálogo comparado del ejemplo',
      originLabel: null, csvText: null, rows: [{ position: 1, sku: { literal: 'KIT-A', spaceNote: null },
        quantityUnits: 2, quantityLabel: '2 unidades declaradas', historicalIdentity: null }] });
    expect(current.rows).toEqual([{ kind: 'resolution', position: 1, sku: { literal: 'KIT-A', spaceNote: null },
      quantityUnits: 2, quantityLabel: '2 unidades declaradas', outcome: 'resolved', reason: null, matchCount: 1,
      label: 'SKU identificado en este catálogo', identity: KIT_A, diagnostics: [] }]);
    expect(current.parser).toBeNull(); frozen(state); frozen(current);
  });

  it('preserves significant boundary spaces instead of correcting the identity', () => {
    const current = render('sku-not-found'); const row = current.rows[0]! as CompanyQuickOrderDemoResolutionRow;
    expect(current.input.rows[0]!.sku).toEqual({ literal: ' KIT-A ', spaceNote: 'Contiene un espacio al principio y otro al final.' });
    expect(row.sku).toEqual(current.input.rows[0]!.sku);
    expect(row).toMatchObject({ outcome: 'unresolved', reason: 'sku_not_found', matchCount: 0, identity: null,
      label: 'SKU no encontrado en este catálogo', quantityUnits: 2 });
  });

  it('reports two exact matches without returning candidate names or an inferred identity', () => {
    const row = render('sku-ambiguous').rows[0]! as CompanyQuickOrderDemoResolutionRow;
    expect(row).toMatchObject({ outcome: 'unresolved', reason: 'sku_ambiguous', matchCount: 2,
      identity: null, label: 'Varias coincidencias de SKU', quantityUnits: 2 });
    expect(JSON.stringify(row)).not.toMatch(/Natural|Compartida/);
  });

  it('keeps repeated rows and zero separately, with ordered related positions', () => {
    const current = render('list-repeated'); const rows = current.rows as readonly CompanyQuickOrderDemoResolutionRow[];
    expect(rows.map(row => [row.position, row.sku.literal, row.quantityUnits, row.identity])).toEqual([
      [1, 'KIT-A', 2, KIT_A], [2, 'KIT-A', 3, KIT_A], [3, 'KIT-B-NEW', 0, KIT_B],
    ]);
    expect(rows.map(row => row.diagnostics)).toEqual([
      [{ code: 'repeated_sku', label: 'SKU repetido en la lista', relatedPositions: [2], relatedLabel: 'Otra fila relacionada: 2' },
        { code: 'multiple_variants_for_product', label: 'Variantes distintas del mismo producto', relatedPositions: [2, 3], relatedLabel: 'Otras filas relacionadas: 2, 3' }],
      [{ code: 'repeated_sku', label: 'SKU repetido en la lista', relatedPositions: [1], relatedLabel: 'Otra fila relacionada: 1' },
        { code: 'multiple_variants_for_product', label: 'Variantes distintas del mismo producto', relatedPositions: [1, 3], relatedLabel: 'Otras filas relacionadas: 1, 3' }],
      [{ code: 'multiple_variants_for_product', label: 'Variantes distintas del mismo producto', relatedPositions: [1, 2], relatedLabel: 'Otras filas relacionadas: 1, 2' }],
    ]);
    expect(rows[2]!.quantityLabel).toBe('0 unidades declaradas'); expect(current.input.rows[2]!.quantityUnits).toBe(0);
  });

  it('decodes quoted commas and escaped quotes before identifying the intact CSV list', () => {
    const current = render('csv-valid'); const rows = current.rows as readonly CompanyQuickOrderDemoResolutionRow[];
    expect(current.input).toMatchObject({ kind: 'csv', rows: [], originLabel: null,
      csvText: 'sku,quantity_units\n"PACK,SMALL",2\n"LABEL""BLUE",0' });
    expect(current.parser).toEqual({ outcome: 'parsed', label: 'Texto interpretado',
      message: 'Las filas forman una lista íntegra de ejemplo; todavía no describen un pedido.', headerPresent: true,
      decodedRows: [{ position: 1, fields: ['PACK,SMALL', '2'] }, { position: 2, fields: ['LABEL"BLUE', '0'] }], diagnostics: [] });
    expect(rows.map(row => [row.sku.literal, row.quantityUnits, row.identity])).toEqual([
      ['PACK,SMALL', 2, { productLabel: 'Embalaje de muestra', variantLabel: 'Pequeño' }],
      ['LABEL"BLUE', 0, { productLabel: 'Embalaje de muestra', variantLabel: 'Etiqueta azul' }],
    ]);
    expect(rows.map(row => row.diagnostics[0]!.relatedPositions)).toEqual([[2], [1]]);
  });

  it('keeps decoded text after a field error without identifying the following good row', () => {
    const current = render('csv-invalid-field');
    expect(current.rows).toEqual([]); expect(current.input.rows).toEqual([]);
    expect(current.parser).toMatchObject({ outcome: 'invalid', headerPresent: true,
      decodedRows: [{ position: 1, fields: ['KIT-A', '2.5'] }, { position: 2, fields: ['KIT-B-NEW', '2'] }],
      diagnostics: [{ category: 'field', code: 'invalid_quantity', label: 'Cantidad escrita no válida',
        at: { offset: 25, line: 2, column: 7 }, recordNumber: 2, fieldNumber: 2, locationLabel: 'Línea 2, columna 7' }] });
    expect(JSON.stringify(current.parser)).not.toContain('quantityUnits');
    expect(current.resultMessage).toBe('No se ha creado una lista de intención; no se identifica ninguna fila por separado.');
  });

  it('discards the apparent prefix on an unclosed quote while retaining the entire source text', () => {
    const current = render('csv-invalid-structure');
    expect(current.input.csvText).toBe('sku,quantity_units\nKIT-A,2\n"KIT-B-NEW,3'); expect(current.rows).toEqual([]);
    expect(current.parser).toMatchObject({ outcome: 'invalid', headerPresent: false, decodedRows: [],
      diagnostics: [{ category: 'syntax', code: 'unclosed_quote', label: 'Falta la comilla de cierre',
        at: { offset: 39, line: 3, column: 13 }, recordNumber: 3, fieldNumber: 1, locationLabel: 'Línea 3, columna 13' }] });
  });

  it('keeps the declared variant when its SKU text changes', () => {
    const current = render('history-same-and-renamed'); const rows = current.rows as readonly CompanyQuickOrderDemoHistoryRow[];
    expect(current.input.originLabel).toBe('Catálogo de origen del ejemplo'); expect(current.parser).toBeNull();
    expect(rows.map(row => row.historicalIdentity)).toEqual([KIT_A, KIT_B]);
    expect(rows[0]).toMatchObject({ sku: { literal: 'KIT-A' }, quantityUnits: 2,
      identityComparison: { outcome: 'found', comparedSku: { literal: 'KIT-A' }, skuRelation: 'same' },
      skuComparison: { outcome: 'resolved', identity: KIT_A, relationToHistoricalIdentity: 'same' } });
    expect(rows[1]).toMatchObject({ sku: { literal: 'KIT-B' }, quantityUnits: 3,
      identityComparison: { outcome: 'found', comparedSku: { literal: 'KIT-B-NEW' }, skuRelation: 'different',
        skuRelationLabel: 'La variante tiene otro SKU' },
      skuComparison: { outcome: 'unresolved', reason: 'sku_not_found', identity: null, matchCount: 0,
        relationToHistoricalIdentity: null, relationLabel: null } });
  });

  it('does not substitute a recycled SKU match for either historical variant', () => {
    const rows = render('history-reused').rows as readonly CompanyQuickOrderDemoHistoryRow[];
    expect(rows[0]).toMatchObject({ historicalIdentity: { productLabel: 'Kit de muestra', variantLabel: 'Serie C' },
      quantityUnits: 4, identityComparison: { outcome: 'not_found', comparedSku: null, skuRelation: null, skuRelationLabel: null },
      skuComparison: { outcome: 'resolved', identity: ALT_C, relationToHistoricalIdentity: 'different', relationLabel: 'El SKU identifica otra variante' } });
    expect(rows[1]).toMatchObject({ sku: { literal: 'OLD-D' }, quantityUnits: 5,
      historicalIdentity: { productLabel: 'Kit de muestra', variantLabel: 'Serie D' },
      identityComparison: { outcome: 'found', comparedSku: { literal: 'NEW-D' }, skuRelation: 'different' },
      skuComparison: { outcome: 'resolved', identity: ALT_D, relationToHistoricalIdentity: 'different' } });
  });

  it('keeps ambiguous text independent of a known variant and does not fill an absent origin', () => {
    const rows = render('history-ambiguous-and-undeclared').rows as readonly CompanyQuickOrderDemoHistoryRow[];
    expect(rows[0]).toMatchObject({ historicalIdentity: { productLabel: 'Muestra de cerámica', variantLabel: 'Natural' },
      quantityUnits: 6, identityComparison: { outcome: 'found', comparedSku: { literal: 'SHARED' }, skuRelation: 'same' },
      skuComparison: { outcome: 'unresolved', reason: 'sku_ambiguous', matchCount: 2, identity: null,
        relationToHistoricalIdentity: null, relationLabel: null } });
    expect(rows[1]).toMatchObject({ historicalIdentity: null, quantityUnits: 7,
      identityComparison: { outcome: 'not_provided', label: 'Variante de origen no indicada', comparedSku: null, skuRelation: null },
      skuComparison: { outcome: 'resolved', identity: { productLabel: 'Soporte de muestra', variantLabel: 'Único' },
        relationToHistoricalIdentity: 'not_provided', relationLabel: 'El SKU no permite deducir la variante de origen' } });
  });
});

describe('selección local, delegación y frontera estricta', () => {
  it('preserves no-ops across eleven reachable states and clears every previous projection', () => {
    const changedInitial = configure(selected('list-repeated'), { scenarioId: 'sku-identified' });
    const states = [create(), ...OPTIONS.map(([id]) => configure(changedInitial, { scenarioId: id }))];
    let changes = 0; let noops = 0;
    expect(new Set(states.map(state => JSON.stringify(state))).size).toBe(11);
    for (const state of states) {
      expect(configure(state, {})).toEqual(state);
      for (const [scenarioId] of OPTIONS) {
        const next = configure(state, { scenarioId });
        if (state.selection.scenarioId === scenarioId) { expect(next).toEqual(state); noops++; }
        else { expect(next.feedback).toEqual(CHANGED); changes++; }
        expect(next.selection.scenarioId).toBe(scenarioId);
        const expected = render(scenarioId);
        expect(view(next)).toEqual({ ...expected, feedback: next.feedback });
        frozen(next); privateProjection(view(next));
      }
    }
    expect({ changes, noops }).toEqual({ changes: 99, noops: 11 });
    expect(create()).toEqual({ selection: { scenarioId: 'sku-identified' }, feedback: INITIAL });
  });

  it('keeps all ten views detached, deeply frozen, private and deterministic', () => {
    const counts = { resolution: 0, history: 0, resolved: 0, notFound: 0, ambiguous: 0, zero: 0 };
    for (const [id] of OPTIONS) {
      const state = selected(id); const current = view(state);
      expect(view(copy(state))).toEqual(current); frozen(current); privateProjection(current);
      for (const row of current.rows) {
        counts[row.kind]++; if (row.quantityUnits === 0) counts.zero++;
        if (row.kind === 'resolution') counts[row.outcome === 'resolved' ? 'resolved' : row.reason === 'sku_not_found' ? 'notFound' : 'ambiguous']++;
      }
      if (current.family !== 'csv') { expect(current.parser).toBeNull(); expect(current.input.csvText).toBeNull(); }
      if (current.parser?.outcome === 'invalid') expect(current.rows).toEqual([]);
    }
    expect(counts).toEqual({ resolution: 8, history: 6, resolved: 6, notFound: 1, ambiguous: 1, zero: 2 });
  });

  it('passes the parser complete canonical list by identity and never resolves an invalid prefix', () => {
    const parser = vi.spyOn(companies, 'parseCompanyQuickOrderCsv');
    const resolver = vi.spyOn(companies, 'previewCompanyQuickOrderList');
    const history = vi.spyOn(companies, 'previewCompanyQuickOrderHistory');
    render('csv-valid'); expect(parser).toHaveBeenCalledTimes(1); expect(resolver).toHaveBeenCalledTimes(1);
    const parsed = parser.mock.results[0]!.value as companies.CompanyQuickOrderCsvResult;
    const delegated = resolver.mock.calls[0]![0] as { list: unknown; catalog: companies.CompanyQuickOrderCatalog };
    expect(delegated.list).toBe(parsed.list);
    expect(delegated.catalog.products).toHaveLength(5);
    resolver.mockClear(); render('csv-invalid-field'); render('csv-invalid-structure');
    expect(resolver).not.toHaveBeenCalled(); expect(history).not.toHaveBeenCalled();
    expect(parser).toHaveBeenCalledTimes(3);
  });

  it('delegates structured identity and historical comparisons through their separate public APIs', () => {
    const resolver = vi.spyOn(companies, 'previewCompanyQuickOrderList');
    const parser = vi.spyOn(companies, 'parseCompanyQuickOrderCsv');
    const history = vi.spyOn(companies, 'previewCompanyQuickOrderHistory');
    for (const id of ['sku-identified', 'sku-not-found', 'sku-ambiguous', 'list-repeated'] as const) render(id);
    expect(resolver).toHaveBeenCalledTimes(4); expect(parser).not.toHaveBeenCalled(); expect(history).not.toHaveBeenCalled();
    resolver.mockClear();
    for (const id of ['history-same-and-renamed', 'history-reused', 'history-ambiguous-and-undeclared'] as const) render(id);
    expect(history).toHaveBeenCalledTimes(3); expect(resolver).not.toHaveBeenCalled(); expect(parser).not.toHaveBeenCalled();
    const input = history.mock.calls[0]![0] as { history: companies.CompanyQuickOrderHistory; comparedCatalog: companies.CompanyQuickOrderCatalog; identityRelation: string };
    expect(input.identityRelation).toBe('same_declared_space');
    expect(input.history.originCatalog.products).toHaveLength(5); expect(input.comparedCatalog.products).toHaveLength(5);
    expect(input.history.originCatalog.ref).not.toBe(input.comparedCatalog.ref);
  });

  it('projects the real resolver return rather than a scenario result table', () => {
    const original = companies.previewCompanyQuickOrderList;
    vi.spyOn(companies, 'previewCompanyQuickOrderList').mockImplementation(input => {
      const captured = input as { list: companies.CompanyQuickOrderList; catalog: companies.CompanyQuickOrderCatalog };
      return original({ catalog: captured.catalog, list: { ...captured.list,
        lines: captured.list.lines.map(line => ({ ...line, sku: 'KIT-B-NEW', quantityUnits: 1 })) } });
    });
    const current = render('sku-identified'); const row = current.rows[0]! as CompanyQuickOrderDemoResolutionRow;
    expect(row).toMatchObject({ sku: { literal: 'KIT-B-NEW' }, quantityUnits: 1, quantityLabel: '1 unidad declarada', identity: KIT_B });
    expect(current.input.rows[0]).toMatchObject({ sku: { literal: 'KIT-B-NEW' }, quantityUnits: 1 });
  });

  it('uses the historical API output without inferring origin identity from its SKU result', () => {
    const original = companies.previewCompanyQuickOrderHistory;
    vi.spyOn(companies, 'previewCompanyQuickOrderHistory').mockImplementation(input => {
      const captured = input as { history: companies.CompanyQuickOrderHistory; comparedCatalog: companies.CompanyQuickOrderCatalog; identityRelation: 'same_declared_space' };
      return original({ ...captured, history: { ...captured.history,
        lines: captured.history.lines.map(line => ({ ...line, identity: null, quantityUnits: 0 })) } });
    });
    const current = render('history-same-and-renamed');
    expect(current.input.rows.every(row => row.historicalIdentity === null && row.quantityUnits === 0)).toBe(true);
    expect((current.rows[0] as CompanyQuickOrderDemoHistoryRow).identityComparison.outcome).toBe('not_provided');
    expect((current.rows[0] as CompanyQuickOrderDemoHistoryRow).skuComparison).toMatchObject({
      identity: KIT_A, relationToHistoricalIdentity: 'not_provided' });
  });

  it('redacts evaluator failures and refuses new unlabelled parser diagnostics', () => {
    vi.spyOn(companies, 'previewCompanyQuickOrderList').mockImplementation(() => { throw new Error('private@example.test'); });
    invalid(() => render('sku-identified')); vi.restoreAllMocks();
    const original = companies.parseCompanyQuickOrderCsv;
    vi.spyOn(companies, 'parseCompanyQuickOrderCsv').mockImplementation(input => original({ ...(input as object), text: 'sku,quantity_units\rKIT-A,2' }));
    invalid(() => render('csv-valid'));
  });

  it('rejects foreign selectors and impossible feedback rather than falling back', () => {
    const initial = create();
    for (const bad of [null, [], {}, { ...initial, request: {} }, { ...initial, selection: { scenarioId: 'foreign' } },
      { ...initial, selection: { ...initial.selection, quantityUnits: 0 } }, { ...initial, selection: { scenarioId: 'csv-valid' } },
      { ...initial, feedback: { ...initial.feedback, code: 'accepted' } }, { ...initial, feedback: { ...initial.feedback, tone: 'success' } },
      { ...initial, feedback: { ...initial.feedback, message: 'approved' } }, { ...initial, feedback: { ...initial.feedback, extra: true } }]) {
      invalid(() => view(bad)); invalid(() => configure(bad, {}));
    }
    for (const patch of [null, [], { scenarioId: undefined }, { scenarioId: 'unknown' }, { scenarioId: 0 }, { scenarioId: true },
      { scenarioId: 'sku-identified', identity: null }, { csvText: '' }, { quantityUnits: 1 }]) invalid(() => configure(initial, patch));
    expect(initial).toEqual(create());
  });

  it('rejects accessors, hidden data and hostile prototypes without executing getters or leaking traps', () => {
    const initial = create(); let getterCalls = 0;
    const getter = { enumerable: true, get() { getterCalls++; throw new Error('private@example.test'); } };
    invalid(() => view(Object.defineProperty({ ...initial }, 'selection', getter)));
    invalid(() => view({ ...initial, selection: Object.defineProperty({}, 'scenarioId', getter) }));
    invalid(() => view({ ...initial, feedback: Object.defineProperty({ ...initial.feedback }, 'message', getter) }));
    invalid(() => configure(initial, Object.defineProperty({}, 'scenarioId', getter)));
    for (const bad of [Object.assign(Object.create({ inherited: true }) as object, initial), { ...initial, [Symbol('secret')]: true },
      Object.defineProperty({ ...initial }, 'hidden', { value: true }),
      new Proxy({}, { ownKeys() { throw new Error('private@example.test'); } }),
      new Proxy({}, { getPrototypeOf() { throw new Error('private@example.test'); } }),
      new Proxy(initial, { getOwnPropertyDescriptor() { throw new Error('private@example.test'); } })]) invalid(() => view(bad));
    expect(getterCalls).toBe(0);
  });

  it('captures state before a later patch or feedback trap can mutate the original', () => {
    const mutable = copy(create());
    const patch = new Proxy({}, { ownKeys() { mutable.selection.scenarioId = 'csv-valid'; return []; } });
    expect(configure(mutable, patch).selection.scenarioId).toBe('sku-identified');
    const next = copy(create());
    const feedback = new Proxy(next.feedback, { getPrototypeOf(target) {
      next.selection.scenarioId = 'list-repeated'; return Object.getPrototypeOf(target);
    } });
    expect(view({ selection: next.selection, feedback }).selection.scenarioId).toBe('sku-identified');
  });

  it('accepts exact null-prototype records and detaches all snapshots', () => {
    const mutable = copy(create());
    const state = Object.assign(Object.create(null) as Record<string, unknown>, mutable);
    const patch = Object.assign(Object.create(null) as Record<string, unknown>, { scenarioId: 'list-repeated' });
    const captured = configure(state, patch); const current = view(captured); const before = structuredClone(current);
    mutable.selection.scenarioId = 'csv-valid'; mutable.feedback.message = 'private@example.test'; patch['scenarioId'] = 'sku-ambiguous';
    expect(current).toEqual(before); expect(captured.selection.scenarioId).toBe('list-repeated'); frozen(captured); frozen(current);
  });

  it('uses only explicit fixture dates and no IO, timers, storage or random identifiers', () => {
    const NativeDate = Date; const forbidden = vi.fn(() => { throw new Error('Efecto inesperado'); });
    class ExplicitDate extends NativeDate {
      constructor(value: string) { if (arguments.length === 0) forbidden(); super(value); }
      static override now(): number { return forbidden(); }
    }
    vi.stubGlobal('Date', ExplicitDate);
    for (const name of ['fetch', 'setTimeout', 'setInterval', 'queueMicrotask']) vi.stubGlobal(name, forbidden);
    vi.stubGlobal('localStorage', { getItem: forbidden, setItem: forbidden });
    vi.stubGlobal('sessionStorage', { getItem: forbidden, setItem: forbidden });
    vi.stubGlobal('crypto', { randomUUID: forbidden, getRandomValues: forbidden });
    for (const [id] of OPTIONS) { expect(render(id).selection.scenarioId).toBe(id); }
    expect(forbidden).not.toHaveBeenCalled();
  });
});

describe('gate AND de demo, sin activar operación', () => {
  it.each(['demo', 'client'] as const)('requires the literal env flag and manifest mode %s', mode => {
    const deployment = { id: 'quick-order-demo-test', environment: 'development' as const };
    const platform = createPlatform(mode === 'demo' ? createPublicDemoManifest(deployment) : createPresetManifest('standard', { ...deployment, mode }));
    for (const DEMO_MODE of ['true', 'false', 'TRUE', '', undefined]) {
      expect(canShowCompanyQuickOrderDemo({ DEMO_MODE }, platform)).toBe(mode === 'demo' && DEMO_MODE === 'true');
    }
    expect(canShowCompanyQuickOrderDemo(undefined, platform)).toBe(false);
    if (mode === 'demo') {
      expect(platform.capabilityState('B2B-008')).toBe('installed');
      expect(platform.isCapabilityActive('B2B-008')).toBe(false);
    }
  });

  it('fails closed on getters, inherited flags, missing platform and Proxy errors', () => {
    type GatePlatform = Parameters<typeof canShowCompanyQuickOrderDemo>[1];
    type Env = Parameters<typeof canShowCompanyQuickOrderDemo>[0];
    const platform = { manifest: { deployment: { mode: 'demo' } } } as GatePlatform; let calls = 0;
    const getter = { enumerable: true, get() { calls++; throw new Error('private@example.test'); } };
    for (const env of [null, { DEMO_MODE: true }, Object.create({ DEMO_MODE: 'true' }), Object.defineProperty({}, 'DEMO_MODE', getter)]) {
      expect(canShowCompanyQuickOrderDemo(env as Env, platform)).toBe(false);
    }
    for (const bad of [undefined, null, [], Object.create(platform), Object.defineProperty({}, 'manifest', getter),
      { manifest: Object.defineProperty({}, 'deployment', getter) }, { manifest: { deployment: Object.defineProperty({}, 'mode', getter) } },
      new Proxy({}, { getPrototypeOf() { throw new Error('private@example.test'); } })]) {
      expect(canShowCompanyQuickOrderDemo({ DEMO_MODE: 'true' }, bad as GatePlatform)).toBe(false);
    }
    expect(calls).toBe(0);
  });
});
