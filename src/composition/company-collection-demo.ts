import type { Platform } from './create-platform';
import {
  defineCompanyDirectory, defineCompanyPaymentTermsPolicy, defineCompanyCollectionObligation,
  defineCompanyCollectionEvidence, previewCompanyCollection,
  type CompanyCollectionEvidence, type CompanyCollectionObservedAmounts, type CompanyCollectionEvidenceEvaluation,
  type CompanyPaymentTermsPreview,
} from '../modules/companies';

export type CompanyCollectionDemoSelection = Readonly<{
  scenarioId: 'partial' | 'missing' | 'incomplete' | 'future' | 'observed-zero' | 'immediate-equal'
    | 'excess' | 'partial-reversal' | 'full-reversal' | 'declared-zero' | 'unconfigured' | 'inactive';
  evaluationId: 'before' | 'on' | 'after';
}>;
export type CompanyCollectionDemoFeedback = Readonly<{ tone: 'info'; code: 'initial' | 'selection_changed'; message: string }>;
export type CompanyCollectionDemoState = Readonly<{ selection: CompanyCollectionDemoSelection; feedback: CompanyCollectionDemoFeedback }>;
export type CompanyCollectionDemoView = Readonly<{
  selection: CompanyCollectionDemoSelection;
  scenarioOptions: readonly Readonly<{ id: CompanyCollectionDemoSelection['scenarioId']; label: string }>[];
  evaluationOptions: readonly Readonly<{ id: CompanyCollectionDemoSelection['evaluationId']; label: string }>[];
  scenarioDescription: string;
  company: Readonly<{ label: string; state: 'active' | 'inactive'; stateLabel: string }>;
  declared: Readonly<{ currency: 'EUR'; amountCents: number }>; evaluatedAt: string;
  calendar: Readonly<{
    outcome: CompanyPaymentTermsPreview['outcome']; conditionLabel: string; baseDate: string; evaluationDate: string;
    dueDate: string | null; duePosition: CompanyPaymentTermsPreview['duePosition']; positionLabel: string; daysUntilDue: number | null;
    milestones: readonly Readonly<{ offsetDays: number; date: string; milestonePosition: 'upcoming' | 'today' | 'past'; label: string }>[];
  }>;
  collection: Readonly<{
    outcome: CompanyCollectionEvidenceEvaluation['outcome']; reason: CompanyCollectionEvidenceEvaluation['reason']; label: string; message: string;
    coverage: 'complete' | 'incomplete' | null; observedAt: string | null; amounts: CompanyCollectionObservedAmounts | null;
    amountPositionLabel: string | null; reversalPositionLabel: string | null;
  }>;
  feedback: CompanyCollectionDemoFeedback;
}>;

/** Presentación de datos locales: el gate no activa cobros, recordatorios ni superficies operativas. */
export function canShowCompanyCollectionDemo(
  env: Readonly<{ DEMO_MODE?: string | undefined }> | undefined, platform: Pick<Platform, 'manifest'>,
): boolean { return platform.manifest.deployment.mode === 'demo' && env?.DEMO_MODE === 'true'; }

const DIRECTORY = defineCompanyDirectory({ schemaVersion: 1, source: 'fixture', id: 'demo.company-collection.directory', version: 1,
  capturedAt: '2026-10-01T00:00:00.000Z', companies: [
    { id: 'company.workshop', displayName: 'Taller de ejemplo', state: 'active', vatId: null },
    { id: 'company.immediate', displayName: 'Comercio de ejemplo', state: 'active', vatId: null },
    { id: 'company.unconfigured', displayName: 'Empresa sin condición de ejemplo', state: 'active', vatId: null },
    { id: 'company.closed', displayName: 'Empresa inactiva de ejemplo', state: 'inactive', vatId: null },
  ], sites: [], contacts: [], roles: [], assignments: [] });
