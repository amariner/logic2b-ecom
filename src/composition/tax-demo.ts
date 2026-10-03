import type { Platform } from './create-platform';
import {
  TAX_CALCULATION_PROFILE, createFixtureTaxAdapter, createFixtureVatIdAdapter,
  defineTaxRequest, defineVatIdQuery, evaluateVatIdEvidence, previewTaxCalculation,
  type TaxAmounts, type TaxAssessmentResponse, type TaxCalculationResult, type TaxDecision,
  type TaxRequest, type TaxRequestLine, type VatIdEvidenceEvaluation,
} from '../modules/taxes';

export type TaxDemoSelection = Readonly<{
  scenario: 'mixed' | 'rounding' | 'zero_exempt' | 'unresolved_shipping' | 'no_assessment';
  priceBasis: 'included' | 'excluded';
  vatScenario: 'valid' | 'invalid' | 'expired' | 'unavailable';
}>;
export type TaxDemoFeedback = Readonly<{ tone: 'info'; code: 'initial' | 'selection_changed'; message: string }>;
export type TaxDemoState = Readonly<{ selection: TaxDemoSelection; feedback: TaxDemoFeedback }>;
export type TaxDemoView = Readonly<{
  selection: TaxDemoSelection;
  scenarioOptions: readonly Readonly<{ id: TaxDemoSelection['scenario']; label: string }>[];
  priceBasisOptions: readonly Readonly<{ id: TaxDemoSelection['priceBasis']; label: string }>[];
  vatScenarioOptions: readonly Readonly<{ id: TaxDemoSelection['vatScenario']; label: string }>[];
  tax: Readonly<{
    outcome: TaxCalculationResult['outcome']; label: string; message: string;
    reason: Extract<TaxCalculationResult, { outcome: 'unresolved' }>['reason'] | null;
    lines: readonly Readonly<{
      id: string; label: string; kind: TaxRequestLine['kind']; priceBasis: TaxRequestLine['priceBasis']; inputCents: number;
      treatment: TaxDecision['treatment'] | null; treatmentLabel: string; rateBasisPoints: number | null;
      exemptionEvidenceRef: string | null; netCents: number | null; taxCents: number | null; grossCents: number | null;
      reasonLabels: readonly string[];
    }>[];
    totals: TaxAmounts | null;
  }>;
  vat: Readonly<{
    status: VatIdEvidenceEvaluation['status']; label: string; message: string;
    outcome: 'valid' | 'invalid' | null;
    reason: Extract<VatIdEvidenceEvaluation, { status: 'unusable' }>['reason'] | null;
    at: string; checkedAt: string | null; expiresAt: string | null;
  }>;
  taxResult: TaxCalculationResult;
  vatResult: VatIdEvidenceEvaluation;
  feedback: TaxDemoFeedback;
}>;

/** Gate de presentación: no activa módulos ni lee bindings operativos. */
export function canShowTaxDemo(
  env: Readonly<{ DEMO_MODE?: string | undefined }> | undefined,
  platform: Pick<Platform, 'manifest'>,
): boolean {
  return platform.manifest.deployment.mode === 'demo' && env?.DEMO_MODE === 'true';
}

