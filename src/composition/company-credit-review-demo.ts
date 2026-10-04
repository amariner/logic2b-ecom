import type { Platform } from './create-platform';
import {
  defineCompanyDirectory, defineCompanyCreditPolicy, defineCompanyCreditRequest, defineCompanyCreditExposureEvidence,
  defineCompanyCreditReviewPolicy, previewCompanyCredit, createCompanyCreditReviewCase,
  previewCompanyCreditReview, applyCompanyCreditReviewDecision,
  type CompanyCreditPreview, type CompanyCreditReviewCase, type CompanyCreditReviewContext,
  type CompanyCreditReviewSnapshot, type CompanyCreditReviewCreationBlockReason, type CompanyCreditUnknownReason,
} from '../modules/companies';

export type CompanyCreditReviewDemoSelection = Readonly<{
  scenarioId: 'within' | 'equal' | 'above' | 'missing' | 'incomplete' | 'future' | 'unconfigured'
    | 'exposure-only' | 'request-only' | 'buyer-only' | 'zero' | 'inactive-company' | 'inactive-buyer' | 'unreachable' | 'buyer-allowed';
  reviewerKey: 'buyer' | 'a' | 'b' | 'inactive' | 'unselected';
}>;
export type CompanyCreditReviewDemoFeedback = Readonly<{
  tone: 'info'; code: 'initial' | 'scenario_changed' | 'reviewer_changed' | 'review_opened' | 'company_inactive'
    | 'buyer_inactive' | 'quorum_unreachable' | 'already_open' | 'review_required' | 'acceptance_recorded'
    | 'rejection_recorded' | 'review_terminal' | 'reviewer_not_selected' | 'reviewer_inactive'
    | 'buyer_separation_required' | 'reviewer_already_decided'; message: string;
}>;
export type CompanyCreditReviewDemoState = Readonly<{
  selection: CompanyCreditReviewDemoSelection; case: CompanyCreditReviewCase | null;
  lastCreationReason: CompanyCreditReviewCreationBlockReason | null; caseSequence: number; feedback: CompanyCreditReviewDemoFeedback;
}>;
export type CompanyCreditReviewDemoView = Readonly<{
  selection: CompanyCreditReviewDemoSelection;
  scenarioOptions: readonly Readonly<{ id: CompanyCreditReviewDemoSelection['scenarioId']; label: string }>[];
  scenarioDescription: string;
  company: Readonly<{ label: string; state: 'active' | 'inactive'; stateLabel: string }>;
  buyer: Readonly<{ label: string; state: 'active' | 'inactive'; stateLabel: string }>;
  requested: Readonly<{ currency: 'EUR'; amountCents: number }>; evaluatedAt: string;
  exposure: Readonly<{
    outcome: 'observed' | 'unknown'; reason: CompanyCreditUnknownReason | null; label: string; message: string;
    coverage: 'complete' | 'incomplete' | null; observedAt: string | null;
    amounts: Readonly<{ asOf: string; companyExposureCents: number; companyExposureWithRequestCents: number }> | null;
  }>;
  comparisons: readonly Readonly<{
    id: 'companyExposure' | 'requestAmount' | 'buyerAmount'; label: string;
    status: 'compared' | 'unconfigured' | 'unknown'; statusLabel: string;
    limitCents: number | null; comparedCents: number | null; differenceCents: number | null;
    position: 'below_limit' | 'equal_limit' | 'above_limit' | null; positionLabel: string | null;
    reason: 'limit_unconfigured' | CompanyCreditUnknownReason | null; reasonLabel: string | null;
  }>[];
  review: Readonly<{
    status: 'not_open' | 'opening_blocked' | 'pending' | 'accepted' | 'rejected'; statusLabel: string;
    openingReason: CompanyCreditReviewCreationBlockReason | null; openingReasonLabel: string | null;
    quorum: number; acceptanceCount: number | null; createdAt: string | null; lastOccurredAt: string | null;
    canOpen: boolean; canSelectReviewer: boolean; canRespond: boolean; blockedReason: string | null;
    contactOptions: readonly Readonly<{ id: CompanyCreditReviewDemoSelection['reviewerKey']; label: string }>[];
    contacts: readonly Readonly<{
      id: CompanyCreditReviewDemoSelection['reviewerKey']; label: string; state: 'active' | 'inactive'; stateLabel: string;
      responseState: 'not_open' | 'not_eligible' | 'awaiting' | 'responded'; statusLabel: string; eligibilityReasonLabel: string | null;
    }>[];
    history: readonly Readonly<{
      reviewerKey: CompanyCreditReviewDemoSelection['reviewerKey']; reviewerLabel: string;
      decision: 'accept' | 'reject'; decisionLabel: string; occurredAt: string;
    }>[];
  }>;
  feedback: CompanyCreditReviewDemoFeedback;
}>;