const DIRECTORY_REF = Object.freeze({ id: DIRECTORY.id, version: DIRECTORY.version, capturedAt: DIRECTORY.capturedAt });
const TERMS_POLICY = defineCompanyPaymentTermsPolicy({ schemaVersion: 1, source: 'fixture', id: 'demo.company-collection.terms', version: 1,
  calendar: 'utc-civil-days-v1', directoryRef: DIRECTORY_REF, assignments: [
    { companyId: 'company.workshop', condition: { kind: 'net_days', days: 30 }, reminderOffsetsDays: [-2, 0, 3] },
    { companyId: 'company.immediate', condition: { kind: 'immediate' }, reminderOffsetsDays: [-2, 0, 3] },
    { companyId: 'company.closed', condition: { kind: 'net_days', days: 30 }, reminderOffsetsDays: [-2, 0, 3] },
  ] });
const OBSERVED_AT = '2026-10-29T10:00:00.000Z';
type Observation = Readonly<{ coverage: 'complete'; appliedCents: number; reversedCents: number; observedAt: string }>
  | Readonly<{ coverage: 'incomplete'; observedAt: string }> | null;
function complete(appliedCents: number, reversedCents: number, observedAt = OBSERVED_AT): Observation {
  return Object.freeze({ coverage: 'complete', appliedCents, reversedCents, observedAt });
}
function scenario(
  id: CompanyCollectionDemoSelection['scenarioId'], label: string, description: string,
  companyId: string, amountCents: number, observation: Observation,
) {
  const obligation = defineCompanyCollectionObligation({ schemaVersion: 1, source: 'fixture', profile: 'company-applied-eur-cents-v1',
    id: `demo.company-collection.obligation.${id}`, version: 1, directoryRef: DIRECTORY_REF, companyId, currency: 'EUR', amountCents,
    terms: { policyRef: { id: TERMS_POLICY.id, version: TERMS_POLICY.version },
      baseDate: companyId === 'company.immediate' ? '2026-10-31' : '2026-10-01' } });
  const evidence: CompanyCollectionEvidence | null = observation === null ? null : defineCompanyCollectionEvidence({
    schemaVersion: 1, source: 'fixture', id: `demo.company-collection.evidence.${id}`, version: 1, obligation, ...observation,
  });
  return Object.freeze({ id, label, description, obligation, evidence });
}
// Cada caso fija una obligación y un corte observado. Cambiar la evaluación nunca los modifica.
const SCENARIOS = Object.freeze([
  scenario('partial', 'Parcial · a 30 días', 'Una aplicación parcial observada se compara con el importe declarado y una condición a 30 días.',
    'company.workshop', 10000, complete(4000, 0)),
  scenario('missing', 'Sin evidencia', 'La condición tiene calendario, pero no hay evidencia para conocer los importes aplicados.',
    'company.workshop', 10000, null),
  scenario('incomplete', 'Evidencia incompleta', 'El corte no cubre todas las aplicaciones y reversiones; sus importes permanecen desconocidos.',
    'company.workshop', 10000, Object.freeze({ coverage: 'incomplete', observedAt: OBSERVED_AT })),
  scenario('future', 'Observación: 1 nov', 'La observación del 1 de noviembre solo se puede mostrar al evaluar una fecha igual o posterior.',
    'company.workshop', 10000, complete(4000, 0, '2026-11-01T10:00:00.000Z')),
  scenario('observed-zero', 'Aplicado: cero', 'La evidencia completa declara cero aplicado; esto es distinto de no disponer de evidencia.',
    'company.workshop', 10000, complete(0, 0)),
  scenario('immediate-equal', 'Iguales · inmediata', 'Los importes coinciden en el corte observado y la condición vence en su fecha base declarada.',
    'company.immediate', 10000, complete(10000, 0)),
  scenario('excess', 'Exceso aplicado', 'El aplicado neto observado supera el importe declarado y la diferencia se conserva negativa.',
    'company.workshop', 10000, complete(12500, 0)),
  scenario('partial-reversal', 'Reversión parcial', 'Una reversión parcial reduce lo aplicado, que aún supera el importe declarado en este corte.',
    'company.workshop', 10000, complete(15000, 2000)),
  scenario('full-reversal', 'Reversión total', 'La evidencia conserva lo aplicado y su reversión total, con aplicado neto igual a cero.',
    'company.workshop', 10000, complete(10000, 10000)),
  scenario('declared-zero', 'Declarado: cero', 'El importe declarado y los contadores observados son cero; la igualdad no demuestra un pago.',
    'company.workshop', 0, complete(0, 0)),
  scenario('unconfigured', 'Sin condición', 'Se conocen los importes del corte observado, pero no hay condición ni fecha de vencimiento calculada.',
    'company.unconfigured', 10000, complete(4000, 0)),
  scenario('inactive', 'Empresa inactiva', 'La empresa inactiva conserva sus datos descriptivos de calendario y observación, sin habilitar operaciones.',
    'company.closed', 10000, complete(10000, 0)),
]);
const SCENARIO_OPTIONS = Object.freeze(SCENARIOS.map(item => Object.freeze({ id: item.id, label: item.label })));
const EVALUATIONS = Object.freeze([
  Object.freeze({ id: 'before' as const, at: '2026-10-30T12:00:00.000Z', label: '30 oct 2026 · 12:00 UTC' }),
  Object.freeze({ id: 'on' as const, at: '2026-10-31T12:00:00.000Z', label: '31 oct 2026 · 12:00 UTC' }),
  Object.freeze({ id: 'after' as const, at: '2026-11-02T12:00:00.000Z', label: '2 nov 2026 · 12:00 UTC' }),
]);
const EVALUATION_OPTIONS = Object.freeze(EVALUATIONS.map(item => Object.freeze({ id: item.id, label: item.label })));
const DUE_LABELS = Object.freeze({ before_due: 'Antes del vencimiento', on_due: 'Fecha de vencimiento', after_due: 'Después del vencimiento' });
const MILESTONE_LABELS = Object.freeze({ upcoming: 'Posterior a la evaluación', today: 'Coincide con la evaluación', past: 'Anterior a la evaluación' });
const AMOUNT_LABELS = Object.freeze({ below_expected: 'Aplicado neto por debajo del importe declarado',
  equal_expected: 'Aplicado neto igual al importe declarado', above_expected: 'Aplicado neto por encima del importe declarado' });
