import { describe, expect, it } from 'vitest';
import migration40 from '../migrations/0040_customer_passwordless_security.sql?raw';
import { BACKUP_TABLES } from '../src/lib/backup';
import { SqliteD1 } from './sqlite-d1';

const START = '2026-08-19T09:00:00.000Z';
const DAY = '2026-08-20T09:00:00.000Z';

function beforeMigration(): SqliteD1 {
  return new SqliteD1(
    true, true, true, true, true, true, true, true, true,
    true, true, true, true, true, true, true, false,
  );
}

function insertProfileAndIdentity(db: SqliteD1): void {
  db.sqlite.prepare(`INSERT INTO customer_profiles (
    id, primary_email, email_identity_hash, status, version, created_at, updated_at
  ) VALUES ('customer_profile:security:1', 'private@example.com', ?, 'active', 1, ?, ?)`)
    .run('a'.repeat(64), START, START);
  db.sqlite.prepare(`INSERT INTO customer_auth_identities (
    id, customer_profile_id, contact_identity_hash, status, created_at,
    revoked_at, creation_idempotency_key
  ) VALUES ('auth_identity:security:1', 'customer_profile:security:1', ?,
    'active', ?, NULL, 'auth:security:identity:create')`)
    .run('a'.repeat(64), START);
}

function insertChallenge(db: SqliteD1, suffix: string, digest: string): void {
  db.sqlite.prepare(`INSERT OR IGNORE INTO customer_passwordless_challenges (
    id, identity_id, method, purpose, provider_reference, secret_digest,
    status, requested_at, expires_at, consumed_at, consumed_by_session_id,
    transition_idempotency_key, version
  ) VALUES (?, 'auth_identity:security:1', 'email_magic_link', 'sign_in', ?, ?,
    'pending', ?, '2026-08-19T09:10:00.000Z', NULL, NULL, NULL, 1)`)
    .run(`auth_challenge:security:${suffix}`, `resend_magic:security:${suffix}`,
      digest, START);
}

describe('migración 0040 de seguridad passwordless', () => {
  it('es expand-only, no inventa throttles y queda excluida del backup HTTP', () => {
    const db = beforeMigration();
    insertProfileAndIdentity(db);
    const beforeTables = Number(db.value(
      "SELECT count(*) AS value FROM sqlite_master WHERE type='table'",
    ));
    const beforeIdentity = db.query('SELECT * FROM customer_auth_identities');

    db.sqlite.exec(migration40);

    expect(Number(db.value(
      "SELECT count(*) AS value FROM sqlite_master WHERE type='table'",
    ))).toBe(beforeTables + 5);
    expect(db.value('SELECT count(*) AS value FROM customer_auth_throttle_events')).toBe(0);
    expect(db.value('SELECT count(*) AS value FROM customer_auth_revoke_all_operations')).toBe(0);
    expect(db.value('SELECT count(*) AS value FROM customer_passwordless_challenge_deliveries')).toBe(0);
    expect(db.value('SELECT count(*) AS value FROM customer_auth_capability_operations')).toBe(0);
    expect(db.value('SELECT count(*) AS value FROM customer_auth_capability_state')).toBe(0);
    expect(db.query('SELECT * FROM customer_auth_identities')).toEqual(beforeIdentity);
    expect(BACKUP_TABLES).not.toContain('customer_auth_throttle_events');
    expect(BACKUP_TABLES).not.toContain('customer_passwordless_challenge_deliveries');
    expect(BACKUP_TABLES).not.toContain('customer_auth_capability_operations');
    expect(BACKUP_TABLES).not.toContain('customer_auth_capability_state');
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('solo persiste digests y acota/immoviliza cada decisión a 24 horas', () => {
    const db = new SqliteD1();
    db.sqlite.prepare(`INSERT INTO customer_auth_throttle_events (
      idempotency_key, scope, subject_digest, decision,
      short_window_count, daily_window_count, occurred_at, expires_at
    ) VALUES ('auth:rate:contact:1', 'contact_start', ?, 'accepted', 1, 1, ?, ?)`)
      .run('b'.repeat(64), START, DAY);

    expect(JSON.stringify(db.query('SELECT * FROM customer_auth_throttle_events')))
      .not.toContain('private@example.com');
    expect(() => db.sqlite.prepare(`INSERT INTO customer_auth_throttle_events (
      idempotency_key, scope, subject_digest, decision,
      short_window_count, daily_window_count, occurred_at, expires_at
    ) VALUES ('auth:rate:pii:1', 'contact_start', ?, 'accepted', 1, 1, ?, ?)`)
      .run('private@example.com', START, DAY)).toThrow(/CHECK constraint failed/u);
    expect(() => db.sqlite.prepare(`INSERT INTO customer_auth_throttle_events (
      idempotency_key, scope, subject_digest, decision,
      short_window_count, daily_window_count, occurred_at, expires_at
    ) VALUES ('auth:rate:late:1', 'contact_start', ?, 'accepted', 1, 1, ?,
      '2026-08-20T09:00:00.001Z')`).run('c'.repeat(64), START))
      .toThrow(/CHECK constraint failed/u);
    expect(() => db.sqlite.exec(`UPDATE customer_auth_throttle_events
      SET expires_at='2026-08-20T08:00:00.000Z'
      WHERE idempotency_key='auth:rate:contact:1'`))
      .toThrow(/customer_auth_throttle_immutable/u);
  });

  it('sustituye pending solo al insertar y un retry antiguo no revoca el posterior', () => {
    const db = new SqliteD1();
    insertProfileAndIdentity(db);
    insertChallenge(db, 'one', '1'.repeat(64));
    insertChallenge(db, 'two', '2'.repeat(64));
    insertChallenge(db, 'three', '3'.repeat(64));

    expect(db.query(`SELECT id, status, version
      FROM customer_passwordless_challenges ORDER BY id`)).toEqual([
      { id: 'auth_challenge:security:one', status: 'revoked', version: 2 },
      { id: 'auth_challenge:security:three', status: 'pending', version: 1 },
      { id: 'auth_challenge:security:two', status: 'revoked', version: 2 },
    ]);

    insertChallenge(db, 'two', '2'.repeat(64));
    expect(db.value(`SELECT count(*) AS value FROM customer_passwordless_challenges
      WHERE id='auth_challenge:security:three' AND status='pending'`)).toBe(1);

    // Un restore inserta el estado final directamente: un terminal nunca debe
    // comportarse como una emisión nueva ni cerrar el pending ya restaurado.
    db.sqlite.prepare(`INSERT INTO customer_passwordless_challenges (
      id, identity_id, method, purpose, provider_reference, secret_digest,
      status, requested_at, expires_at, consumed_at, consumed_by_session_id,
      transition_idempotency_key, version
    ) VALUES ('auth_challenge:security:restored-terminal',
      'auth_identity:security:1', 'email_magic_link', 'sign_in',
      'resend_magic:security:restored-terminal', ?, 'revoked', ?,
      '2026-08-19T09:10:00.000Z', NULL, NULL,
      'auth:challenge:restored-terminal', 2)`)
      .run('4'.repeat(64), START);
    expect(db.value(`SELECT count(*) AS value FROM customer_passwordless_challenges
      WHERE id='auth_challenge:security:three' AND status='pending'`)).toBe(1);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });
});
