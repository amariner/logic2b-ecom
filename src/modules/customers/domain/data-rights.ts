export const DATA_RIGHTS_REQUEST_KINDS = [
  'access', 'rectification', 'restriction', 'erasure',
] as const;
export type DataRightsRequestKind = (typeof DATA_RIGHTS_REQUEST_KINDS)[number];

export const DATA_RIGHTS_ACTIONS = [
  'requested', 'identity_verified', 'plan_attached', 'plan_approved',
  'plan_rejected', 'execution_started', 'completed', 'failed', 'cancelled',
] as const;
export type DataRightsAction = (typeof DATA_RIGHTS_ACTIONS)[number];

export const DATA_RIGHTS_OWNER_OPERATIONS = [
  'export', 'correct', 'restrict', 'anonymize', 'retain', 'manual_review',
] as const;
export type DataRightsOwnerOperation = (typeof DATA_RIGHTS_OWNER_OPERATIONS)[number];

export type DataRightsSubject =
  | Readonly<{ kind: 'customer_profile'; id: string }>
  | Readonly<{ kind: 'contact_identity'; id: string }>;

export type DataRightsPlanDecision = Readonly<{
  ownerId: string;
  operation: DataRightsOwnerOperation;
  policyReasonId: string;
  /** Referencia opaca a datos protegidos; nunca contiene el valor corregido. */
  payloadReference: string | null;
}>;

export type DataRightsPlan = Readonly<{
  id: string;
  mode: 'dry_run';
  fingerprint: string;
  createdBy: string;
  createdAt: string;
  decisions: readonly DataRightsPlanDecision[];
}>;

export type DataRightsEvidenceDetails =
  | Readonly<{ action: 'requested'; requestPayloadReference: string | null }>
  | Readonly<{
    action: 'identity_verified'; methodId: string; evidenceReference: string;
  }>
  | Readonly<{ action: 'plan_attached'; plan: DataRightsPlan }>
  | Readonly<{ action: 'plan_approved'; planFingerprint: string }>
  | Readonly<{ action: 'plan_rejected'; reasonId: string }>
  | Readonly<{ action: 'execution_started'; planFingerprint: string }>
  | Readonly<{
    action: 'completed'; planFingerprint: string; artifactReferences: readonly string[];
  }>
  | Readonly<{ action: 'failed'; planFingerprint: string; reasonId: string }>
  | Readonly<{ action: 'cancelled'; reasonId: string }>;

export type DataRightsEvidence = Readonly<{
  id: string;
  requestId: string;
  subject: DataRightsSubject;
  requestKind: DataRightsRequestKind;
  actorId: string;
  occurredAt: string;
  recordedAt: string;
  version: number;
  idempotencyKey: string;
  details: DataRightsEvidenceDetails;
}>;

type DataRightsCommandBase = Readonly<{
  evidenceId: string;
  requestId: string;
  subject: DataRightsSubject;
  requestKind: DataRightsRequestKind;
  actorId: string;
  occurredAt: string;
  recordedAt: string;
  expectedVersion: number;
  idempotencyKey: string;
}>;

export type DataRightsCommand = DataRightsCommandBase & DataRightsEvidenceDetails;

export type DataRightsState = Readonly<{
  requestId: string;
  subject: DataRightsSubject;
  requestKind: DataRightsRequestKind;
  status: 'verification_pending' | 'verified' | 'planned' | 'approved' |
    'rejected' | 'executing' | 'completed' | 'failed' | 'cancelled';
  version: number;
  requestPayloadReference: string | null;
  verification: Readonly<{
    methodId: string; evidenceReference: string; verifiedBy: string; verifiedAt: string;
  }> | null;
  plan: DataRightsPlan | null;
  approvedBy: string | null;
  approvedPlanFingerprint: string | null;
  artifactReferences: readonly string[];
  lastEvidence: DataRightsEvidence;
}>;

export type DataRightsWriteOutcome = Readonly<{
  outcome: 'appended' | 'replayed';
  evidence: DataRightsEvidence;
  state: DataRightsState;
}>;

const OPAQUE_ID_PATTERN = /^[a-z][a-z0-9]*(?:[_:-][a-z0-9]+)+$/u;
const NAMESPACED_ID_PATTERN = /^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)+$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;

function clean(value: string, label: string, pattern: RegExp, maximum = 200): string {
  if (value.length > maximum || value.trim() !== value || !pattern.test(value) ||
      /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new RangeError(`${label} inválido.`);
  }
  return value;
}

function opaque(value: string, label: string): string {
  return clean(value, label, OPAQUE_ID_PATTERN);
}