const REVERSAL_LABELS = Object.freeze({ none: 'Sin reversiones declaradas', partial: 'Reversión parcial de lo aplicado', full: 'Reversión total de lo aplicado' });
const UNKNOWN_LABELS = Object.freeze({
  missing_evidence: Object.freeze({ label: 'Sin evidencia', message: 'No hay un corte de evidencia para este caso. Los importes observados son desconocidos.' }),
  incomplete_evidence: Object.freeze({ label: 'Evidencia incompleta', message: 'El corte no cubre todas las aplicaciones y reversiones; no se calculan importes observados.' }),
  future_observation: Object.freeze({ label: 'Observación posterior a la evaluación', message: 'La observación ocurre después de la evaluación seleccionada. Sus importes aún no se muestran.' }),
});
const FEEDBACK = Object.freeze({
  initial: Object.freeze({ tone: 'info' as const, code: 'initial' as const, message: 'Selecciona un caso y una fecha de evaluación. Los datos son ficticios.' }),
  selection_changed: Object.freeze({ tone: 'info' as const, code: 'selection_changed' as const,
    message: 'Ejemplo actualizado. El calendario y los importes observados se muestran por separado.' }),
});

function invalid(): never { throw new RangeError('Selección del ejemplo de condiciones y cobros inválida.'); }
function record(input: unknown, keys: readonly string[], partial = false): Readonly<Record<string, unknown>> {
  try {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) return invalid();
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return invalid();
    const actual = Reflect.ownKeys(input);
    if ((!partial && actual.length !== keys.length) || (partial && actual.length === 0)) return invalid();
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of actual) {
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (typeof key !== 'string' || !keys.includes(key) || !descriptor?.enumerable || !('value' in descriptor)) return invalid();
      result[key] = descriptor.value;
    }
    return Object.freeze(result);
  } catch { return invalid(); }
}
function selection(input: unknown): CompanyCollectionDemoSelection {
  const row = record(input, ['scenarioId', 'evaluationId']);
  const scenario = SCENARIOS.find(item => item.id === row.scenarioId); const evaluation = EVALUATIONS.find(item => item.id === row.evaluationId);
  if (!scenario || !evaluation) return invalid();
  return Object.freeze({ scenarioId: scenario.id, evaluationId: evaluation.id });
}
function state(input: unknown): CompanyCollectionDemoState {
  const row = record(input, ['selection', 'feedback']); const current = selection(row.selection);
  const feedback = record(row.feedback, ['tone', 'code', 'message']);
  if ((feedback.code !== 'initial' && feedback.code !== 'selection_changed') || feedback.tone !== 'info' || feedback.message !== FEEDBACK[feedback.code].message) return invalid();
  return Object.freeze({ selection: current, feedback: FEEDBACK[feedback.code] });
}

