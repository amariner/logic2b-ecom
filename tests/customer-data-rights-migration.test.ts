import { describe, expect, it } from 'vitest';
import migration38 from '../migrations/0038_data_rights_evidence.sql?raw';
import { SqliteD1 } from './sqlite-d1';

const AT = '2026-08-18T08:00:00.000Z';

function beforeMigration(): SqliteD1 {
  return new SqliteD1(true, true, true, true, true, true, true, true, true,
    true, true, true, true, true, false);
}

function insertProfile(db: SqliteD1): void {
  db.sqlite.prepare(`INSERT INTO customer_profiles (
    id, primary_email, email_identity_hash, status, version, created_at, updated_at
  ) VALUES ('profile:rights:1', 'rights@example.com', ?, 'active', 1, ?, ?)`)
    .run('a'.repeat(64), AT, AT);
}

type EvidenceInput = Readonly<{
  id: string;
  version: number;
  action: string;
  idempotencyKey: string;
  requestId?: string;
  profileId?: string | null;
  contactHash?: string | null;
  requestKind?: string;
  actorId?: string;
  occurredAt?: string;
  requestPayloadReference?: string | null;
  verificationMethodId?: string | null;
  verificationEvidenceReference?: string | null;
  planId?: string | null;
  planFingerprint?: string | null;
  planCreatedBy?: string | null;
  planCreatedAt?: string | null;
  reasonId?: string | null;
}>;