/** Gate de presentación: no activa crédito, permisos o superficies operativas. */
export function canShowCompanyCreditReviewDemo(
  env: Readonly<{ DEMO_MODE?: string | undefined }> | undefined, platform: Pick<Platform, 'manifest'>,
): boolean { return platform.manifest.deployment.mode === 'demo' && env?.DEMO_MODE === 'true'; }

const AT = '2026-10-03T12:00:00.000Z';
const OBSERVED_AT = '2026-10-03T11:00:00.000Z';
const DECISION_AT = Object.freeze(['2026-10-03T12:01:00.000Z', '2026-10-03T12:02:00.000Z']);
const COMPANY_ID = 'company.credit-demo';
const COMPANY_LABEL = 'Empresa de crédito de ejemplo';
const CONTACTS = Object.freeze([
  Object.freeze({ id: 'buyer' as const, contactId: 'contact.credit-demo.buyer', label: 'Comprador de ejemplo' }),
  Object.freeze({ id: 'a' as const, contactId: 'contact.credit-demo.a', label: 'Contacto A' }),
  Object.freeze({ id: 'b' as const, contactId: 'contact.credit-demo.b', label: 'Contacto B' }),
  Object.freeze({ id: 'inactive' as const, contactId: 'contact.credit-demo.inactive', label: 'Contacto inactivo' }),
  Object.freeze({ id: 'unselected' as const, contactId: 'contact.credit-demo.unselected', label: 'Contacto sin designar' }),
]);
const CONTACT_OPTIONS = Object.freeze(CONTACTS.map(contact => Object.freeze({ id: contact.id, label: contact.label })));
type Scenario = Readonly<{
  id: CompanyCreditReviewDemoSelection['scenarioId']; label: string; description: string; context: CompanyCreditReviewContext;
}>;
type ScenarioOptions = Readonly<{
  amountCents?: number; exposureCents?: number; observation?: 'complete' | 'missing' | 'incomplete' | 'future';
  limits?: 'all' | 'none' | 'exposure' | 'request' | 'buyer' | 'zero';
  companyInactive?: boolean; buyerInactive?: boolean; review?: 'default' | 'unreachable' | 'buyer_allowed';
}>;
/** Configuración privada y cerrada: todos los artefactos pasan por las factories públicas reales. */
function scenario(id: Scenario['id'], label: string, description: string, options: ScenarioOptions = {}): Scenario {
  const directory = defineCompanyDirectory({ schemaVersion: 1, source: 'fixture', id: `demo.credit-review.directory.${id}`, version: 1,
    capturedAt: '2026-10-03T10:00:00.000Z', companies: [
      { id: COMPANY_ID, displayName: COMPANY_LABEL, state: options.companyInactive ? 'inactive' : 'active', vatId: null },
    ], sites: [], contacts: CONTACTS.map(contact => ({ id: contact.contactId, companyId: COMPANY_ID, displayName: contact.label,
      state: contact.id === 'inactive' || (contact.id === 'buyer' && options.buyerInactive) ? 'inactive' : 'active', identityRef: null })),
    roles: [], assignments: [] });
  const directoryRef = Object.freeze({ id: directory.id, version: directory.version, capturedAt: directory.capturedAt });
  const limits = options.limits ?? 'all';
  const allLimits = limits === 'all' || limits === 'zero';
  const creditPolicy = defineCompanyCreditPolicy({ schemaVersion: 1, source: 'fixture', profile: 'company-credit-eur-cents-v1',
    id: `demo.credit-review.limits.${id}`, version: 1, directoryRef, currency: 'EUR',
    companyExposureLimits: allLimits || limits === 'exposure' ? [{ companyId: COMPANY_ID, limitCents: limits === 'zero' ? 0 : 10000 }] : [],
    companyRequestLimits: allLimits || limits === 'request' ? [{ companyId: COMPANY_ID, limitCents: limits === 'zero' ? 0 : 5000 }] : [],
    buyerLimits: allLimits || limits === 'buyer' ? [{ companyId: COMPANY_ID, contactId: CONTACTS[0]!.contactId, requestLimitCents: limits === 'zero' ? 0 : 3000 }] : [],
  });
  const request = defineCompanyCreditRequest({ schemaVersion: 1, source: 'fixture', profile: 'company-credit-eur-cents-v1',
    id: `demo.credit-review.request.${id}`, version: 1, directoryRef, policyRef: { id: creditPolicy.id, version: creditPolicy.version },
    companyId: COMPANY_ID, buyerContactId: CONTACTS[0]!.contactId, currency: 'EUR', amountCents: options.amountCents ?? 2000 });
  const observation = options.observation ?? 'complete';
  const commonEvidence = { schemaVersion: 1, source: 'fixture', id: `demo.credit-review.exposure.${id}`, version: 1,
    excludedRequest: request, observedAt: observation === 'future' ? '2026-10-03T13:00:00.000Z' : OBSERVED_AT };
  const evidence = observation === 'missing' ? null : defineCompanyCreditExposureEvidence(observation === 'incomplete'
    ? { ...commonEvidence, coverage: 'incomplete' }
    : { ...commonEvidence, coverage: 'complete', companyExposureCents: options.exposureCents ?? 6000 });
  const review = options.review ?? 'default';
  const reviewPolicy = defineCompanyCreditReviewPolicy({ schemaVersion: 1, source: 'fixture', profile: 'company-credit-review-v1',
    id: `demo.credit-review.reviewers.${id}`, version: 1, directoryRef, companyId: COMPANY_ID,
    reviewerContactIds: (review === 'default' ? CONTACTS.slice(0, 4) : CONTACTS.slice(0, 2)).map(contact => contact.contactId),
    buyerSeparation: review === 'buyer_allowed' ? 'allowed' : 'required', quorum: 2 });
  return Object.freeze({ id, label, description, context: Object.freeze({ directory, creditPolicy, request, evaluatedAt: AT, evidence, reviewPolicy }) });
}
const SCENARIOS = Object.freeze([
  scenario('within', 'Bajo los límites', 'Las tres cantidades quedan por debajo de sus límites declarados. La revisión solo empieza si la abres explícitamente.'),
  scenario('equal', 'En dos límites', 'La exposición con la solicitud y el importe del comprador coinciden con sus límites. La igualdad no autoriza una compra.',
    { amountCents: 3000, exposureCents: 7000 }),
  scenario('above', 'Límites superados', 'Las tres cantidades superan los límites declarados. La revisión permanece separada y ninguna operación se rechaza automáticamente.',
    { amountCents: 6000 }),
  scenario('missing', 'Sin exposición', 'No hay evidencia de exposición. Los importes de solicitud y comprador siguen siendo conocidos y comparables.', { observation: 'missing' }),
  scenario('incomplete', 'Evidencia incompleta', 'La evidencia no declara una exposición completa. Su fecha se conserva, pero no se inventa un importe observado.', { observation: 'incomplete' }),
  scenario('future', 'Observación posterior', 'La observación de las 13:00 es posterior a la evaluación de las 12:00. Sus importes no se anticipan.', { observation: 'future' }),
  scenario('unconfigured', 'Sin límites declarados', 'No se han declarado límites. Las cantidades conocidas se conservan, sin convertir ausencia en cero o en crédito ilimitado.', { limits: 'none' }),
  scenario('exposure-only', 'Solo exposición', 'Solo hay límite para la exposición de empresa; los otros importes siguen conocidos sin heredar ese límite.', { limits: 'exposure' }),
  scenario('request-only', 'Solo solicitud', 'Solo hay límite por solicitud de empresa; la exposición y el comprador no reciben un límite implícito.', { limits: 'request' }),
  scenario('buyer-only', 'Solo comprador', 'Solo hay límite por solicitud del comprador; no sustituye los dos límites empresariales ausentes.', { limits: 'buyer' }),
  scenario('zero', 'Importes y límites cero', 'La solicitud, la exposición y los límites son cero explícitos. La igualdad numérica no demuestra una autorización.',
    { amountCents: 0, exposureCents: 0, limits: 'zero' }),
  scenario('inactive-company', 'Empresa inactiva', 'La empresa inactiva conserva sus comparaciones, pero el perfil de revisión del ejemplo impide abrir un expediente.', { companyInactive: true }),
  scenario('inactive-buyer', 'Comprador inactivo', 'El comprador inactivo conserva sus comparaciones, pero el perfil de revisión del ejemplo impide abrir un expediente.', { buyerInactive: true }),
  scenario('unreachable', 'Faltan revisores', 'Se piden dos aceptaciones, pero al excluir al comprador solo queda el Contacto A elegible; no se abre una revisión.', { review: 'unreachable' }),
  scenario('buyer-allowed', 'Comprador incluido', 'La política ficticia incluye explícitamente al comprador y al Contacto A. Cada contacto declarado puede responder una vez.', { review: 'buyer_allowed' }),
]);
const SCENARIO_OPTIONS = Object.freeze(SCENARIOS.map(item => Object.freeze({ id: item.id, label: item.label })));
function feedback(code: CompanyCreditReviewDemoFeedback['code'], message: string): CompanyCreditReviewDemoFeedback {
  return Object.freeze({ tone: 'info', code, message });
}
const FEEDBACK = Object.freeze({
  initial: feedback('initial', 'Selecciona un caso. La revisión solo empieza cuando la abres.'),
  scenario_changed: feedback('scenario_changed', 'Ejemplo cambiado. Su revisión empieza vacía al abrirla.'),
  reviewer_changed: feedback('reviewer_changed', 'Contacto de ejemplo seleccionado.'),
  review_opened: feedback('review_opened', 'Revisión de ejemplo abierta. Ninguna respuesta se ha declarado todavía.'),
  company_inactive: feedback('company_inactive', 'La empresa del ejemplo está inactiva.'),
  buyer_inactive: feedback('buyer_inactive', 'El comprador del ejemplo está inactivo.'),
  quorum_unreachable: feedback('quorum_unreachable', 'No hay suficientes contactos elegibles para completar esta revisión.'),
  already_open: feedback('already_open', 'La revisión actual se conserva con sus respuestas.'),
  review_required: feedback('review_required', 'Abre la revisión de ejemplo antes de responder.'),
  acceptance_recorded: feedback('acceptance_recorded', 'Aceptación declarada en el ejemplo.'),
  rejection_recorded: feedback('rejection_recorded', 'Rechazo declarado en el ejemplo.'),
  review_terminal: feedback('review_terminal', 'La revisión del ejemplo está cerrada y conserva sus respuestas.'),
  reviewer_not_selected: feedback('reviewer_not_selected', 'Este contacto no está designado en la política del ejemplo.'),
  reviewer_inactive: feedback('reviewer_inactive', 'Este contacto de ejemplo está inactivo.'),
  buyer_separation_required: feedback('buyer_separation_required', 'El comprador está excluido de la revisión en este ejemplo.'),
  reviewer_already_decided: feedback('reviewer_already_decided', 'Este contacto ya ha declarado una respuesta.'),
});
const UNKNOWN_LABELS = Object.freeze({
  missing_evidence: Object.freeze({ label: 'Sin evidencia de exposición', message: 'No hay un corte de exposición para este ejemplo.' }),
  incomplete_evidence: Object.freeze({ label: 'Exposición incompleta', message: 'El corte no declara una exposición empresarial completa.' }),
  future_observation: Object.freeze({ label: 'Observación posterior', message: 'La observación es posterior a la evaluación; sus importes no se anticipan.' }),
});
const COMPARISON_LABELS = Object.freeze({ companyExposure: 'Exposición de empresa con esta solicitud',
  requestAmount: 'Importe de esta solicitud', buyerAmount: 'Importe de este comprador por solicitud' });
