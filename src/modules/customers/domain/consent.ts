export const CONSENT_CHANNELS = ['email', 'sms', 'whatsapp', 'push'] as const;
export type ConsentChannel = (typeof CONSENT_CHANNELS)[number];

export const CONSENT_ACTIONS = ['granted', 'withdrawn'] as const;
export type ConsentAction = (typeof CONSENT_ACTIONS)[number];

export const CONSENT_SOURCE_KINDS = ['storefront', 'operator', 'import', 'api'] as const;
export type ConsentSourceKind = (typeof CONSENT_SOURCE_KINDS)[number];

export type ConsentSubject =
  | Readonly<{ kind: 'customer_profile'; id: string }>
  | Readonly<{ kind: 'contact_identity'; id: string }>;

export type ConsentScope = Readonly<{
  channel: ConsentChannel;
  purposeId: string;
}>;

export type ConsentSource = Readonly<{
  kind: ConsentSourceKind;
  /** Referencia opaca de formulario, operador, lote o cliente API; nunca PII. */
  reference: string | null;
}>;

export type LegalNoticeVersion = Readonly<{
  noticeId: string;
  version: string;
}>;

export type ConsentEvidence = Readonly<{
  id: string;
  subject: ConsentSubject;
  scope: ConsentScope;
  action: ConsentAction;
  legalNotice: LegalNoticeVersion;
  source: ConsentSource;
  region: string;
  occurredAt: string;
  recordedAt: string;
  withdrawsEvidenceId: string | null;
  version: number;
  idempotencyKey: string;
}>;

export type ConsentState = Readonly<{
  subject: ConsentSubject;
  scope: ConsentScope;
  status: 'not_recorded' | 'granted' | 'withdrawn';
  version: number;
  currentGrant: ConsentEvidence | null;
  lastEvidence: ConsentEvidence | null;
}>;

type ConsentCommandBase = Readonly<{
  evidenceId: string;
  subject: ConsentSubject;
  scope: ConsentScope;
  source: ConsentSource;
  region: string;
  occurredAt: string;
  recordedAt: string;
  expectedVersion: number;
  idempotencyKey: string;
}>;

export type GrantConsentCommand = ConsentCommandBase & Readonly<{
  action: 'grant';
  /** Impide construir un grant desde una casilla ausente, premarcada o inferida. */
  affirmed: true;
  legalNotice: LegalNoticeVersion;
}>;

export type WithdrawConsentCommand = ConsentCommandBase & Readonly<{
  action: 'withdraw';
}>;

export type ConsentCommand = GrantConsentCommand | WithdrawConsentCommand;

export type ConsentWriteOutcome = Readonly<{
  outcome: 'appended' | 'replayed';
  evidence: ConsentEvidence;
  state: ConsentState;
}>;

export type CommunicationDecision = Readonly<{
  allowed: boolean;
  authority: 'transactional_required' | 'active_consent' | 'missing_consent' | 'preference_opt_out';
}>;

const OPAQUE_ID_PATTERN = /^[a-z][a-z0-9]*(?:[_:-][a-z0-9]+)+$/u;
const NAMESPACED_ID_PATTERN = /^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)+$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const VERSION_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._:-]{0,79})$/u;
const REGION_PATTERN = /^[A-Z][A-Z0-9_-]{1,31}$/u;

function cleanText(value: string, label: string, pattern: RegExp, maximum = 200): string {
  if (value.length > maximum || value.trim() !== value || !pattern.test(value) ||
      /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new RangeError(`${label} inválido.`);
  }
  return value;
}

function opaqueId(value: string, label: string): string {
  return cleanText(value, label, OPAQUE_ID_PATTERN);
}

function instant(value: string, label: string): number {
  const parsed = Date.parse(value);
  if (!value.endsWith('Z') || !Number.isFinite(parsed)) {
    throw new RangeError(`${label} debe ser una fecha ISO-8601 UTC.`);
  }
  return parsed;
}

function normalizeSubject(subject: ConsentSubject): ConsentSubject {
  if (subject.kind === 'customer_profile') {
    return Object.freeze({ kind: subject.kind, id: opaqueId(subject.id, 'consent.subject.id') });
  }
  if (subject.kind !== 'contact_identity') throw new RangeError('consent.subject.kind inválido.');
  return Object.freeze({
    kind: subject.kind,
    id: cleanText(subject.id, 'consent.subject.id', HASH_PATTERN, 64),
  });
}

function normalizeScope(scope: ConsentScope): ConsentScope {
  if (!CONSENT_CHANNELS.includes(scope.channel)) throw new RangeError('consent.channel inválido.');
  return Object.freeze({
    channel: scope.channel,
    purposeId: cleanText(scope.purposeId, 'consent.purposeId', NAMESPACED_ID_PATTERN, 120),
  });
}

