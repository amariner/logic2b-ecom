import { afterEach, describe, expect, it, vi } from 'vitest';
import * as companies from '../src/modules/companies';
import * as preliminary from '../src/composition/company-preliminary-order';
import {
  createCompanyNegotiationDemo, configureCompanyNegotiationDemo, createCompanyNegotiationDemoDraft,
  applyCompanyNegotiationDemoAction, getCompanyNegotiationDemoView, canShowCompanyNegotiationDemo,
  type CompanyNegotiationDemoOfferId,
  type CompanyNegotiationDemoMomentId, type CompanyNegotiationDemoAction,
} from '../src/composition/company-negotiation-demo';

const initial = createCompanyNegotiationDemo;
const view = getCompanyNegotiationDemoView;
const configure = configureCompanyNegotiationDemo;
const create = createCompanyNegotiationDemoDraft;
const act = (state: unknown, action: CompanyNegotiationDemoAction) => applyCompanyNegotiationDemoAction(state, { action });
const FIXED_ERROR = 'Estado del ejemplo de ofertas y presupuesto inválido.';
const START = '2026-10-03T14:00:00.000Z';
const FIRST = '2026-10-10T12:00:00.000Z';
const SECOND = '2026-10-11T12:00:00.000Z';
const AFTER = '2026-10-12T12:00:00.000Z';
const OFFERS = ['one', 'two', 'three'] as const;
const MOMENTS = ['start', 'first-expiry', 'second-expiry', 'after'] as const;
const PAIRS = ['one-two', 'two-three', 'one-three'] as const;
type Mutable<T> = T extends readonly (infer V)[] ? Mutable<V>[] : T extends object ? { -readonly [K in keyof T]: Mutable<T[K]> } : T;
function copy<T>(value: T): Mutable<T> { return JSON.parse(JSON.stringify(value)) as Mutable<T>; }
function draft(offerId: CompanyNegotiationDemoOfferId = 'one', momentId: CompanyNegotiationDemoMomentId = 'start') {
  let state = configure(initial(), { offerId });
  state = configure(state, { momentId });
  return create(state);
}
function deepFrozen(value: unknown): void {
  if (value !== null && typeof value === 'object') {
    expect(Object.isFrozen(value)).toBe(true);
    Object.values(value).forEach(deepFrozen);
  }
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('company negotiation demo: ofertas y presupuesto independientes', () => {
  it('starts with the literal selection and no implicit draft, amount or action history', () => {
    const state = initial(); const result = view(state);
    expect(state.selection).toEqual({ comparisonId: 'one-two', offerId: 'one', momentId: 'start' });
    expect(state.artifactSequence).toBe(0); expect(state.artifact).toBeNull();
    expect(result.preliminary).toBeNull(); expect(result.canCreate).toBe(true);
    expect(result.selectedOffer.totalCents).toBe(7700);
    expect(result.terms.depositCents).toBe(2000);
    expect(result.actions.every(action => !action.available)).toBe(true);
    expect(result.actions.map(action => action.blockedReason)).toEqual(Array(4).fill('Crea un borrador para simular acciones.'));
  });

  it('projects all 36 closed selections with literal deltas and no phantom budget', () => {
    const expected = {
      'one-two': { subtotalCents: -3000, shippingCents: -500, totalCents: -3500 },
      'two-three': { subtotalCents: 1600, shippingCents: 200, totalCents: 1800 },
      'one-three': { subtotalCents: -1400, shippingCents: -300, totalCents: -1700 },
    };
    const totals = { one: 7700, two: 4200, three: 6000 };
    let count = 0;
    for (const comparisonId of PAIRS) for (const offerId of OFFERS) for (const momentId of MOMENTS) {
      const state = configure(configure(initial(), { comparisonId, offerId }), { momentId });
      const result = view(state);
      expect(result.comparison.deltas).toEqual(expected[comparisonId]);
      expect(result.selectedOffer.totalCents).toBe(totals[offerId]);
      expect(result.preliminary).toBeNull(); expect(state.artifactSequence).toBe(0);
      expect(result.momentOptions.every(option => !option.disabled)).toBe(true); count++;
    }
    expect(count).toBe(36);
  });

  it('preserves explicit zero shipping, removed/added lines and exact variant ownership', () => {
    const first = view(initial()).comparison;
    expect(first.before).toMatchObject({ subtotalCents: 7200, shippingCents: 500, totalCents: 7700 });
    expect(first.after).toMatchObject({ subtotalCents: 4200, shippingCents: 0, totalCents: 4200 });
    expect(first.lineChanges[0]).toMatchObject({ productId: 1, kind: 'changed',
      changedFields: ['variantId', 'quantityUnits', 'unitPriceCents'],
      before: { variantId: 11, sku: 'DEMO-CER-N', quantityUnits: 4, lineTotalCents: 3600 },
      after: { variantId: 12, sku: 'DEMO-CER-A', quantityUnits: 3, lineTotalCents: 4200 } });
    expect(first.lineChanges[1]).toMatchObject({ productId: 2, kind: 'removed', after: null });
    const second = view(configure(initial(), { comparisonId: 'two-three' })).comparison;
    expect(second.lineChanges[1]).toMatchObject({ productId: 2, kind: 'added', before: null,
      after: { variantId: 21, sku: 'DEMO-SOP-U', quantityUnits: 1, unitPriceCents: 1750 } });
  });

  it('delegates money/diffs and availability to the real public APIs without storing probes', () => {
    const compare = vi.spyOn(companies, 'compareCompanyOfferRevisions');
    const selected = vi.spyOn(companies, 'previewCompanyOfferRevision');
    const apply = vi.spyOn(preliminary, 'applyCompanyPreliminaryAction');
    const state = draft(); const before = JSON.stringify(state);
    apply.mockClear(); selected.mockClear();
    const result = view(state);
    expect(compare).toHaveBeenCalled(); expect(selected).toHaveBeenCalled();
    expect(apply).toHaveBeenCalledTimes(4);
    expect(apply.mock.calls.map(call => (call[0] as { command: { action: string } }).command.action)).toEqual(['issue', 'approve', 'expire', 'cancel']);
    expect(result.comparison.deltas).toEqual(compare.mock.results.at(-1)?.value.deltas);
    expect(JSON.stringify(state)).toBe(before); expect(state.artifact?.actions).toEqual([]);
    expect(view(state)).toEqual(result); expect(JSON.stringify(state)).toBe(before);
  });

  it.each(OFFERS)('creates %s explicitly at all four moments, including expiry, without auto transitions', offerId => {
    for (const momentId of MOMENTS) {
      const state = draft(offerId, momentId); const result = view(state);
      expect(result.preliminary?.status).toBe('draft'); expect(result.preliminary?.history).toEqual([]);
      expect(result.preliminary?.createdAt).toBe(result.selectedMoment.at);
      expect(result.preliminary?.totalCents).toBe(result.selectedOffer.totalCents);
      const beforeExpiry = momentId === 'start' || (offerId !== 'one' && momentId === 'first-expiry');
      expect(result.actions.filter(action => action.available).map(action => action.id)).toEqual(beforeExpiry ? ['issue', 'cancel'] : ['expire', 'cancel']);
      expect(state.artifactSequence).toBe(1); expect(result.canCreate).toBe(false);
    }
  });

  it('keeps comparison, same-offer selection and repeated create independent of applied history', () => {
    const original = act(act(draft(), 'issue'), 'approve');
    const changed = configure(original, { comparisonId: 'two-three' });
    expect(changed.artifact).toEqual(original.artifact);
    expect(view(changed).preliminary).toEqual(view(original).preliminary);
    expect(changed.feedback.message).toBe('Comparación cambiada. La selección del presupuesto se conserva.');
    const same = configure(changed, { offerId: 'one', comparisonId: 'two-three' });
    expect(same).toEqual(changed);
    const repeated = create(same);
    expect(repeated.artifact).toEqual(original.artifact); expect(repeated.artifactSequence).toBe(1);
    expect(repeated.feedback.code).toBe('draft_exists');
  });

  it('changing offer clears the artifact and dates, resets moment, preserves the counter and requires creation', () => {
    const original = configure(act(act(draft(), 'issue'), 'approve'), { momentId: 'after', comparisonId: 'two-three' });
    const changed = configure(original, { offerId: 'two' }); const result = view(changed);
    expect(changed.selection).toEqual({ comparisonId: 'two-three', offerId: 'two', momentId: 'start' });
    expect(changed.artifactSequence).toBe(1); expect(result.preliminary).toBeNull();
    expect(result.selectedOffer.totalCents).toBe(4200); expect(result.canCreate).toBe(true);
    const recreated = create(changed);
    expect(recreated.artifactSequence).toBe(2); expect(recreated.artifact?.id).toBe('demo.offer-preliminary.n2.two');
    expect(view(recreated).preliminary).toMatchObject({ status: 'draft', issuedAt: null, approvedAt: null, history: [] });
    expect(original.artifact?.actions).toHaveLength(2);
  });

  it('resets literally and does not restore discarded budgets when selecting an earlier offer', () => {
    let state = act(draft(), 'issue');
    state = configure(state, { offerId: 'two' }); state = configure(state, { offerId: 'one' });
    expect(view(state).preliminary).toBeNull(); expect(state.artifactSequence).toBe(1);
    expect(initial()).toEqual(createCompanyNegotiationDemo());
    expect(initial().artifactSequence).toBe(0);
  });

  it('permits equal timestamps, keeps approval after expiry, and cancels explicitly as the third action', () => {
    let state = act(act(draft(), 'issue'), 'approve');
    expect(view(state).preliminary).toMatchObject({ status: 'approved', issuedAt: START, approvedAt: START });
    state = configure(state, { momentId: 'after' });
    expect(view(state).preliminary?.status).toBe('approved');
    expect(state.feedback.message).toBe('Momento cambiado. No se ha aplicado ninguna acción.');
    const blocked = act(state, 'expire'); expect(blocked.artifact).toEqual(state.artifact);
    state = act(blocked, 'cancel');
    expect(view(state).preliminary).toMatchObject({ status: 'cancelled', lastOccurredAt: AFTER });
    expect(state.artifact?.actions.map(command => [command.id, command.expectedVersion, command.occurredAt])).toEqual([
      ['demo.offer-preliminary.n1.s1.issue', 1, START], ['demo.offer-preliminary.n1.s2.approve', 2, START],
      ['demo.offer-preliminary.n1.s3.cancel', 3, AFTER],
    ]);
    expect(view(state).actions.every(action => !action.available)).toBe(true);
  });

  it('only applied events constrain future moment choices, not a later moment merely inspected', () => {
    let state = configure(draft(), { momentId: 'after' });
    state = configure(state, { momentId: 'start' });
    expect(view(state).selectedMoment.at).toBe(START);
    state = configure(state, { momentId: 'first-expiry' }); state = act(state, 'expire');
    expect(view(state).preliminary).toMatchObject({ status: 'expired', lastOccurredAt: FIRST, issuedAt: null, approvedAt: null });
    expect(view(state).momentOptions.map(option => option.disabled)).toEqual([true, false, false, false]);
    expect(() => configure(state, { momentId: 'start' })).toThrow(FIXED_ERROR);
    expect(() => view({ ...state, selection: { ...state.selection, momentId: 'start' } })).toThrow(FIXED_ERROR);
  });

  it('offers two/three expire at their own later boundary and preserve issuedAt without inventing approvedAt', () => {
    const second = configure(act(draft('two'), 'issue'), { momentId: 'first-expiry' });
    expect(view(second).actions.find(action => action.id === 'approve')?.available).toBe(true);
    const third = configure(act(draft('three'), 'issue'), { momentId: 'second-expiry' });
    expect(view(third).actions.find(action => action.id === 'approve')?.available).toBe(false);
    const expired = act(third, 'expire');
    expect(view(expired).preliminary).toMatchObject({ status: 'expired', issuedAt: START, approvedAt: null, lastOccurredAt: SECOND });
  });

  it('valid unavailable actions only change feedback; missing budget is not a draft', () => {
    const missing = act(initial(), 'approve'); expect(missing.artifact).toBeNull();
    expect(missing.artifactSequence).toBe(0); expect(missing.feedback.code).toBe('draft_required');
    const state = draft(); const blocked = act(state, 'approve');
    expect(blocked.artifact).toEqual(state.artifact); expect(blocked.artifactSequence).toBe(1);
    expect(blocked.feedback.code).toBe('action_blocked'); expect(view(blocked).preliminary?.lastOccurredAt).toBe(START);
  });
});

describe('company negotiation demo: frontera cerrada y sin efectos', () => {
  it('rejects contradictory selection patches and never invents an unknown selector', () => {
    for (const patch of [{}, { offerId: 'unknown' }, { comparisonId: 'three-one' }, { momentId: 'now' },
      { offerId: undefined }, { action: 'issue' }, { offerId: 'two', momentId: 'after' }]) {
      expect(() => configure(initial(), patch)).toThrow(FIXED_ERROR);
    }
    expect(configure(initial(), { offerId: 'two', momentId: 'start', comparisonId: 'one-three' }).selection)
      .toEqual({ offerId: 'two', momentId: 'start', comparisonId: 'one-three' });
    for (const action of [{}, { action: 'convert' }, { action: 'issue', at: START }, { action: undefined }]) {
      expect(() => applyCompanyNegotiationDemoAction(initial(), action)).toThrow(FIXED_ERROR);
    }
  });

  it('validates state before every operation, including apparent no-ops and missing-budget actions', () => {
    const original = initial();
    for (const bad of [null, [], { ...original, extra: true }, { ...original, artifactSequence: -0 },
      { ...original, artifactSequence: 1.5 }, { ...original, selection: { ...original.selection, offerId: 'foreign' } },
      { ...original, feedback: { ...original.feedback, message: 'PII' } },
      { ...original, feedback: { tone: 'info', code: 'toString', message: '' } }]) {
      for (const operation of [() => view(bad), () => create(bad), () => configure(bad, { offerId: 'one' }), () => act(bad, 'approve')]) {
        expect(operation).toThrow(FIXED_ERROR);
      }
    }
  });

  it('rejects generic valid artifacts whose complete binding, identity or terms are not the fixture', () => {
    const state = draft(); const base = state.artifact!;
    const bindings = [
      { ...base.binding, terms: { ...base.binding.terms, depositCents: 1000 } },
      { ...base.binding, terms: { ...base.binding.terms, conversionGate: 'approval' } },
      { ...base.binding, terms: { ...base.binding.terms, preliminaryId: 'another_quote' } },
      { ...base.binding, revisionId: 'offer.two' },
    ];
    const altered = copy(base.binding);
    altered.negotiation.context.directory.companies[0]!.displayName = 'Otra empresa declarada';
    bindings.push(altered);
    const hiddenOffer = copy(base.binding);
    hiddenOffer.negotiation.revisions[2]!.shippingCents = 201; bindings.push(hiddenOffer);
    for (const binding of bindings) {
      const generic = preliminary.createCompanyPreliminaryArtifact({ id: base.id, createdAt: START, binding });
      expect(generic.order.status).toBe('draft');
      expect(() => view({ ...state, artifact: generic.artifact })).toThrow(FIXED_ERROR);
    }
    const otherId = preliminary.createCompanyPreliminaryArtifact({ id: 'other.artifact', createdAt: START, binding: base.binding });
    expect(() => view({ ...state, artifact: otherId.artifact })).toThrow(FIXED_ERROR);
    expect(() => view({ ...state, artifactSequence: 0 })).toThrow(FIXED_ERROR);
    expect(() => view({ ...state, artifactSequence: 2 })).toThrow(FIXED_ERROR);
  });

  it('rejects coherent generic histories with dates or command IDs outside the finite demo', () => {
    const state = draft(); const base = state.artifact!;
    const outside = preliminary.createCompanyPreliminaryArtifact({ id: base.id, binding: base.binding, createdAt: '2026-10-03T14:01:00.000Z' });
    expect(() => view({ ...state, artifact: outside.artifact })).toThrow(FIXED_ERROR);
    for (const [id, occurredAt] of [['other.command', START], ['demo.offer-preliminary.n1.s1.issue', '2026-10-03T14:01:00.000Z']]) {
      const generic = preliminary.applyCompanyPreliminaryAction({ artifact: base, binding: base.binding,
        command: { id, artifactId: base.id, expectedVersion: 1, action: 'issue', occurredAt } });
      expect(generic.outcome).toBe('applied');
      expect(() => view({ ...state, selection: { ...state.selection, momentId: 'after' }, artifact: generic.snapshot.artifact })).toThrow(FIXED_ERROR);
    }
  });

  it('closes counter overflow, but still preserves an existing artifact at the inclusive safe maximum', () => {
    const max = Number.MAX_SAFE_INTEGER;
    const exhausted = { ...initial(), artifactSequence: max };
    expect(view(exhausted).canCreate).toBe(false);
    expect(view(exhausted).createBlockedReason).toContain('Restablécelo');
    expect(() => create(exhausted)).toThrow(FIXED_ERROR);
    expect(() => view({ ...initial(), artifactSequence: max + 1 })).toThrow(FIXED_ERROR);
    const last = create({ ...initial(), artifactSequence: max - 1 });
    expect(last.artifactSequence).toBe(max);
    expect(create(last).artifact).toEqual(last.artifact);
    expect(view(act(last, 'issue')).preliminary?.status).toBe('issued');
  });

  it('copies and freezes state/DTO without exposing private artifacts or lifecycle authority', () => {
    const source = copy(act(draft(), 'issue')); const snapshot = view(source); const captured = copy(snapshot);
    source.artifact!.binding.negotiation.context.directory.companies[0]!.displayName = 'mutated';
    source.artifact!.actions[0]!.occurredAt = AFTER;
    expect(snapshot).toEqual(captured); deepFrozen(snapshot); deepFrozen(act(draft(), 'issue')); deepFrozen(initial());
    const forbidden = new Set(['artifact', 'binding', 'negotiation', 'context', 'request', 'directoryRef', 'catalogRef',
      'revisionId', 'preliminaryId', 'artifactSequence', 'expectedVersion', 'version', 'commandId', 'identityRef',
      'paidCents', 'paymentStatus', 'convertedOrderId']);
    function check(value: unknown): void {
      if (value !== null && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
        expect(forbidden.has(key)).toBe(false); check(child);
      }
    }
    check(snapshot);
    expect(JSON.stringify(snapshot)).not.toMatch(/demo\.offer-demo|demo\.offer-preliminary|quote_demo_n|offer\.one/);
  });

  it('captures state before a hostile later patch mutates the original input', () => {
    const original = copy(act(draft(), 'issue')); const baseline = copy(original.artifact);
    const patch = new Proxy({ comparisonId: 'two-three' }, { ownKeys(target) {
      original.artifact!.binding.negotiation.context.directory.companies[0]!.displayName = 'changed late';
      return Reflect.ownKeys(target);
    } });
    const changed = configure(original, patch);
    expect(changed.artifact).toEqual(baseline); expect(view(changed).preliminary?.status).toBe('issued');
  });

  it('rejects getters, exotic prototypes, symbol extras and redacts arbitrary Proxy errors without invoking getters', () => {
    let reads = 0;
    const getter = { get offerId() { reads++; return 'one'; } };
    expect(() => configure(initial(), getter)).toThrow(FIXED_ERROR);
    const hostileState = { ...initial(), get artifact() { reads++; return null; } };
    expect(() => view(hostileState)).toThrow(FIXED_ERROR);
    expect(() => applyCompanyNegotiationDemoAction(initial(), { get action() { reads++; return 'issue'; } })).toThrow(FIXED_ERROR);
    const artifact = copy(draft().artifact!);
    Object.defineProperty(artifact.binding.negotiation.context.catalog.products[1]!.variants[0]!, 'priceCents',
      { enumerable: true, get() { reads++; return 2000; } });
    expect(() => view({ ...draft(), artifact })).toThrow(FIXED_ERROR);
    for (const state of [Object.create(initial()), { ...initial(), [Symbol('extra')]: true },
      new Proxy({}, { ownKeys() { throw new Error('secret@example.test'); } }),
      new Proxy({}, { getPrototypeOf() { throw new Error('private-token'); } })]) {
      expect(() => view(state)).toThrow(FIXED_ERROR);
    }
    expect(reads).toBe(0);
  });

  it('treats unexpected underlying outcomes as closed errors, never a retry or optimistic transition', () => {
    const state = draft(); const snapshot = preliminary.previewCompanyPreliminaryArtifact({ artifact: state.artifact });
    const apply = vi.spyOn(preliminary, 'applyCompanyPreliminaryAction');
    apply.mockReturnValueOnce({ outcome: 'conflict', reason: 'version_mismatch', snapshot });
    expect(() => act(state, 'issue')).toThrow(FIXED_ERROR);
    apply.mockReturnValueOnce({ outcome: 'replayed', snapshot });
    expect(() => view(state)).toThrow(FIXED_ERROR);
    apply.mockImplementationOnce(() => { throw new Error('internal private information'); });
    expect(() => act(state, 'issue')).toThrow(FIXED_ERROR);
    expect(state.artifact?.actions).toEqual([]);
  });

  it('runs the complete interaction with implicit clocks, network, storage and timers blocked', () => {
    let effects = 0;
    const stop = () => { effects++; throw new Error('Unexpected effect'); };
    class ExplicitDate extends Date {
      constructor(value?: string | number) { if (value === undefined) stop(); super(value!); }
      static override now(): number { return stop(); }
    }
    vi.stubGlobal('Date', ExplicitDate); vi.stubGlobal('fetch', stop);
    vi.stubGlobal('localStorage', { getItem: stop, setItem: stop });
    vi.stubGlobal('sessionStorage', { getItem: stop, setItem: stop });
    vi.stubGlobal('setTimeout', stop); vi.stubGlobal('setInterval', stop);
    const state = configure(act(act(draft(), 'issue'), 'approve'), { comparisonId: 'one-three', momentId: 'after' });
    expect(view(state).preliminary?.status).toBe('approved'); expect(effects).toBe(0);
  });

  it('requires both gate signals and never reads accessors or inherits gate values', () => {
    const platform = (mode: string) => ({ manifest: { deployment: { mode } } }) as unknown as Parameters<typeof canShowCompanyNegotiationDemo>[1];
    for (const flag of [undefined, 'false', 'TRUE', 'true']) for (const mode of ['demo', 'production']) {
      const env = flag === undefined ? undefined : { DEMO_MODE: flag };
      expect(canShowCompanyNegotiationDemo(env, platform(mode))).toBe(flag === 'true' && mode === 'demo');
    }
    expect(canShowCompanyNegotiationDemo({ DEMO_MODE: 'true' }, undefined)).toBe(false);
    let reads = 0;
    expect(canShowCompanyNegotiationDemo({ get DEMO_MODE() { reads++; return 'true'; } }, platform('demo'))).toBe(false);
    const getterPlatform = { get manifest() { reads++; return { deployment: { mode: 'demo' } }; } } as unknown as Parameters<typeof canShowCompanyNegotiationDemo>[1];
    expect(canShowCompanyNegotiationDemo({ DEMO_MODE: 'true' }, getterPlatform)).toBe(false);
    expect(canShowCompanyNegotiationDemo(Object.create({ DEMO_MODE: 'true' }) as { DEMO_MODE: string }, platform('demo'))).toBe(false);
    const hostile = new Proxy({}, { getOwnPropertyDescriptor() { throw new Error('private'); } });
    expect(canShowCompanyNegotiationDemo(hostile, platform('demo'))).toBe(false); expect(reads).toBe(0);
  });
});