function namespaced(value: string, label: string): string {
  return clean(value, label, NAMESPACED_ID_PATTERN, 120);
}

function instant(value: string, label: string): number {
  const parsed = Date.parse(value);
  if (!value.endsWith('Z') || !Number.isFinite(parsed)) {
    throw new RangeError(`${label} debe ser una fecha ISO-8601 UTC.`);
  }
  return parsed;
}

function normalizeSubject(subject: DataRightsSubject): DataRightsSubject {
  if (subject.kind === 'customer_profile') {
    return Object.freeze({ kind: subject.kind, id: opaque(subject.id, 'dataRights.subject.id') });
  }
  if (subject.kind !== 'contact_identity') throw new RangeError('dataRights.subject.kind inválido.');
  return Object.freeze({
    kind: subject.kind,
    id: clean(subject.id, 'dataRights.subject.id', HASH_PATTERN, 64),
  });
}

function sameSubject(left: DataRightsSubject, right: DataRightsSubject): boolean {
  return left.kind === right.kind && left.id === right.id;
}

function normalizePlan(plan: DataRightsPlan): DataRightsPlan {
  if (plan.mode !== 'dry_run') throw new RangeError('El plan debe ser dry-run.');
  const decisions = plan.decisions.map((decision) => {
    if (!DATA_RIGHTS_OWNER_OPERATIONS.includes(decision.operation)) {
      throw new RangeError('dataRights.plan.operation inválida.');
    }
    const payloadReference = decision.payloadReference === null
      ? null
      : opaque(decision.payloadReference, 'dataRights.plan.payloadReference');
    if ((decision.operation === 'correct') !== (payloadReference !== null)) {
      throw new RangeError('Solo una corrección exige payloadReference.');
    }
    return Object.freeze({
      ownerId: namespaced(decision.ownerId, 'dataRights.plan.ownerId'),
      operation: decision.operation,
      policyReasonId: namespaced(decision.policyReasonId, 'dataRights.plan.policyReasonId'),
      payloadReference,
    });
  }).toSorted((left, right) => left.ownerId.localeCompare(right.ownerId));
  if (decisions.length < 1 || decisions.length > 100 ||
      new Set(decisions.map(({ ownerId }) => ownerId)).size !== decisions.length) {
    throw new RangeError('El plan exige propietarios únicos.');
  }
  instant(plan.createdAt, 'dataRights.plan.createdAt');
  return Object.freeze({
    id: opaque(plan.id, 'dataRights.plan.id'),
    mode: 'dry_run',
    fingerprint: clean(plan.fingerprint, 'dataRights.plan.fingerprint', HASH_PATTERN, 64),
    createdBy: opaque(plan.createdBy, 'dataRights.plan.createdBy'),
    createdAt: plan.createdAt,
    decisions: Object.freeze(decisions),
  });
}

function fingerprint(value: string): string {
  return clean(value, 'dataRights.planFingerprint', HASH_PATTERN, 64);
}

function normalizeDetails(details: DataRightsEvidenceDetails): DataRightsEvidenceDetails {
  if (!DATA_RIGHTS_ACTIONS.includes(details.action)) throw new RangeError('dataRights.action inválida.');
  switch (details.action) {
    case 'requested':
      return Object.freeze({ action: details.action,
        requestPayloadReference: details.requestPayloadReference === null ? null :
          opaque(details.requestPayloadReference, 'dataRights.requestPayloadReference') });
    case 'identity_verified':
      return Object.freeze({ action: details.action,
        methodId: namespaced(details.methodId, 'dataRights.verification.methodId'),
        evidenceReference: opaque(details.evidenceReference, 'dataRights.verification.evidenceReference') });
    case 'plan_attached':
      return Object.freeze({ action: details.action, plan: normalizePlan(details.plan) });
    case 'plan_approved':
    case 'execution_started':
      return Object.freeze({ action: details.action, planFingerprint: fingerprint(details.planFingerprint) });
    case 'completed': {
      const artifacts = details.artifactReferences.map((reference) =>
        opaque(reference, 'dataRights.artifactReference'));
      if (new Set(artifacts).size !== artifacts.length || artifacts.length > 100) {
        throw new RangeError('dataRights.artifactReferences inválidas.');
      }
      return Object.freeze({ action: details.action,
        planFingerprint: fingerprint(details.planFingerprint),
        artifactReferences: Object.freeze(artifacts) });
    }
    case 'plan_rejected':
    case 'cancelled':
      return Object.freeze({ action: details.action,
        reasonId: namespaced(details.reasonId, 'dataRights.reasonId') });
    case 'failed':
      return Object.freeze({ action: details.action,
        planFingerprint: fingerprint(details.planFingerprint),
        reasonId: namespaced(details.reasonId, 'dataRights.reasonId') });
  }
}