function normalizeSource(source: ConsentSource): ConsentSource {
  if (!CONSENT_SOURCE_KINDS.includes(source.kind)) throw new RangeError('consent.source.kind inválido.');
  return Object.freeze({
    kind: source.kind,
    reference: source.reference === null
      ? null
      : opaqueId(source.reference, 'consent.source.reference'),
  });
}

function normalizeNotice(notice: LegalNoticeVersion): LegalNoticeVersion {
  return Object.freeze({
    noticeId: cleanText(notice.noticeId, 'consent.noticeId', NAMESPACED_ID_PATTERN, 120),
    version: cleanText(notice.version, 'consent.noticeVersion', VERSION_PATTERN, 80),
  });
}

function sameSubject(left: ConsentSubject, right: ConsentSubject): boolean {
  return left.kind === right.kind && left.id === right.id;
}

function sameScope(left: ConsentScope, right: ConsentScope): boolean {
  return left.channel === right.channel && left.purposeId === right.purposeId;
}

function assertEvidence(evidence: ConsentEvidence): void {
  opaqueId(evidence.id, 'consent.evidence.id');
  normalizeSubject(evidence.subject);
  normalizeScope(evidence.scope);
  normalizeSource(evidence.source);
  normalizeNotice(evidence.legalNotice);
  cleanText(evidence.region, 'consent.region', REGION_PATTERN, 32);
  const occurredAt = instant(evidence.occurredAt, 'consent.occurredAt');
  const recordedAt = instant(evidence.recordedAt, 'consent.recordedAt');
  if (recordedAt < occurredAt) throw new RangeError('El registro no puede preceder al hecho.');
  if (!Number.isSafeInteger(evidence.version) || evidence.version < 1) {
    throw new RangeError('consent.version inválida.');
  }
  cleanText(evidence.idempotencyKey, 'consent.idempotencyKey', /^.{8,200}$/u, 200);
  if (!CONSENT_ACTIONS.includes(evidence.action)) throw new RangeError('consent.action inválida.');
  if (evidence.action === 'granted' && evidence.withdrawsEvidenceId !== null) {
    throw new RangeError('Un grant no retira evidencia previa.');
  }
  if (evidence.action === 'withdrawn') {
    if (evidence.withdrawsEvidenceId === null) throw new RangeError('La retirada debe señalar el grant.');
    opaqueId(evidence.withdrawsEvidenceId, 'consent.withdrawsEvidenceId');
  }
}

function emptyState(subject: ConsentSubject, scope: ConsentScope): ConsentState {
  return Object.freeze({ subject, scope, status: 'not_recorded', version: 0,
    currentGrant: null, lastEvidence: null });
}

/** Reduce evidencia append-only. El orden y las versiones forman parte del contrato. */
export function consentState(
  history: readonly ConsentEvidence[],
  subject: ConsentSubject,
  scope: ConsentScope,
): ConsentState {
  const normalizedSubject = normalizeSubject(subject);
  const normalizedScope = normalizeScope(scope);
  let state = emptyState(normalizedSubject, normalizedScope);
  const ids = new Set<string>();
  const keys = new Set<string>();
  for (const evidence of history) {
    assertEvidence(evidence);
    if (!sameSubject(evidence.subject, normalizedSubject) || !sameScope(evidence.scope, normalizedScope)) {
      throw new RangeError('El historial mezcla sujetos o finalidades.');
    }
    if (ids.has(evidence.id) || keys.has(evidence.idempotencyKey)) {
      throw new RangeError('El historial contiene evidencia duplicada.');
    }
    if (evidence.version !== state.version + 1) throw new RangeError('Secuencia de consentimiento inválida.');
    if (state.lastEvidence !== null &&
        instant(evidence.occurredAt, 'consent.occurredAt') <
          instant(state.lastEvidence.occurredAt, 'consent.previous.occurredAt')) {
      throw new RangeError('La evidencia no puede retroceder en el tiempo.');
    }
    if (evidence.action === 'withdrawn') {
      if (state.status !== 'granted' || state.currentGrant === null ||
          evidence.withdrawsEvidenceId !== state.currentGrant.id ||
          evidence.legalNotice.noticeId !== state.currentGrant.legalNotice.noticeId ||
          evidence.legalNotice.version !== state.currentGrant.legalNotice.version) {
        throw new RangeError('Retirada sin grant vigente coincidente.');
      }
      state = Object.freeze({ ...state, status: 'withdrawn', version: evidence.version,
        currentGrant: null, lastEvidence: evidence });
    } else {
      state = Object.freeze({ ...state, status: 'granted', version: evidence.version,
        currentGrant: evidence, lastEvidence: evidence });
    }
    ids.add(evidence.id);
    keys.add(evidence.idempotencyKey);
  }
  return state;
}