const COMPARISON_STATUS_LABELS = Object.freeze({ compared: 'Comparación numérica', unconfigured: 'Sin límite declarado', unknown: 'No se puede comparar' });
const POSITION_LABELS = Object.freeze({ below_limit: 'Por debajo del límite', equal_limit: 'Igual al límite', above_limit: 'Por encima del límite' });
const REVIEW_LABELS = Object.freeze({ not_open: 'Sin revisión abierta', opening_blocked: 'No se ha abierto la revisión',
  pending: 'Revisión pendiente', accepted: 'Revisión aceptada en el ejemplo', rejected: 'Revisión rechazada en el ejemplo' });
const CONTACT_STATUS_LABELS = Object.freeze({ not_open: 'Sin revisión abierta', not_eligible: 'No participa en esta revisión',
  awaiting: 'Sin responder', responded: 'Respuesta registrada' });
const DECISION_LABELS = Object.freeze({ accept: 'Aceptación declarada', reject: 'Rechazo declarado' });

function invalid(): never { throw new RangeError('Estado del ejemplo de crédito y revisión inválido.'); }
function boundary<T>(operation: () => T): T { try { return operation(); } catch { return invalid(); } }
function record(input: unknown, keys: readonly string[], partial = false): Readonly<Record<string, unknown>> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return invalid();
  const prototype = Object.getPrototypeOf(input); if (prototype !== Object.prototype && prototype !== null) return invalid();
  const actual = Reflect.ownKeys(input);
  if ((!partial && actual.length !== keys.length) || (partial && actual.length === 0)) return invalid();
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of actual) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (typeof key !== 'string' || !keys.includes(key) || !descriptor?.enumerable || !('value' in descriptor)) return invalid();
    result[key] = descriptor.value;
  }
  return Object.freeze(result);
}
function selection(input: unknown): CompanyCreditReviewDemoSelection {
  const row = record(input, ['scenarioId', 'reviewerKey']);
  const selected = SCENARIOS.find(item => item.id === row.scenarioId); const contact = CONTACTS.find(item => item.id === row.reviewerKey);
  if (!selected || !contact) return invalid();
  return Object.freeze({ scenarioId: selected.id, reviewerKey: contact.id });
}
function caseId(scenarioId: Scenario['id'], sequence: number): string { return `demo.credit-review.case.n${sequence}.${scenarioId}`; }
function commandId(sequence: number, index: number): string { return `demo.credit-review.decision.n${sequence}.s${index + 1}`; }
function creditFor(item: Scenario): CompanyCreditPreview {
  const context = item.context;
  return previewCompanyCredit({ directory: context.directory, policy: context.creditPolicy, request: context.request,
    evaluatedAt: context.evaluatedAt, evidence: context.evidence });
}
function readState(input: unknown): Readonly<{ state: CompanyCreditReviewDemoState; selected: Scenario; snapshot: CompanyCreditReviewSnapshot | null }> {
  const row = record(input, ['selection', 'case', 'lastCreationReason', 'caseSequence', 'feedback']);
  const current = selection(row.selection); const selected = SCENARIOS.find(item => item.id === current.scenarioId)!;
  if (typeof row.caseSequence !== 'number' || !Number.isSafeInteger(row.caseSequence) || row.caseSequence < 0 || Object.is(row.caseSequence, -0)) return invalid();
  const sequence = row.caseSequence;
  const note = record(row.feedback, ['tone', 'code', 'message']);
  if (typeof note.code !== 'string' || !Object.hasOwn(FEEDBACK, note.code)) return invalid();
  const knownFeedback = FEEDBACK[note.code as CompanyCreditReviewDemoFeedback['code']];
  if (note.tone !== knownFeedback.tone || note.message !== knownFeedback.message) return invalid();
  if (row.lastCreationReason !== null && row.lastCreationReason !== 'company_inactive' && row.lastCreationReason !== 'buyer_inactive' && row.lastCreationReason !== 'quorum_unreachable') return invalid();
  let snapshot: CompanyCreditReviewSnapshot | null = null;
  if (row.case !== null) {
    if (sequence < 1 || row.lastCreationReason !== null) return invalid();
    snapshot = previewCompanyCreditReview({ case: row.case, context: selected.context });
    if (snapshot.case.id !== caseId(selected.id, sequence) || snapshot.case.createdAt !== AT || snapshot.case.decisions.length > DECISION_AT.length) return invalid();
    for (const [index, decision] of snapshot.case.decisions.entries()) {
      if (decision.id !== commandId(sequence, index) || decision.occurredAt !== DECISION_AT[index]) return invalid();
    }
  } else if (row.lastCreationReason !== null) {
    // Revalida un intento bloqueado declarado; no abre un caso en estados iniciales sin intento.
    const attempted = createCompanyCreditReviewCase({ id: caseId(selected.id, sequence), createdAt: AT, context: selected.context });
    if (attempted.outcome !== 'blocked' || attempted.reason !== row.lastCreationReason) return invalid();
  }
  return Object.freeze({ state: Object.freeze({ selection: current, case: snapshot?.case ?? null,
    lastCreationReason: row.lastCreationReason, caseSequence: sequence, feedback: knownFeedback }), selected, snapshot });
}

