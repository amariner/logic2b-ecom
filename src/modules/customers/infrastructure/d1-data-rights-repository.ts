import type { DataRightsRepository } from '../application/data-rights-repository';
import {
  dataRightsState,
  recordDataRightsEvidence,
  type DataRightsCommand,
  type DataRightsEvidence,
  type DataRightsEvidenceDetails,
  type DataRightsPlanDecision,
  type DataRightsState,
  type DataRightsSubject,
  type DataRightsWriteOutcome,
} from '../domain/data-rights';

type DataRightsEvidenceRow = Readonly<{
  id: string;
  request_id: string;
  customer_profile_id: string | null;
  contact_identity_hash: string | null;
  request_kind: DataRightsEvidence['requestKind'];
  action: DataRightsEvidenceDetails['action'];
  actor_id: string;
  occurred_at: string;
  recorded_at: string;
  version: number;
  idempotency_key: string;
  request_payload_reference: string | null;
  verification_method_id: string | null;
  verification_evidence_reference: string | null;
  plan_id: string | null;
  plan_fingerprint: string | null;
  plan_created_by: string | null;
  plan_created_at: string | null;
  reason_id: string | null;
}>;

type DataRightsPlanDecisionRow = Readonly<{
  evidence_id: string;
  owner_id: string;
  operation: DataRightsPlanDecision['operation'];
  policy_reason_id: string;
  payload_reference: string | null;
  position: number;
}>;

type DataRightsArtifactRow = Readonly<{
  evidence_id: string;
  artifact_reference: string;
  position: number;
}>;

const EVIDENCE_COLUMNS = `id, request_id, customer_profile_id, contact_identity_hash,
  request_kind, action, actor_id, occurred_at, recorded_at, version, idempotency_key,
  request_payload_reference, verification_method_id, verification_evidence_reference,
  plan_id, plan_fingerprint, plan_created_by, plan_created_at, reason_id`;

const REQUEST_ID_PATTERN = /^[a-z][a-z0-9]*(?:[_:-][a-z0-9]+)+$/u;

export class DataRightsConflictError extends Error {
  readonly code = 'customer_data_rights_conflict';

  constructor() {
    super('La operación de derechos de datos no pudo confirmarse.');
    this.name = 'DataRightsConflictError';
  }
}

function conflict(): never {
  throw new DataRightsConflictError();
}

function requestIdOf(value: string): string {
  if (value.length > 200 || value.trim() !== value || !REQUEST_ID_PATTERN.test(value)) {
    return conflict();
  }
  return value;
}

function subjectOf(row: DataRightsEvidenceRow): DataRightsSubject {
  return row.customer_profile_id === null
    ? Object.freeze({ kind: 'contact_identity', id: row.contact_identity_hash! })
    : Object.freeze({ kind: 'customer_profile', id: row.customer_profile_id });
}

function detailsOf(
  row: DataRightsEvidenceRow,
  decisions: ReadonlyMap<string, readonly DataRightsPlanDecision[]>,
  artifacts: ReadonlyMap<string, readonly string[]>,
): DataRightsEvidenceDetails {
  switch (row.action) {
    case 'requested':
      return Object.freeze({
        action: row.action,
        requestPayloadReference: row.request_payload_reference,
      });
    case 'identity_verified':
      return Object.freeze({
        action: row.action,
        methodId: row.verification_method_id!,
        evidenceReference: row.verification_evidence_reference!,
      });
    case 'plan_attached':
      return Object.freeze({
        action: row.action,
        plan: Object.freeze({
          id: row.plan_id!,
          mode: 'dry_run',
          fingerprint: row.plan_fingerprint!,
          createdBy: row.plan_created_by!,
          createdAt: row.plan_created_at!,
          decisions: decisions.get(row.id) ?? Object.freeze([]),
        }),
      });
    case 'plan_approved':
    case 'execution_started':
      return Object.freeze({ action: row.action, planFingerprint: row.plan_fingerprint! });
    case 'completed':
      return Object.freeze({
        action: row.action,
        planFingerprint: row.plan_fingerprint!,
        artifactReferences: artifacts.get(row.id) ?? Object.freeze([]),
      });
    case 'plan_rejected':
    case 'cancelled':
      return Object.freeze({ action: row.action, reasonId: row.reason_id! });
    case 'failed':
      return Object.freeze({
        action: row.action,
        planFingerprint: row.plan_fingerprint!,
        reasonId: row.reason_id!,
      });
  }
}

