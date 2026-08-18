import { describe, expect, it } from 'vitest';
import migration39 from '../migrations/0039_customer_passwordless_auth.sql?raw';
import { SqliteD1 } from './sqlite-d1';

const START = '2026-08-18T09:00:00.000Z';
const DAY = '2026-08-19T09:00:00.000Z';
const ABSOLUTE = '2026-09-17T09:00:00.000Z';

function beforeMigration(): SqliteD1 {
  return new SqliteD1(true, true, true, true, true, true, true, true, true,
    true, true, true, true, true, true, false);
}

function insertProfile(db: SqliteD1): void {
  db.sqlite.prepare(`INSERT INTO customer_profiles (
    id, primary_email, email_identity_hash, status, version, created_at, updated_at
  ) VALUES ('customer_profile:auth:1', 'private@example.com', ?, 'active', 1, ?, ?)`)
    .run('a'.repeat(64), START, START);
}

function insertIdentity(db: SqliteD1): void {
  db.sqlite.prepare(`INSERT INTO customer_auth_identities (
    id, customer_profile_id, contact_identity_hash, status, created_at,
    revoked_at, creation_idempotency_key
  ) VALUES ('auth_identity:1', 'customer_profile:auth:1', ?, 'active', ?, NULL,
    'auth:identity:create:1')`).run('b'.repeat(64), START);
}

function insertFamily(db: SqliteD1): void {
  db.sqlite.prepare(`INSERT INTO customer_session_families (
    id, identity_id, customer_profile_id, status, created_at,
    absolute_expires_at, revoked_at, revocation_reason_id,
    transition_idempotency_key, version
  ) VALUES ('session_family:1', 'auth_identity:1', 'customer_profile:auth:1',
    'active', ?, ?, NULL, NULL, NULL, 1)`).run(START, ABSOLUTE);
}

function insertSession(db: SqliteD1, input: Readonly<{
  id: string;
  token: string;
  generation: number;
  rotatedFrom: string | null;
  issuedAt?: string;
  canRevoke?: 0 | 1;
}>): void {
  db.sqlite.prepare(`INSERT INTO customer_sessions (
    id, family_id, identity_id, customer_profile_id, token_digest,
    can_revoke_sessions, status, issued_at, expires_at, absolute_expires_at,
    generation, rotated_from_session_id, replaced_by_session_id, revoked_at,
    revocation_reason_id, transition_idempotency_key, version
  ) VALUES (?, 'session_family:1', 'auth_identity:1', 'customer_profile:auth:1',
    ?, ?, 'active', ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, 1)`)
    .run(input.id, input.token, input.canRevoke ?? 1, input.issuedAt ?? START, DAY, ABSOLUTE,
      input.generation, input.rotatedFrom);
}

