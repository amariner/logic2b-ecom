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
    contactIdentityHash: 'b'.repeat(64),
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
    scopes: ['customer:self'],
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
    expect(await repository.identityById(identity().id)).toEqual(identity());
    const stored = JSON.stringify([
      ...db.query('SELECT * FROM customer_auth_identities'),
      ...db.query('SELECT * FROM customer_passwordless_challenges'),
    ]);
    expect(stored).not.toContain('private@example.com');
    expect(stored).not.toContain('raw-magic-link-token');
  });

  it('rechaza una identidad cuyo hash no coincide con el perfil activo', async () => {
    const db = new SqliteD1();
    insertProfile(db);
    const repository = createD1CustomerAuthenticationRepository(db.asD1());

    await expect(repository.createIdentity({
      identity: { ...identity(), contactIdentityHash: 'c'.repeat(64) },
      idempotencyKey: 'auth:identity:create:mismatch',
    })).rejects.toBeInstanceOf(CustomerAuthenticationConflictError);
    expect(await repository.identityById(identity().id)).toBeNull();
  });

  it('no permite crear una identidad ya revocada que bloquearía el perfil', async () => {
    const db = new SqliteD1();
    insertProfile(db);
    const repository = createD1CustomerAuthenticationRepository(db.asD1());

    await expect(repository.createIdentity({
      identity: { ...identity(), status: 'revoked', revokedAt: iso(60_000) },
      idempotencyKey: 'auth:identity:create:revoked',
    })).rejects.toBeInstanceOf(CustomerAuthenticationConflictError);
    expect(await repository.identityById(identity().id)).toBeNull();
  });

  it('no crea challenges si el perfil pierde coherencia con la identidad', async () => {
    const db = new SqliteD1();
    const repository = await configuredRepository(db);
    db.sqlite.prepare(`UPDATE customer_profiles SET email_identity_hash = ?,
      version = version + 1, updated_at = ? WHERE id = ?`)
      .run('6'.repeat(64), iso(30_000), identity().customerProfileId);

    await expect(repository.createChallenge(pendingChallenge()))
      .rejects.toBeInstanceOf(CustomerAuthenticationConflictError);
    expect(db.value('SELECT count(*) AS value FROM customer_passwordless_challenges')).toBe(0);
  });

  it('no crea challenges para un perfil fusionado', async () => {
    const db = new SqliteD1();
    const repository = await configuredRepository(db);
    db.sqlite.prepare(`INSERT INTO customer_profiles (
      id, primary_email, email_identity_hash, status, version, created_at, updated_at
    ) VALUES ('customer_profile:target', 'target@example.com', ?, 'active', 1, ?, ?)`)
      .run('7'.repeat(64), iso(0), iso(0));
    db.sqlite.prepare(`UPDATE customer_profiles SET status = 'merged',
      merged_into_profile_id = 'customer_profile:target', version = version + 1,
      updated_at = ? WHERE id = ?`).run(iso(30_000), identity().customerProfileId);

    await expect(repository.createChallenge(pendingChallenge()))
      .rejects.toBeInstanceOf(CustomerAuthenticationConflictError);
    expect(db.value('SELECT count(*) AS value FROM customer_passwordless_challenges')).toBe(0);
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
    expect(await repository.sessionByTokenDigest(planned.session.tokenDigest, iso(2 * 60_000)))
      .toEqual(planned.session);
    expect(await repository.activeSessionContextByTokenDigest(
      planned.session.tokenDigest,
      iso(2 * 60_000),
    ))
      .toMatchObject({
        session: planned.session,
        identity: identity(),
        family: { id: planned.session.familyId, status: 'active' },
        profile: {
          id: planned.session.customerProfileId,
          status: 'active',
          emailIdentityHash: identity().contactIdentityHash,
        },
      });
    expect(await repository.activeSessionContextByTokenDigest(
      planned.session.tokenDigest,
      iso(30_000),
    )).toBeNull();
    expect(await repository.activeSessionContextByTokenDigest(
      planned.session.tokenDigest,
      planned.session.expiresAt,
    )).toBeNull();
    expect(db.value('SELECT count(*) AS value FROM customer_session_families')).toBe(1);
    expect(db.value('SELECT count(*) AS value FROM customer_sessions')).toBe(1);
    expect(await repository.challenge(pending.id)).toEqual(planned.challenge);
  });

  it('rechaza scopes elevados o no canónicos antes de persistir una sesión', async () => {
    for (const scopes of [
      ['customer:self', 'customer:sessions:revoke'],
      ['customer:sessions:revoke', 'customer:self'],
    ] as const) {
      const db = new SqliteD1();
      const repository = await configuredRepository(db);
      const pending = pendingChallenge();
      await repository.createChallenge(pending);
      const planned = consumedAndSession({ challenge: pending });
      const forged: CustomerSession = { ...planned.session, scopes };

      await expect(repository.consumeChallenge({
        challenge: planned.challenge,
        session: forged,
        expectedVersion: 1,
        idempotencyKey: planned.key,
      })).rejects.toBeInstanceOf(CustomerAuthenticationConflictError);
      expect(db.value('SELECT count(*) AS value FROM customer_session_families')).toBe(0);
      expect(db.value('SELECT count(*) AS value FROM customer_sessions')).toBe(0);
      expect(await repository.challenge(pending.id)).toEqual(pending);
    }
  });

  it('rechaza emitir después del vencimiento del challenge sin tocar D1', async () => {
    const db = new SqliteD1();
    const repository = await configuredRepository(db);
    const pending = pendingChallenge();
    await repository.createChallenge(pending);
    const planned = consumedAndSession({ challenge: pending });
    const lateSession: CustomerSession = {
      ...planned.session,
      issuedAt: pending.expiresAt,
    };

    await expect(repository.consumeChallenge({
      challenge: { ...planned.challenge, consumedAt: null },
      session: planned.session,
      expectedVersion: 1,
      idempotencyKey: planned.key,
    })).rejects.toBeInstanceOf(CustomerAuthenticationConflictError);
    await expect(repository.consumeChallenge({
      challenge: planned.challenge,
      session: lateSession,
      expectedVersion: 1,
      idempotencyKey: planned.key,
    })).rejects.toBeInstanceOf(CustomerAuthenticationConflictError);
    expect(db.value('SELECT count(*) AS value FROM customer_session_families')).toBe(0);
    expect(db.value('SELECT count(*) AS value FROM customer_sessions')).toBe(0);
    expect(await repository.challenge(pending.id)).toEqual(pending);
  });

  it('rechaza persistir una sesión manual desde un challenge de step-up', async () => {
    const db = new SqliteD1();
    const repository = await configuredRepository(db);
    const pending = createPasswordlessChallenge({
      id: 'auth_challenge:step-up',
      identity: identity(),
      method: 'email_magic_link',
      purpose: 'step_up',
      providerReference: 'provider_challenge:step-up',
      secretDigest: '8'.repeat(64),
      requestedAt: iso(0),
      expiresAt: iso(10 * 60 * 1000),
    });
    await repository.createChallenge(pending);
    const key = 'auth:challenge:consume:step-up';
    const consumed = consumePasswordlessChallenge(pending, {
      proofDigest: pending.secretDigest,
      sessionId: 'customer_session:step-up',
      consumedAt: iso(60_000),
      expectedVersion: 1,
      idempotencyKey: key,
    }).value;
    const base = consumedAndSession();
    const forged: CustomerSession = {
      ...base.session,
      id: 'customer_session:step-up',
      familyId: 'session_family:step-up',
      tokenDigest: '9'.repeat(64),
    };

    await expect(repository.consumeChallenge({
      challenge: consumed,
      session: forged,
      expectedVersion: 1,
      idempotencyKey: key,
    })).rejects.toBeInstanceOf(CustomerAuthenticationConflictError);
    expect(db.value('SELECT count(*) AS value FROM customer_session_families')).toBe(0);
    expect(db.value('SELECT count(*) AS value FROM customer_sessions')).toBe(0);
    expect(await repository.challenge(pending.id)).toEqual(pending);
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

  it('confirma el consumo desde la misma batch aunque una revocación lo superseda al devolver', async () => {
    const db = new SqliteD1();
    const repository = await configuredRepository(db);
    const pending = pendingChallenge();
    await repository.createChallenge(pending);
    const planned = consumedAndSession({ challenge: pending });
    const base = db.asD1();
    const interleavingDb = {
      prepare: base.prepare.bind(base),
      batch: async (statements: D1PreparedStatement[]) => {
        const results = await base.batch(statements);
        db.sqlite.prepare(`UPDATE customer_sessions SET status = 'revoked',
          revoked_at = ?, revocation_reason_id = ?, transition_idempotency_key = ?,
          version = version + 1 WHERE id = ?`).run(
          iso(2 * 60_000), 'reason:security_event',
          'auth:session:revoke:after-consume', planned.session.id,
        );
        return results;
      },
    } as unknown as D1Database;
    const interleavedRepository = createD1CustomerAuthenticationRepository(interleavingDb);

    expect(await interleavedRepository.consumeChallenge({
      challenge: planned.challenge,
      session: planned.session,
      expectedVersion: 1,
      idempotencyKey: planned.key,
    })).toBe('consumed');
    expect(db.value(`SELECT count(*) AS value FROM customer_sessions
      WHERE id = '${planned.session.id}' AND status = 'revoked'`)).toBe(1);
    expect(await repository.challenge(pending.id)).toEqual(planned.challenge);
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
    expect(await repository.sessionByTokenDigest(
      issued.session.tokenDigest,
      iso(3 * 60_000),
    )).toBeNull();
    expect(await repository.sessionByTokenDigest(rotated.current.tokenDigest, iso(3 * 60_000)))
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
    expect(await repository.sessionByTokenDigest(
      rotated.current.tokenDigest,
      iso(4 * 60_000),
    )).toBeNull();
  });

  it('no acepta como replay una revocación familiar concurrente con datos divergentes', async () => {
    const db = new SqliteD1();
    const repository = await configuredRepository(db);
    const pending = pendingChallenge();
    await repository.createChallenge(pending);
    const issued = consumedAndSession({ challenge: pending });
    await repository.consumeChallenge({ challenge: issued.challenge, session: issued.session,
      expectedVersion: 1, idempotencyKey: issued.key });

    const outcomes = await Promise.allSettled([
      repository.revokeSessionFamily({
        familyId: issued.session.familyId,
        occurredAt: iso(3 * 60_000),
        reasonId: 'reason:security_event',
        expectedVersion: 1,
        idempotencyKey: 'auth:family:revoke:race',
      }),
      repository.revokeSessionFamily({
        familyId: issued.session.familyId,
        occurredAt: iso(4 * 60_000),
        reasonId: 'reason:user_logout',
        expectedVersion: 1,
        idempotencyKey: 'auth:family:revoke:race',
      }),
    ]);

    expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === 'rejected')).toHaveLength(1);
  });

  it('deja de autorizar una sesión si el perfil se fusiona o pierde coherencia', async () => {
    const db = new SqliteD1();
    const repository = await configuredRepository(db);
    const pending = pendingChallenge();
    await repository.createChallenge(pending);
    const issued = consumedAndSession({ challenge: pending });
    await repository.consumeChallenge({ challenge: issued.challenge, session: issued.session,
      expectedVersion: 1, idempotencyKey: issued.key });
    expect(await repository.activeSessionContextByTokenDigest(
      issued.session.tokenDigest,
      iso(3 * 60_000),
    ))
      .not.toBeNull();

    db.sqlite.prepare(`UPDATE customer_profiles SET email_identity_hash = ?,
      version=version+1, updated_at=? WHERE id='customer_profile:auth:1'`)
      .run('6'.repeat(64), iso(90_000));
    expect(await repository.activeSessionContextByTokenDigest(
      issued.session.tokenDigest,
      iso(3 * 60_000),
    ))
      .toBeNull();
    db.sqlite.prepare(`UPDATE customer_profiles SET email_identity_hash = ?,
      version=version+1, updated_at=? WHERE id='customer_profile:auth:1'`)
      .run(identity().contactIdentityHash, iso(100_000));
    expect(await repository.activeSessionContextByTokenDigest(
      issued.session.tokenDigest,
      iso(3 * 60_000),
    ))
      .not.toBeNull();

    db.sqlite.prepare(`INSERT INTO customer_profiles (
      id, primary_email, email_identity_hash, status, version, created_at, updated_at
    ) VALUES ('customer_profile:target', 'target@example.com', ?, 'active', 1, ?, ?)`)
      .run('7'.repeat(64), iso(0), iso(0));
    db.sqlite.exec(`UPDATE customer_profiles SET status='merged',
      merged_into_profile_id='customer_profile:target', version=version+1,
      updated_at='${iso(2 * 60_000)}' WHERE id='customer_profile:auth:1'`);

    expect(await repository.activeSessionContextByTokenDigest(
      issued.session.tokenDigest,
      iso(3 * 60_000),
    ))
      .toBeNull();
    expect(await repository.sessionByTokenDigest(
      issued.session.tokenDigest,
      iso(3 * 60_000),
    )).toBeNull();
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

  it('rechaza un cierre de challenge no canónico sin aplicar la transición', async () => {
    const db = new SqliteD1();
    const repository = await configuredRepository(db);
    const pending = pendingChallenge();
    await repository.createChallenge(pending);
    const key = 'auth:challenge:revoke:forged-terminal';
    const revoked = revokePasswordlessChallenge(pending, {
      occurredAt: iso(30_000), expectedVersion: 1, idempotencyKey: key,
    }).value;

    await expect(repository.transitionChallenge({
      challenge: {
        ...revoked,
        consumedAt: iso(30_000),
        consumedBySessionId: 'customer_session:forged',
      },
      expectedVersion: 1,
      idempotencyKey: key,
    })).rejects.toBeInstanceOf(CustomerAuthenticationConflictError);
    expect(await repository.challenge(pending.id)).toEqual(pending);
  });

  it('rechaza formas no canónicas de rotación sin crear la generación nueva', async () => {
    const db = new SqliteD1();
    const repository = await configuredRepository(db);
    const pending = pendingChallenge();
    await repository.createChallenge(pending);
    const issued = consumedAndSession({ challenge: pending });
    await repository.consumeChallenge({ challenge: issued.challenge, session: issued.session,
      expectedVersion: 1, idempotencyKey: issued.key });
    const key = 'auth:session:rotate:forged-terminal';
    const rotated = rotateCustomerSession(issued.session, {
      newSessionId: 'customer_session:forged:2',
      newTokenDigest: '7'.repeat(64),
      rotatedAt: iso(2 * 60_000),
      expiresAt: iso(24 * 60 * 60 * 1000),
      expectedVersion: 1,
      idempotencyKey: key,
    }).value;
    const attempts = [
      {
        previous: {
          ...rotated.previous,
          replacedBySessionId: 'customer_session:other',
        },
        current: rotated.current,
      },
      {
        previous: {
          ...rotated.previous,
          revokedAt: iso(2 * 60_000),
          revocationReasonId: 'reason:forged',
        },
        current: rotated.current,
      },
      {
        previous: rotated.previous,
        current: {
          ...rotated.current,
          transitionIdempotencyKey: 'auth:session:unexpected-terminal',
          version: 2,
        },
      },
    ] as const;

    for (const attempt of attempts) {
      await expect(repository.rotateSession({ ...attempt, idempotencyKey: key }))
        .rejects.toBeInstanceOf(CustomerAuthenticationConflictError);
      expect(db.value('SELECT count(*) AS value FROM customer_sessions')).toBe(1);
      expect(await repository.sessionByTokenDigest(
        issued.session.tokenDigest,
        iso(3 * 60_000),
      )).toEqual(issued.session);
    }
  });

  it('rechaza una revocación no canónica sin invalidar la sesión', async () => {
    const db = new SqliteD1();
    const repository = await configuredRepository(db);
    const pending = pendingChallenge();
    await repository.createChallenge(pending);
    const issued = consumedAndSession({ challenge: pending });
    await repository.consumeChallenge({ challenge: issued.challenge, session: issued.session,
      expectedVersion: 1, idempotencyKey: issued.key });
    const key = 'auth:session:revoke:forged-terminal';
    const revoked = revokeCustomerSession(issued.session, {
      revokedAt: iso(3 * 60_000),
      reasonId: 'reason:user_logout',
      expectedVersion: 1,
      idempotencyKey: key,
    }).value;
    const attempts: readonly CustomerSession[] = [
      { ...revoked, replacedBySessionId: 'customer_session:other' },
      { ...revoked, revokedAt: null },
      { ...revoked, revocationReasonId: null },
    ];

    for (const session of attempts) {
      await expect(repository.revokeSession({
        session, expectedVersion: 1, idempotencyKey: key,
      })).rejects.toBeInstanceOf(CustomerAuthenticationConflictError);
      expect(await repository.sessionByTokenDigest(
        issued.session.tokenDigest,
        iso(4 * 60_000),
      )).toEqual(issued.session);
    }
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
    expect(await repository.sessionByTokenDigest(
      issued.session.tokenDigest,
      iso(4 * 60_000),
    ))
      .toEqual(issued.session);
  });
});
