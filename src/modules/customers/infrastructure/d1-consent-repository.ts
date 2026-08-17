import type { ConsentRepository } from '../application/consent-repository';
import {
  consentState,
  recordConsent,
  type ConsentCommand,
  type ConsentEvidence,
  type ConsentScope,
  type ConsentState,
  type ConsentSubject,
  type ConsentWriteOutcome,
} from '../domain/consent';

type ConsentRow = Readonly<{
  id: string;
  customer_profile_id: string | null;
  contact_identity_hash: string | null;
  channel: ConsentScope['channel'];
  purpose_id: string;
  action: ConsentEvidence['action'];
  notice_id: string;
  notice_version: string;
  source_kind: ConsentEvidence['source']['kind'];
  source_reference: string | null;
  region: string;
  occurred_at: string;
  recorded_at: string;
  withdraws_evidence_id: string | null;
  version: number;
  idempotency_key: string;
}>;

const EVIDENCE_COLUMNS = `id, customer_profile_id, contact_identity_hash,
  channel, purpose_id, action, notice_id, notice_version, source_kind,
  source_reference, region, occurred_at, recorded_at, withdraws_evidence_id,
  version, idempotency_key`;

export class ConsentConflictError extends Error {
  readonly code = 'customer_consent_conflict';

  constructor() {
    super('La operación de consentimiento no pudo confirmarse.');
    this.name = 'ConsentConflictError';
  }
}

function conflict(): never {
  throw new ConsentConflictError();
}

function evidenceOf(row: ConsentRow): ConsentEvidence {
  const subject: ConsentSubject = row.customer_profile_id === null
    ? Object.freeze({ kind: 'contact_identity', id: row.contact_identity_hash! })
    : Object.freeze({ kind: 'customer_profile', id: row.customer_profile_id });
  return Object.freeze({
    id: row.id,
    subject,
    scope: Object.freeze({ channel: row.channel, purposeId: row.purpose_id }),
    action: row.action,
    legalNotice: Object.freeze({ noticeId: row.notice_id, version: row.notice_version }),
    source: Object.freeze({ kind: row.source_kind, reference: row.source_reference }),
    region: row.region,
    occurredAt: row.occurred_at,
    recordedAt: row.recorded_at,
    withdrawsEvidenceId: row.withdraws_evidence_id,
    version: row.version,
    idempotencyKey: row.idempotency_key,
  });
}

function normalizedScope(subject: ConsentSubject, scope: ConsentScope): ConsentState {
  return consentState([], subject, scope);
}

function scopeQuery(subject: ConsentSubject): Readonly<{ clause: string; subjectId: string }> {
  if (subject.kind === 'customer_profile') {
    return Object.freeze({
      clause: 'customer_profile_id = ? AND contact_identity_hash IS NULL',
      subjectId: subject.id,
    });
  }
  return Object.freeze({
    clause: 'customer_profile_id IS NULL AND contact_identity_hash = ?',
    subjectId: subject.id,
  });
}

/** Adaptador interno; no contiene lookup por email ni imprime HMAC/PII. */
export function createD1ConsentRepository(db: D1Database): ConsentRepository {
  async function history(
    subject: ConsentSubject,
    scope: ConsentScope,
  ): Promise<readonly ConsentEvidence[]> {
    const normalized = normalizedScope(subject, scope);
    const query = scopeQuery(normalized.subject);
    const result = await db.prepare(`SELECT ${EVIDENCE_COLUMNS}
      FROM customer_consent_evidence
      WHERE ${query.clause} AND channel = ? AND purpose_id = ?
      ORDER BY version`).bind(
        query.subjectId,
        normalized.scope.channel,
        normalized.scope.purposeId,
      ).all<ConsentRow>();
    const evidence = Object.freeze((result.results ?? []).map(evidenceOf));
    consentState(evidence, normalized.subject, normalized.scope);
    return evidence;
  }

  async function current(
    subject: ConsentSubject,
    scope: ConsentScope,
  ): Promise<ConsentState> {
    return consentState(await history(subject, scope), subject, scope);
  }

  async function recoverReplay(command: ConsentCommand): Promise<ConsentWriteOutcome> {
    try {
      const latest = await history(command.subject, command.scope);
      const replay = recordConsent(latest, command);
      if (replay.outcome === 'replayed') return replay;
    } catch {
      // El error externo es deliberadamente estable y no incluye sujeto ni D1.
    }
    return conflict();
  }

  async function append(command: ConsentCommand): Promise<ConsentWriteOutcome> {
    let planned: ConsentWriteOutcome;
    try {
      planned = recordConsent(await history(command.subject, command.scope), command);
    } catch {
      return conflict();
    }
    if (planned.outcome === 'replayed') return planned;

    const evidence = planned.evidence;
    const profileId = evidence.subject.kind === 'customer_profile' ? evidence.subject.id : null;
    const contactHash = evidence.subject.kind === 'contact_identity' ? evidence.subject.id : null;
    const query = scopeQuery(evidence.subject);
    try {
      const results = await db.batch<ConsentRow>([
        db.prepare(`INSERT OR IGNORE INTO customer_consent_evidence (
          id, customer_profile_id, contact_identity_hash, channel, purpose_id,
          action, notice_id, notice_version, source_kind, source_reference,
          region, occurred_at, recorded_at, withdraws_evidence_id, version,
          idempotency_key
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
          evidence.id,
          profileId,
          contactHash,
          evidence.scope.channel,
          evidence.scope.purposeId,
          evidence.action,
          evidence.legalNotice.noticeId,
          evidence.legalNotice.version,
          evidence.source.kind,
          evidence.source.reference,
          evidence.region,
          evidence.occurredAt,
          evidence.recordedAt,
          evidence.withdrawsEvidenceId,
          evidence.version,
          evidence.idempotencyKey,
        ),
        db.prepare(`SELECT ${EVIDENCE_COLUMNS}
          FROM customer_consent_evidence
          WHERE ${query.clause} AND channel = ? AND purpose_id = ?
          ORDER BY version`).bind(
          query.subjectId,
          evidence.scope.channel,
          evidence.scope.purposeId,
        ),
      ]);
      const storedHistory = Object.freeze((results[1]?.results ?? []).map(evidenceOf));
      const stored = storedHistory.find((item) => item.idempotencyKey === command.idempotencyKey);
      if (stored === undefined) return conflict();
      const validated = recordConsent(storedHistory, command);
      if (validated.outcome !== 'replayed') return conflict();
      return Object.freeze({
        outcome: results[0]?.meta.changes === 1 ? 'appended' : 'replayed',
        evidence: stored,
        state: consentState(storedHistory, evidence.subject, evidence.scope),
      });
    } catch (error) {
      if (error instanceof ConsentConflictError) throw error;
      return recoverReplay(command);
    }
  }

  return Object.freeze({ history, current, append });
}
