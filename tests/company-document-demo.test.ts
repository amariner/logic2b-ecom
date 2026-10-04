import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CompanyDocumentDemoContractError, canShowCompanyDocumentDemo, createCompanyDocumentDemo,
  configureCompanyDocumentDemo, getCompanyDocumentDemoView,
  type CompanyDocumentDemoSelection, type CompanyDocumentDemoState,
} from '../src/composition/company-document-demo';
import * as companies from '../src/modules/companies';
import { createPlatform } from '../src/composition/create-platform';
import { createPublicDemoManifest, createPresetManifest } from '../src/platform/configuration';

const create = createCompanyDocumentDemo; const configure = configureCompanyDocumentDemo; const view = getCompanyDocumentDemoView;
const NORMAL = '2026-10-03T14:00:00.000Z'; const FUTURE = '2026-10-03T14:15:00.000Z';
const EVALUATIONS = [
  { id: 'first', at: NORMAL, label: '3 oct 2026 · 14:00 UTC' },
  { id: 'boundary', at: FUTURE, label: '3 oct 2026 · 14:15 UTC' },
  { id: 'after', at: '2026-10-03T14:30:00.000Z', label: '3 oct 2026 · 14:30 UTC' },
] as const;
// Expectativas literales independientes; nunca se importan respuestas calculadas del modelo.
const GOLDENS = [
  { id: 'same', label: 'Datos coincidentes', company: 'matches', po: 'matches', amount: 7700, delta: 0, reason: null },
  { id: 'lower', label: 'Importe menor', company: 'matches', po: 'matches', amount: 7200, delta: -500, reason: null },
  { id: 'higher', label: 'Importe mayor', company: 'matches', po: 'matches', amount: 8200, delta: 500, reason: null },
  { id: 'zero', label: 'Cero declarado', company: 'matches', po: 'matches', amount: 0, delta: -7700, reason: null },
  { id: 'no-po', label: 'Sin referencia de compra', company: 'matches', po: 'unknown', amount: null, delta: null, reason: 'expected_po_not_provided' },
  { id: 'no-support', label: 'Sin soporte PO', company: 'matches', po: 'matches', amount: 7700, delta: 0, reason: null },
  { id: 'company-missing', label: 'Comprador no aportado', company: 'unknown', po: 'matches', amount: null, delta: null, reason: 'company_not_provided' },
  { id: 'company-different', label: 'Otro comprador', company: 'differs', po: 'matches', amount: null, delta: null, reason: 'company_mismatch' },
  { id: 'po-missing', label: 'PO observada no aportada', company: 'matches', po: 'unknown', amount: null, delta: null, reason: 'observed_po_not_provided' },
  { id: 'po-different', label: 'Otra PO observada', company: 'matches', po: 'differs', amount: null, delta: null, reason: 'po_mismatch' },
  { id: 'amount-missing', label: 'Importe no aportado', company: 'matches', po: 'matches', amount: null, delta: null, reason: 'commercial_amount_not_provided' },
  { id: 'response-missing', label: 'Sin respuesta', company: null, po: null, amount: null, delta: null, reason: 'missing_response' },
  { id: 'not-configured', label: 'Sin caso configurado', company: null, po: null, amount: null, delta: null, reason: 'not_configured' },
  { id: 'unavailable', label: 'Evidencia no disponible', company: null, po: null, amount: null, delta: null, reason: 'unavailable' },
  { id: 'unsupported', label: 'Consulta no admitida', company: null, po: null, amount: null, delta: null, reason: 'unsupported' },
  { id: 'future', label: 'Corte posterior', company: 'matches', po: 'matches', amount: 8200, delta: 500, reason: null },
  { id: 'incomplete', label: 'Evidencia incompleta', company: null, po: null, amount: null, delta: null, reason: 'incomplete_evidence' },
  { id: 'document-missing', label: 'Sin documento en el corte', company: null, po: null, amount: null, delta: null, reason: 'document_not_provided' },
] as const;
const CASES = GOLDENS.flatMap(golden => EVALUATIONS.map(evaluation => ({ golden, evaluation })));
type Mutable<T> = T extends readonly (infer U)[] ? Mutable<U>[] : T extends object ? { -readonly [K in keyof T]: Mutable<T[K]> } : T;
function copy<T>(value: T): Mutable<T> { return structuredClone(value) as Mutable<T>; }
function frozen(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true); for (const child of Object.values(value)) frozen(child);
}
function invalid(operation: () => unknown): void {
  try { operation(); } catch (error) {
    expect(error).toBeInstanceOf(CompanyDocumentDemoContractError);
    expect(error).toMatchObject({ code: 'company_document_demo_invalid', message: 'Los datos no pertenecen al ejemplo documental.' });
    expect(error).not.toHaveProperty('cause'); return;
  }
  throw new Error('Se esperaba error del ejemplo.');
}
function privateProjection(value: unknown): void {
  const serialized = JSON.stringify(value);
  for (const token of ['8888', '88,88', 'company.offer-demo', 'company.document-other', 'demo.company-document', 'demo.offer-demo', 'contact.', 'offer.one']) {
    expect(serialized).not.toContain(token);
  }
  function visit(item: unknown): void {
    if (item === null || typeof item !== 'object') return;
    for (const [key, child] of Object.entries(item)) {
      expect(['request', 'declaration', 'binding', 'response', 'adapterId', 'ref', 'profile', 'companyId', 'commercialAmount']).not.toContain(key);
      visit(child);
    }
  }
  visit(value);
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('inicio y gate de lectura local', () => {
  it('starts same/first with explicit dates, readable reference and a real zero delta', () => {
    const state = create(); const current = view(state);
    expect(state).toEqual({ selection: { scenarioId: 'same', evaluationId: 'first' }, feedback: {
      tone: 'info', code: 'initial', message: 'Selecciona un ejemplo y un momento de evaluación. Los datos son ficticios.',
    } });
    expect(current.scenarioOptions).toEqual(GOLDENS.map(({ id, label }) => ({ id, label })));
    expect(current.evaluationOptions).toEqual(EVALUATIONS.map(({ id, label }) => ({ id, label })));
    expect(current.reference).toEqual({ buyerCompanyLabel: 'Empresa de ejemplo', offerLabel: 'Oferta 1',
      purchaseOrderNumber: 'PO 2026/0042-Á', purchaseOrderLabel: 'Referencia de compra aportada',
      supportStatus: 'declared', supportLabel: 'Soporte PO declarado', declaredAmount: { currency: 'EUR', amountCents: 7700, formatted: '77,00 EUR' } });
    expect(current.comparisons?.amount.delta).toEqual({ currency: 'EUR', amountCents: 0, formatted: '0,00 EUR' });
    frozen(state); frozen(current); privateProjection(current);
  });

  it.each(['demo', 'client'] as const)('requires DEMO_MODE string true AND manifest mode %s', mode => {
    const deployment = { id: 'company-document-isolation', environment: 'development' as const };
    const platform = createPlatform(mode === 'demo' ? createPublicDemoManifest(deployment) : createPresetManifest('standard', { ...deployment, mode }));
    for (const DEMO_MODE of ['true', 'false', 'TRUE', '', undefined]) {
      const env = { DEMO_MODE, get DB(): never { throw new Error('Database must not be read'); } };
      expect(canShowCompanyDocumentDemo(env, platform)).toBe(mode === 'demo' && DEMO_MODE === 'true');
    }
    expect(canShowCompanyDocumentDemo(undefined, platform)).toBe(false);
    if (mode === 'demo') {
      expect(platform.capabilityState('B2B-007')).toBe('installed'); expect(platform.isCapabilityActive('B2B-007')).toBe(false);
      expect(platform.hasCapabilityFlag('B2B-007', 'routes')).toBe(false);
    }
  });

  it('fails closed on gate getters, inherited values, missing platform and hostile proxies', () => {
    type Env = Parameters<typeof canShowCompanyDocumentDemo>[0]; type GatePlatform = Parameters<typeof canShowCompanyDocumentDemo>[1];
    const platform = { manifest: { deployment: { mode: 'demo' } } }; let calls = 0;
    const getter = { enumerable: true, get() { calls++; throw new Error('private@example.test'); } };
    const env = Object.defineProperty({}, 'DEMO_MODE', getter);
    expect(canShowCompanyDocumentDemo(env, platform as GatePlatform)).toBe(false);
    for (const bad of [undefined, null, [], Object.create(platform), Object.defineProperty({}, 'manifest', getter),
      { manifest: Object.defineProperty({}, 'deployment', getter) }, { manifest: { deployment: Object.defineProperty({}, 'mode', getter) } },
      new Proxy({}, { getPrototypeOf() { throw new Error('private@example.test'); } })]) {
      expect(canShowCompanyDocumentDemo({ DEMO_MODE: 'true' }, bad as GatePlatform)).toBe(false);
    }
    for (const bad of [{ DEMO_MODE: true }, Object.create({ DEMO_MODE: 'true' }), null]) {
      expect(canShowCompanyDocumentDemo(bad as Env, platform as GatePlatform)).toBe(false);
    }
    expect(calls).toBe(0);
  });
});

describe('54 lecturas de campos, importes y metadatos sin autoridad global', () => {
  it.each(CASES)('$golden.id / $evaluation.id', ({ golden, evaluation }) => {
    const current = view(configure(create(), { scenarioId: golden.id, evaluationId: evaluation.id }));
    const future = golden.id === 'future' && evaluation.id === 'first';
    const globalUnknown = golden.company === null || future;
    const metadataAbsent = ['response-missing', 'not-configured', 'unavailable', 'unsupported'].some(id => id === golden.id);
    expect(current.evaluatedAt).toBe(evaluation.at); expect(current.evaluatedAtLabel).toBe(evaluation.label);
    expect(current.reference.declaredAmount).toEqual({ currency: 'EUR', amountCents: 7700, formatted: '77,00 EUR' });
    expect(current.reference.purchaseOrderNumber).toBe(golden.id === 'no-po' ? null : 'PO 2026/0042-Á');
    expect(current.reference.supportStatus).toBe(['no-po', 'no-support'].some(id => id === golden.id) ? 'not_provided' : 'declared');
    expect(current.evidence.outcome).toBe(globalUnknown ? 'unknown' : 'observed');
    expect(current.evidence.reason).toBe(globalUnknown ? future ? 'future_observation' : golden.reason : null);
    if (metadataAbsent) expect(current.evidence.metadata).toBeNull();
    else expect(current.evidence.metadata).toMatchObject({ coverage: golden.id === 'incomplete' ? 'incomplete' : 'complete',
      observedAt: golden.id === 'future' ? FUTURE : NORMAL });
    if (globalUnknown) {
      expect(current.evidence.document).toBeNull(); expect(current.comparisons).toBeNull();
    } else {
      const asOf = golden.id === 'future' ? FUTURE : NORMAL;
      expect(current.evidence.document).toMatchObject({ label: 'Documento del ejemplo', asOf });
      expect(current.comparisons?.company.outcome).toBe(golden.company);
      expect(current.comparisons?.purchaseOrder.outcome).toBe(golden.po);
      expect(current.comparisons?.company.expectedValue).toBe('Empresa de ejemplo');
      expect(current.comparisons?.company.observedValue).toBe(golden.id === 'company-missing' ? null : golden.id === 'company-different' ? 'Otra empresa de ejemplo' : 'Empresa de ejemplo');
      expect(current.comparisons?.purchaseOrder.expectedValue).toBe(golden.id === 'no-po' ? null : 'PO 2026/0042-Á');
      expect(current.comparisons?.purchaseOrder.observedValue).toBe(golden.id === 'po-missing' ? null : golden.id === 'po-different' ? 'PO 2026/0042-á' : 'PO 2026/0042-Á');
      const amount = current.comparisons?.amount;
      expect(amount?.expected.amountCents).toBe(7700);
      if (golden.amount === null) {
        expect(amount).toMatchObject({ outcome: 'unknown', reason: golden.reason, observed: null, delta: null, position: null, asOf: null, asOfLabel: null });
      } else {
        expect(amount).toMatchObject({ outcome: 'compared', reason: null, reasonLabel: null,
          observed: { currency: 'EUR', amountCents: golden.amount }, delta: { currency: 'EUR', amountCents: golden.delta }, asOf,
          position: golden.delta < 0 ? 'below_declared' : golden.delta > 0 ? 'above_declared' : 'equal_declared' });
      }
    }
    frozen(current); privateProjection(current);
  });

  it('has the agreed observation, metadata and comparison counts without treating unknown as zero', () => {
    const counts = { observed: 0, unknown: 0, metadata: 0, compared: 0, amountUnknown: 0, below: 0, equal: 0, above: 0 };
    for (const { golden, evaluation } of CASES) {
      const current = view(configure(create(), { scenarioId: golden.id, evaluationId: evaluation.id }));
      counts[current.evidence.outcome]++; if (current.evidence.metadata !== null) counts.metadata++;
      const amount = current.comparisons?.amount;
      if (amount?.outcome === 'compared') { counts.compared++; counts[amount.position === 'below_declared' ? 'below' : amount.position === 'above_declared' ? 'above' : 'equal']++; }
      else if (amount?.outcome === 'unknown') counts.amountUnknown++;
    }
    expect(counts).toEqual({ observed: 35, unknown: 19, metadata: 42, compared: 17, amountUnknown: 18, below: 6, equal: 6, above: 5 });
  });

  it('formats signed differences as evidence minus offer and shows true zero separately from missing', () => {
    const expectations = [
      ['same', '77,00 EUR', '0,00 EUR'], ['lower', '72,00 EUR', '−5,00 EUR'],
      ['higher', '82,00 EUR', '+5,00 EUR'], ['zero', '0,00 EUR', '−77,00 EUR'],
    ] as const;
    for (const [scenarioId, amount, delta] of expectations) {
      const current = view(configure(create(), { scenarioId }));
      expect(current.comparisons?.amount.observed?.formatted).toBe(amount);
      expect(current.comparisons?.amount.delta?.formatted).toBe(delta);
    }
    expect(view(configure(create(), { scenarioId: 'amount-missing' })).comparisons?.amount.observed).toBeNull();
    expect(view(configure(create(), { scenarioId: 'response-missing' })).comparisons).toBeNull();
  });

  it('uses distinct human labels for unknown causes and keeps buyer meaning explicit', () => {
    const cases = [
      ['response-missing', 'Sin respuesta aportada'], ['not-configured', 'Sin evidencia configurada'], ['unavailable', 'Evidencia no disponible'],
      ['unsupported', 'Consulta no admitida'], ['future', 'Corte posterior a la evaluación'], ['incomplete', 'Evidencia incompleta'],
      ['document-missing', 'Documento no aportado en el corte'],
    ] as const;
    for (const [scenarioId, label] of cases) expect(view(configure(create(), { scenarioId })).evidence.label).toBe(label);
    const foreign = view(configure(create(), { scenarioId: 'company-different' }));
    expect(foreign.comparisons?.company.label).toBe('Difiere en este campo');
    expect(foreign.comparisons?.amount.reasonLabel).toBe('El documento declara otra empresa compradora.');
    expect(view(configure(create(), { scenarioId: 'not-configured' })).scenarioDescription).not.toContain('adaptador');
  });
});

describe('selectores, cortes estables y límites del estado', () => {
  it('preserves the other selector across all 1,134 partial patches, including 108 no-ops', () => {
    let attempts = 0; let noops = 0;
    for (const { golden, evaluation } of CASES) {
      const current = configure(create(), { scenarioId: golden.id, evaluationId: evaluation.id });
      const before = structuredClone(current);
      const patches: readonly Partial<CompanyDocumentDemoSelection>[] = [
        ...GOLDENS.map(item => ({ scenarioId: item.id })), ...EVALUATIONS.map(item => ({ evaluationId: item.id })),
      ];
      for (const patch of patches) {
        const next = configure(current, patch); attempts++;
        expect(next.selection).toEqual({ ...current.selection, ...patch });
        const same = next.selection.scenarioId === current.selection.scenarioId && next.selection.evaluationId === current.selection.evaluationId;
        if (same) { noops++; expect(next).toEqual(current); }
        else expect(next.feedback).toEqual({ tone: 'info', code: 'selection_changed',
          message: 'Selección actualizada. El resultado corresponde al ejemplo y al momento elegidos.' });
        expect(current).toEqual(before); frozen(next);
      }
    }
    expect({ attempts, noops }).toEqual({ attempts: 1134, noops: 108 });
  });

  it('reuses the same observation at before/equal/after and going back never preserves future money', () => {
    let state = configure(create(), { scenarioId: 'future' });
    const first = view(state);
    expect(first.evidence).toMatchObject({ reason: 'future_observation', metadata: { observedAt: FUTURE }, document: null });
    state = configure(state, { evaluationId: 'boundary' }); const boundary = view(state);
    expect(boundary.comparisons?.amount).toMatchObject({ observed: { amountCents: 8200 }, delta: { amountCents: 500 }, asOf: FUTURE });
    state = configure(state, { evaluationId: 'after' }); const after = view(state);
    expect(after.evidence).toEqual(boundary.evidence); expect(after.comparisons).toEqual(boundary.comparisons);
    state = configure(state, { evaluationId: 'first' }); const back = view(state);
    expect(back.evidence).toEqual(first.evidence); expect(back.comparisons).toBeNull();
    expect(back.reference).toEqual(first.reference);
  });

  it('cleans attributed money and document data without destroying the known reference or legitimate metadata', () => {
    let state = configure(create(), { scenarioId: 'higher', evaluationId: 'after' });
    expect(view(state).comparisons?.amount.delta?.amountCents).toBe(500);
    state = configure(state, { scenarioId: 'company-different' }); const foreign = view(state);
    expect(foreign.selection.evaluationId).toBe('after');
    expect(foreign.evidence.document).not.toBeNull(); expect(foreign.comparisons?.amount).toMatchObject({ observed: null, delta: null, asOf: null });
    for (const scenarioId of ['response-missing', 'incomplete', 'document-missing'] as const) {
      state = configure(state, { scenarioId }); const current = view(state);
      expect(current.comparisons).toBeNull(); expect(current.evidence.document).toBeNull();
      expect(current.evidence.metadata === null).toBe(scenarioId === 'response-missing');
      expect(current.reference.declaredAmount.amountCents).toBe(7700); privateProjection(current);
    }
  });

  it('accepts empty/same patches and resets to a fresh literal without remembered selection', () => {
    const initial = create(); expect(configure(initial, {})).toEqual(initial);
    expect(configure(initial, { scenarioId: 'same', evaluationId: 'first' })).toEqual(initial);
    const later = configure(initial, { scenarioId: 'zero', evaluationId: 'after' });
    expect(configure(later, {})).toEqual(later);
    const returned = configure(later, { scenarioId: 'same', evaluationId: 'first' });
    expect(returned.feedback.code).toBe('selection_changed');
    expect(create()).toEqual(initial); expect(create()).not.toBe(initial);
    expect(view(create()).selection).toEqual({ scenarioId: 'same', evaluationId: 'first' });
  });

  it('uses the public evaluator, the real missing factory lookup and the real PO projection', () => {
    const evaluate = vi.spyOn(companies, 'evaluateCompanyDocumentEvidence');
    const po = vi.spyOn(companies, 'previewCompanyPurchaseOrderDeclaration');
    view(configure(create(), { scenarioId: 'not-configured' }));
    expect(evaluate).toHaveBeenLastCalledWith(expect.objectContaining({
      expectedAdapterId: 'demo.company-document.adapter', evaluatedAt: NORMAL,
      response: expect.objectContaining({ outcome: 'unavailable', reason: 'not_configured' }),
    }));
    view(configure(create(), { scenarioId: 'response-missing' }));
    expect(evaluate).toHaveBeenLastCalledWith(expect.objectContaining({ response: null }));
    const future = configure(create(), { scenarioId: 'future' }); view(future);
    const first = evaluate.mock.lastCall![0] as { request: unknown; response: unknown };
    view(configure(future, { evaluationId: 'after' }));
    const after = evaluate.mock.lastCall![0] as { request: unknown; response: unknown };
    expect(after.request).toEqual(first.request); expect(after.response).toEqual(first.response);
    expect(po).toHaveBeenCalled();
  });

  it('rejects foreign selectors, forged feedback, extra context and undefined patches without fallback', () => {
    const state = create();
    const badStates: unknown[] = [null, [], {}, { ...state, request: {} }, { ...state, selection: { ...state.selection, scenarioId: 'fallback' } },
      { ...state, selection: { ...state.selection, evaluationId: 'now' } }, { ...state, selection: { ...state.selection, amountCents: 0 } },
      { ...state, feedback: { ...state.feedback, tone: 'success' } }, { ...state, feedback: { ...state.feedback, message: 'approved' } },
      { ...state, feedback: { ...state.feedback, code: 'approved' } }, { ...state, feedback: { ...state.feedback, extra: true } },
      { ...state, selection: { scenarioId: 'zero', evaluationId: 'first' } },
    ];
    for (const bad of badStates) { invalid(() => view(bad)); invalid(() => configure(bad, {})); }
    for (const patch of [null, [], { scenarioId: undefined }, { evaluationId: undefined }, { scenarioId: 'missing' },
      { evaluationId: 'before' }, { request: {} }, { response: null }, { amountCents: 0 }, { scenarioId: 'same', other: true }]) {
      invalid(() => configure(state, patch));
    }
    expect(state).toEqual(create());
  });

  it('rejects descriptors and hostile prototypes without reading getters or leaking arbitrary errors', () => {
    const state = create(); let calls = 0;
    const getter = { enumerable: true, get() { calls++; throw new Error('private@example.test'); } };
    invalid(() => view(Object.defineProperty({ ...state }, 'selection', getter)));
    invalid(() => view({ ...state, selection: Object.defineProperty({ ...state.selection }, 'scenarioId', getter) }));
    invalid(() => view({ ...state, feedback: Object.defineProperty({ ...state.feedback }, 'message', getter) }));
    invalid(() => configure(state, Object.defineProperty({}, 'evaluationId', getter)));
    for (const bad of [Object.assign(Object.create({ inherited: true }) as object, state), { ...state, [Symbol('extra')]: true },
      Object.defineProperty({ ...state }, 'extra', { value: 1 }), new Proxy({}, { ownKeys() { throw new Error('private@example.test'); } }),
      new Proxy({}, { getPrototypeOf() { throw new Error('private@example.test'); } })]) invalid(() => view(bad));
    const patch = new Proxy({}, { ownKeys() { throw new Error('private@example.test'); } }); invalid(() => configure(state, patch));
    expect(calls).toBe(0);
  });

  it('normalizes state before a later patch or feedback trap can mutate original selections', () => {
    const state = copy(create());
    const patch = new Proxy({ evaluationId: 'after' }, { getPrototypeOf(target) {
      state.selection.scenarioId = 'zero'; return Object.getPrototypeOf(target);
    } });
    expect(configure(state, patch).selection).toEqual({ scenarioId: 'same', evaluationId: 'after' });
    const next = copy(create());
    const feedback = new Proxy(next.feedback, { getPrototypeOf(target) {
      next.selection.scenarioId = 'zero'; return Object.getPrototypeOf(target);
    } });
    expect(view({ selection: next.selection, feedback }).selection).toEqual({ scenarioId: 'same', evaluationId: 'first' });
  });

  it('accepts strict null-prototype data records, detaches state and deeply freezes all public data', () => {
    const mutable = copy(create());
    const raw = Object.assign(Object.create(null) as Record<string, unknown>, mutable);
    const current = configure(raw, Object.assign(Object.create(null) as Record<string, unknown>, { scenarioId: 'zero' }));
    const rendered = view(current); const before = structuredClone(rendered);
    mutable.selection.scenarioId = 'lower'; mutable.feedback.message = 'private@example.test';
    expect(rendered).toEqual(before); expect(current.selection.scenarioId).toBe('zero');
    frozen(current); frozen(rendered);
  });

  it('evaluates explicit dates without network, storage, timers, random IDs or implicit time', () => {
    const state: CompanyDocumentDemoState = configure(create(), { scenarioId: 'future', evaluationId: 'boundary' });
    const NativeDate = Date; const forbidden = vi.fn(() => { throw new Error('Efecto inesperado'); });
    class ExplicitDate extends NativeDate {
      constructor(value: string) { if (arguments.length === 0) forbidden(); super(value); }
      static override now(): number { return forbidden(); }
    }
    vi.stubGlobal('Date', ExplicitDate);
    for (const key of ['fetch', 'setTimeout', 'setInterval', 'queueMicrotask']) vi.stubGlobal(key, forbidden);
    vi.stubGlobal('localStorage', { getItem: forbidden, setItem: forbidden });
    vi.stubGlobal('sessionStorage', { getItem: forbidden, setItem: forbidden });
    vi.stubGlobal('crypto', { randomUUID: forbidden, getRandomValues: forbidden });
    expect(view(state).comparisons?.amount.delta?.amountCents).toBe(500);
    expect(view(configure(state, { scenarioId: 'not-configured' })).evidence.reason).toBe('not_configured');
    expect(view(create()).reference.declaredAmount.amountCents).toBe(7700);
    expect(forbidden).not.toHaveBeenCalled();
  });
});