function insertEvidence(db: SqliteD1, input: EvidenceInput): void {
  db.sqlite.prepare(`INSERT INTO customer_data_rights_evidence (
    id, request_id, customer_profile_id, contact_identity_hash, request_kind,
    action, actor_id, occurred_at, recorded_at, version, idempotency_key,
    request_payload_reference, verification_method_id,
    verification_evidence_reference, plan_id, plan_fingerprint,
    plan_created_by, plan_created_at, reason_id
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      input.id,
      input.requestId ?? 'request:rights:1',
      input.profileId === undefined ? 'profile:rights:1' : input.profileId,
      input.contactHash ?? null,
      input.requestKind ?? 'access',
      input.action,
      input.actorId ?? 'actor:operator:1',
      input.occurredAt ?? AT,
      input.occurredAt ?? AT,
      input.version,
      input.idempotencyKey,
      input.requestPayloadReference ?? null,
      input.verificationMethodId ?? null,
      input.verificationEvidenceReference ?? null,
      input.planId ?? null,
      input.planFingerprint ?? null,
      input.planCreatedBy ?? null,
      input.planCreatedAt ?? null,
      input.reasonId ?? null,
    );
}

describe('migración 0038 de evidencia de derechos de datos', () => {
  it('es expand-only y no infiere solicitudes desde perfiles o consentimientos', () => {
    const db = beforeMigration();
    insertProfile(db);
    db.sqlite.exec(`INSERT INTO customer_consent_evidence (
      id, customer_profile_id, contact_identity_hash, channel, purpose_id,
      action, notice_id, notice_version, source_kind, source_reference, region,
      occurred_at, recorded_at, withdraws_evidence_id, version, idempotency_key
    ) VALUES ('consent_rights_1', 'profile:rights:1', NULL, 'email',
      'marketing.newsletter', 'granted', 'privacy.marketing', '2026-08-18',
      'storefront', 'form_footer', 'ES', '${AT}', '${AT}', NULL, 1,
      'idem:rights:consent:1')`);
    const before = db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table'",
    ).length;

    db.sqlite.exec(migration38);

    expect(db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'").length)
      .toBe(before + 3);
    expect(db.value('SELECT count(*) AS value FROM customer_data_rights_evidence')).toBe(0);
    expect(migration38).not.toMatch(/INSERT\s+INTO\s+customer_data_rights_evidence\s+SELECT/iu);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('conserva el historial y normaliza decisiones sin admitir payload arbitrario', () => {
    const db = new SqliteD1();
    insertProfile(db);
    insertEvidence(db, {
      id: 'evidence:rights:1', version: 1, action: 'requested',
      idempotencyKey: 'idem:rights:requested:1',
    });
    insertEvidence(db, {
      id: 'evidence:rights:2', version: 2, action: 'identity_verified',
      idempotencyKey: 'idem:rights:verified:1',
      actorId: 'actor:verifier:1',
      occurredAt: '2026-08-18T08:01:00.000Z',
      verificationMethodId: 'method:account_session',
      verificationEvidenceReference: 'proof:session:1',
    });
    insertEvidence(db, {
      id: 'evidence:rights:3', version: 3, action: 'plan_attached',
      idempotencyKey: 'idem:rights:plan:1',
      actorId: 'actor:planner:1',
      occurredAt: '2026-08-18T08:02:00.000Z',
      planId: 'plan:rights:1',
      planFingerprint: 'b'.repeat(64),
      planCreatedBy: 'actor:planner:1',
      planCreatedAt: '2026-08-18T08:01:30.000Z',
    });
    db.sqlite.exec(`INSERT INTO customer_data_rights_plan_decisions (
      evidence_id, owner_id, operation, policy_reason_id, payload_reference, position
    ) VALUES ('evidence:rights:3', 'orders:snapshots', 'retain',
      'policy:fiscal_retention', NULL, 0)`);

    expect(db.query(`SELECT action, version FROM customer_data_rights_evidence
      ORDER BY version`)).toEqual([
      { action: 'requested', version: 1 },
      { action: 'identity_verified', version: 2 },
      { action: 'plan_attached', version: 3 },
    ]);
    expect(() => db.sqlite.exec(`UPDATE customer_data_rights_evidence
      SET actor_id='actor:other:1' WHERE id='evidence:rights:1'`))
      .toThrow(/customer_data_rights_evidence_immutable/u);
    expect(() => db.sqlite.exec(`UPDATE customer_data_rights_plan_decisions
      SET operation='export' WHERE evidence_id='evidence:rights:3'`))
      .toThrow(/customer_data_rights_plan_decision_immutable/u);
  });

  it('rechaza saltos de versión, contexto mezclado, tiempo regresivo y PII literal', () => {
    const db = new SqliteD1();
    insertProfile(db);
    expect(() => insertEvidence(db, {
      id: 'evidence:rights:gap', version: 2, action: 'identity_verified',
      idempotencyKey: 'idem:rights:gap:1',
      verificationMethodId: 'method:session',
      verificationEvidenceReference: 'proof:session:gap',
    })).toThrow(/customer_data_rights_version_conflict/u);
    insertEvidence(db, {
      id: 'evidence:rights:1', version: 1, action: 'requested',
      idempotencyKey: 'idem:rights:requested:1',
    });
    expect(() => insertEvidence(db, {
      id: 'evidence:rights:context', version: 2, action: 'identity_verified',
      idempotencyKey: 'idem:rights:context:1', requestKind: 'erasure',
      verificationMethodId: 'method:session',
      verificationEvidenceReference: 'proof:session:context',
    })).toThrow(/customer_data_rights_context_conflict/u);
    expect(() => insertEvidence(db, {
      id: 'evidence:rights:past', version: 2, action: 'identity_verified',
      idempotencyKey: 'idem:rights:past:1', occurredAt: '2026-08-18T07:59:00.000Z',
      verificationMethodId: 'method:session',
      verificationEvidenceReference: 'proof:session:past',
    })).toThrow(/customer_data_rights_time_conflict/u);
    expect(() => insertEvidence(db, {
      id: 'evidence:rights:pii', requestId: 'person@example.com', version: 1,
      action: 'requested', idempotencyKey: 'idem:rights:pii:1',
    })).toThrow(/CHECK constraint failed/u);
    expect(db.value('SELECT count(*) AS value FROM customer_data_rights_evidence')).toBe(1);
  });

  it('solo admite decisiones y artefactos bajo la evidencia correspondiente', () => {
    const db = new SqliteD1();
    insertProfile(db);
    insertEvidence(db, {
      id: 'evidence:rights:1', version: 1, action: 'requested',
      idempotencyKey: 'idem:rights:requested:1',
    });
    expect(() => db.sqlite.exec(`INSERT INTO customer_data_rights_plan_decisions (
      evidence_id, owner_id, operation, policy_reason_id, payload_reference, position
    ) VALUES ('evidence:rights:1', 'orders:snapshots', 'retain',
      'policy:fiscal_retention', NULL, 0)`))
      .toThrow(/customer_data_rights_plan_decision_conflict/u);
    expect(() => db.sqlite.exec(`INSERT INTO customer_data_rights_artifact_references (
      evidence_id, artifact_reference, position
    ) VALUES ('evidence:rights:1', 'artifact:export:1', 0)`))
      .toThrow(/customer_data_rights_artifact_reference_conflict/u);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });
});
