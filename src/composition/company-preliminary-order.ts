import {
  defineCompanyNegotiation, previewCompanyOfferRevision,
  type CompanyNegotiation, type CompanyOfferSnapshot,
} from '../modules/companies';
import {
  createPreliminaryOrderDraft, issuePreliminaryOrder, approvePreliminaryOrder,
  expirePreliminaryOrder, cancelPreliminaryOrder, assertPreliminaryOrder,
  type PreliminaryOrder, type PreliminaryOrderDraft, type PreliminaryOrderConversionGate,
} from '../modules/orders';

export const COMPANY_PRELIMINARY_LIMITS = /* @__PURE__ */ Object.freeze({
  recordedActions: 3, idLength: 100, preliminaryIdLength: 200, depositCents: 1_000_000_000, expectedVersion: 1_000_000_000,
});
export type CompanyPreliminaryTerms = Readonly<{
  preliminaryId: string; depositCents: number; conversionGate: PreliminaryOrderConversionGate;
}>;
/** Corte íntegro histórico. No consulta ni retargetea la última revisión de otra copia. */
export type CompanyPreliminaryBinding = Readonly<{
  negotiation: CompanyNegotiation; revisionId: string; terms: CompanyPreliminaryTerms;
}>;
export type CompanyPreliminaryActionCommand = Readonly<{
  id: string; artifactId: string; expectedVersion: number; action: 'issue' | 'approve' | 'expire' | 'cancel'; occurredAt: string;
}>;
/** No admite estado ni versión lifecycle como autoridad: se reconstruyen en ORD-008. */
export type CompanyPreliminaryArtifact = Readonly<{
  schemaVersion: 1; source: 'fixture'; profile: 'company-preliminary-fixture-v1'; id: string; createdAt: string;
  binding: CompanyPreliminaryBinding; actions: readonly CompanyPreliminaryActionCommand[];
}>;
export type CompanyPreliminarySnapshot = Readonly<{
  source: 'fixture'; profile: 'company-preliminary-fixture-v1'; artifact: CompanyPreliminaryArtifact;
  offer: CompanyOfferSnapshot; order: PreliminaryOrder; lastOccurredAt: string;
}>;
export type CompanyPreliminaryTransition =
  | Readonly<{ outcome: 'applied' | 'replayed'; snapshot: CompanyPreliminarySnapshot }>
  | Readonly<{ outcome: 'conflict'; reason: 'version_mismatch' | 'command_id_reused'; snapshot: CompanyPreliminarySnapshot }>
  | Readonly<{ outcome: 'blocked'; reason: 'transition_not_allowed'; snapshot: CompanyPreliminarySnapshot }>;
export type CompanyPreliminaryContractReason = 'invalid_data' | 'offer_invalid' | 'terms_invalid' | 'binding_mismatch'
  | 'reference_mismatch' | 'invalid_history' | 'invalid_chronology' | 'history_limit' | 'reducer_failure';