function groupedDecisions(rows: readonly DataRightsPlanDecisionRow[]): ReadonlyMap<
string, readonly DataRightsPlanDecision[]> {
  const result = new Map<string, DataRightsPlanDecision[]>();
  for (const row of rows) {
    const decisions = result.get(row.evidence_id) ?? [];
    decisions.push(Object.freeze({
      ownerId: row.owner_id,
      operation: row.operation,
      policyReasonId: row.policy_reason_id,
      payloadReference: row.payload_reference,
    }));
    result.set(row.evidence_id, decisions);
  }
  return new Map([...result].map(([id, values]) => [id, Object.freeze(values)]));
}

function groupedArtifacts(rows: readonly DataRightsArtifactRow[]): ReadonlyMap<
string, readonly string[]> {
  const result = new Map<string, string[]>();
  for (const row of rows) {
    const references = result.get(row.evidence_id) ?? [];
    references.push(row.artifact_reference);
    result.set(row.evidence_id, references);
  }
  return new Map([...result].map(([id, values]) => [id, Object.freeze(values)]));
}

function evidenceOf(
  row: DataRightsEvidenceRow,
  decisions: ReadonlyMap<string, readonly DataRightsPlanDecision[]>,
  artifacts: ReadonlyMap<string, readonly string[]>,
): DataRightsEvidence {
  return Object.freeze({
    id: row.id,
    requestId: row.request_id,
    subject: subjectOf(row),
    requestKind: row.request_kind,
    actorId: row.actor_id,
    occurredAt: row.occurred_at,
    recordedAt: row.recorded_at,
    version: row.version,
    idempotencyKey: row.idempotency_key,
    details: detailsOf(row, decisions, artifacts),
  });
}

function scalarDetails(details: DataRightsEvidenceDetails): readonly (
string | null)[] {
  switch (details.action) {
    case 'requested':
      return [details.requestPayloadReference, null, null, null, null, null, null, null];
    case 'identity_verified':
      return [null, details.methodId, details.evidenceReference, null, null, null, null, null];
    case 'plan_attached':
      return [null, null, null, details.plan.id, details.plan.fingerprint,
        details.plan.createdBy, details.plan.createdAt, null];
    case 'plan_approved':
    case 'execution_started':
    case 'completed':
      return [null, null, null, null, details.planFingerprint, null, null, null];
    case 'plan_rejected':
    case 'cancelled':
      return [null, null, null, null, null, null, null, details.reasonId];
    case 'failed':
      return [null, null, null, null, details.planFingerprint, null, null, details.reasonId];
  }
}