function replayMatches(evidence: ConsentEvidence, command: ConsentCommand): boolean {
  const common = evidence.id === command.evidenceId &&
    sameSubject(evidence.subject, command.subject) && sameScope(evidence.scope, command.scope) &&
    evidence.source.kind === command.source.kind && evidence.source.reference === command.source.reference &&
    evidence.region === command.region && evidence.occurredAt === command.occurredAt &&
    evidence.recordedAt === command.recordedAt && command.expectedVersion === evidence.version - 1;
  if (!common) return false;
  if (command.action === 'withdraw') return evidence.action === 'withdrawn';
  return command.affirmed === true && evidence.action === 'granted' &&
    evidence.legalNotice.noticeId === command.legalNotice.noticeId &&
    evidence.legalNotice.version === command.legalNotice.version;
}

/** Crea el siguiente hecho o devuelve el hecho previo en un retry idéntico. */
export function recordConsent(
  history: readonly ConsentEvidence[],
  command: ConsentCommand,
): ConsentWriteOutcome {
  if (command.action !== 'grant' && command.action !== 'withdraw') {
    throw new RangeError('consent.command.action inválida.');
  }
  const subject = normalizeSubject(command.subject);
  const scope = normalizeScope(command.scope);
  const source = normalizeSource(command.source);
  const region = cleanText(command.region, 'consent.region', REGION_PATTERN, 32);
  const occurredAt = instant(command.occurredAt, 'consent.occurredAt');
  const recordedAt = instant(command.recordedAt, 'consent.recordedAt');
  if (recordedAt < occurredAt) throw new RangeError('El registro no puede preceder al hecho.');
  opaqueId(command.evidenceId, 'consent.evidenceId');
  cleanText(command.idempotencyKey, 'consent.idempotencyKey', /^.{8,200}$/u, 200);
  const current = consentState(history, subject, scope);
  const replay = history.find((evidence) => evidence.idempotencyKey === command.idempotencyKey);
  if (replay !== undefined) {
    if (!replayMatches(replay, command)) throw new RangeError('Conflicto de idempotencia de consentimiento.');
    return Object.freeze({ outcome: 'replayed', evidence: replay, state: current });
  }
  if (!Number.isSafeInteger(command.expectedVersion) || command.expectedVersion !== current.version) {
    throw new RangeError('Conflicto de versión de consentimiento.');
  }
  if (current.lastEvidence !== null && occurredAt < Date.parse(current.lastEvidence.occurredAt)) {
    throw new RangeError('La evidencia no puede retroceder en el tiempo.');
  }
  let evidence: ConsentEvidence;
  if (command.action === 'grant') {
    if (command.affirmed !== true) throw new RangeError('El consentimiento debe afirmarse explícitamente.');
    evidence = Object.freeze({
      id: command.evidenceId, subject, scope, action: 'granted',
      legalNotice: normalizeNotice(command.legalNotice), source, region,
      occurredAt: command.occurredAt, recordedAt: command.recordedAt,
      withdrawsEvidenceId: null, version: current.version + 1,
      idempotencyKey: command.idempotencyKey,
    });
  } else {
    if (current.status !== 'granted' || current.currentGrant === null) {
      throw new RangeError('No existe consentimiento vigente que retirar.');
    }
    evidence = Object.freeze({
      id: command.evidenceId, subject, scope, action: 'withdrawn',
      legalNotice: current.currentGrant.legalNotice, source, region,
      occurredAt: command.occurredAt, recordedAt: command.recordedAt,
      withdrawsEvidenceId: current.currentGrant.id, version: current.version + 1,
      idempotencyKey: command.idempotencyKey,
    });
  }
  assertEvidence(evidence);
  const nextHistory = Object.freeze([...history, evidence]);
  return Object.freeze({ outcome: 'appended', evidence,
    state: consentState(nextHistory, subject, scope) });
}

/** Preferencia y consentimiento son señales distintas; comprar nunca crea un grant. */
export function communicationDecision(input: Readonly<{
  messageClass: 'transactional_required' | 'consent_required';
  consent: ConsentState;
  preference: 'unset' | 'subscribed' | 'unsubscribed';
}>): CommunicationDecision {
  if (input.messageClass === 'transactional_required') {
    return Object.freeze({ allowed: true, authority: 'transactional_required' });
  }
  if (input.preference === 'unsubscribed') {
    return Object.freeze({ allowed: false, authority: 'preference_opt_out' });
  }
  if (input.consent.status !== 'granted') {
    return Object.freeze({ allowed: false, authority: 'missing_consent' });
  }
  return Object.freeze({ allowed: true, authority: 'active_consent' });
}