export function createCompanyCreditReviewDemo(): CompanyCreditReviewDemoState {
  return Object.freeze({ selection: Object.freeze({ scenarioId: 'within', reviewerKey: 'a' }), case: null,
    lastCreationReason: null, caseSequence: 0, feedback: FEEDBACK.initial });
}
export function configureCompanyCreditReviewDemo(
  stateInput: CompanyCreditReviewDemoState, input: Readonly<Partial<CompanyCreditReviewDemoSelection>>,
): CompanyCreditReviewDemoState {
  return boundary(() => {
    const current = readState(stateInput).state; const patch = record(input, ['scenarioId', 'reviewerKey'], true);
    const next = selection({ ...current.selection, ...patch });
    if (next.scenarioId !== current.selection.scenarioId) {
      if (Object.hasOwn(patch, 'reviewerKey') && next.reviewerKey !== 'a') return invalid();
      return Object.freeze({ ...current, selection: Object.freeze({ scenarioId: next.scenarioId, reviewerKey: 'a' }),
        case: null, lastCreationReason: null, feedback: FEEDBACK.scenario_changed });
    }
    if (next.reviewerKey === current.selection.reviewerKey) return current;
    return Object.freeze({ ...current, selection: next, feedback: FEEDBACK.reviewer_changed });
  });
}
export function openCompanyCreditReviewDemo(stateInput: CompanyCreditReviewDemoState): CompanyCreditReviewDemoState {
  return boundary(() => {
    const { state: current, selected } = readState(stateInput);
    if (current.case) return Object.freeze({ ...current, feedback: FEEDBACK.already_open });
    if (current.lastCreationReason !== null) return Object.freeze({ ...current, feedback: FEEDBACK[current.lastCreationReason] });
    if (current.caseSequence === Number.MAX_SAFE_INTEGER) return invalid();
    const sequence = current.caseSequence + 1;
    const result = createCompanyCreditReviewCase({ id: caseId(selected.id, sequence), createdAt: AT, context: selected.context });
    if (result.outcome === 'blocked') return Object.freeze({ ...current, lastCreationReason: result.reason, feedback: FEEDBACK[result.reason] });
    return Object.freeze({ ...current, case: result.snapshot.case, caseSequence: sequence, feedback: FEEDBACK.review_opened });
  });
}
export function respondCompanyCreditReviewDemo(
  stateInput: CompanyCreditReviewDemoState, input: Readonly<{ decision: 'accept' | 'reject' }>,
): CompanyCreditReviewDemoState {
  return boundary(() => {
    const { state: current, selected, snapshot } = readState(stateInput); const row = record(input, ['decision']);
    if (row.decision !== 'accept' && row.decision !== 'reject') return invalid();
    if (!snapshot) return Object.freeze({ ...current, feedback: current.lastCreationReason ? FEEDBACK[current.lastCreationReason] : FEEDBACK.review_required });
    if (snapshot.status !== 'pending') return Object.freeze({ ...current, feedback: FEEDBACK.review_terminal });
    const reviewer = CONTACTS.find(item => item.id === current.selection.reviewerKey)!;
    const index = snapshot.case.decisions.length; const occurredAt = DECISION_AT[index]; if (!occurredAt) return invalid();
    const result = applyCompanyCreditReviewDecision({ case: snapshot.case, context: selected.context, command: {
      id: commandId(current.caseSequence, index), caseId: snapshot.case.id, expectedVersion: snapshot.case.version,
      reviewerContactId: reviewer.contactId, decision: row.decision, occurredAt,
    } });
    if (result.outcome === 'applied') return Object.freeze({ ...current, case: result.snapshot.case,
      feedback: row.decision === 'accept' ? FEEDBACK.acceptance_recorded : FEEDBACK.rejection_recorded });
    if (result.outcome === 'blocked') return Object.freeze({ ...current,
      feedback: result.reason === 'case_terminal' ? FEEDBACK.review_terminal : FEEDBACK[result.reason] });
    // Este modelo genera un comando nuevo sobre la copia vigente; no reintenta conflictos ni fabrica replay.
    return invalid();
  });
}

