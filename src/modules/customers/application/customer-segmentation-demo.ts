import {
  assertCustomerSegmentRecalculation, createCustomerSegmentFacts,
  CustomerSegmentationContractError, defineCustomerSegmentTemplate,
  evaluateCustomerSegment, instantiateCustomerSegment,
  type CustomerSegmentFact, type CustomerSegmentFacts,
  type CustomerSegmentRecalculation, type CustomerSegmentTemplate,
} from '../domain/customer-segmentation';
import { segmentRecord } from './customer-segmentation-contract';

export const CUSTOMER_SEGMENT_DEMO_BATCH_SIZE = 3;
export type CustomerSegmentDemoTemplateId = 'orders-and-spend' | 'recent-activity' | 'new-without-orders';
export type CustomerSegmentDemoParameter = Readonly<{
  name: string;
  label: string;
  unit: 'count' | 'days' | 'eur_cents';
  min: number;
  max: number;
}>;
export type CustomerSegmentDemoTemplate = Readonly<{
  id: CustomerSegmentDemoTemplateId;
  title: string;
  description: string;
  template: CustomerSegmentTemplate;
  defaults: Readonly<Record<string, number>>;
  parameters: readonly CustomerSegmentDemoParameter[];
}>;
export type CustomerSegmentDemoProfile = Readonly<{
  id: string;
  label: string;
  facts: CustomerSegmentFacts;
}>;
export type CustomerSegmentDemoRow = CustomerSegmentDemoProfile & Readonly<{
  status: 'pending' | 'match' | 'no_match' | 'unknown';
  missingFacts: readonly CustomerSegmentFact[];
}>;
export type CustomerSegmentDemoState = Readonly<{
  templateId: CustomerSegmentDemoTemplateId;
  definitionVersion: number;
  parameters: Readonly<Record<string, number>> | null;
  validationError: string | null;
  run: CustomerSegmentRecalculation | null;
  rows: readonly CustomerSegmentDemoRow[];
}>;

export const CUSTOMER_SEGMENT_DEMO_FACT_LABELS: Readonly<Record<CustomerSegmentFact, string>> = Object.freeze({
  'customer.age_days': 'Antigüedad del perfil',
  'orders.count': 'Pedidos',
  'orders.days_since_last': 'Días desde el último pedido',
  'orders.total_spent_cents': 'Importe acumulado',
});

function template(input: CustomerSegmentDemoTemplate): CustomerSegmentDemoTemplate {
  const definition = defineCustomerSegmentTemplate(input.template);
  const instance = instantiateCustomerSegment(definition, input.defaults);
  return Object.freeze({ ...input, template: definition, defaults: instance.parameters,
    parameters: Object.freeze(input.parameters.map((parameter) => Object.freeze({ ...parameter }))) });
}

/** Umbrales elegidos para estos fixtures; no son políticas ni recomendaciones comerciales. */
export const CUSTOMER_SEGMENT_DEMO_TEMPLATES: readonly CustomerSegmentDemoTemplate[] = Object.freeze([
  template({
    id: 'orders-and-spend', title: 'Pedidos e importe',
    description: 'Ejemplo de dos condiciones que deben cumplirse a la vez.',
    template: { id: 'demo-orders-and-spend', version: 1,
      parameters: [{ name: 'minimum_orders', min: 0, max: 20 }, { name: 'minimum_spent_cents', min: 0, max: 100_000 }],
      conditions: [
        { fact: 'orders.count', operator: 'gte', parameter: 'minimum_orders' },
        { fact: 'orders.total_spent_cents', operator: 'gte', parameter: 'minimum_spent_cents' },
      ] },
    defaults: { minimum_orders: 2, minimum_spent_cents: 10_000 },
    parameters: [
      { name: 'minimum_orders', label: 'Pedidos mínimos', unit: 'count', min: 0, max: 20 },
      { name: 'minimum_spent_cents', label: 'Importe mínimo', unit: 'eur_cents', min: 0, max: 100_000 },
    ],
  }),
  template({
    id: 'recent-activity', title: 'Actividad reciente',
    description: 'Ejemplo de un límite inclusivo sobre los días sin actividad.',
    template: { id: 'demo-recent-activity', version: 1,
      parameters: [{ name: 'maximum_inactivity_days', min: 0, max: 365 }],
      conditions: [{ fact: 'orders.days_since_last', operator: 'lte', parameter: 'maximum_inactivity_days' }] },
    defaults: { maximum_inactivity_days: 30 },
    parameters: [{ name: 'maximum_inactivity_days', label: 'Días máximos desde el último pedido', unit: 'days', min: 0, max: 365 }],
  }),
  template({
    id: 'new-without-orders', title: 'Antigüedad y pedidos exactos',
    description: 'Ejemplo que empieza con perfiles recientes y cero pedidos; cero es un dato conocido.',
    template: { id: 'demo-new-without-orders', version: 1,
      parameters: [{ name: 'maximum_age_days', min: 0, max: 365 }, { name: 'exact_orders', min: 0, max: 20 }],
      conditions: [
        { fact: 'customer.age_days', operator: 'lte', parameter: 'maximum_age_days' },
        { fact: 'orders.count', operator: 'eq', parameter: 'exact_orders' },
      ] },
    defaults: { maximum_age_days: 30, exact_orders: 0 },
    parameters: [
      { name: 'maximum_age_days', label: 'Antigüedad máxima del perfil', unit: 'days', min: 0, max: 365 },
      { name: 'exact_orders', label: 'Pedidos exactos', unit: 'count', min: 0, max: 20 },
    ],
  }),
]);

