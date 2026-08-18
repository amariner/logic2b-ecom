import { describe, expect, it } from 'vitest';
import {
  CustomerAuthenticationConflictError,
  consumePasswordlessChallenge,
  createD1CustomerAuthenticationRepository,
  createPasswordlessChallenge,
  expirePasswordlessChallenge,
  issueCustomerSession,
  revokeCustomerSession,
  revokePasswordlessChallenge,
  rotateCustomerSession,
  type CustomerAuthIdentity,
  type CustomerSession,
  type PasswordlessChallenge,
} from '../src/modules/customers';
import { SqliteD1 } from './sqlite-d1';

const START = Date.parse('2026-08-18T09:00:00.000Z');
const iso = (offset: number): string => new Date(START + offset).toISOString();
const SECRET = 'a'.repeat(64);

function insertProfile(db: SqliteD1): void {
  db.sqlite.prepare(`INSERT INTO customer_profiles (
    id, primary_email, email_identity_hash, status, version, created_at, updated_at
  ) VALUES ('customer_profile:auth:1', 'private@example.com', ?, 'active', 1, ?, ?)`)
    .run('b'.repeat(64), iso(0), iso(0));
}

function identity(): CustomerAuthIdentity {
  return {
    id: 'auth_identity:1',
    customerProfileId: 'customer_profile:auth:1',
    contactIdentityHash: 'c'.repeat(64),
    status: 'active',
    createdAt: iso(0),
    revokedAt: null,
  };
}

function pendingChallenge(id = 'auth_challenge:1', secret = SECRET): PasswordlessChallenge {
  return createPasswordlessChallenge({
    id,
    identity: identity(),
    method: 'email_magic_link',
    purpose: 'sign_in',
    providerReference: `provider_${id}`,
    secretDigest: secret,
    requestedAt: iso(0),
    expiresAt: iso(10 * 60 * 1000),
  });
}

function consumedAndSession(input: Readonly<{
  challenge?: PasswordlessChallenge;
  sessionId?: string;
  familyId?: string;
  token?: string;
  key?: string;
}> = {}): Readonly<{ challenge: PasswordlessChallenge; session: CustomerSession; key: string }> {
  const pending = input.challenge ?? pendingChallenge();
  const sessionId = input.sessionId ?? 'customer_session:1';
  const key = input.key ?? 'auth:challenge:consume:1';
  const challenge = consumePasswordlessChallenge(pending, {
    proofDigest: pending.secretDigest,
    sessionId,
    consumedAt: iso(60_000),
    expectedVersion: 1,
    idempotencyKey: key,
  }).value;
  const session = issueCustomerSession({
    challenge,
    identity: identity(),
    id: sessionId,
    familyId: input.familyId ?? 'session_family:1',
    tokenDigest: input.token ?? 'd'.repeat(64),
    scopes: ['customer:self', 'customer:sessions:revoke'],
    issuedAt: iso(60_000),
    expiresAt: iso(24 * 60 * 60 * 1000),
    absoluteExpiresAt: iso(30 * 24 * 60 * 60 * 1000),
  });
  return { challenge, session, key };
}

async function configuredRepository(db: SqliteD1) {
  insertProfile(db);
  const repository = createD1CustomerAuthenticationRepository(db.asD1());
  await repository.createIdentity({
    identity: identity(), idempotencyKey: 'auth:identity:create:1',
  });
  return repository;
}