function sameDetails(left: DataRightsEvidenceDetails, right: DataRightsEvidenceDetails): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertContext(state: DataRightsState, evidence: DataRightsEvidence): void {
  if (state.requestId !== evidence.requestId || state.requestKind !== evidence.requestKind ||
      !sameSubject(state.subject, evidence.subject)) {
    throw new RangeError('El historial mezcla solicitudes o sujetos.');
  }
}

function transition(state: DataRightsState | null, evidence: DataRightsEvidence): DataRightsState {
  const details = evidence.details;
  if (details.action === 'requested') {
    if (state !== null || evidence.version !== 1) throw new RangeError('Solicitud duplicada.');
    if (evidence.requestKind === 'rectification' && details.requestPayloadReference === null) {
      throw new RangeError('La rectificación exige payloadReference opaca.');
    }
    return Object.freeze({
      requestId: evidence.requestId, subject: evidence.subject, requestKind: evidence.requestKind,
      status: 'verification_pending', version: 1,
      requestPayloadReference: details.requestPayloadReference,
      verification: null, plan: null, approvedBy: null, approvedPlanFingerprint: null,
      artifactReferences: Object.freeze([]), lastEvidence: evidence,
    });
  }
  if (state === null) throw new RangeError('La solicitud debe recibirse primero.');
  assertContext(state, evidence);
  const common = { ...state, version: evidence.version, lastEvidence: evidence };
  switch (details.action) {
    case 'identity_verified':
      if (state.status !== 'verification_pending') throw new RangeError('Verificación fuera de estado.');
      return Object.freeze({ ...common, status: 'verified', verification: Object.freeze({
        methodId: details.methodId, evidenceReference: details.evidenceReference,
        verifiedBy: evidence.actorId, verifiedAt: evidence.occurredAt,
      }) });
    case 'plan_attached':
      if (state.status !== 'verified') throw new RangeError('Plan antes de verificar o fuera de estado.');
      if (state.verification === null ||
          Date.parse(details.plan.createdAt) < Date.parse(state.verification.verifiedAt) ||
          Date.parse(details.plan.createdAt) > Date.parse(evidence.occurredAt)) {
        throw new RangeError('El plan debe crearse entre la verificación y su evidencia.');
      }
      return Object.freeze({ ...common, status: 'planned', plan: details.plan });
    case 'plan_approved':
      if (state.status !== 'planned' || state.plan === null ||
          details.planFingerprint !== state.plan.fingerprint) {
        throw new RangeError('Aprobación sin plan coincidente.');
      }
      if (evidence.actorId === state.plan.createdBy) throw new RangeError('La aprobación exige doble control.');
      if (state.plan.decisions.some(({ operation }) => operation === 'manual_review')) {
        throw new RangeError('Un plan con revisión manual no puede aprobarse.');
      }
      return Object.freeze({ ...common, status: 'approved', approvedBy: evidence.actorId,
        approvedPlanFingerprint: details.planFingerprint });
    case 'plan_rejected':
      if (state.status !== 'planned') throw new RangeError('Rechazo fuera de estado.');
      return Object.freeze({ ...common, status: 'rejected' });
    case 'execution_started':
      if (state.status !== 'approved' || details.planFingerprint !== state.approvedPlanFingerprint) {
        throw new RangeError('Ejecución sin plan aprobado coincidente.');
      }
      return Object.freeze({ ...common, status: 'executing' });
    case 'completed':
      if (state.status !== 'executing' || details.planFingerprint !== state.approvedPlanFingerprint) {
        throw new RangeError('Finalización sin ejecución coincidente.');
      }
      return Object.freeze({ ...common, status: 'completed',
        artifactReferences: details.artifactReferences });
    case 'failed':
      if (state.status !== 'executing' || details.planFingerprint !== state.approvedPlanFingerprint) {
        throw new RangeError('Fallo sin ejecución coincidente.');
      }
      return Object.freeze({ ...common, status: 'failed' });
    case 'cancelled':
      if (!['verification_pending', 'verified', 'planned', 'approved'].includes(state.status)) {
        throw new RangeError('Cancelación fuera de estado.');
      }
      return Object.freeze({ ...common, status: 'cancelled' });
  }
}

