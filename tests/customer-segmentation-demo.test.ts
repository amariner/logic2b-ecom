import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  advanceCustomerSegmentDemo, configureCustomerSegmentDemo, createCustomerSegmentDemo,
  simulateCustomerSegmentDemo, CUSTOMER_SEGMENT_DEMO_BATCH_SIZE, CUSTOMER_SEGMENT_DEMO_FACT_LABELS,
  CUSTOMER_SEGMENT_DEMO_PROFILES, CUSTOMER_SEGMENT_DEMO_TEMPLATES,
  type CustomerSegmentDemoState, type CustomerSegmentDemoTemplateId,
} from '../src/modules/customers/application/customer-segmentation-demo';
import { CUSTOMER_SEGMENT_FACTS, assertCustomerSegmentRecalculation } from '../src/modules/customers/domain/customer-segmentation';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function configured(id: CustomerSegmentDemoTemplateId): CustomerSegmentDemoState {
  const selected = CUSTOMER_SEGMENT_DEMO_TEMPLATES.find((item) => item.id === id)!;
  return configureCustomerSegmentDemo(createCustomerSegmentDemo(), { templateId: id, parameters: selected.defaults });
}
function finished(state = createCustomerSegmentDemo()): CustomerSegmentDemoState {
  let current = simulateCustomerSegmentDemo(state);
  for (let step = 0; step < 6; step++) current = advanceCustomerSegmentDemo(current);
  expect(current.run?.state).toBe('completed');
  return current;
}
const ids = (state: CustomerSegmentDemoState, status: 'match' | 'no_match' | 'unknown' | 'pending') =>
  state.rows.filter((row) => row.status === status).map((row) => row.id);
const profileIds = (...numbers: number[]) => numbers.map((number) => `demo-profile-${String(number).padStart(2, '0')}`);