describe('migración 0039 de autenticación passwordless', () => {
  it('es expand-only y no inventa credenciales desde perfiles existentes', () => {
    const db = beforeMigration();
    insertProfile(db);
    const before = db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table'",
    ).length;

    db.sqlite.exec(migration39);

    expect(db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'").length)
      .toBe(before + 4);
    for (const table of ['customer_auth_identities', 'customer_session_families',
      'customer_sessions', 'customer_passwordless_challenges']) {
      expect(db.value(`SELECT count(*) AS value FROM ${table}`)).toBe(0);
    }
    expect(migration39).not.toMatch(/INSERT\s+INTO\s+customer_auth_identities\s+SELECT/iu);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('separa perfil e identidad y solo persiste un HMAC, nunca email literal', () => {
    const db = new SqliteD1();
    insertProfile(db);
    insertIdentity(db);
    expect(db.query(`SELECT id, customer_profile_id, status
      FROM customer_auth_identities`)).toEqual([{
      id: 'auth_identity:1', customer_profile_id: 'customer_profile:auth:1', status: 'active',
    }]);
    expect(() => db.sqlite.exec(`INSERT INTO customer_auth_identities (
      id, customer_profile_id, contact_identity_hash, status, created_at,
      revoked_at, creation_idempotency_key
    ) VALUES ('auth_identity:pii', 'customer_profile:auth:1',
      'private@example.com', 'active', '${START}', NULL, 'auth:identity:pii')`))
      .toThrow(/CHECK constraint failed|UNIQUE constraint failed/u);
  });

  it('acota challenge, digest y transición única sin guardar el proof', () => {
    const db = new SqliteD1();
    insertProfile(db);
    insertIdentity(db);
    db.sqlite.prepare(`INSERT INTO customer_passwordless_challenges (
      id, identity_id, method, purpose, provider_reference, secret_digest,
      status, requested_at, expires_at, consumed_at, consumed_by_session_id,
      transition_idempotency_key, version
    ) VALUES ('auth_challenge:1', 'auth_identity:1', 'email_magic_link', 'sign_in',
      'provider_challenge:1', ?, 'pending', ?, '2026-08-18T09:15:00.000Z',
      NULL, NULL, NULL, 1)`).run('c'.repeat(64), START);
    expect(JSON.stringify(db.query('SELECT * FROM customer_passwordless_challenges')))
      .not.toContain('raw-magic-link-token');
    expect(() => db.sqlite.prepare(`INSERT INTO customer_passwordless_challenges (
      id, identity_id, method, purpose, provider_reference, secret_digest,
      status, requested_at, expires_at, consumed_at, consumed_by_session_id,
      transition_idempotency_key, version
    ) VALUES ('auth_challenge:late', 'auth_identity:1', 'email_magic_link', 'sign_in',
      'provider_challenge:late', ?, 'pending', ?, '2026-08-18T09:15:01.000Z',
      NULL, NULL, NULL, 1)`).run('d'.repeat(64), START))
      .toThrow(/CHECK constraint failed/u);
    expect(() => db.sqlite.prepare(`INSERT INTO customer_passwordless_challenges (
      id, identity_id, method, purpose, provider_reference, secret_digest,
      status, requested_at, expires_at, consumed_at, consumed_by_session_id,
      transition_idempotency_key, version
    ) VALUES ('auth_challenge:provider_replay', 'auth_identity:1',
      'email_magic_link', 'sign_in', 'provider_challenge:1', ?, 'pending', ?,
      '2026-08-18T09:10:00.000Z', NULL, NULL, NULL, 1)`)
      .run('e'.repeat(64), START)).toThrow(/UNIQUE constraint failed/u);
    db.sqlite.exec(`UPDATE customer_passwordless_challenges
      SET status='revoked', transition_idempotency_key='auth:challenge:revoke:1', version=2
      WHERE id='auth_challenge:1'`);
    expect(() => db.sqlite.exec(`UPDATE customer_passwordless_challenges
      SET status='expired', transition_idempotency_key='auth:challenge:expire:1', version=3
      WHERE id='auth_challenge:1'`)).toThrow(/customer_passwordless_challenge_transition_conflict/u);
  });

  it('encadena generaciones, invalida la anterior y bloquea rotación tras revocar familia', () => {
    const db = new SqliteD1();
    insertProfile(db);
    insertIdentity(db);
    insertFamily(db);
    insertSession(db, { id: 'customer_session:1', token: 'd'.repeat(64), generation: 1,
      rotatedFrom: null });
    expect(() => insertSession(db, { id: 'customer_session:escalated',
      token: '9'.repeat(64), generation: 2, rotatedFrom: 'customer_session:1',
      issuedAt: '2026-08-18T09:00:30.000Z', canRevoke: 0 }))
      .toThrow(/customer_session_scope_escalation_conflict/u);
    insertSession(db, { id: 'customer_session:2', token: 'e'.repeat(64), generation: 2,
      rotatedFrom: 'customer_session:1', issuedAt: '2026-08-18T09:01:00.000Z' });
    db.sqlite.exec(`UPDATE customer_sessions SET status='rotated',
      replaced_by_session_id='customer_session:2',
      transition_idempotency_key='auth:session:rotate:1', version=2
      WHERE id='customer_session:1'`);
    expect(db.query(`SELECT id, status, generation FROM customer_sessions ORDER BY generation`))
      .toEqual([
        { id: 'customer_session:1', status: 'rotated', generation: 1 },
        { id: 'customer_session:2', status: 'active', generation: 2 },
      ]);
    db.sqlite.exec(`UPDATE customer_session_families SET status='revoked',
      revoked_at='2026-08-18T09:02:00.000Z', revocation_reason_id='reason:user_logout',
      transition_idempotency_key='auth:family:revoke:1', version=2
      WHERE id='session_family:1'`);
    expect(() => insertSession(db, { id: 'customer_session:3', token: 'f'.repeat(64),
      generation: 3, rotatedFrom: 'customer_session:2',
      issuedAt: '2026-08-18T09:03:00.000Z' }))
      .toThrow(/customer_session_family_conflict/u);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });
});