export function createCompanyCollectionDemo(): CompanyCollectionDemoState {
  return Object.freeze({ selection: Object.freeze({ scenarioId: 'partial', evaluationId: 'on' }), feedback: FEEDBACK.initial });
}
export function configureCompanyCollectionDemo(
  stateInput: CompanyCollectionDemoState, input: Readonly<Partial<CompanyCollectionDemoSelection>>,
): CompanyCollectionDemoState {
  const current = state(stateInput); const patch = record(input, ['scenarioId', 'evaluationId'], true);
  return Object.freeze({ selection: selection({ ...current.selection, ...patch }), feedback: FEEDBACK.selection_changed });
}

/** Solo proyecta resultados del contrato real a etiquetas; no calcula fechas ni importes. */
export function getCompanyCollectionDemoView(stateInput: CompanyCollectionDemoState): CompanyCollectionDemoView {
  const current = state(stateInput);
  const selected = SCENARIOS.find(item => item.id === current.selection.scenarioId)!;
  const evaluated = EVALUATIONS.find(item => item.id === current.selection.evaluationId)!;
  const preview = previewCompanyCollection({ directory: DIRECTORY, termsPolicy: TERMS_POLICY, obligation: selected.obligation,
    evidence: selected.evidence, request: { schemaVersion: 1, id: `demo.company-collection.request.${selected.id}`, evaluatedAt: evaluated.at } });
  const calendar = preview.calendar; const collection = preview.collection; const company = DIRECTORY.companies.find(item => item.id === preview.company.id)!;
  const status = collection.outcome === 'unknown' ? UNKNOWN_LABELS[collection.reason]
    : { label: 'Evidencia completa de ejemplo', message: 'Importes declarados para la fecha de observación indicada; no acreditan movimientos posteriores.' };
  const amounts = collection.observedAmounts;
  return Object.freeze({ selection: current.selection, scenarioOptions: SCENARIO_OPTIONS, evaluationOptions: EVALUATION_OPTIONS,
    scenarioDescription: selected.description, company: Object.freeze({ label: company.displayName, state: preview.company.state,
      stateLabel: preview.company.state === 'active' ? 'Activa' : 'Inactiva' }),
    declared: Object.freeze({ currency: collection.obligation.currency, amountCents: collection.obligation.amountCents }), evaluatedAt: collection.evaluatedAt,
    calendar: Object.freeze({ outcome: calendar.outcome,
      conditionLabel: calendar.condition === null ? 'Sin condición configurada' : calendar.condition.kind === 'immediate' ? 'Inmediata' : `A ${calendar.condition.days} días`,
      baseDate: calendar.baseDate, evaluationDate: calendar.evaluationDate, dueDate: calendar.dueDate, duePosition: calendar.duePosition,
      positionLabel: calendar.duePosition === null ? 'Sin fecha calculada' : DUE_LABELS[calendar.duePosition], daysUntilDue: calendar.daysUntilDue,
      milestones: Object.freeze(calendar.reminderMilestones.map(item => Object.freeze({ offsetDays: item.offsetDays, date: item.date,
        milestonePosition: item.milestonePosition, label: MILESTONE_LABELS[item.milestonePosition] }))) }),
    collection: Object.freeze({ outcome: collection.outcome, reason: collection.reason, ...status,
      coverage: collection.evidence?.coverage ?? null, observedAt: collection.evidence?.observedAt ?? null, amounts,
      amountPositionLabel: amounts === null ? null : AMOUNT_LABELS[amounts.amountPosition],
      reversalPositionLabel: amounts === null ? null : REVERSAL_LABELS[amounts.reversalPosition] }), feedback: current.feedback });
}