function profile(index: number, values: readonly [number | null, number | null, number | null, number | null]): CustomerSegmentDemoProfile {
  const number = String(index).padStart(2, '0');
  return Object.freeze({ id: `demo-profile-${number}`, label: `Perfil ${number}`,
    facts: createCustomerSegmentFacts({
      'customer.age_days': values[0], 'orders.count': values[1],
      'orders.days_since_last': values[2], 'orders.total_spent_cents': values[3],
    }) });
}

/** Fotografías sintéticas independientes; no leen clientes, pedidos ni datos financieros. */
export const CUSTOMER_SEGMENT_DEMO_PROFILES: readonly CustomerSegmentDemoProfile[] = Object.freeze([
  profile(1, [10, 0, null, 0]),
  profile(2, [120, 4, 3, 24_000]),
  profile(3, [300, 2, 30, 10_000]),
  profile(4, [45, 1, 60, 5_000]),
  profile(5, [7, 1, 2, null]),
  profile(6, [200, null, null, null]),
  profile(7, [null, 0, null, 0]),
  profile(8, [28, 0, null, 0]),
  profile(9, [365, 8, 120, 80_000]),
  profile(10, [20, 2, 0, 8_000]),
  profile(11, [30, 0, null, null]),
  profile(12, [100, 3, null, 30_000]),
]);

// Fechas del ejemplo, no lecturas del reloj ni promesas de duración del motor.
const REQUESTED_AT = '2026-09-01T12:00:00.000Z';
const STARTED_AT = '2026-09-01T12:00:01.000Z';
const FINISHED_AT = '2026-09-01T12:00:06.000Z';
const FIXTURE_NOW = Date.parse(FINISHED_AT);
const EMPTY_MISSING_FACTS: readonly CustomerSegmentFact[] = Object.freeze([]);

function pendingRows(): readonly CustomerSegmentDemoRow[] {
  return Object.freeze(CUSTOMER_SEGMENT_DEMO_PROFILES.map((item) => Object.freeze({ ...item,
    status: 'pending' as const, missingFacts: EMPTY_MISSING_FACTS })));
}
function selectedTemplate(id: string): CustomerSegmentDemoTemplate {
  const selected = CUSTOMER_SEGMENT_DEMO_TEMPLATES.find((item) => item.id === id);
  if (!selected) throw new CustomerSegmentationContractError('Selecciona una plantilla del ejemplo.');
  return selected;
}
function nextVersion(state: CustomerSegmentDemoState): number {
  const version = state.definitionVersion + 1;
  if (!Number.isSafeInteger(version) || version < 1) throw new CustomerSegmentationContractError('Versión local inválida.');
  return version;
}

/** Estado de presentación en memoria. No crea una definición ni una ejecución durable. */
export function createCustomerSegmentDemo(): CustomerSegmentDemoState {
  const selected = CUSTOMER_SEGMENT_DEMO_TEMPLATES[0]!;
  return Object.freeze({ templateId: selected.id, definitionVersion: 1, parameters: selected.defaults,
    validationError: null, run: null, rows: pendingRows() });
}