/** Proyecta resultados reales a texto y controles locales; no duplica aritmética o reglas de revisión. */
export function getCompanyCreditReviewDemoView(stateInput: CompanyCreditReviewDemoState): CompanyCreditReviewDemoView {
  return boundary(() => {
    const { state: current, selected, snapshot } = readState(stateInput);
    const credit = snapshot?.credit ?? creditFor(selected);
    const contacts: CompanyCreditReviewDemoView['review']['contacts'] = Object.freeze(CONTACTS.map(metadata => {
      const contact = selected.context.directory.contacts.find(item => item.id === metadata.contactId)!;
      let responseState: CompanyCreditReviewDemoView['review']['contacts'][number]['responseState'] = 'not_open';
      let eligibilityReasonLabel: string | null = null;
      if (snapshot) {
        if (snapshot.decidedReviewerIds.includes(contact.id)) responseState = 'responded';
        else if (snapshot.eligibleReviewerIds.includes(contact.id)) responseState = 'awaiting';
        else {
          responseState = 'not_eligible';
          // Solo explica un resultado ya no elegible; ninguna etiqueta concede acción.
          eligibilityReasonLabel = contact.state === 'inactive' ? FEEDBACK.reviewer_inactive.message
            : contact.id === selected.context.request.buyerContactId && selected.context.reviewPolicy.buyerSeparation === 'required'
              ? FEEDBACK.buyer_separation_required.message : FEEDBACK.reviewer_not_selected.message;
        }
      }
      return Object.freeze({ id: metadata.id, label: metadata.label, state: contact.state, stateLabel: contact.state === 'active' ? 'Activo' : 'Inactivo',
        responseState, statusLabel: CONTACT_STATUS_LABELS[responseState], eligibilityReasonLabel });
    }));
    const selectedMetadata = CONTACTS.find(item => item.id === current.selection.reviewerKey)!;
    const selectedContact = contacts.find(item => item.id === current.selection.reviewerKey)!;
    const status = snapshot?.status ?? (current.lastCreationReason ? 'opening_blocked' : 'not_open');
    const canRespond = snapshot?.status === 'pending' && snapshot.remainingReviewerIds.includes(selectedMetadata.contactId);
    const blockedReason = !snapshot ? current.lastCreationReason ? FEEDBACK[current.lastCreationReason].message : FEEDBACK.review_required.message
      : snapshot.status !== 'pending' ? FEEDBACK.review_terminal.message : canRespond ? null
        : selectedContact.responseState === 'responded' ? FEEDBACK.reviewer_already_decided.message : selectedContact.eligibilityReasonLabel;
    const exposureLabels = credit.exposure.outcome === 'unknown' ? UNKNOWN_LABELS[credit.exposure.reason]
      : { label: 'Exposición observada', message: 'El corte conserva la exposición declarada y la hipótesis con esta solicitud; no acredita crédito disponible actual.' };
    const comparisonIds = ['companyExposure', 'requestAmount', 'buyerAmount'] as const;
    const comparisons = Object.freeze(comparisonIds.map(id => {
      const value = credit.comparisons[id];
      return Object.freeze({ id, label: COMPARISON_LABELS[id], ...value, statusLabel: COMPARISON_STATUS_LABELS[value.status],
        positionLabel: value.position === null ? null : POSITION_LABELS[value.position],
        reasonLabel: value.reason === null ? null : value.reason === 'limit_unconfigured' ? 'Sin límite declarado' : UNKNOWN_LABELS[value.reason].label });
    }));
    const history = Object.freeze((snapshot?.case.decisions ?? []).map(decision => {
      const metadata = CONTACTS.find(item => item.contactId === decision.reviewerContactId)!;
      return Object.freeze({ reviewerKey: metadata.id, reviewerLabel: metadata.label, decision: decision.decision,
        decisionLabel: DECISION_LABELS[decision.decision], occurredAt: decision.occurredAt });
    }));
    return Object.freeze({ selection: current.selection, scenarioOptions: SCENARIO_OPTIONS, scenarioDescription: selected.description,
      company: Object.freeze({ label: COMPANY_LABEL, state: credit.context.company.state, stateLabel: credit.context.company.state === 'active' ? 'Activa' : 'Inactiva' }),
      buyer: Object.freeze({ label: CONTACTS[0]!.label, state: credit.context.buyer.state, stateLabel: credit.context.buyer.state === 'active' ? 'Activo' : 'Inactivo' }),
      requested: Object.freeze({ currency: 'EUR' as const, amountCents: credit.request.amountCents }), evaluatedAt: credit.evaluatedAt,
      exposure: Object.freeze({ outcome: credit.exposure.outcome, reason: credit.exposure.reason, ...exposureLabels,
        coverage: credit.exposure.evidence?.coverage ?? null, observedAt: credit.exposure.evidence?.observedAt ?? null, amounts: credit.exposure.amounts }),
      comparisons, review: Object.freeze({ status, statusLabel: REVIEW_LABELS[status], openingReason: current.lastCreationReason,
        openingReasonLabel: current.lastCreationReason ? FEEDBACK[current.lastCreationReason].message : null,
        quorum: snapshot?.quorum ?? selected.context.reviewPolicy.quorum, acceptanceCount: snapshot?.acceptanceCount ?? null,
        createdAt: snapshot?.case.createdAt ?? null, lastOccurredAt: snapshot?.lastOccurredAt ?? null,
        canOpen: !snapshot && current.lastCreationReason === null, canSelectReviewer: snapshot?.status === 'pending', canRespond,
        blockedReason, contactOptions: CONTACT_OPTIONS, contacts, history }), feedback: current.feedback });
  });
}