const AT = '2026-10-03T12:00:00.000Z';
const CHECKED_AT = '2026-10-03T11:00:00.000Z';
const EXPIRES_AT = '2026-10-03T13:00:00.000Z';
const TAX_ADAPTER_ID = 'demo.tax.adapter';
const VAT_ADAPTER_ID = 'demo.vat.adapter';
const SCENARIO_OPTIONS = Object.freeze([
  Object.freeze({ id: 'mixed' as const, label: 'Desglose con dos tipos' }),
  Object.freeze({ id: 'rounding' as const, label: 'Redondeo por línea' }),
  Object.freeze({ id: 'zero_exempt' as const, label: 'Tipo cero y exención' }),
  Object.freeze({ id: 'unresolved_shipping' as const, label: 'Envío pendiente de resolver' }),
  Object.freeze({ id: 'no_assessment' as const, label: 'Sin evaluación fiscal' }),
]);
const PRICE_BASIS_OPTIONS = Object.freeze([
  Object.freeze({ id: 'excluded' as const, label: 'Impuestos no incluidos' }),
  Object.freeze({ id: 'included' as const, label: 'Impuestos incluidos' }),
]);
const VAT_SCENARIO_OPTIONS = Object.freeze([
  Object.freeze({ id: 'valid' as const, label: 'Positivo y vigente' }),
  Object.freeze({ id: 'invalid' as const, label: 'Negativo y vigente' }),
  Object.freeze({ id: 'expired' as const, label: 'Evidencia caducada' }),
  Object.freeze({ id: 'unavailable' as const, label: 'Comprobación no disponible' }),
]);
const LINE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  'goods.a': 'Producto de ejemplo A', 'goods.b': 'Producto de ejemplo B', shipping: 'Envío de ejemplo',
});
const TREATMENT_LABELS: Readonly<Record<TaxDecision['treatment'], string>> = Object.freeze({
  taxable: 'Sujeto a impuesto', zero_rate: 'Tipo cero', exempt: 'Exento con evidencia ficticia', unresolved: 'Pendiente de resolver',
});
const UNRESOLVED_LABELS = Object.freeze({
  not_configured: 'No hay un tratamiento configurado para esta línea.',
  unsupported: 'El caso ficticio no admite un tratamiento para esta línea.',
  missing_evidence: 'Falta evidencia para resolver el tratamiento de esta línea.',
});
const FEEDBACK = Object.freeze({
  initial: Object.freeze({ tone: 'info' as const, code: 'initial' as const,
    message: 'Explora importes y evidencias ficticios. Las selecciones solo cambian este ejemplo en memoria.' }),
  selection_changed: Object.freeze({ tone: 'info' as const, code: 'selection_changed' as const,
    message: 'Ejemplo actualizado. La comprobación VAT se muestra por separado y no cambia el cálculo fiscal.' }),
});

function requestFor(selection: Pick<TaxDemoSelection, 'scenario' | 'priceBasis'>): TaxRequest {
  const amounts = selection.scenario === 'rounding' ? [5, 5, 50] : [1900, 750, 325];
  return defineTaxRequest({ schemaVersion: 1, id: `demo.tax.${selection.scenario}.${selection.priceBasis}`,
    profile: TAX_CALCULATION_PROFILE, at: AT, currency: 'EUR', lines: ['goods.a', 'goods.b', 'shipping'].map((id, index) => ({
      id, kind: id === 'shipping' ? 'shipping' : 'goods', amountCents: amounts[index]!, priceBasis: selection.priceBasis,
    })) });
}

function decisionsFor(scenario: TaxDemoSelection['scenario']): readonly TaxDecision[] {
  return Object.freeze(['goods.a', 'goods.b', 'shipping'].map((lineId): TaxDecision => {
    const reference = { lineId, jurisdictionRef: 'demo.tax.zone', ruleId: `demo.tax.${scenario}.${lineId}` };
    if (scenario === 'zero_exempt' && lineId === 'goods.a') return Object.freeze({ ...reference, treatment: 'zero_rate' });
    if (scenario === 'zero_exempt' && lineId === 'goods.b') return Object.freeze({ ...reference,
      treatment: 'exempt', exemptionEvidenceRef: 'demo.tax.exemption-evidence' });
    if (scenario === 'unresolved_shipping' && lineId === 'shipping') return Object.freeze({
      lineId, treatment: 'unresolved', reason: 'missing_evidence',
    });
    return Object.freeze({ ...reference, treatment: 'taxable',
      rateBasisPoints: scenario === 'rounding' ? 1000 : lineId === 'goods.b' ? 600 : 1250 });
  }));
}

// Casos sintéticos cerrados: las tasas no representan un régimen fiscal territorial.
// No se declara respuesta para no_assessment; el adaptador devuelve ausencia explícita.
const TAX_ADAPTER = createFixtureTaxAdapter({ adapterId: TAX_ADAPTER_ID,
  cases: SCENARIO_OPTIONS.filter(({ id }) => id !== 'no_assessment').flatMap(({ id: scenario }) =>
    PRICE_BASIS_OPTIONS.map(({ id: priceBasis }): TaxAssessmentResponse => ({
      source: 'fixture', adapterId: TAX_ADAPTER_ID, request: requestFor({ scenario, priceBasis }), outcome: 'assessed',
      assessedAt: CHECKED_AT, expiresAt: EXPIRES_AT, policy: { id: `demo.tax.policy.${scenario}`, version: 1 },
      decisions: decisionsFor(scenario),
    }))) });