/** Cualquier edición invalida el resultado anterior, incluso si el nuevo valor es inválido. */
export function configureCustomerSegmentDemo(
  state: CustomerSegmentDemoState,
  input: Readonly<{ templateId: string; parameters: Readonly<Record<string, number>> }>,
): CustomerSegmentDemoState {
  const definitionVersion = nextVersion(state);
  let templateId = state.templateId;
  try {
    const row = segmentRecord(input, ['templateId', 'parameters'], 'demoConfiguration');
    if (typeof row.templateId !== 'string') throw new CustomerSegmentationContractError('Selecciona una plantilla del ejemplo.');
    const selected = selectedTemplate(row.templateId);
    templateId = selected.id;
    const configured = instantiateCustomerSegment(selected.template, row.parameters as Readonly<Record<string, number>>);
    return Object.freeze({ templateId, definitionVersion, parameters: configured.parameters,
      validationError: null, run: null, rows: pendingRows() });
  } catch (error) {
    if (!(error instanceof CustomerSegmentationContractError)) throw error;
    return Object.freeze({ templateId, definitionVersion, parameters: null,
      validationError: 'Revisa los valores del ejemplo: usa enteros dentro de los límites indicados.',
      run: null, rows: pendingRows() });
  }
}

/** Reinicia únicamente el ejemplo local y deja visible el estado solicitado. */
export function simulateCustomerSegmentDemo(state: CustomerSegmentDemoState): CustomerSegmentDemoState {
  if (state.parameters === null || state.validationError !== null) return state;
  const selected = selectedTemplate(state.templateId);
  instantiateCustomerSegment(selected.template, state.parameters);
  const run = assertCustomerSegmentRecalculation({
    segmentId: selected.template.id, definitionVersion: state.definitionVersion,
    state: 'requested', requestedAt: REQUESTED_AT, startedAt: null, finishedAt: null,
    cursor: null, totalCandidates: 0, processedCandidates: 0, matchedCustomers: 0, errorCode: null,
  }, FIXTURE_NOW);
  return Object.freeze({ ...state, run, rows: pendingRows() });
}

/** Un clic representa una transición; los lotes calculan con el evaluador real, sin I/O. */
export function advanceCustomerSegmentDemo(state: CustomerSegmentDemoState): CustomerSegmentDemoState {
  if (state.parameters === null || state.validationError !== null || state.run === null ||
    (state.run.state !== 'requested' && state.run.state !== 'running')) return state;
  const previous = assertCustomerSegmentRecalculation(state.run, FIXTURE_NOW);
  if (previous.state === 'requested') {
    const run = assertCustomerSegmentRecalculation({ ...previous, state: 'running', startedAt: STARTED_AT,
      cursor: 'demo-cursor-0000', totalCandidates: CUSTOMER_SEGMENT_DEMO_PROFILES.length }, FIXTURE_NOW);
    return Object.freeze({ ...state, run });
  }
  if (previous.processedCandidates === previous.totalCandidates) {
    const run = assertCustomerSegmentRecalculation({ ...previous, state: 'completed', finishedAt: FINISHED_AT,
      cursor: null }, FIXTURE_NOW);
    return Object.freeze({ ...state, run });
  }

  const selected = selectedTemplate(state.templateId);
  const segment = instantiateCustomerSegment(selected.template, state.parameters);
  const end = Math.min(previous.processedCandidates + CUSTOMER_SEGMENT_DEMO_BATCH_SIZE, CUSTOMER_SEGMENT_DEMO_PROFILES.length);
  const rows = Object.freeze(state.rows.map((row, position): CustomerSegmentDemoRow => {
    if (position < previous.processedCandidates || position >= end) return row;
    const result = evaluateCustomerSegment(segment, row.facts);
    return Object.freeze({ ...row, status: result.missingFacts.length > 0 ? 'unknown' : result.matches ? 'match' : 'no_match',
      missingFacts: result.missingFacts });
  }));
  const run = assertCustomerSegmentRecalculation({ ...previous, processedCandidates: end,
    matchedCustomers: rows.filter((row) => row.status === 'match').length,
    cursor: end < previous.totalCandidates ? `demo-cursor-${String(end).padStart(4, '0')}` : null,
  }, FIXTURE_NOW);
  return Object.freeze({ ...state, run, rows });
}