/** Reduce el lifecycle append-only. Un historial vacío todavía no es solicitud. */
export function dataRightsState(history: readonly DataRightsEvidence[]): DataRightsState | null {
  let state: DataRightsState | null = null;
  const ids = new Set<string>();
  const keys = new Set<string>();
  for (const evidence of history) {
    opaque(evidence.id, 'dataRights.evidenceId');
    opaque(evidence.requestId, 'dataRights.requestId');
    const subject = normalizeSubject(evidence.subject);
    if (!DATA_RIGHTS_REQUEST_KINDS.includes(evidence.requestKind)) {
      throw new RangeError('dataRights.requestKind inválido.');
    }
    opaque(evidence.actorId, 'dataRights.actorId');
    const occurred = instant(evidence.occurredAt, 'dataRights.occurredAt');
    const recorded = instant(evidence.recordedAt, 'dataRights.recordedAt');
    if (recorded < occurred) throw new RangeError('El registro no puede preceder al hecho.');
    clean(evidence.idempotencyKey, 'dataRights.idempotencyKey', /^.{8,200}$/u, 200);
    if (ids.has(evidence.id) || keys.has(evidence.idempotencyKey)) {
      throw new RangeError('El historial contiene evidencia duplicada.');
    }
    if (evidence.version !== (state?.version ?? 0) + 1) {
      throw new RangeError('Secuencia de derechos de datos inválida.');
    }
    if (state !== null && occurred < Date.parse(state.lastEvidence.occurredAt)) {
      throw new RangeError('La evidencia no puede retroceder en el tiempo.');
    }
    const normalizedEvidence = Object.freeze({ ...evidence, subject,
      details: normalizeDetails(evidence.details) });
    state = transition(state, normalizedEvidence);
    ids.add(evidence.id);
    keys.add(evidence.idempotencyKey);
  }
  return state;
}

function replayMatches(evidence: DataRightsEvidence, command: DataRightsCommand,
  details: DataRightsEvidenceDetails): boolean {
  return evidence.id === command.evidenceId && evidence.requestId === command.requestId &&
    sameSubject(evidence.subject, command.subject) && evidence.requestKind === command.requestKind &&
    evidence.actorId === command.actorId && evidence.occurredAt === command.occurredAt &&
    evidence.recordedAt === command.recordedAt && command.expectedVersion === evidence.version - 1 &&
    sameDetails(normalizeDetails(evidence.details), details);
}

/** Añade el siguiente hecho o recupera un retry semánticamente idéntico. */
export function recordDataRightsEvidence(
  history: readonly DataRightsEvidence[],
  command: DataRightsCommand,
): DataRightsWriteOutcome {
  const current = dataRightsState(history);
  opaque(command.evidenceId, 'dataRights.evidenceId');
  opaque(command.requestId, 'dataRights.requestId');
  const subject = normalizeSubject(command.subject);
  if (!DATA_RIGHTS_REQUEST_KINDS.includes(command.requestKind)) {
    throw new RangeError('dataRights.requestKind inválido.');
  }
  const actorId = opaque(command.actorId, 'dataRights.actorId');
  const occurred = instant(command.occurredAt, 'dataRights.occurredAt');
  const recorded = instant(command.recordedAt, 'dataRights.recordedAt');
  if (recorded < occurred) throw new RangeError('El registro no puede preceder al hecho.');
  clean(command.idempotencyKey, 'dataRights.idempotencyKey', /^.{8,200}$/u, 200);
  const details = normalizeDetails(command);
  const replay = history.find(({ idempotencyKey }) => idempotencyKey === command.idempotencyKey);
  if (replay !== undefined) {
    if (!replayMatches(replay, command, details)) {
      throw new RangeError('Conflicto de idempotencia de derechos de datos.');
    }
    if (current === null) throw new RangeError('Historial de derechos de datos inválido.');
    return Object.freeze({ outcome: 'replayed', evidence: replay, state: current });
  }
  if (!Number.isSafeInteger(command.expectedVersion) ||
      command.expectedVersion !== (current?.version ?? 0)) {
    throw new RangeError('Conflicto de versión de derechos de datos.');
  }
  if (current !== null && occurred < Date.parse(current.lastEvidence.occurredAt)) {
    throw new RangeError('La evidencia no puede retroceder en el tiempo.');
  }
  const evidence: DataRightsEvidence = Object.freeze({
    id: command.evidenceId, requestId: command.requestId, subject,
    requestKind: command.requestKind, actorId,
    occurredAt: command.occurredAt, recordedAt: command.recordedAt,
    version: (current?.version ?? 0) + 1,
    idempotencyKey: command.idempotencyKey, details,
  });
  const state = dataRightsState(Object.freeze([...history, evidence]));
  if (state === null) throw new RangeError('No se pudo construir la solicitud.');
  return Object.freeze({ outcome: 'appended', evidence, state });
}