const VAT_QUERIES = Object.freeze(Object.fromEntries(VAT_SCENARIO_OPTIONS.map(({ id }) => [id, defineVatIdQuery({
  schemaVersion: 1, id: `demo.vat.${id}`, countryCode: 'ZZ', identifier: `FICTIONAL${id.toUpperCase()}`,
})])) as Readonly<Record<TaxDemoSelection['vatScenario'], ReturnType<typeof defineVatIdQuery>>>);
const VAT_ADAPTER = createFixtureVatIdAdapter({ adapterId: VAT_ADAPTER_ID,
  cases: VAT_SCENARIO_OPTIONS.map(({ id }) => ({ source: 'fixture', adapterId: VAT_ADAPTER_ID,
    query: VAT_QUERIES[id], evidenceRef: `demo.vat.evidence.${id}`, checkedAt: CHECKED_AT,
    expiresAt: id === 'expired' ? AT : EXPIRES_AT, outcome: id === 'expired' ? 'valid' : id,
  })) });

function record(input: unknown, keys: readonly string[], partial = false): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new RangeError('Selección del ejemplo inválida.');
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) throw new RangeError('Selección del ejemplo inválida.');
  const actual = Reflect.ownKeys(input);
  if ((!partial && actual.length !== keys.length) || (partial && actual.length === 0)) throw new RangeError('Selección del ejemplo incompleta.');
  const copy: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of actual) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key)!;
    if (typeof key !== 'string' || !keys.includes(key) || !descriptor.enumerable || !('value' in descriptor)) {
      throw new RangeError('Selección del ejemplo inválida.');
    }
    copy[key] = descriptor.value;
  }
  return copy;
}
function defineSelection(input: unknown): TaxDemoSelection {
  const selection = record(input, ['scenario', 'priceBasis', 'vatScenario']);
  if (!SCENARIO_OPTIONS.some(({ id }) => id === selection.scenario) ||
    !PRICE_BASIS_OPTIONS.some(({ id }) => id === selection.priceBasis) ||
    !VAT_SCENARIO_OPTIONS.some(({ id }) => id === selection.vatScenario)) throw new RangeError('Selección ajena a los casos del ejemplo.');
  return Object.freeze({ scenario: selection.scenario as TaxDemoSelection['scenario'],
    priceBasis: selection.priceBasis as TaxDemoSelection['priceBasis'], vatScenario: selection.vatScenario as TaxDemoSelection['vatScenario'] });
}
function defineState(input: unknown): TaxDemoState {
  const state = record(input, ['selection', 'feedback']);
  const selection = defineSelection(state.selection);
  const inputFeedback = record(state.feedback, ['tone', 'code', 'message']);
  if ((inputFeedback.code !== 'initial' && inputFeedback.code !== 'selection_changed') || inputFeedback.tone !== 'info' ||
    inputFeedback.message !== FEEDBACK[inputFeedback.code].message) throw new RangeError('Estado del ejemplo inválido.');
  return Object.freeze({ selection, feedback: FEEDBACK[inputFeedback.code] });
}

/** Sin buffers ni persistencia: crear otro estado restablece los tres selectores. */
export function createTaxDemo(): TaxDemoState {
  return Object.freeze({ selection: Object.freeze({ scenario: 'mixed', priceBasis: 'excluded', vatScenario: 'valid' }), feedback: FEEDBACK.initial });
}

export function configureTaxDemo(stateInput: TaxDemoState, input: Readonly<Partial<TaxDemoSelection>>): TaxDemoState {
  const state = defineState(stateInput);
  const patch = record(input, ['scenario', 'priceBasis', 'vatScenario'], true);
  return Object.freeze({ selection: defineSelection({ ...state.selection, ...patch }), feedback: FEEDBACK.selection_changed });
}

