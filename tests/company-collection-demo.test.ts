import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canShowCompanyCollectionDemo, createCompanyCollectionDemo, configureCompanyCollectionDemo, getCompanyCollectionDemoView,
  type CompanyCollectionDemoState, type CompanyCollectionDemoSelection,
} from '../src/composition/company-collection-demo';
import * as companies from '../src/modules/companies';
import { createPlatform } from '../src/composition/create-platform';
import { createPresetManifest, createPublicDemoManifest } from '../src/platform/configuration';

const create = createCompanyCollectionDemo; const configure = configureCompanyCollectionDemo; const view = getCompanyCollectionDemoView;
const OBSERVED = '2026-10-29T10:00:00.000Z'; const FUTURE = '2026-11-01T10:00:00.000Z';
const GOLDENS = [
  ['partial', 10000, 4000, 0, 4000, 6000, 'below_expected', 'none'],
  ['missing', 10000, null, null, null, null, null, null],
  ['incomplete', 10000, null, null, null, null, null, null],
  ['future', 10000, 4000, 0, 4000, 6000, 'below_expected', 'none'],
  ['observed-zero', 10000, 0, 0, 0, 10000, 'below_expected', 'none'],
  ['immediate-equal', 10000, 10000, 0, 10000, 0, 'equal_expected', 'none'],
  ['excess', 10000, 12500, 0, 12500, -2500, 'above_expected', 'none'],
  ['partial-reversal', 10000, 15000, 2000, 13000, -3000, 'above_expected', 'partial'],
  ['full-reversal', 10000, 10000, 10000, 0, 10000, 'below_expected', 'full'],
  ['declared-zero', 0, 0, 0, 0, 0, 'equal_expected', 'none'],
  ['unconfigured', 10000, 4000, 0, 4000, 6000, 'below_expected', 'none'],
  ['inactive', 10000, 10000, 0, 10000, 0, 'equal_expected', 'none'],
] as const;
const EVALUATIONS = [
  { id: 'before', at: '2026-10-30T12:00:00.000Z', date: '2026-10-30', duePosition: 'before_due', days: 1, milestonePositions: ['past', 'upcoming', 'upcoming'] },
  { id: 'on', at: '2026-10-31T12:00:00.000Z', date: '2026-10-31', duePosition: 'on_due', days: 0, milestonePositions: ['past', 'today', 'upcoming'] },
  { id: 'after', at: '2026-11-02T12:00:00.000Z', date: '2026-11-02', duePosition: 'after_due', days: -2, milestonePositions: ['past', 'past', 'upcoming'] },
] as const;
const CASES = GOLDENS.flatMap(([scenarioId, expected, applied, reversed, net, difference, position, reversal]) => EVALUATIONS.map(evaluation => ({
  scenarioId, evaluation, expected, applied, reversed, net, difference, position, reversal,
})));
function frozen(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true); for (const child of Object.values(value)) frozen(child);
}
function invalid(operation: () => unknown): void {
  expect(operation).toThrow(new RangeError('Selección del ejemplo de condiciones y cobros inválida.'));
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('gate de demo e inicio explícito', () => {
  it.each(['demo', 'client'] as const)('requiere manifest %s y DEMO_MODE literal con platform explícito', mode => {
    const deployment = { id: 'collection-demo-isolation', environment: 'development' as const };
    const platform = createPlatform(mode === 'demo' ? createPublicDemoManifest(deployment) : createPresetManifest('standard', { ...deployment, mode }));
    for (const DEMO_MODE of ['true', 'false', 'TRUE', '', undefined]) {
      const env = { DEMO_MODE, get DB(): never { throw new Error('Unexpected database'); } };
      expect(canShowCompanyCollectionDemo(env, platform)).toBe(mode === 'demo' && DEMO_MODE === 'true');
    }
    expect(canShowCompanyCollectionDemo(undefined, platform)).toBe(false);
  });

  it('la presentación conserva B2B instalado e inactivo, sin superficies operativas', () => {
    const platform = createPlatform(createPublicDemoManifest({ id: 'collection-demo-isolation', environment: 'development' }));
    expect(canShowCompanyCollectionDemo({ DEMO_MODE: 'true' }, platform)).toBe(true);
    for (const id of ['B2B-001', 'B2B-003'] as const) {
      expect(platform.capabilityState(id)).toBe('installed'); expect(platform.isCapabilityActive(id)).toBe(false);
      expect(platform.hasCapabilityFlag(id, 'routes')).toBe(false);
    }
    expect(platform.scheduledJobs('*/1 * * * *')).toEqual([]);
  });

  it('inicia partial/on con observación distinta de evaluación y opciones cortas declaradas', () => {
    const initial = create(); const current = view(initial);
    expect(initial.selection).toEqual({ scenarioId: 'partial', evaluationId: 'on' }); expect(initial.feedback.code).toBe('initial');
    expect(current.scenarioOptions.map(item => item.id)).toEqual(GOLDENS.map(row => row[0]));
    expect(current.scenarioOptions.map(item => item.label)).toEqual(['Parcial · a 30 días', 'Sin evidencia', 'Evidencia incompleta', 'Observación: 1 nov',
      'Aplicado: cero', 'Iguales · inmediata', 'Exceso aplicado', 'Reversión parcial', 'Reversión total', 'Declarado: cero', 'Sin condición', 'Empresa inactiva']);
    expect(current.evaluationOptions.map(item => item.id)).toEqual(['before', 'on', 'after']);
    expect(current.company).toEqual({ label: 'Taller de ejemplo', state: 'active', stateLabel: 'Activa' });
    expect(current.calendar.conditionLabel).toBe('A 30 días'); expect(current.calendar.dueDate).toBe('2026-10-31');
    expect(current.evaluatedAt).toBe('2026-10-31T12:00:00.000Z'); expect(current.collection.observedAt).toBe(OBSERVED);
    expect(current.collection.amounts).toMatchObject({ asOf: OBSERVED, netAppliedCents: 4000, differenceCents: 6000 });
  });
});

describe('36 estados, calendario y observación independientes', () => {
  it.each(CASES)('$scenarioId / $evaluation.id', ({ scenarioId, evaluation, expected, applied, reversed, net, difference, position, reversal }) => {
    const current = view(configure(create(), { scenarioId, evaluationId: evaluation.id }));
    expect(current.selection).toEqual({ scenarioId, evaluationId: evaluation.id });
    expect(current.declared).toEqual({ currency: 'EUR', amountCents: expected }); expect(current.evaluatedAt).toBe(evaluation.at);
    expect(current.company.state).toBe(scenarioId === 'inactive' ? 'inactive' : 'active');
    expect(current.calendar.evaluationDate).toBe(evaluation.date);
    expect(current.calendar.baseDate).toBe(scenarioId === 'immediate-equal' ? '2026-10-31' : '2026-10-01');
    if (scenarioId === 'unconfigured') {
      expect(current.calendar).toMatchObject({ outcome: 'unconfigured', conditionLabel: 'Sin condición configurada', dueDate: null,
        duePosition: null, daysUntilDue: null, positionLabel: 'Sin fecha calculada', milestones: [] });
    } else {
      expect(current.calendar).toMatchObject({ outcome: 'configured', conditionLabel: scenarioId === 'immediate-equal' ? 'Inmediata' : 'A 30 días',
        dueDate: '2026-10-31', duePosition: evaluation.duePosition, daysUntilDue: evaluation.days });
      expect(current.calendar.milestones.map(item => item.date)).toEqual(['2026-10-29', '2026-10-31', '2026-11-03']);
      expect(current.calendar.milestones.map(item => item.offsetDays)).toEqual([-2, 0, 3]);
      expect(current.calendar.milestones.map(item => item.milestonePosition)).toEqual(evaluation.milestonePositions);
    }
    const unknownReason = scenarioId === 'missing' ? 'missing_evidence' : scenarioId === 'incomplete' ? 'incomplete_evidence'
      : scenarioId === 'future' && evaluation.id !== 'after' ? 'future_observation' : null;
    expect(current.collection.outcome).toBe(unknownReason === null ? 'observed' : 'unknown'); expect(current.collection.reason).toBe(unknownReason);
    expect(current.collection.coverage).toBe(scenarioId === 'missing' ? null : scenarioId === 'incomplete' ? 'incomplete' : 'complete');
    expect(current.collection.observedAt).toBe(scenarioId === 'missing' ? null : scenarioId === 'future' ? FUTURE : OBSERVED);
    if (unknownReason !== null) {
      expect(current.collection.amounts).toBeNull(); expect(current.collection.amountPositionLabel).toBeNull(); expect(current.collection.reversalPositionLabel).toBeNull();
    } else {
      expect(current.collection.amounts).toEqual({ asOf: scenarioId === 'future' ? FUTURE : OBSERVED, appliedCents: applied, reversedCents: reversed,
        netAppliedCents: net, differenceCents: difference, amountPosition: position, reversalPosition: reversal });
      expect(current.collection.amountPositionLabel).toBeTruthy(); expect(current.collection.reversalPositionLabel).toBeTruthy();
    }
    expect(current.scenarioDescription.length).toBeGreaterThan(30);
  });

  it('verifica la distribución y no confunde cantidades observadas con fechas configuradas', () => {
    const views = CASES.map(row => view(configure(create(), { scenarioId: row.scenarioId, evaluationId: row.evaluation.id })));
    expect(views).toHaveLength(36); expect(views.filter(row => row.collection.outcome === 'observed')).toHaveLength(28);
    expect(views.filter(row => row.collection.outcome === 'unknown')).toHaveLength(8);
    expect(views.filter(row => row.calendar.outcome === 'configured')).toHaveLength(33);
    expect(views.filter(row => row.calendar.outcome === 'unconfigured')).toHaveLength(3);
    for (const [position, count] of [['below_expected', 13], ['equal_expected', 9], ['above_expected', 6]] as const) {
      expect(views.filter(row => row.collection.amounts?.amountPosition === position)).toHaveLength(count);
    }
    for (const [position, count] of [['none', 22], ['partial', 3], ['full', 3]] as const) {
      expect(views.filter(row => row.collection.amounts?.reversalPosition === position)).toHaveLength(count);
    }
  });

  it('proyecta la salida real del preview público y sus fixtures completos', () => {
    const preview = vi.spyOn(companies, 'previewCompanyCollection');
    const current = view(configure(create(), { scenarioId: 'partial-reversal', evaluationId: 'after' }));
    expect(preview).toHaveBeenCalledTimes(1);
    const input = preview.mock.calls[0]![0] as { obligation: companies.CompanyCollectionObligation; evidence: companies.CompanyCollectionEvidence; request: companies.CompanyCollectionRequest };
    expect(input.evidence.obligation).toEqual(input.obligation); expect(input.request.evaluatedAt).toBe(current.evaluatedAt);
    const output = preview.mock.results[0]!.value as companies.CompanyCollectionPreview;
    expect(current.collection.amounts).toEqual(output.collection.observedAmounts);
    expect(current.declared.amountCents).toBe(output.collection.obligation.amountCents);
    expect(current.calendar.dueDate).toBe(output.calendar.dueDate);
    expect(current.calendar.daysUntilDue).toBe(output.calendar.daysUntilDue);
    expect(current.calendar.milestones.map(({ label: _label, ...item }) => item)).toEqual(output.calendar.reminderMilestones.map(({ daysUntilMilestone: _days, ...item }) => item));
  });
});

describe('transiciones, limpieza y privacidad del DTO', () => {
  it('cada cambio de evaluación conserva el caso y sus importes/asOf ya observados', () => {
    for (const [scenarioId] of GOLDENS) {
      let state = configure(create(), { scenarioId, evaluationId: 'before' });
      const before = view(state);
      for (const evaluation of EVALUATIONS) {
        state = configure(state, { evaluationId: evaluation.id }); const current = view(state);
        expect(current.selection).toEqual({ scenarioId, evaluationId: evaluation.id });
        expect(current.declared).toEqual(before.declared); expect(current.company).toEqual(before.company);
        expect(current.collection.observedAt).toBe(before.collection.observedAt);
        if (scenarioId !== 'future') expect(current.collection.amounts).toEqual(before.collection.amounts);
      }
    }
  });

  it('cambiar caso conserva cada evaluación explícita y reset vuelve exactamente a partial/on', () => {
    for (const evaluation of EVALUATIONS) {
      let state = configure(create(), { evaluationId: evaluation.id });
      for (const [scenarioId] of GOLDENS) {
        state = configure(state, { scenarioId });
        expect(state.selection).toEqual({ scenarioId, evaluationId: evaluation.id }); expect(view(state).evaluatedAt).toBe(evaluation.at);
      }
      expect(state.feedback.code).toBe('selection_changed');
    }
    expect(view(create())).toEqual(view(create())); expect(create().selection).toEqual({ scenarioId: 'partial', evaluationId: 'on' });
  });

  it('volver de observado a futuro/incompleto/ausente no conserva cifras anteriores', () => {
    let state = configure(create(), { scenarioId: 'excess', evaluationId: 'after' });
    expect(view(state).collection.amounts?.differenceCents).toBe(-2500);
    state = configure(state, { scenarioId: 'future' }); expect(view(state).collection.amounts?.asOf).toBe(FUTURE);
    state = configure(state, { evaluationId: 'on' });
    expect(view(state).collection).toMatchObject({ reason: 'future_observation', observedAt: FUTURE, amounts: null, amountPositionLabel: null, reversalPositionLabel: null });
    state = configure(state, { scenarioId: 'incomplete' }); expect(view(state).collection).toMatchObject({ reason: 'incomplete_evidence', observedAt: OBSERVED, amounts: null });
    state = configure(state, { scenarioId: 'missing' }); expect(view(state).collection).toMatchObject({ reason: 'missing_evidence', observedAt: null, coverage: null, amounts: null });
    state = configure(state, { scenarioId: 'observed-zero' }); expect(view(state).collection.amounts).toMatchObject({ appliedCents: 0, netAppliedCents: 0, differenceCents: 10000 });
    state = configure(state, { scenarioId: 'declared-zero' }); expect(view(state).declared.amountCents).toBe(0);
    expect(view(state).collection.amounts).toMatchObject({ differenceCents: 0, reversalPosition: 'none' });
  });

  it('el DTO no expone refs, IDs de empresa/obligación/evidencia ni datos operativos', () => {
    for (const row of CASES) {
      const current = view(configure(create(), { scenarioId: row.scenarioId, evaluationId: row.evaluation.id }));
      const serialized = JSON.stringify(current);
      for (const token of ['demo.company-collection.', 'company.workshop', 'company.immediate', 'company.unconfigured', 'company.closed',
        'directoryRef', 'policyRef', 'requestId', 'schemaVersion', 'company-applied-eur-cents-v1', 'identityRef', 'emailIdentityHash', 'profileId']) {
        expect(serialized).not.toContain(token);
      }
      for (const key of ['obligation', 'evidence', 'preview', 'paid', 'unpaid', 'overdue', 'balance', 'recipients', 'jobs', 'paymentId']) expect(current).not.toHaveProperty(key);
      expect(current.company).not.toHaveProperty('id');
    }
  });
});

describe('estado estricto, inmutabilidad y ausencia de efectos', () => {
  it('congela estado/vista profundamente y desacopla los inputs sin mutarlos', () => {
    const initial = create(); const mutable = { selection: { ...initial.selection }, feedback: { ...initial.feedback } };
    const patch = { scenarioId: 'excess' as const };
    const changed = configure(mutable, patch); const result = view(changed); frozen(initial); frozen(changed); frozen(result);
    mutable.selection.scenarioId = 'missing'; mutable.feedback.message = 'Changed';
    expect(changed.selection.scenarioId).toBe('excess'); expect(result.collection.amounts?.differenceCents).toBe(-2500);
    expect(initial.selection).toEqual({ scenarioId: 'partial', evaluationId: 'on' }); expect(patch).toEqual({ scenarioId: 'excess' });
  });

  it('rechaza selección, patch y feedback ajenos antes de fabricar un resultado', () => {
    const initial = create();
    for (const patch of [null, [], {}, { scenarioId: 'unknown' }, { evaluationId: 'today' }, { scenarioId: undefined },
      { evaluationId: undefined }, { amountCents: 100 }, { scenarioId: 'partial', extra: undefined }, { [Symbol('secret')]: 'partial' }]) {
      invalid(() => configure(initial, patch as unknown as Partial<CompanyCollectionDemoSelection>));
    }
    const states = [null, [], { ...initial, extra: undefined }, { ...initial, selection: { ...initial.selection, scenarioId: 'missing.other' } },
      { ...initial, selection: { ...initial.selection, evaluationId: undefined } }, { ...initial, feedback: { ...initial.feedback, message: 'Injected' } },
      { ...initial, feedback: { ...initial.feedback, code: '__proto__' } }];
    for (const state of states) {
      invalid(() => view(state as unknown as CompanyCollectionDemoState));
      invalid(() => configure(state as unknown as CompanyCollectionDemoState, { scenarioId: 'partial' }));
    }
    expect(view(initial).collection.amounts?.netAppliedCents).toBe(4000);
  });

  it('no ejecuta getters y redacta trampas de introspección', () => {
    const getter = vi.fn(() => { throw new Error('private@example.test'); }); const initial = create();
    const patch = Object.defineProperty({}, 'scenarioId', { enumerable: true, get: getter });
    invalid(() => configure(initial, patch));
    const selection = Object.defineProperty({ evaluationId: 'on' }, 'scenarioId', { enumerable: true, get: getter });
    invalid(() => view({ ...initial, selection } as unknown as CompanyCollectionDemoState));
    const feedback = Object.defineProperty({ tone: 'info', code: 'initial' }, 'message', { enumerable: true, get: getter });
    invalid(() => view({ ...initial, feedback } as unknown as CompanyCollectionDemoState));
    const hostile = new Proxy({}, { getPrototypeOf() { throw new Error('private@example.test'); } });
    invalid(() => view(hostile as CompanyCollectionDemoState)); invalid(() => configure(initial, hostile));
    const hidden = { scenarioId: 'partial' }; Object.defineProperty(hidden, 'secret', { value: 'private', enumerable: false });
    invalid(() => configure(initial, hidden as Partial<CompanyCollectionDemoSelection>));
    invalid(() => configure(initial, Object.assign(Object.create({ inherited: true }), { scenarioId: 'partial' })));
    expect(getter).not.toHaveBeenCalled();
  });

  it('recorre los estados sin IO, almacenamiento, timers o reloj implícito', () => {
    class ExplicitDate extends Date {
      constructor(value?: string | number) { if (value === undefined) throw new Error('Implicit clock'); super(value); }
      static override now(): never { throw new Error('Implicit clock'); }
    }
    const forbidden = vi.fn(() => { throw new Error('Unexpected effect'); }); vi.stubGlobal('Date', ExplicitDate);
    for (const name of ['fetch', 'setTimeout', 'setInterval']) vi.stubGlobal(name, forbidden);
    for (const name of ['localStorage', 'sessionStorage']) vi.stubGlobal(name, { getItem: forbidden, setItem: forbidden });
    for (const row of CASES) {
      const current = view(configure(create(), { scenarioId: row.scenarioId, evaluationId: row.evaluation.id }));
      expect(current.evaluatedAt).toBe(row.evaluation.at);
    }
    expect(forbidden).not.toHaveBeenCalled();
  });
});