describe('repositorio D1 passwordless R5.4b', () => {
  it('crea identidad y challenge de forma idempotente sin persistir email o proof crudo', async () => {
    const db = new SqliteD1();
    insertProfile(db);
    const repository = createD1CustomerAuthenticationRepository(db.asD1());
    const command = { identity: identity(), idempotencyKey: 'auth:identity:create:1' };
    expect(await repository.createIdentity(command)).toBe('created');
    expect(await repository.createIdentity(command)).toBe('replayed');
    await expect(repository.createIdentity({ ...command, idempotencyKey: 'auth:identity:other:1' }))
      .rejects.toBeInstanceOf(CustomerAuthenticationConflictError);

    const challenge = pendingChallenge();
    expect(await repository.createChallenge(challenge)).toBe('created');
    expect(await repository.createChallenge(challenge)).toBe('replayed');
    expect(await repository.identityByContactHash(identity().contactIdentityHash))
      .toEqual(identity());
    const stored = JSON.stringify([
      ...db.query('SELECT * FROM customer_auth_identities'),
      ...db.query('SELECT * FROM customer_passwordless_challenges'),
    ]);
    expect(stored).not.toContain('private@example.com');
    expect(stored).not.toContain('raw-magic-link-token');
  });

  it('consume challenge y emite familia+sesión en una única operación reproducible', async () => {
    const db = new SqliteD1();
    const repository = await configuredRepository(db);
    const pending = pendingChallenge();
    await repository.createChallenge(pending);
    const planned = consumedAndSession({ challenge: pending });
    const command = {
      challenge: planned.challenge,
      session: planned.session,
      expectedVersion: 1,
      idempotencyKey: planned.key,
    };

    expect(await repository.consumeChallenge(command)).toBe('consumed');
    expect(await repository.consumeChallenge(command)).toBe('replayed');
    expect(await repository.sessionByTokenDigest(planned.session.tokenDigest))
      .toEqual(planned.session);
    expect(db.value('SELECT count(*) AS value FROM customer_session_families')).toBe(1);
    expect(db.value('SELECT count(*) AS value FROM customer_sessions')).toBe(1);
    expect(await repository.challenge(pending.id)).toEqual(planned.challenge);
  });

  it('deja un único ganador cuando dos sesiones compiten por el mismo challenge', async () => {
    const db = new SqliteD1();
    const repository = await configuredRepository(db);
    const pending = pendingChallenge();
    await repository.createChallenge(pending);
    const first = consumedAndSession({ challenge: pending });
    const rival = consumedAndSession({
      challenge: pending,
      sessionId: 'customer_session:rival',
      familyId: 'session_family:rival',
      token: 'e'.repeat(64),
      key: 'auth:challenge:consume:rival',
    });
    const outcomes = await Promise.allSettled([
      repository.consumeChallenge({ challenge: first.challenge, session: first.session,
        expectedVersion: 1, idempotencyKey: first.key }),
      repository.consumeChallenge({ challenge: rival.challenge, session: rival.session,
        expectedVersion: 1, idempotencyKey: rival.key }),
    ]);

    expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === 'rejected')).toHaveLength(1);
    expect(db.value('SELECT count(*) AS value FROM customer_session_families')).toBe(1);
    expect(db.value('SELECT count(*) AS value FROM customer_sessions')).toBe(1);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('rota token atómicamente e invalida la sesión previa con retry seguro', async () => {
    const db = new SqliteD1();
    const repository = await configuredRepository(db);
    const pending = pendingChallenge();
    await repository.createChallenge(pending);
    const issued = consumedAndSession({ challenge: pending });
    await repository.consumeChallenge({ challenge: issued.challenge, session: issued.session,
      expectedVersion: 1, idempotencyKey: issued.key });
    const key = 'auth:session:rotate:1';
    const rotated = rotateCustomerSession(issued.session, {
      newSessionId: 'customer_session:2',
      newTokenDigest: 'f'.repeat(64),
      rotatedAt: iso(2 * 60_000),
      expiresAt: iso(24 * 60 * 60 * 1000),
      expectedVersion: 1,
      idempotencyKey: key,
    }).value;

    expect(await repository.rotateSession({ ...rotated, idempotencyKey: key })).toBe('rotated');
    expect(await repository.rotateSession({ ...rotated, idempotencyKey: key })).toBe('replayed');
    expect(await repository.sessionByTokenDigest(issued.session.tokenDigest))
      .toMatchObject({ status: 'rotated', replacedBySessionId: 'customer_session:2' });
    expect(await repository.sessionByTokenDigest(rotated.current.tokenDigest))
      .toEqual(rotated.current);
  });

  it('persiste revocación individual, familiar y cierre de challenge', async () => {
    const db = new SqliteD1();
    const repository = await configuredRepository(db);
    const pending = pendingChallenge();
    await repository.createChallenge(pending);
    const issued = consumedAndSession({ challenge: pending });
    await repository.consumeChallenge({ challenge: issued.challenge, session: issued.session,
      expectedVersion: 1, idempotencyKey: issued.key });

    const revokeKey = 'auth:session:revoke:1';
    const revoked = revokeCustomerSession(issued.session, {
      revokedAt: iso(3 * 60_000), reasonId: 'reason:user_logout',
      expectedVersion: 1, idempotencyKey: revokeKey,
    }).value;
    expect(await repository.revokeSession({ session: revoked, expectedVersion: 1,
      idempotencyKey: revokeKey })).toBe('revoked');
    expect(await repository.revokeSession({ session: revoked, expectedVersion: 1,
      idempotencyKey: revokeKey })).toBe('replayed');

    const secondPending = pendingChallenge('auth_challenge:2', '9'.repeat(64));
    await repository.createChallenge(secondPending);
    const closedKey = 'auth:challenge:revoke:2';
    const closed = revokePasswordlessChallenge(secondPending, {
      occurredAt: iso(30_000), expectedVersion: 1, idempotencyKey: closedKey,
    }).value;
    expect(await repository.transitionChallenge({ challenge: closed, expectedVersion: 1,
      idempotencyKey: closedKey })).toBe('transitioned');
    expect(await repository.transitionChallenge({ challenge: closed, expectedVersion: 1,
      idempotencyKey: closedKey })).toBe('replayed');
  });

  it('revoca la sesión activa de una familia sin reactivar generaciones rotadas', async () => {
    const db = new SqliteD1();
    const repository = await configuredRepository(db);
    const pending = pendingChallenge();
    await repository.createChallenge(pending);
    const issued = consumedAndSession({ challenge: pending });
    await repository.consumeChallenge({ challenge: issued.challenge, session: issued.session,
      expectedVersion: 1, idempotencyKey: issued.key });
    const rotateKey = 'auth:session:rotate:family';
    const rotated = rotateCustomerSession(issued.session, {
      newSessionId: 'customer_session:family:2', newTokenDigest: '8'.repeat(64),
      rotatedAt: iso(2 * 60_000), expiresAt: iso(24 * 60 * 60 * 1000),
      expectedVersion: 1, idempotencyKey: rotateKey,
    }).value;
    await repository.rotateSession({ ...rotated, idempotencyKey: rotateKey });
    const familyCommand = {
      familyId: issued.session.familyId,
      occurredAt: iso(3 * 60_000),
      reasonId: 'reason:security_event',
      expectedVersion: 1,
      idempotencyKey: 'auth:family:revoke:1',
    } as const;
    expect(await repository.revokeSessionFamily(familyCommand)).toBe(1);
    expect(await repository.revokeSessionFamily(familyCommand)).toBe(1);
    expect(db.query(`SELECT status, count(*) AS total FROM customer_sessions
      GROUP BY status ORDER BY status`)).toEqual([
      { status: 'revoked', total: 1 },
      { status: 'rotated', total: 1 },
    ]);
  });

  it('persiste expiración ya decidida por dominio y devuelve conflictos estables', async () => {
    const db = new SqliteD1();
    const repository = await configuredRepository(db);
    const pending = pendingChallenge();
    await repository.createChallenge(pending);
    const key = 'auth:challenge:expire:1';
    const expired = expirePasswordlessChallenge(pending, {
      occurredAt: iso(10 * 60_000), expectedVersion: 1, idempotencyKey: key,
    }).value;
    expect(await repository.transitionChallenge({ challenge: expired, expectedVersion: 1,
      idempotencyKey: key })).toBe('transitioned');

    const message = await repository.createChallenge({ ...pending,
      providerReference: 'provider_challenge:private' }).catch((error: unknown) =>
      error instanceof Error ? error.message : String(error));
    expect(message).toBe('La operación de autenticación no pudo confirmarse.');
    expect(message).not.toContain('private@example.com');
    expect(message).not.toContain(SECRET);
    expect(message).not.toContain('customer_passwordless_challenge');
  });

  it('rechaza campos inmutables manipulados sin aplicar una transición parcial', async () => {
    const db = new SqliteD1();
    const repository = await configuredRepository(db);
    const pending = pendingChallenge();
    await repository.createChallenge(pending);
    const issued = consumedAndSession({ challenge: pending });

    await expect(repository.consumeChallenge({
      challenge: { ...issued.challenge, providerReference: 'provider_challenge:attacker' },
      session: issued.session,
      expectedVersion: 1,
      idempotencyKey: issued.key,
    })).rejects.toBeInstanceOf(CustomerAuthenticationConflictError);
    expect(await repository.challenge(pending.id)).toEqual(pending);
    expect(db.value('SELECT count(*) AS value FROM customer_sessions')).toBe(0);

    await repository.consumeChallenge({ challenge: issued.challenge, session: issued.session,
      expectedVersion: 1, idempotencyKey: issued.key });
    const key = 'auth:session:revoke:tampered';
    const revoked = revokeCustomerSession(issued.session, {
      revokedAt: iso(3 * 60_000), reasonId: 'reason:user_logout',
      expectedVersion: 1, idempotencyKey: key,
    }).value;
    await expect(repository.revokeSession({
      session: { ...revoked, tokenDigest: '7'.repeat(64) },
      expectedVersion: 1,
      idempotencyKey: key,
    })).rejects.toBeInstanceOf(CustomerAuthenticationConflictError);
    expect(await repository.sessionByTokenDigest(issued.session.tokenDigest))
      .toEqual(issued.session);
  });
});