function taxMessage(result: TaxCalculationResult): Readonly<{ label: string; message: string }> {
  if (result.outcome === 'calculated') return { label: 'Desglose calculado',
    message: 'Cada cuota se redondea por línea; los totales suman esos resultados en céntimos.' };
  if (result.reason === 'line_unresolved') return { label: 'Desglose parcial',
    message: 'Se conservan las líneas resueltas. El total queda pendiente mientras falte resolver una línea.' };
  return { label: 'Sin evaluación fiscal', message: 'Este caso no tiene una evaluación utilizable. Los importes de entrada se conservan y los resultados quedan sin calcular.' };
}
function vatMessage(result: VatIdEvidenceEvaluation): Readonly<{ label: string; message: string }> {
  if (result.status === 'usable') return result.outcome === 'valid'
    ? { label: 'Positivo y vigente', message: 'La evidencia ficticia es positiva y vigente. Esto no concede una exención ni cambia el desglose.' }
    : { label: 'Negativo y vigente', message: 'La evidencia ficticia tiene un resultado negativo vigente. Se muestra por separado del desglose.' };
  return result.reason === 'expired'
    ? { label: 'Evidencia caducada', message: 'La comprobación anterior ha caducado. No se presenta como un resultado positivo o negativo vigente.' }
    : { label: 'Comprobación no disponible', message: 'No hay un resultado VAT utilizable. Su ausencia no se convierte en un resultado negativo ni en una exención.' };
}

/** Solo deriva presentación; dinero, tratamientos y vigencia proceden de las APIs públicas. */
export function getTaxDemoView(stateInput: TaxDemoState): TaxDemoView {
  const state = defineState(stateInput);
  const request = requestFor(state.selection);
  const taxResult = previewTaxCalculation({ request, expectedAdapterId: TAX_ADAPTER.adapterId, response: TAX_ADAPTER.assess(request) });
  const query = VAT_QUERIES[state.selection.vatScenario];
  const vatResult = evaluateVatIdEvidence({ expectedAdapterId: VAT_ADAPTER.adapterId, query, at: AT, response: VAT_ADAPTER.validate(query) });
  const lines = Object.freeze(taxResult.request.lines.map((line) => {
    const result = taxResult.snapshot?.lines.find((candidate) => candidate.line.id === line.id);
    const decision = result?.decision;
    return Object.freeze({ id: line.id, label: LINE_LABELS[line.id]!, kind: line.kind, priceBasis: line.priceBasis, inputCents: line.amountCents,
      treatment: decision?.treatment ?? null, treatmentLabel: decision ? TREATMENT_LABELS[decision.treatment] : 'Sin evaluación',
      rateBasisPoints: decision?.treatment === 'taxable' ? decision.rateBasisPoints : decision?.treatment === 'zero_rate' ? 0 : null,
      exemptionEvidenceRef: decision?.treatment === 'exempt' ? decision.exemptionEvidenceRef : null,
      netCents: result?.netCents ?? null, taxCents: result?.taxCents ?? null, grossCents: result?.grossCents ?? null,
      reasonLabels: Object.freeze(decision?.treatment === 'unresolved' ? [UNRESOLVED_LABELS[decision.reason]]
        : decision ? [] : ['No hay una evaluación fiscal para esta línea.']),
    });
  }));
  return Object.freeze({ selection: state.selection, scenarioOptions: SCENARIO_OPTIONS, priceBasisOptions: PRICE_BASIS_OPTIONS,
    vatScenarioOptions: VAT_SCENARIO_OPTIONS,
    tax: Object.freeze({ outcome: taxResult.outcome, ...taxMessage(taxResult), reason: taxResult.outcome === 'unresolved' ? taxResult.reason : null,
      lines, totals: taxResult.snapshot?.totals ?? null }),
    vat: Object.freeze({ status: vatResult.status, ...vatMessage(vatResult), outcome: vatResult.status === 'usable' ? vatResult.outcome : null,
      reason: vatResult.status === 'unusable' ? vatResult.reason : null, at: vatResult.at,
      checkedAt: vatResult.evidence?.checkedAt ?? null, expiresAt: vatResult.evidence?.expiresAt ?? null }),
    taxResult, vatResult, feedback: state.feedback });
}