const ERROR_MESSAGES: Readonly<Record<CompanyPreliminaryContractReason, string>> = /* @__PURE__ */ Object.freeze({
  invalid_data: 'Los datos no cumplen el contrato preliminar de empresa.',
  offer_invalid: 'La negociación o la revisión seleccionada no cumplen su contrato completo.',
  terms_invalid: 'Los términos declarados no cumplen el contrato del presupuesto preliminar.',
  binding_mismatch: 'El vínculo completo difiere del congelado en el artefacto.',
  reference_mismatch: 'El comando no corresponde al artefacto declarado.',
  invalid_history: 'El historial no representa una secuencia aplicada válida del artefacto.',
  invalid_chronology: 'Las fechas declaradas retroceden respecto al corte o al historial.',
  history_limit: 'El artefacto alcanzó el límite de acciones del perfil.',
  reducer_failure: 'El resultado del presupuesto preliminar no cumple el perfil de simulación.',
});
export class CompanyPreliminaryContractError extends Error {
  readonly code = 'company_preliminary_contract_invalid';
  readonly reason: CompanyPreliminaryContractReason;
  constructor(reason: CompanyPreliminaryContractReason) {
    const safeReason = typeof reason === 'string' && Object.hasOwn(ERROR_MESSAGES, reason) ? reason : 'invalid_data';
    super(ERROR_MESSAGES[safeReason]); this.name = 'CompanyPreliminaryContractError'; this.reason = safeReason;
  }
}
function invalid(reason: CompanyPreliminaryContractReason = 'invalid_data'): never { throw new CompanyPreliminaryContractError(reason); }
function boundary<T>(operation: () => T): T {
  try { return operation(); }
  catch (error) {
    let reason: CompanyPreliminaryContractReason = 'invalid_data';
    try {
      if (error instanceof CompanyPreliminaryContractError) {
        const descriptor = Object.getOwnPropertyDescriptor(error, 'reason');
        if (descriptor && 'value' in descriptor && typeof descriptor.value === 'string' && Object.hasOwn(ERROR_MESSAGES, descriptor.value)) {
          reason = descriptor.value as CompanyPreliminaryContractReason;
        }
      }
    } catch { /* Tampoco se confía en las trampas del propio error. */ }
    throw new CompanyPreliminaryContractError(reason);
  }
}
function record(input: unknown, keys: readonly string[]): Readonly<Record<string, unknown>> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return invalid();
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return invalid();
  const actual = Reflect.ownKeys(input);
  if (actual.length !== keys.length) return invalid();
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of actual) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (typeof key !== 'string' || !keys.includes(key) || !descriptor?.enumerable || !('value' in descriptor)) return invalid();
    result[key] = descriptor.value;
  }
  return Object.freeze(result);
}
function integer(input: unknown, minimum = 1, maximum = Number.MAX_SAFE_INTEGER): number {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || Object.is(input, -0) || input < minimum || input > maximum) return invalid();
  return input;
}
function actionArray(input: unknown): readonly unknown[] {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) return invalid();
  const descriptor = Object.getOwnPropertyDescriptor(input, 'length');
  if (!descriptor || !('value' in descriptor)) return invalid();
  const length = integer(descriptor.value, 0);
  if (length > COMPANY_PRELIMINARY_LIMITS.recordedActions) return invalid('invalid_history');
  if (Reflect.ownKeys(input).length !== length + 1) return invalid();
  const values: unknown[] = [];
  for (let index = 0; index < length; index++) {
    const item = Object.getOwnPropertyDescriptor(input, String(index));
    if (!item?.enumerable || !('value' in item)) return invalid();
    values.push(item.value);
  }
  return Object.freeze(values);
}
function id(input: unknown): string {
  if (typeof input !== 'string' || input.length > COMPANY_PRELIMINARY_LIMITS.idLength || !/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/.test(input)) return invalid();
  return input;
}
function preliminaryId(input: unknown): string {
  if (typeof input !== 'string' || !/^[a-z0-9](?:[a-z0-9:_-]{0,198}[a-z0-9])?$/.test(input)) return invalid();
  return input;
}
function instant(input: unknown): string {
  if (typeof input !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input) || input.startsWith('0000-')) return invalid();
  const parsed = new Date(input);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== input) return invalid();
  return input;
}
function isRangeError(error: unknown): boolean {
  try { return error instanceof RangeError; } catch { return false; }
}
function readTerms(input: unknown): CompanyPreliminaryTerms {
  const row = record(input, ['preliminaryId', 'depositCents', 'conversionGate']);
  // Vocabulario del perfil, independiente de los arrays exportados mutables del dominio legacy.
  if (row.conversionGate !== 'approval' && row.conversionGate !== 'deposit' && row.conversionGate !== 'full_payment') return invalid();
  return Object.freeze({ preliminaryId: preliminaryId(row.preliminaryId),
    depositCents: integer(row.depositCents, 0, COMPANY_PRELIMINARY_LIMITS.depositCents), conversionGate: row.conversionGate });
}
/** Frontera de salida del perfil; no representa una segunda tabla de transiciones. */
function checkedOrder(input: unknown, expected: PreliminaryOrderDraft, version: number): PreliminaryOrder {
  try {
    const row = record(input, ['id', 'status', 'paymentStatus', 'currency', 'totalCents', 'depositCents', 'paidCents',
      'conversionGate', 'expiresAt', 'version', 'issuedAt', 'approvedAt', 'convertedOrderId', 'convertedAt']);
    const status = row.status;
    if (status !== 'draft' && status !== 'issued' && status !== 'approved' && status !== 'expired' && status !== 'cancelled') return invalid('reducer_failure');
    if (row.id !== expected.id || row.currency !== expected.currency || !Object.is(row.totalCents, expected.totalCents) ||
      !Object.is(row.depositCents, expected.depositCents) || row.conversionGate !== expected.conversionGate || row.expiresAt !== expected.expiresAt ||
      !Object.is(row.version, version) || row.paymentStatus !== 'unpaid' || !Object.is(row.paidCents, 0) ||
      row.convertedOrderId !== null || row.convertedAt !== null) return invalid('reducer_failure');
    const issuedAt = row.issuedAt === null ? null : instant(row.issuedAt);
    const approvedAt = row.approvedAt === null ? null : instant(row.approvedAt);
    if (version === 1 && (status !== 'draft' || issuedAt !== null || approvedAt !== null)) return invalid('reducer_failure');
    const result: PreliminaryOrder = Object.freeze({ ...expected, status, paymentStatus: 'unpaid', paidCents: 0, version,
      issuedAt, approvedAt, convertedOrderId: null, convertedAt: null });
    assertPreliminaryOrder(result); // Conserva la autoridad del contrato público sobre su propio agregado.
    return result;
  } catch { return invalid('reducer_failure'); }
}
function initialOrder(draft: PreliminaryOrderDraft): PreliminaryOrder {
  let result: unknown;
  try { result = createPreliminaryOrderDraft(draft); }
  catch (error) { return invalid(isRangeError(error) ? 'terms_invalid' : 'reducer_failure'); }
  // Fuera del catch del constructor: una regresión de salida no es un rechazo de términos.
  return checkedOrder(result, draft, 1);
}
type BindingData = Readonly<{ binding: CompanyPreliminaryBinding; offer: CompanyOfferSnapshot; draft: PreliminaryOrderDraft; order: PreliminaryOrder }>;
function readBinding(input: unknown): BindingData {
  const row = record(input, ['negotiation', 'revisionId', 'terms']);
  const revisionId = id(row.revisionId);
  let negotiation: CompanyNegotiation; let offer: CompanyOfferSnapshot;
  try {
    negotiation = defineCompanyNegotiation(row.negotiation);
    offer = previewCompanyOfferRevision({ negotiation, context: negotiation.context, revisionId });
  } catch { return invalid('offer_invalid'); }
  const terms = readTerms(row.terms);
  const binding = Object.freeze({ negotiation, revisionId, terms });
  const draft: PreliminaryOrderDraft = Object.freeze({ id: terms.preliminaryId, currency: offer.context.request.currency,
    totalCents: offer.offer.totalCents, depositCents: terms.depositCents, conversionGate: terms.conversionGate, expiresAt: offer.offer.expiresAt });
  return Object.freeze({ binding, offer, draft, order: initialOrder(draft) });
}
export function defineCompanyPreliminaryBinding(input: unknown): CompanyPreliminaryBinding { return boundary(() => readBinding(input).binding); }
function readCommand(input: unknown): CompanyPreliminaryActionCommand {
  const row = record(input, ['id', 'artifactId', 'expectedVersion', 'action', 'occurredAt']);
  if (row.action !== 'issue' && row.action !== 'approve' && row.action !== 'expire' && row.action !== 'cancel') return invalid();
  return Object.freeze({ id: id(row.id), artifactId: id(row.artifactId),
    expectedVersion: integer(row.expectedVersion, 1, COMPANY_PRELIMINARY_LIMITS.expectedVersion), action: row.action, occurredAt: instant(row.occurredAt) });
}
/** Solo captura rechazos del reducer. Las invariantes se verifican después, fuera de este catch. */
function dispatch(order: PreliminaryOrder, command: CompanyPreliminaryActionCommand): Readonly<{ rejected: true }> | Readonly<{ rejected: false; result: unknown }> {
  try {
    let result: PreliminaryOrder;
    switch (command.action) {
      case 'issue': result = issuePreliminaryOrder(order, command.occurredAt); break;
      case 'approve': result = approvePreliminaryOrder(order, command.occurredAt); break;
      case 'expire': result = expirePreliminaryOrder(order, command.occurredAt); break;
      case 'cancel': result = cancelPreliminaryOrder(order); break;
    }
    return { rejected: false, result };
  } catch (error) {
    if (isRangeError(error)) return { rejected: true };
    return invalid('reducer_failure');
  }
}
function assertCreationTime(createdAt: string, binding: CompanyPreliminaryBinding): void {
  const lastRevision = binding.negotiation.revisions.at(-1);
  if (!lastRevision) return invalid('offer_invalid');
  if (createdAt < lastRevision.createdAt) return invalid('invalid_chronology');
}
function snapshot(artifact: CompanyPreliminaryArtifact, offer: CompanyOfferSnapshot, order: PreliminaryOrder): CompanyPreliminarySnapshot {
  return Object.freeze({ source: 'fixture', profile: 'company-preliminary-fixture-v1', artifact, offer, order,
    lastOccurredAt: artifact.actions.at(-1)?.occurredAt ?? artifact.createdAt });
}
function readArtifact(input: unknown): CompanyPreliminarySnapshot {
  const row = record(input, ['schemaVersion', 'source', 'profile', 'id', 'createdAt', 'binding', 'actions']);
  if (row.schemaVersion !== 1 || row.source !== 'fixture' || row.profile !== 'company-preliminary-fixture-v1') return invalid();
  const artifactId = id(row.id); const createdAt = instant(row.createdAt);
  const data = readBinding(row.binding);
  assertCreationTime(createdAt, data.binding);
  const actions = Object.freeze(actionArray(row.actions).map(readCommand));
  let order = data.order; let lastOccurredAt = createdAt; const commandIds = new Set<string>();
  for (const command of actions) {
    if (commandIds.has(command.id) || command.artifactId !== artifactId || command.expectedVersion !== order.version) return invalid('invalid_history');
    commandIds.add(command.id);
    if (command.occurredAt < lastOccurredAt) return invalid('invalid_chronology');
    const result = dispatch(order, command);
    if (result.rejected) return invalid('invalid_history');
    order = checkedOrder(result.result, data.draft, order.version + 1);
    lastOccurredAt = command.occurredAt;
  }
  const artifact: CompanyPreliminaryArtifact = Object.freeze({ schemaVersion: 1, source: 'fixture', profile: 'company-preliminary-fixture-v1',
    id: artifactId, createdAt, binding: data.binding, actions });
  return snapshot(artifact, data.offer, order);
}
export function defineCompanyPreliminaryArtifact(input: unknown): CompanyPreliminaryArtifact { return boundary(() => readArtifact(input).artifact); }
export function createCompanyPreliminaryArtifact(input: unknown): CompanyPreliminarySnapshot {
  return boundary(() => {
    const row = record(input, ['id', 'createdAt', 'binding']);
    const artifactId = id(row.id); const createdAt = instant(row.createdAt); const data = readBinding(row.binding);
    assertCreationTime(createdAt, data.binding);
    const artifact: CompanyPreliminaryArtifact = Object.freeze({ schemaVersion: 1, source: 'fixture', profile: 'company-preliminary-fixture-v1',
      id: artifactId, createdAt, binding: data.binding, actions: Object.freeze([]) });
    return snapshot(artifact, data.offer, data.order);
  });
}
export function previewCompanyPreliminaryArtifact(input: unknown): CompanyPreliminarySnapshot {
  return boundary(() => { const row = record(input, ['artifact']); return readArtifact(row.artifact); });
}
function same(left: unknown, right: unknown): boolean { return JSON.stringify(left) === JSON.stringify(right); }
export function applyCompanyPreliminaryAction(input: unknown): CompanyPreliminaryTransition {
  return boundary(() => {
    const row = record(input, ['artifact', 'binding', 'command']);
    const current = readArtifact(row.artifact); const external = readBinding(row.binding);
    if (!same(current.artifact.binding, external.binding)) return invalid('binding_mismatch');
    const command = readCommand(row.command);
    if (command.artifactId !== current.artifact.id) return invalid('reference_mismatch');
    const stored = current.artifact.actions.find(item => item.id === command.id);
    if (stored) return same(stored, command)
      ? Object.freeze({ outcome: 'replayed', snapshot: current })
      : Object.freeze({ outcome: 'conflict', reason: 'command_id_reused', snapshot: current });
    if (command.expectedVersion !== current.order.version) return Object.freeze({ outcome: 'conflict', reason: 'version_mismatch', snapshot: current });
    if (command.occurredAt < current.lastOccurredAt) return invalid('invalid_chronology');
    const result = dispatch(current.order, command);
    if (result.rejected) return Object.freeze({ outcome: 'blocked', reason: 'transition_not_allowed', snapshot: current });
    // No queda dentro del catch RangeError de dispatch: fallo del perfil siempre es error, nunca blocked.
    const order = checkedOrder(result.result, external.draft, current.order.version + 1);
    if (current.artifact.actions.length === COMPANY_PRELIMINARY_LIMITS.recordedActions) return invalid('history_limit');
    const artifact = Object.freeze({ ...current.artifact, actions: Object.freeze([...current.artifact.actions, command]) });
    return Object.freeze({ outcome: 'applied', snapshot: snapshot(artifact, current.offer, order) });
  });
}