describe('modelo local de la demo de segmentación R5.6d', () => {
  it('declara tres templates ilustrativos y doce fotografías con los cuatro hechos permitidos', () => {
    expect(CUSTOMER_SEGMENT_DEMO_TEMPLATES).toHaveLength(3);
    expect(CUSTOMER_SEGMENT_DEMO_PROFILES).toHaveLength(12);
    expect(Object.keys(CUSTOMER_SEGMENT_DEMO_FACT_LABELS).sort()).toEqual([...CUSTOMER_SEGMENT_FACTS].sort());
    const facts = new Set(CUSTOMER_SEGMENT_DEMO_TEMPLATES.flatMap((item) => item.template.conditions.map((condition) => condition.fact)));
    const operators = new Set(CUSTOMER_SEGMENT_DEMO_TEMPLATES.flatMap((item) => item.template.conditions.map((condition) => condition.operator)));
    expect([...facts].sort()).toEqual([...CUSTOMER_SEGMENT_FACTS].sort());
    expect([...operators].sort()).toEqual(['eq', 'gte', 'lte']);
    for (const item of CUSTOMER_SEGMENT_DEMO_PROFILES) expect(Object.keys(item.facts).sort()).toEqual([...CUSTOMER_SEGMENT_FACTS].sort());
    for (const item of CUSTOMER_SEGMENT_DEMO_TEMPLATES) {
      expect(item.template.version).toBe(1);
      expect(item.parameters.map(({ name, min, max }) => ({ name, min, max }))).toEqual(item.template.parameters);
    }
    expect(JSON.stringify(CUSTOMER_SEGMENT_DEMO_PROFILES)).not.toMatch(/@|email|phone|address/iu);
  });

  it('no presenta resultados ni un recálculo antes de iniciar el ejemplo', () => {
    const state = createCustomerSegmentDemo();
    expect(state).toMatchObject({ templateId: 'orders-and-spend', definitionVersion: 1, validationError: null, run: null });
    expect(ids(state, 'pending')).toHaveLength(12);
    expect(advanceCustomerSegmentDemo(state)).toBe(state);
  });

  it('expone solicitud, captura local, lotes de tres y un cierre separado sin adelantar resultados', () => {
    const initial = createCustomerSegmentDemo();
    let state = simulateCustomerSegmentDemo(initial);
    expect(state.run).toMatchObject({ state: 'requested', startedAt: null, totalCandidates: 0, processedCandidates: 0, matchedCustomers: 0 });
    state = advanceCustomerSegmentDemo(state);
    expect(state.run).toMatchObject({ state: 'running', totalCandidates: 12, processedCandidates: 0, matchedCustomers: 0 });
    expect(ids(state, 'pending')).toHaveLength(12);
    expect(CUSTOMER_SEGMENT_DEMO_BATCH_SIZE).toBe(3);
    for (const processed of [3, 6, 9, 12]) {
      state = advanceCustomerSegmentDemo(state);
      expect(state.run).toMatchObject({ state: 'running', processedCandidates: processed, finishedAt: null });
      expect(ids(state, 'pending')).toHaveLength(12 - processed);
      expect(state.run?.matchedCustomers).toBe(ids(state, 'match').length);
      expect(state.rows.filter((row) => row.status !== 'pending')).toHaveLength(processed);
      expect(() => assertCustomerSegmentRecalculation(state.run!, Date.parse('2026-09-01T12:00:06.000Z'))).not.toThrow();
    }
    expect(state.run?.cursor).toBeNull();
    state = advanceCustomerSegmentDemo(state);
    expect(state.run).toMatchObject({ state: 'completed', totalCandidates: 12, processedCandidates: 12, matchedCustomers: 4 });
    expect(advanceCustomerSegmentDemo(state)).toBe(state);
    expect(initial.run).toBeNull();
    expect(ids(initial, 'pending')).toHaveLength(12);
  });

  it.each([
    { template: 'orders-and-spend' as const, matches: [2, 3, 9, 12], unknown: [5, 6, 11] },
    { template: 'recent-activity' as const, matches: [2, 3, 5, 10], unknown: [1, 6, 7, 8, 11, 12] },
    { template: 'new-without-orders' as const, matches: [1, 8, 11], unknown: [6, 7] },
  ])('calcula resultados explicables para $template mediante el motor real', ({ template, matches, unknown }) => {
    const state = finished(configured(template));
    expect(ids(state, 'match')).toEqual(profileIds(...matches));
    expect(ids(state, 'unknown')).toEqual(profileIds(...unknown));
    expect(ids(state, 'no_match')).toHaveLength(12 - matches.length - unknown.length);
    expect(state.run?.matchedCustomers).toBe(matches.length);
  });

  it('distingue cero, ausencia relevante, ausencia irrelevante y filas todavía no evaluadas', () => {
    const recent = finished(configured('recent-activity'));
    expect(recent.rows[9]).toMatchObject({ status: 'match', missingFacts: [], facts: { 'orders.days_since_last': 0 } });
    expect(recent.rows[0]).toMatchObject({ status: 'unknown', missingFacts: ['orders.days_since_last'] });
    const newProfiles = finished(configured('new-without-orders'));
    expect(newProfiles.rows[0]).toMatchObject({ status: 'match', missingFacts: [], facts: { 'orders.count': 0, 'orders.days_since_last': null } });
    expect(newProfiles.rows[6]).toMatchObject({ status: 'unknown', missingFacts: ['customer.age_days'] });
    const firstBatch = advanceCustomerSegmentDemo(advanceCustomerSegmentDemo(simulateCustomerSegmentDemo(configured('recent-activity'))));
    expect(firstBatch.rows[0]?.status).toBe('unknown');
    expect(firstBatch.rows[5]).toMatchObject({ status: 'pending', missingFacts: [] });
  });

  it('señala los datos incompletos incluso cuando otra condición conocida ya no coincide', () => {
    const state = finished();
    expect(state.rows[4]).toMatchObject({ status: 'unknown', missingFacts: ['orders.total_spent_cents'], facts: { 'orders.count': 1 } });
    expect(state.rows[5]?.missingFacts).toEqual(['orders.count', 'orders.total_spent_cents']);
    expect(state.rows[0]?.status).toBe('no_match');
  });

  it('usa límites inclusivos, comparador exacto y céntimos enteros sin reinterpretar la moneda', () => {
    const first = finished();
    expect(first.rows[2]).toMatchObject({ status: 'match', facts: { 'orders.count': 2, 'orders.total_spent_cents': 10_000 } });
    const changed = configureCustomerSegmentDemo(first, {
      templateId: 'orders-and-spend', parameters: { minimum_orders: 2, minimum_spent_cents: 10_001 },
    });
    expect(finished(changed).rows[2]?.status).toBe('no_match');
    const exact = configureCustomerSegmentDemo(first, {
      templateId: 'new-without-orders', parameters: { maximum_age_days: 30, exact_orders: 1 },
    });
    expect(ids(finished(exact), 'match')).toEqual(profileIds(5));
  });

  it.each(['running', 'completed'] as const)('editar durante %s invalida todos los resultados antes de otro avance', (stage) => {
    const old = stage === 'completed' ? finished() : advanceCustomerSegmentDemo(advanceCustomerSegmentDemo(simulateCustomerSegmentDemo(createCustomerSegmentDemo())));
    expect(old.run?.state).toBe(stage);
    const changed = configureCustomerSegmentDemo(old, {
      templateId: old.templateId, parameters: { minimum_orders: 5, minimum_spent_cents: 10_000 },
    });
    expect(changed).toMatchObject({ definitionVersion: old.definitionVersion + 1, validationError: null, run: null });
    expect(ids(changed, 'pending')).toHaveLength(12);
    expect(advanceCustomerSegmentDemo(changed)).toBe(changed);
    expect(ids(finished(changed), 'match')).toEqual(profileIds(9));
    expect(old.run?.processedCandidates).toBe(stage === 'completed' ? 12 : 3);
  });

  it.each([NaN, Infinity, -1, 1.5, 21, ''])('un valor inválido %s limpia el resultado y no permite simular', (value) => {
    const old = finished();
    const invalid = configureCustomerSegmentDemo(old, {
      templateId: old.templateId, parameters: { minimum_orders: value, minimum_spent_cents: 10_000 } as never,
    });
    expect(invalid).toMatchObject({ parameters: null, run: null, definitionVersion: old.definitionVersion + 1 });
    expect(invalid.validationError).toBeTruthy();
    expect(ids(invalid, 'pending')).toHaveLength(12);
    expect(simulateCustomerSegmentDemo(invalid)).toBe(invalid);
    expect(advanceCustomerSegmentDemo(invalid)).toBe(invalid);
  });

  it('cambiar de plantilla exige sus propios parámetros y permite corregir un borrador inválido', () => {
    const old = finished();
    const wrong = configureCustomerSegmentDemo(old, { templateId: 'recent-activity', parameters: old.parameters! });
    expect(wrong).toMatchObject({ templateId: 'recent-activity', parameters: null, run: null });
    const corrected = configureCustomerSegmentDemo(wrong, { templateId: 'recent-activity', parameters: { maximum_inactivity_days: 0 } });
    expect(corrected.validationError).toBeNull();
    expect(ids(finished(corrected), 'match')).toEqual(profileIds(10));
  });

  it('rechaza plantillas, hechos y campos arbitrarios sin conservar un resultado anterior', () => {
    const previous = finished();
    for (const input of [
      { templateId: 'custom-template', parameters: {} },
      { templateId: previous.templateId, parameters: { ...previous.parameters, minimum_age: 0 } },
      { templateId: previous.templateId, parameters: previous.parameters, facts: { 'orders.count': 999 } },
      { templateId: previous.templateId, parameters: { minimum_orders: 2 } },
    ]) {
      const invalid = configureCustomerSegmentDemo(previous, input as never);
      expect(invalid.run).toBeNull();
      expect(invalid.parameters).toBeNull();
      expect(ids(invalid, 'pending')).toHaveLength(12);
    }
  });

  it('no ejecuta getters de configuración y conserva inmutable toda evidencia del ejemplo', () => {
    const initial = createCustomerSegmentDemo();
    const getter = vi.fn(() => 2);
    const invalid = configureCustomerSegmentDemo(initial, {
      templateId: initial.templateId, parameters: { get minimum_orders() { return getter(); }, minimum_spent_cents: 10_000 },
    });
    expect(invalid.parameters).toBeNull();
    expect(getter).not.toHaveBeenCalled();
    const parameters = { minimum_orders: 2, minimum_spent_cents: 10_000 };
    const configured = configureCustomerSegmentDemo(initial, { templateId: initial.templateId, parameters });
    parameters.minimum_orders = 20;
    expect(configured.parameters?.minimum_orders).toBe(2);
    const done = finished(configured);
    for (const value of [CUSTOMER_SEGMENT_DEMO_TEMPLATES, CUSTOMER_SEGMENT_DEMO_TEMPLATES[0],
      CUSTOMER_SEGMENT_DEMO_TEMPLATES[0]!.parameters, CUSTOMER_SEGMENT_DEMO_TEMPLATES[0]!.parameters[0],
      CUSTOMER_SEGMENT_DEMO_TEMPLATES[0]!.defaults, CUSTOMER_SEGMENT_DEMO_TEMPLATES[0]!.template.conditions,
      CUSTOMER_SEGMENT_DEMO_PROFILES, CUSTOMER_SEGMENT_DEMO_PROFILES[0], CUSTOMER_SEGMENT_DEMO_PROFILES[0]!.facts,
      configured, configured.parameters, done, done.run, done.rows, done.rows[5], done.rows[5]!.missingFacts]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
    expect(() => { (done.rows[0]!.facts as Record<string, number>)['orders.count'] = 999; }).toThrow();
  });

  it('repetir la simulación es determinista y solo reinicia el estado local', () => {
    const first = finished();
    const restarted = simulateCustomerSegmentDemo(first);
    expect(restarted.run?.state).toBe('requested');
    expect(ids(restarted, 'pending')).toHaveLength(12);
    expect(restarted.definitionVersion).toBe(first.definitionVersion);
    expect(finished(restarted)).toEqual(first);
    expect(first.run?.state).toBe('completed');
  });

  it('no consulta reloj, red, almacenamiento ni temporizadores', () => {
    const unexpected = () => { throw new Error('Unexpected external effect'); };
    vi.spyOn(Date, 'now').mockImplementation(unexpected);
    vi.stubGlobal('fetch', unexpected);
    vi.stubGlobal('localStorage', { getItem: unexpected, setItem: unexpected });
    vi.stubGlobal('sessionStorage', { getItem: unexpected, setItem: unexpected });
    vi.stubGlobal('setTimeout', unexpected);
    expect(finished().run?.matchedCustomers).toBe(4);
  });
});