/** Adaptador interno sin búsquedas por email, payloads protegidos ni artefactos. */
export function createD1DataRightsRepository(db: D1Database): DataRightsRepository {
  async function history(requestId: string): Promise<readonly DataRightsEvidence[]> {
    const normalizedRequestId = requestIdOf(requestId);
    const results = await db.batch<Record<string, unknown>>([
      db.prepare(`SELECT ${EVIDENCE_COLUMNS}
        FROM customer_data_rights_evidence
        WHERE request_id = ? ORDER BY version`).bind(normalizedRequestId),
      db.prepare(`SELECT decision.evidence_id, decision.owner_id, decision.operation,
          decision.policy_reason_id, decision.payload_reference, decision.position
        FROM customer_data_rights_plan_decisions decision
        JOIN customer_data_rights_evidence evidence ON evidence.id = decision.evidence_id
        WHERE evidence.request_id = ?
        ORDER BY evidence.version, decision.position`).bind(normalizedRequestId),
      db.prepare(`SELECT artifact.evidence_id, artifact.artifact_reference, artifact.position
        FROM customer_data_rights_artifact_references artifact
        JOIN customer_data_rights_evidence evidence ON evidence.id = artifact.evidence_id
        WHERE evidence.request_id = ?
        ORDER BY evidence.version, artifact.position`).bind(normalizedRequestId),
    ]);
    const evidenceRows = (results[0]?.results ?? []) as DataRightsEvidenceRow[];
    const decisionRows = (results[1]?.results ?? []) as DataRightsPlanDecisionRow[];
    const artifactRows = (results[2]?.results ?? []) as DataRightsArtifactRow[];
    const decisions = groupedDecisions(decisionRows);
    const artifacts = groupedArtifacts(artifactRows);
    const evidence = Object.freeze(evidenceRows.map((row) => evidenceOf(row, decisions, artifacts)));
    dataRightsState(evidence);
    return evidence;
  }

  async function current(requestId: string): Promise<DataRightsState | null> {
    return dataRightsState(await history(requestId));
  }

  async function recoverReplay(command: DataRightsCommand): Promise<DataRightsWriteOutcome> {
    try {
      const storedHistory = await history(command.requestId);
      const replay = recordDataRightsEvidence(storedHistory, command);
      if (replay.outcome === 'replayed') return replay;
    } catch {
      // El error estable no incluye requestId, sujeto, referencias, claves o SQL.
    }
    return conflict();
  }

  async function append(command: DataRightsCommand): Promise<DataRightsWriteOutcome> {
    let planned: DataRightsWriteOutcome;
    try {
      planned = recordDataRightsEvidence(await history(command.requestId), command);
    } catch {
      return conflict();
    }
    if (planned.outcome === 'replayed') return planned;

    const evidence = planned.evidence;
    const profileId = evidence.subject.kind === 'customer_profile' ? evidence.subject.id : null;
    const contactHash = evidence.subject.kind === 'contact_identity' ? evidence.subject.id : null;
    const details = scalarDetails(evidence.details);
    const statements = [
      db.prepare(`INSERT OR IGNORE INTO customer_data_rights_evidence (
        id, request_id, customer_profile_id, contact_identity_hash, request_kind,
        action, actor_id, occurred_at, recorded_at, version, idempotency_key,
        request_payload_reference, verification_method_id,
        verification_evidence_reference, plan_id, plan_fingerprint,
        plan_created_by, plan_created_at, reason_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        evidence.id,
        evidence.requestId,
        profileId,
        contactHash,
        evidence.requestKind,
        evidence.details.action,
        evidence.actorId,
        evidence.occurredAt,
        evidence.recordedAt,
        evidence.version,
        evidence.idempotencyKey,
        ...details,
      ),
    ];
    if (evidence.details.action === 'plan_attached') {
      evidence.details.plan.decisions.forEach((decision, position) => {
        statements.push(db.prepare(`INSERT OR IGNORE INTO customer_data_rights_plan_decisions (
          evidence_id, owner_id, operation, policy_reason_id, payload_reference, position
        ) VALUES (?, ?, ?, ?, ?, ?)`).bind(
          evidence.id,
          decision.ownerId,
          decision.operation,
          decision.policyReasonId,
          decision.payloadReference,
          position,
        ));
      });
    }
    if (evidence.details.action === 'completed') {
      evidence.details.artifactReferences.forEach((reference, position) => {
        statements.push(db.prepare(`INSERT OR IGNORE INTO customer_data_rights_artifact_references (
          evidence_id, artifact_reference, position
        ) VALUES (?, ?, ?)`).bind(evidence.id, reference, position));
      });
    }

    try {
      const results = await db.batch(statements);
      const storedHistory = await history(evidence.requestId);
      const replay = recordDataRightsEvidence(storedHistory, command);
      if (replay.outcome !== 'replayed') return conflict();
      return Object.freeze({
        outcome: results[0]?.meta.changes === 1 ? 'appended' : 'replayed',
        evidence: replay.evidence,
        state: replay.state,
      });
    } catch (error) {
      if (error instanceof DataRightsConflictError) throw error;
      return recoverReplay(command);
    }
  }

  return Object.freeze({ history, current, append });
}
