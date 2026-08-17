import { describe, expect, it } from 'vitest';
import migration37 from '../migrations/0037_consent_evidence.sql?raw';
import { SqliteD1 } from './sqlite-d1';

const AT = '2026-08-17T12:00:00.000Z';

function beforeMigration(): SqliteD1 {
  return new SqliteD1(true, true, true, true, true, true, true, true, true,
    true, true, true, true, false);
}

function insertProfile(db: SqliteD1, id = 'cus_consent_a', hash = 'a'.repeat(64)): void {
  db.sqlite.prepare(`INSERT INTO customer_profiles (
    id, primary_email, email_identity_hash, status, version, created_at, updated_at
  ) VALUES (?, 'consent@example.com', ?, 'active', 1, ?, ?)`).run(id, hash, AT, AT);
}

type EvidenceInput = Readonly<{
  id: string;
  profileId?: string | null;
  contactHash?: string | null;
  channel?: string;
  purposeId?: string;
  action?: string;
  noticeId?: string;
  noticeVersion?: string;
  sourceKind?: string;
  sourceReference?: string | null;
  region?: string;
  occurredAt?: string;
  recordedAt?: string;
  withdrawsEvidenceId?: string | null;
  version: number;
  idempotencyKey: string;
}>;

function insertEvidence(db: SqliteD1, input: EvidenceInput): void {
  db.sqlite.prepare(`INSERT INTO customer_consent_evidence (
    id, customer_profile_id, contact_identity_hash, channel, purpose_id,
    action, notice_id, notice_version, source_kind, source_reference, region,
    occurred_at, recorded_at, withdraws_evidence_id, version, idempotency_key
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      input.id,
      input.profileId === undefined ? 'cus_consent_a' : input.profileId,
      input.contactHash ?? null,
      input.channel ?? 'email',
      input.purposeId ?? 'marketing.newsletter',
      input.action ?? 'granted',
      input.noticeId ?? 'privacy.marketing',
      input.noticeVersion ?? '2026-08-17',
      input.sourceKind ?? 'storefront',
      input.sourceReference === undefined ? 'form_footer' : input.sourceReference,
      input.region ?? 'ES',
      input.occurredAt ?? AT,
      input.recordedAt ?? input.occurredAt ?? AT,
      input.withdrawsEvidenceId ?? null,
      input.version,
      input.idempotencyKey,
    );
}

describe('migración 0037 de evidencia de consentimiento', () => {
  it('es expand-only y no infiere grants desde perfiles o pedidos', () => {
    const db = beforeMigration();
    insertProfile(db);
    db.sqlite.exec(`INSERT INTO orders (
      order_number, email, customer_name, address_json, subtotal_cents,
      shipping_cents, total_cents, status, stripe_session_id, currency,
      customer_profile_id
    ) VALUES ('ORDER-BEFORE-37', 'legacy@example.com', 'Legacy', '{}',
      1000, 0, 1000, 'pending', 'session-before-37', 'EUR', 'cus_consent_a')`);
    const before = db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table'",
    ).length;

    db.sqlite.exec(migration37);

    expect(db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'").length)
      .toBe(before + 1);
    expect(db.value('SELECT count(*) AS value FROM customer_consent_evidence')).toBe(0);
    expect(migration37).not.toMatch(/INSERT\s+INTO\s+customer_consent_evidence\s+SELECT/iu);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('conserva grant, retirada y reconsentimiento como versiones inmutables', () => {
    const db = new SqliteD1();
    insertProfile(db);
    insertEvidence(db, { id: 'consent_ev_001', version: 1, idempotencyKey: 'idem:grant:001' });
    insertEvidence(db, {
      id: 'consent_ev_002', action: 'withdrawn', withdrawsEvidenceId: 'consent_ev_001',
      occurredAt: '2026-08-17T13:00:00.000Z', version: 2,
      idempotencyKey: 'idem:withdraw:001',
    });
    insertEvidence(db, {
      id: 'consent_ev_003', noticeVersion: '2026-09-01',
      occurredAt: '2026-09-01T09:00:00.000Z', version: 3,
      idempotencyKey: 'idem:grant:002',
    });

    expect(db.query(`SELECT id, action, withdraws_evidence_id, version
      FROM customer_consent_evidence ORDER BY version`)).toEqual([
      { id: 'consent_ev_001', action: 'granted', withdraws_evidence_id: null, version: 1 },
      { id: 'consent_ev_002', action: 'withdrawn', withdraws_evidence_id: 'consent_ev_001', version: 2 },
      { id: 'consent_ev_003', action: 'granted', withdraws_evidence_id: null, version: 3 },
    ]);
    expect(() => db.sqlite.exec(`UPDATE customer_consent_evidence
      SET region='EU' WHERE id='consent_ev_001'`))
      .toThrow(/customer_consent_evidence_immutable/u);
  });

  it('rechaza versiones, tiempo, idempotencia y retiradas que no apuntan al grant vigente', () => {
    const db = new SqliteD1();
    insertProfile(db);
    expect(() => insertEvidence(db, {
      id: 'consent_ev_gap', version: 2, idempotencyKey: 'idem:gap:001',
    })).toThrow(/customer_consent_version_conflict/u);
    insertEvidence(db, { id: 'consent_ev_001', version: 1, idempotencyKey: 'idem:grant:001' });
    expect(() => insertEvidence(db, {
      id: 'consent_ev_cross', channel: 'sms', action: 'withdrawn',
      withdrawsEvidenceId: 'consent_ev_001', version: 1,
      idempotencyKey: 'idem:cross:001',
    })).toThrow(/customer_consent_withdrawal_conflict/u);
    insertEvidence(db, {
      id: 'consent_ev_002', action: 'withdrawn', withdrawsEvidenceId: 'consent_ev_001',
      occurredAt: '2026-08-17T13:00:00.000Z', version: 2,
      idempotencyKey: 'idem:withdraw:001',
    });
    expect(() => insertEvidence(db, {
      id: 'consent_ev_again', action: 'withdrawn', withdrawsEvidenceId: 'consent_ev_001',
      occurredAt: '2026-08-17T14:00:00.000Z', version: 3,
      idempotencyKey: 'idem:withdraw:002',
    })).toThrow(/customer_consent_withdrawal_conflict/u);
    expect(() => insertEvidence(db, {
      id: 'consent_ev_past', occurredAt: '2026-08-17T11:00:00.000Z', version: 3,
      idempotencyKey: 'idem:past:001',
    })).toThrow(/customer_consent_time_conflict/u);
    expect(() => insertEvidence(db, {
      id: 'consent_ev_duplicate', channel: 'sms', version: 1,
      idempotencyKey: 'idem:grant:001',
    })).toThrow(/UNIQUE/u);
  });

  it('admite identidad guest HMAC sin columna de contacto directo y aísla cada alcance', () => {
    const db = new SqliteD1();
    const contactHash = 'b'.repeat(64);
    insertEvidence(db, {
      id: 'consent_guest_email', profileId: null, contactHash, version: 1,
      idempotencyKey: 'idem:guest:email',
    });
    insertEvidence(db, {
      id: 'consent_guest_sms', profileId: null, contactHash, channel: 'sms', version: 1,
      idempotencyKey: 'idem:guest:sms',
    });
    insertEvidence(db, {
      id: 'consent_guest_email_v2', profileId: null, contactHash,
      noticeVersion: '2026-09-01', occurredAt: '2026-09-01T09:00:00.000Z',
      version: 2, idempotencyKey: 'idem:guest:email:v2',
    });

    expect(db.query(`SELECT channel, max(version) AS version
      FROM customer_consent_evidence GROUP BY channel ORDER BY channel`)).toEqual([
      { channel: 'email', version: 2 }, { channel: 'sms', version: 1 },
    ]);
    expect(db.query<{ name: string }>("PRAGMA table_info('customer_consent_evidence')")
      .map(({ name }) => name)).not.toEqual(expect.arrayContaining(['email', 'phone']));
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });
});
