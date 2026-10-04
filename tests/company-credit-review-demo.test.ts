import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canShowCompanyCreditReviewDemo, createCompanyCreditReviewDemo, configureCompanyCreditReviewDemo,
  openCompanyCreditReviewDemo, respondCompanyCreditReviewDemo, getCompanyCreditReviewDemoView,
  type CompanyCreditReviewDemoState, type CompanyCreditReviewDemoSelection,
} from '../src/composition/company-credit-review-demo';
import * as companies from '../src/modules/companies';
import { createPlatform } from '../src/composition/create-platform';
import { createPublicDemoManifest, createPresetManifest } from '../src/platform/configuration';

const create = createCompanyCreditReviewDemo; const configure = configureCompanyCreditReviewDemo;
const open = openCompanyCreditReviewDemo; const respond = respondCompanyCreditReviewDemo; const view = getCompanyCreditReviewDemoView;
const AT = '2026-10-03T12:00:00.000Z'; const OBSERVED = '2026-10-03T11:00:00.000Z'; const FUTURE = '2026-10-03T13:00:00.000Z';
const FIRST = '2026-10-03T12:01:00.000Z'; const SECOND = '2026-10-03T12:02:00.000Z';
const CASES = [
  { id: 'within', amount: 2000, exposure: 6000, projected: 8000, limits: [10000, 5000, 3000], compared: [8000, 2000, 2000], differences: [2000, 3000, 1000], positions: ['below_limit', 'below_limit', 'below_limit'], reason: null },
  { id: 'equal', amount: 3000, exposure: 7000, projected: 10000, limits: [10000, 5000, 3000], compared: [10000, 3000, 3000], differences: [0, 2000, 0], positions: ['equal_limit', 'below_limit', 'equal_limit'], reason: null },
  { id: 'above', amount: 6000, exposure: 6000, projected: 12000, limits: [10000, 5000, 3000], compared: [12000, 6000, 6000], differences: [-2000, -1000, -3000], positions: ['above_limit', 'above_limit', 'above_limit'], reason: null },
  { id: 'missing', amount: 2000, exposure: null, projected: null, limits: [10000, 5000, 3000], compared: [null, 2000, 2000], differences: [null, 3000, 1000], positions: [null, 'below_limit', 'below_limit'], reason: null },
  { id: 'incomplete', amount: 2000, exposure: null, projected: null, limits: [10000, 5000, 3000], compared: [null, 2000, 2000], differences: [null, 3000, 1000], positions: [null, 'below_limit', 'below_limit'], reason: null },
  { id: 'future', amount: 2000, exposure: null, projected: null, limits: [10000, 5000, 3000], compared: [null, 2000, 2000], differences: [null, 3000, 1000], positions: [null, 'below_limit', 'below_limit'], reason: null },
  { id: 'unconfigured', amount: 2000, exposure: 6000, projected: 8000, limits: [null, null, null], compared: [8000, 2000, 2000], differences: [null, null, null], positions: [null, null, null], reason: null },
  { id: 'exposure-only', amount: 2000, exposure: 6000, projected: 8000, limits: [10000, null, null], compared: [8000, 2000, 2000], differences: [2000, null, null], positions: ['below_limit', null, null], reason: null },
  { id: 'request-only', amount: 2000, exposure: 6000, projected: 8000, limits: [null, 5000, null], compared: [8000, 2000, 2000], differences: [null, 3000, null], positions: [null, 'below_limit', null], reason: null },
  { id: 'buyer-only', amount: 2000, exposure: 6000, projected: 8000, limits: [null, null, 3000], compared: [8000, 2000, 2000], differences: [null, null, 1000], positions: [null, null, 'below_limit'], reason: null },
  { id: 'zero', amount: 0, exposure: 0, projected: 0, limits: [0, 0, 0], compared: [0, 0, 0], differences: [0, 0, 0], positions: ['equal_limit', 'equal_limit', 'equal_limit'], reason: null },
  { id: 'inactive-company', amount: 2000, exposure: 6000, projected: 8000, limits: [10000, 5000, 3000], compared: [8000, 2000, 2000], differences: [2000, 3000, 1000], positions: ['below_limit', 'below_limit', 'below_limit'], reason: 'company_inactive' },
  { id: 'inactive-buyer', amount: 2000, exposure: 6000, projected: 8000, limits: [10000, 5000, 3000], compared: [8000, 2000, 2000], differences: [2000, 3000, 1000], positions: ['below_limit', 'below_limit', 'below_limit'], reason: 'buyer_inactive' },
  { id: 'unreachable', amount: 2000, exposure: 6000, projected: 8000, limits: [10000, 5000, 3000], compared: [8000, 2000, 2000], differences: [2000, 3000, 1000], positions: ['below_limit', 'below_limit', 'below_limit'], reason: 'quorum_unreachable' },
  { id: 'buyer-allowed', amount: 2000, exposure: 6000, projected: 8000, limits: [10000, 5000, 3000], compared: [8000, 2000, 2000], differences: [2000, 3000, 1000], positions: ['below_limit', 'below_limit', 'below_limit'], reason: null },
] as const;
function selected(id: CompanyCreditReviewDemoSelection['scenarioId']) { return configure(create(), { scenarioId: id }); }
function accepted(id: CompanyCreditReviewDemoSelection['scenarioId'] = 'within') {
  const first = respond(open(selected(id)), { decision: 'accept' });
  return respond(configure(first, { reviewerKey: id === 'buyer-allowed' ? 'buyer' : 'b' }), { decision: 'accept' });
}
function frozen(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true); for (const child of Object.values(value)) frozen(child);
}
function invalid(operation: () => unknown): void {
  expect(operation).toThrow(new RangeError('Estado del ejemplo de crédito y revisión inválido.'));
}
function assertInvalidState(input: unknown): void {
  const current = input as CompanyCreditReviewDemoState;
  invalid(() => view(current)); invalid(() => configure(current, { reviewerKey: 'a' }));
  invalid(() => open(current)); invalid(() => respond(current, { decision: 'accept' }));
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('gate AND y apertura explícita', () => {
  it.each(['demo', 'client'] as const)('manifest %s necesita DEMO_MODE literal true', mode => {
    const deployment = { id: 'credit-review-demo-test', environment: 'development' as const };
    const platform = createPlatform(mode === 'demo' ? createPublicDemoManifest(deployment) : createPresetManifest('standard', { ...deployment, mode }));
    for (const DEMO_MODE of ['true', 'false', 'TRUE', '', undefined]) {
      const env = { DEMO_MODE, get DB(): never { throw new Error('Unexpected database'); } };
      expect(canShowCompanyCreditReviewDemo(env, platform)).toBe(mode === 'demo' && DEMO_MODE === 'true');
    }
    expect(canShowCompanyCreditReviewDemo(undefined, platform)).toBe(false);
  });

  it('mostrar el ejemplo no activa B2B ni superficies operativas', () => {
    const platform = createPlatform(createPublicDemoManifest({ id: 'credit-review-demo-test', environment: 'development' }));
    expect(canShowCompanyCreditReviewDemo({ DEMO_MODE: 'true' }, platform)).toBe(true);
    expect(platform.capabilityState('B2B-004')).toBe('installed'); expect(platform.isCapabilityActive('B2B-004')).toBe(false);
    expect(platform.hasCapabilityFlag('B2B-004', 'routes')).toBe(false); expect(platform.scheduledJobs('*/1 * * * *')).toEqual([]);
  });

  it('inicia within/A sin caso ni aceptaciones inventadas y con quince opciones explícitas', () => {
    const initial = create(); const current = view(initial);
    expect(initial).toMatchObject({ selection: { scenarioId: 'within', reviewerKey: 'a' }, case: null, lastCreationReason: null, caseSequence: 0, feedback: { code: 'initial' } });
    expect(current.scenarioOptions.map(item => item.id)).toEqual(CASES.map(item => item.id));
    expect(current.scenarioOptions.map(item => item.label)).toEqual(['Bajo los límites', 'En dos límites', 'Límites superados', 'Sin exposición',
      'Evidencia incompleta', 'Observación posterior', 'Sin límites declarados', 'Solo exposición', 'Solo solicitud', 'Solo comprador',
      'Importes y límites cero', 'Empresa inactiva', 'Comprador inactivo', 'Faltan revisores', 'Comprador incluido']);
    expect(current.review).toMatchObject({ status: 'not_open', statusLabel: 'Sin revisión abierta', quorum: 2, acceptanceCount: null,
      createdAt: null, lastOccurredAt: null, history: [], canOpen: true, canSelectReviewer: false, canRespond: false,
      blockedReason: 'Abre la revisión de ejemplo antes de responder.' });
    expect(current.review.contactOptions).toEqual([{ id: 'buyer', label: 'Comprador de ejemplo' }, { id: 'a', label: 'Contacto A' },
      { id: 'b', label: 'Contacto B' }, { id: 'inactive', label: 'Contacto inactivo' }, { id: 'unselected', label: 'Contacto sin designar' }]);
    expect(current.review.contacts.every(contact => contact.responseState === 'not_open')).toBe(true);
  });

  it('calcular y presentar los quince escenarios no llama a la apertura de revisión', () => {
    const openSpy = vi.spyOn(companies, 'createCompanyCreditReviewCase'); const creditSpy = vi.spyOn(companies, 'previewCompanyCredit');
    for (const scenario of CASES) expect(view(selected(scenario.id)).review.status).toBe('not_open');
    expect(openSpy).not.toHaveBeenCalled(); expect(creditSpy).toHaveBeenCalledTimes(15);
    const opened = open(create()); expect(opened.case?.version).toBe(1); expect(openSpy).toHaveBeenCalledTimes(1);
    expect(open(opened).case).toEqual(opened.case); expect(openSpy).toHaveBeenCalledTimes(1);
  });
});

describe('quince escenarios con cantidades literales y ausencia independiente', () => {
  it.each(CASES)('$id conserva números/nulls/asOf y resultado de apertura explícita', scenario => {
    const state = selected(scenario.id); const current = view(state);
    expect(current.requested).toEqual({ currency: 'EUR', amountCents: scenario.amount }); expect(current.evaluatedAt).toBe(AT);
    expect(current.comparisons.map(item => item.id)).toEqual(['companyExposure', 'requestAmount', 'buyerAmount']);
    expect(current.comparisons.map(item => item.limitCents)).toEqual(scenario.limits);
    expect(current.comparisons.map(item => item.comparedCents)).toEqual(scenario.compared);
    expect(current.comparisons.map(item => item.differenceCents)).toEqual(scenario.differences);
    expect(current.comparisons.map(item => item.position)).toEqual(scenario.positions);
    const unknown = scenario.id === 'missing' || scenario.id === 'incomplete' || scenario.id === 'future';
    expect(current.exposure.outcome).toBe(unknown ? 'unknown' : 'observed');
    expect(current.exposure.coverage).toBe(scenario.id === 'missing' ? null : scenario.id === 'incomplete' ? 'incomplete' : 'complete');
    expect(current.exposure.observedAt).toBe(scenario.id === 'missing' ? null : scenario.id === 'future' ? FUTURE : OBSERVED);
    expect(current.exposure.amounts).toEqual(unknown ? null : { asOf: OBSERVED, companyExposureCents: scenario.exposure, companyExposureWithRequestCents: scenario.projected });
    for (const [index, row] of current.comparisons.entries()) {
      if (scenario.limits[index] === null) expect(row).toMatchObject({ status: 'unconfigured', reason: 'limit_unconfigured', reasonLabel: 'Sin límite declarado', positionLabel: null });
      else if (scenario.compared[index] === null) expect(row).toMatchObject({ status: 'unknown', reason: scenario.id === 'missing' ? 'missing_evidence' : scenario.id === 'future' ? 'future_observation' : 'incomplete_evidence' });
      else expect(row).toMatchObject({ status: 'compared', reason: null });
    }
    expect(current.company.state).toBe(scenario.id === 'inactive-company' ? 'inactive' : 'active');
    expect(current.buyer.state).toBe(scenario.id === 'inactive-buyer' ? 'inactive' : 'active');
    const opened = open(state); const after = view(opened);
    expect(after.comparisons).toEqual(current.comparisons); expect(after.exposure).toEqual(current.exposure);
    if (scenario.reason) {
      expect(opened).toMatchObject({ case: null, caseSequence: 0, lastCreationReason: scenario.reason });
      expect(after.review).toMatchObject({ status: 'opening_blocked', openingReason: scenario.reason, acceptanceCount: null,
        createdAt: null, lastOccurredAt: null, history: [], canOpen: false, canSelectReviewer: false, canRespond: false });
      expect(open(opened)).toEqual(opened); expect(respond(opened, { decision: 'accept' })).toEqual(opened);
    } else {
      expect(opened).toMatchObject({ caseSequence: 1, lastCreationReason: null, case: { version: 1, createdAt: AT } });
      expect(after.review).toMatchObject({ status: 'pending', acceptanceCount: 0, history: [], canOpen: false, canSelectReviewer: true, canRespond: true });
      const first = respond(opened, { decision: 'accept' }); const final = respond(configure(first, { reviewerKey: scenario.id === 'buyer-allowed' ? 'buyer' : 'b' }), { decision: 'accept' });
      const terminal = view(final);
      expect(terminal.review).toMatchObject({ status: 'accepted', acceptanceCount: 2, canOpen: false, canSelectReviewer: false, canRespond: false });
      expect(terminal.comparisons).toEqual(current.comparisons); expect(terminal.exposure).toEqual(current.exposure);
      expect(terminal.review.history.map(item => item.occurredAt)).toEqual([FIRST, SECOND]); expect(final.caseSequence).toBe(1);
    }
  });

  it('la matriz conserva 33 comparadas, 9 sin configurar y 3 desconocidas, sin agregado financiero', () => {
    const rows = CASES.flatMap(scenario => view(selected(scenario.id)).comparisons);
    expect(rows.filter(row => row.status === 'compared')).toHaveLength(33);
    expect(rows.filter(row => row.status === 'unconfigured')).toHaveLength(9);
    expect(rows.filter(row => row.status === 'unknown')).toHaveLength(3);
    expect(rows.filter(row => row.position === 'below_limit')).toHaveLength(25);
    expect(rows.filter(row => row.position === 'equal_limit')).toHaveLength(5);
    expect(rows.filter(row => row.position === 'above_limit')).toHaveLength(3);
    expect(view(accepted('missing')).exposure.amounts).toBeNull();
    expect(view(accepted('above')).comparisons.map(row => row.differenceCents)).toEqual([-2000, -1000, -3000]);
    expect(view(accepted('zero')).comparisons.map(row => row.limitCents)).toEqual([0, 0, 0]);
    expect(view(accepted('unconfigured')).comparisons.map(row => row.limitCents)).toEqual([null, null, null]);
  });
});

describe('historial real, contactos y acciones locales', () => {
  it('la aceptación inicial no cambia contacto ni permite que el mismo contacto responda otra vez', () => {
    const initial = create(); const opened = open(initial); const first = respond(opened, { decision: 'accept' });
    expect(first.selection.reviewerKey).toBe('a'); expect(view(first).review).toMatchObject({ status: 'pending', acceptanceCount: 1, canRespond: false,
      blockedReason: 'Este contacto ya ha declarado una respuesta.', lastOccurredAt: FIRST });
    const blocked = respond(first, { decision: 'reject' });
    expect(blocked.case).toEqual(first.case); expect(blocked.caseSequence).toBe(1); expect(blocked.feedback.code).toBe('reviewer_already_decided');
    const final = respond(configure(blocked, { reviewerKey: 'b' }), { decision: 'accept' });
    expect(view(final).review.history).toEqual([
      { reviewerKey: 'a', reviewerLabel: 'Contacto A', decision: 'accept', decisionLabel: 'Aceptación declarada', occurredAt: FIRST },
      { reviewerKey: 'b', reviewerLabel: 'Contacto B', decision: 'accept', decisionLabel: 'Aceptación declarada', occurredAt: SECOND },
    ]);
    expect(initial.case).toBeNull(); expect(opened.case?.decisions).toHaveLength(0); expect(first.case?.decisions).toHaveLength(1);
  });

  it.each([false, true])('rechazo terminal con aceptación previa %s conserva contactos sin responder sin permiso', previousAcceptance => {
    const opened = open(create()); const before = previousAcceptance ? respond(opened, { decision: 'accept' }) : opened;
    const rejected = respond(configure(before, { reviewerKey: 'b' }), { decision: 'reject' }); const current = view(rejected);
    expect(current.review).toMatchObject({ status: 'rejected', acceptanceCount: previousAcceptance ? 1 : 0, canSelectReviewer: false,
      canRespond: false, blockedReason: 'La revisión del ejemplo está cerrada y conserva sus respuestas.' });
    const terminalOther = configure(rejected, { reviewerKey: 'a' });
    expect(view(terminalOther).review.canRespond).toBe(false);
    if (!previousAcceptance) expect(current.review.contacts.find(contact => contact.id === 'a')).toMatchObject({ responseState: 'awaiting', statusLabel: 'Sin responder' });
    expect(respond(terminalOther, { decision: 'accept' }).case).toEqual(rejected.case);
    expect(open(rejected).case).toEqual(rejected.case); expect(rejected.caseSequence).toBe(1);
    expect(current.review.history.at(-1)?.occurredAt).toBe(previousAcceptance ? SECOND : FIRST);
  });

  it.each([
    ['buyer', 'buyer_separation_required', 'El comprador está excluido de la revisión en este ejemplo.'],
    ['inactive', 'reviewer_inactive', 'Este contacto de ejemplo está inactivo.'],
    ['unselected', 'reviewer_not_selected', 'Este contacto no está designado en la política del ejemplo.'],
  ] as const)('contacto %s conserva bloqueo sin consumir ID ni slot temporal', (reviewerKey, code, message) => {
    const opened = open(create()); const chosen = configure(opened, { reviewerKey }); const current = view(chosen);
    expect(current.review).toMatchObject({ canRespond: false, blockedReason: message });
    expect(current.review.contacts.find(contact => contact.id === reviewerKey)).toMatchObject({ responseState: 'not_eligible', eligibilityReasonLabel: message });
    const attempted = respond(chosen, { decision: 'accept' }); expect(attempted.feedback).toMatchObject({ code, message });
    expect(attempted.case).toEqual(opened.case); expect(attempted.caseSequence).toBe(1);
    const allowed = respond(configure(attempted, { reviewerKey: 'a' }), { decision: 'accept' });
    expect(view(allowed).review.history[0]?.occurredAt).toBe(FIRST); expect(allowed.case?.version).toBe(2);
  });

  it('buyer-allowed usa exactamente A y comprador; B no hereda designación de otro escenario', () => {
    const opened = open(selected('buyer-allowed'));
    expect(view(configure(opened, { reviewerKey: 'b' })).review.blockedReason).toBe('Este contacto no está designado en la política del ejemplo.');
    const first = respond(configure(opened, { reviewerKey: 'buyer' }), { decision: 'accept' });
    const final = respond(configure(first, { reviewerKey: 'a' }), { decision: 'accept' });
    expect(view(final).review).toMatchObject({ status: 'accepted', acceptanceCount: 2 });
    expect(view(final).review.history.map(item => item.reviewerKey)).toEqual(['buyer', 'a']);
  });

  it('sin apertura no fabrica caso al responder ni adelanta el contador', () => {
    const initial = create(); const attempted = respond(initial, { decision: 'reject' });
    expect(attempted).toMatchObject({ case: null, caseSequence: 0, lastCreationReason: null, feedback: { code: 'review_required' } });
    expect(view(attempted).review.history).toEqual([]); expect(open(attempted).caseSequence).toBe(1);
  });

  it('los comandos deterministas del modelo conservan replay histórico y conflicto del contrato público', () => {
    const terminal = accepted(); const reviewCase = terminal.case!; const firstCommand = reviewCase.decisions[0]!;
    const replay = companies.applyCompanyCreditReviewDecision({ case: reviewCase, context: reviewCase.context, command: firstCommand });
    expect(replay).toMatchObject({ outcome: 'replayed', snapshot: { status: 'accepted', case: { version: 3 } } });
    expect(replay.snapshot.case).toEqual(reviewCase);
    const conflict = companies.applyCompanyCreditReviewDecision({ case: reviewCase, context: reviewCase.context,
      command: { ...firstCommand, id: 'demo.test.new-command' } });
    expect(conflict).toMatchObject({ outcome: 'conflict', reason: 'version_mismatch', snapshot: { case: reviewCase } });
    expect(terminal.case).toEqual(reviewCase);
  });
});

describe('cambios de contexto, contador y limpieza de proyecciones', () => {
  it('mismo escenario y cambios de contacto conservan votos; nueva apertura tampoco los retira', () => {
    const first = respond(open(create()), { decision: 'accept' });
    expect(configure(first, { scenarioId: 'within' })).toEqual(first);
    expect(configure(first, { reviewerKey: 'a' })).toEqual(first);
    const changed = configure(first, { scenarioId: 'within', reviewerKey: 'b' });
    expect(changed.case).toEqual(first.case); expect(changed.caseSequence).toBe(1);
    const repeated = open(changed); expect(repeated.case).toEqual(first.case); expect(repeated.feedback.code).toBe('already_open');
    expect(repeated.selection.reviewerKey).toBe('b');
  });

  it('cambio real de escenario limpia solo revisión/selector y exige otra apertura con ID distinto', () => {
    const final = accepted('above'); const before = view(final);
    const changed = configure(final, { scenarioId: 'missing' }); const current = view(changed);
    expect(changed).toMatchObject({ selection: { scenarioId: 'missing', reviewerKey: 'a' }, case: null, lastCreationReason: null, caseSequence: 1 });
    expect(current.exposure.amounts).toBeNull(); expect(current.comparisons[0]).toMatchObject({ status: 'unknown', comparedCents: null, differenceCents: null, position: null });
    expect(current.review).toMatchObject({ status: 'not_open', acceptanceCount: null, history: [], createdAt: null, lastOccurredAt: null });
    const opened = open(changed); expect(opened.caseSequence).toBe(2); expect(opened.case?.id).not.toBe(final.case?.id);
    expect(opened.case?.decisions).toHaveLength(0); expect(opened.case?.context.request.id).not.toBe(final.case?.context.request.id);
    expect(view(final)).toEqual(before);
    const back = configure(opened, { scenarioId: 'above' }); expect(back.case).toBeNull(); expect(back.caseSequence).toBe(2);
    expect(open(back).caseSequence).toBe(3);
  });

  it('un bloqueo tras revisión anterior no incrementa secuencia y reset vuelve al literal inicial', () => {
    const final = accepted(); const blocked = open(configure(final, { scenarioId: 'inactive-company' }));
    expect(blocked).toMatchObject({ case: null, caseSequence: 1, lastCreationReason: 'company_inactive' });
    expect(open(blocked)).toEqual(blocked);
    const next = open(configure(blocked, { scenarioId: 'within' })); expect(next.caseSequence).toBe(2);
    expect(create()).toEqual({ selection: { scenarioId: 'within', reviewerKey: 'a' }, case: null, lastCreationReason: null, caseSequence: 0,
      feedback: { tone: 'info', code: 'initial', message: 'Selecciona un caso. La revisión solo empieza cuando la abres.' } });
  });

  it('cada colección aislada limpia su límite/diferencia/posición sin perder comparados conocidos', () => {
    let state = accepted('above');
    for (const [scenarioId, expectedLimits, expectedDifferences] of [
      ['exposure-only', [10000, null, null], [2000, null, null]], ['request-only', [null, 5000, null], [null, 3000, null]],
      ['buyer-only', [null, null, 3000], [null, null, 1000]], ['unconfigured', [null, null, null], [null, null, null]],
    ] as const) {
      state = configure(state, { scenarioId }); const current = view(state);
      expect(current.comparisons.map(item => item.comparedCents)).toEqual([8000, 2000, 2000]);
      expect(current.comparisons.map(item => item.limitCents)).toEqual(expectedLimits);
      expect(current.comparisons.map(item => item.differenceCents)).toEqual(expectedDifferences);
      for (const comparison of current.comparisons.filter(item => item.status === 'unconfigured')) {
        expect(comparison.position).toBeNull(); expect(comparison.positionLabel).toBeNull();
      }
      expect(current.review.history).toEqual([]); expect(current.review.createdAt).toBeNull();
    }
  });
});

describe('frontera estricta y perfil cerrado de artefactos', () => {
  it('rechaza patch vacío/ajeno y combinación contradictoria de nuevo escenario con contacto', () => {
    const initial = create();
    for (const patch of [null, [], {}, { scenarioId: 'unknown' }, { reviewerKey: 'real-user' }, { scenarioId: undefined },
      { reviewerKey: undefined }, { amountCents: 100 }, { scenarioId: 'above', reviewerKey: 'b' }, { scenarioId: 'within', extra: undefined }]) {
      invalid(() => configure(initial, patch as Partial<CompanyCreditReviewDemoSelection>));
    }
    expect(configure(initial, { scenarioId: 'above', reviewerKey: 'a' }).selection).toEqual({ scenarioId: 'above', reviewerKey: 'a' });
    for (const decision of [null, {}, { decision: 'approve' }, { decision: 'accept', extra: undefined }]) {
      invalid(() => respond(initial, decision as { decision: 'accept' | 'reject' }));
    }
  });

  it('rechaza estados adulterados y motivos de apertura incompatibles con el fixture', () => {
    const initial = create(); const opened = open(initial);
    for (const state of [null, [], { ...initial, extra: undefined }, { ...initial, selection: { scenarioId: 'unknown', reviewerKey: 'a' } },
      { ...initial, feedback: { ...initial.feedback, message: 'Inventado' } }, { ...initial, feedback: { ...initial.feedback, code: '__proto__' } },
      { ...initial, lastCreationReason: 'quorum_unreachable' }, { ...opened, lastCreationReason: 'company_inactive' },
      { ...opened, caseSequence: 0 }, { ...opened, caseSequence: 2 }, { ...initial, case: undefined }]) assertInvalidState(state);
    for (const sequence of [-1, -0, 0.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, '1', null]) assertInvalidState({ ...initial, caseSequence: sequence });
    const maximum = { ...initial, caseSequence: Number.MAX_SAFE_INTEGER }; expect(view(maximum).review.status).toBe('not_open'); invalid(() => open(maximum));
  });

  it('un caso genérico válido con ID/fechas ajenos al perfil demo no se puede introducir', () => {
    const opened = open(create()); const context = opened.case!.context;
    const foreign = companies.createCompanyCreditReviewCase({ id: 'case.generic', createdAt: AT, context });
    expect(foreign.outcome).toBe('created'); if (foreign.outcome !== 'created') throw new Error('Fixture inválido');
    assertInvalidState({ ...opened, case: foreign.snapshot.case });
    const later = companies.createCompanyCreditReviewCase({ id: opened.case!.id, createdAt: FIRST, context });
    if (later.outcome !== 'created') throw new Error('Fixture inválido');
    assertInvalidState({ ...opened, case: later.snapshot.case });
    const first = respond(opened, { decision: 'accept' }); const original = first.case!.decisions[0]!;
    const wrongId = { ...first.case!, decisions: [{ ...original, id: 'demo.generic.command' }] };
    expect(companies.defineCompanyCreditReviewCase(wrongId)).toEqual(wrongId); assertInvalidState({ ...first, case: wrongId });
    const wrongTime = { ...first.case!, decisions: [{ ...original, occurredAt: SECOND }] };
    expect(companies.defineCompanyCreditReviewCase(wrongTime)).toEqual(wrongTime); assertInvalidState({ ...first, case: wrongTime });
    assertInvalidState({ ...opened, case: { ...opened.case!, version: 2 } });
    assertInvalidState({ ...accepted('above'), selection: { scenarioId: 'within', reviewerKey: 'a' } });
  });

  it('normaliza copias profundas y conserva la entrada al abrir/configurar/responder', () => {
    const initial = create(); const mutable = { ...initial, selection: { ...initial.selection }, feedback: { ...initial.feedback } };
    const opened = open(mutable); const first = respond(opened, { decision: 'accept' }); const current = view(first);
    for (const output of [initial, opened, first, current]) frozen(output);
    mutable.selection.scenarioId = 'above'; mutable.feedback.message = 'Alterado';
    expect(opened.selection.scenarioId).toBe('within'); expect(current.requested.amountCents).toBe(2000);
    expect(opened.case?.decisions).toEqual([]); expect(first.case?.decisions).toHaveLength(1);
    expect(configure(first, { reviewerKey: 'b' }).case).toEqual(first.case);
  });

  it('no ejecuta getters y redacta errores de Proxy, prototipos, extras y campos ocultos', () => {
    const getter = vi.fn(() => { throw new Error('private@example.test'); }); const initial = create();
    const patch = Object.defineProperty({}, 'scenarioId', { enumerable: true, get: getter }); invalid(() => configure(initial, patch));
    const state = Object.defineProperty({ ...initial }, 'case', { enumerable: true, get: getter }); assertInvalidState(state);
    const note = Object.defineProperty({ tone: 'info', code: 'initial' }, 'message', { enumerable: true, get: getter }); assertInvalidState({ ...initial, feedback: note });
    const command = Object.defineProperty({}, 'decision', { enumerable: true, get: getter }); invalid(() => respond(initial, command as { decision: 'accept' }));
    const hostile = new Proxy({}, { ownKeys() { throw new Error('private@example.test'); } }); assertInvalidState(hostile);
    invalid(() => configure(initial, hostile));
    const hidden = { reviewerKey: 'a' }; Object.defineProperty(hidden, 'secret', { value: 'private', enumerable: false }); invalid(() => configure(initial, hidden as Partial<CompanyCreditReviewDemoSelection>));
    invalid(() => configure(initial, Object.assign(Object.create({ inherited: true }) as object, { reviewerKey: 'a' as const })));
    invalid(() => configure(initial, { [Symbol('private')]: 'a' })); expect(getter).not.toHaveBeenCalled();
  });

  it('la vista omite contexto, identidades y referencias privadas en todas las fases', () => {
    for (const scenario of CASES) {
      const initial = selected(scenario.id); const opened = open(initial);
      const states = scenario.reason ? [initial, opened] : [initial, opened, respond(opened, { decision: 'accept' }), accepted(scenario.id)];
      for (const state of states) {
        const current = view(state); const serialized = JSON.stringify(current);
        expect(serialized).not.toMatch(/demo\.credit-review|contact\.credit-demo|company\.credit-demo|directoryRef|policyRef|identityRef|emailIdentityHash|expectedVersion|commandId|schemaVersion/);
        for (const key of ['case', 'context', 'request', 'creditPolicy', 'reviewPolicy', 'evidence', 'profile', 'approved', 'availableCredit']) expect(current).not.toHaveProperty(key);
      }
    }
  });

  it('recorre números y declaraciones sin red, storage, timers ni reloj implícito', () => {
    const forbidden = vi.fn(() => { throw new Error('Unexpected effect'); });
    class ExplicitDate extends Date {
      constructor(value?: string | number) { if (value === undefined) throw new Error('Implicit clock'); super(value); }
      static override now(): never { throw new Error('Implicit clock'); }
    }
    vi.stubGlobal('Date', ExplicitDate);
    for (const name of ['fetch', 'setTimeout', 'setInterval', 'queueMicrotask']) vi.stubGlobal(name, forbidden);
    for (const name of ['localStorage', 'sessionStorage']) vi.stubGlobal(name, { getItem: forbidden, setItem: forbidden, removeItem: forbidden });
    for (const scenario of CASES) {
      const state = open(selected(scenario.id)); expect(view(state).evaluatedAt).toBe(AT);
      const next = respond(state, { decision: 'accept' }); expect(next.caseSequence).toBe(scenario.reason ? 0 : 1);
    }
    expect(forbidden).not.toHaveBeenCalled();
  });
});
