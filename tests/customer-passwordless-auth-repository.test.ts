import { describe, expect, it } from 'vitest';
import {
  CustomerAuthenticationConflictError,
  consumePasswordlessChallenge,
  createD1CustomerAuthRateLimitRepository,
  createD1CustomerAuthenticationRepository,
  createPasswordlessChallenge,
  expirePasswordlessChallenge,
  issueCustomerSession,
  revokeCustomerSession,
  revokePasswordlessChallenge,
  rotateCustomerSession,
  type CustomerAuthIdentity,
  type CustomerAuthAuditCommand,
  type CustomerAuthenticationRepository,
  type CustomerSession,
  type PasswordlessChallenge,
} from '../src/modules/customers';
import { SqliteD1 } from './sqlite-d1';

const START = Date.parse('2026-08-18T09:00:00.000Z');
const iso = (offset: number): string => new Date(START + offset).toISOString();
const SECRET = 'a'.repeat(64);

function authAudit(suffix: string, occurredAt: string): CustomerAuthAuditCommand {
  return {
    auditId: `audit:auth:${suffix}`,
    occurredAt,
    correlationId: `correlation:auth:${suffix}`,
  };
}

function insertProfile(db: SqliteD1): void {
  db.sqlite.prepare(`INSERT INTO customer_profiles (
    id, primary_email, email_identity_hash, status, version, created_at, updated_at
  ) VALUES ('customer_profile:auth:1', 'private@example.com', ?, 'active', 1, ?, ?)`)
    .run('b'.repeat(64), iso(0), iso(0));
}

function withoutSecurityMigration(): SqliteD1 {
  return new SqliteD1(
    true, true, true, true, true, true, true, true, true,
    true, true, true, true, true, true, true, false,
  );
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
}> = {}): Readonly<{
  challenge: PasswordlessChallenge;
  session: CustomerSession;
  key: string;
  audit: CustomerAuthAuditCommand;
}> {
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
  return {
    challenge,
    session,
    key,
    audit: authAudit(`issue:${sessionId}`, session.issuedAt),
  };
}

async function configuredRepository(db: SqliteD1) {
  insertProfile(db);
  const repository = createD1CustomerAuthenticationRepository(db.asD1());
  await repository.createIdentity({
    identity: identity(), idempotencyKey: 'auth:identity:create:1',
  });
  return repository;
}

async function createDeliveredChallenge(
  repository: CustomerAuthenticationRepository,
  challenge: PasswordlessChallenge,
): Promise<void> {
  await repository.createChallenge(challenge);
  const acceptedAt = new Date(Date.parse(challenge.requestedAt) + 1_000).toISOString();
  await repository.confirmChallengeDelivery({
    challengeId: challenge.id,
    providerReference: challenge.providerReference,
    acceptedAt,
    idempotencyKey: `customer-auth/delivery/${challenge.id}`,
  });
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

  it('crea y supersede pending de forma atómica sin que un replay tumbe el posterior', async () => {
    const db = new SqliteD1();
    const repository = await configuredRepository(db);
    const first = pendingChallenge('auth_challenge:supersede:1', '1'.repeat(64));
    const second = pendingChallenge('auth_challenge:supersede:2', '2'.repeat(64));

    expect(await repository.createChallengeSupersedingPending(first)).toBe('created');
    expect(await repository.createChallengeSupersedingPending(second)).toBe('created');
    expect(await repository.createChallengeSupersedingPending(second)).toBe('replayed');
    expect(await repository.challenge(first.id)).toMatchObject({ status: 'revoked', version: 2 });
    expect(await repository.challenge(second.id)).toEqual(second);
    expect(await repository.createChallengeSupersedingPending(first)).toBe('replayed');
    expect(await repository.challenge(second.id)).toEqual(second);

    const third = pendingChallenge('auth_challenge:supersede:3', '3'.repeat(64));
    const fourth = pendingChallenge('auth_challenge:supersede:4', '4'.repeat(64));
    const outcomes = await Promise.all([
      repository.createChallengeSupersedingPending(third),
      repository.createChallengeSupersedingPending(fourth),
    ]);
    expect(outcomes).toEqual(['created', 'created']);
    expect(db.value(`SELECT count(*) AS value FROM customer_passwordless_challenges
      WHERE identity_id='auth_identity:1' AND status='pending'`)).toBe(1);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('confirma entrega sin proof y bloquea atómicamente el consumo hasta aceptarla', async () => {
    const db = new SqliteD1();
    const repository = await configuredRepository(db);
    const pending = pendingChallenge('auth_challenge:delivery:1', '1'.repeat(64));
    await repository.createChallenge(pending);
    const planned = consumedAndSession({ challenge: pending });
    const consume = {
      challenge: planned.challenge,
      session: planned.session,
      expectedVersion: 1,
      idempotencyKey: planned.key,
      audit: planned.audit,
    };

    await expect(repository.consumeChallenge(consume))
      .rejects.toBeInstanceOf(CustomerAuthenticationConflictError);
    expect(db.value('SELECT count(*) AS value FROM customer_sessions')).toBe(0);
    expect(db.value('SELECT count(*) AS value FROM customer_session_families')).toBe(0);
    expect(db.value('SELECT count(*) AS value FROM audit_log')).toBe(0);
    const delivery = {
      challengeId: pending.id,
      providerReference: pending.providerReference,
      acceptedAt: iso(1_000),
      idempotencyKey: 'customer-auth/delivery/auth-challenge-delivery-1',
    };
    expect(await repository.confirmChallengeDelivery(delivery)).toBe('confirmed');
    expect(await repository.confirmChallengeDelivery(delivery)).toBe('replayed');
    await expect(repository.confirmChallengeDelivery({
      ...delivery,
      acceptedAt: iso(2_000),
    })).rejects.toBeInstanceOf(CustomerAuthenticationConflictError);
    expect(await repository.consumeChallenge(consume)).toBe('consumed');
    const stored = JSON.stringify(db.query(
      'SELECT * FROM customer_passwordless_challenge_deliveries',
    ));
    expect(stored).not.toContain('private@example.com');
    expect(stored).not.toContain(SECRET);
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
    await createDeliveredChallenge(repository, pending);
    const planned = consumedAndSession({ challenge: pending });
    const command = {
      challenge: planned.challenge,
      session: planned.session,
      expectedVersion: 1,
      idempotencyKey: planned.key,
      audit: planned.audit,
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
    expect(db.query(`SELECT actor_kind, actor_id, action, entity_type, entity_id, diff_json
      FROM audit_log`)).toEqual([{
      actor_kind: 'customer',
      actor_id: identity().id,
      action: 'auth.session_issued',
      entity_type: 'customer_session',
      entity_id: planned.session.id,
      diff_json: JSON.stringify({
        status: { before: null, after: 'active' },
        generation: { before: null, after: 1 },
      }),
    }]);
    const audit = JSON.stringify(db.query('SELECT * FROM audit_log'));
    expect(audit).not.toContain(planned.challenge.id);
    expect(audit).not.toContain(planned.session.tokenDigest);
    expect(audit).not.toContain(identity().contactIdentityHash);
    expect(audit).not.toContain('private@example.com');
  });

  it('falla cerrado ante una colisión de auditoría y no emite sesión huérfana', async () => {
    const db = new SqliteD1();
    const repository = await configuredRepository(db);
    const pending = pendingChallenge();
    await createDeliveredChallenge(repository, pending);
    const planned = consumedAndSession({ challenge: pending });
    db.sqlite.prepare(`INSERT INTO audit_log (
      audit_id, occurred_at, actor_kind, actor_id, actor_label, action,
      entity_type, entity_id, entity_reference, correlation_id, source_event_id,
      diff_json, created_at
    ) VALUES (?, ?, 'system', 'customer_auth:collision', NULL,
      'auth.session_revoked', 'customer_session', 'customer_session:collision',
      NULL, ?, NULL, '{}', ?)`)
      .run(planned.audit.auditId, planned.audit.occurredAt,
        planned.audit.correlationId, planned.audit.occurredAt);

    await expect(repository.consumeChallenge({
      challenge: planned.challenge,
      session: planned.session,
      expectedVersion: 1,
      idempotencyKey: planned.key,
      audit: planned.audit,
    })).rejects.toBeInstanceOf(CustomerAuthenticationConflictError);
    expect(db.value('SELECT count(*) AS value FROM customer_session_families')).toBe(0);
    expect(db.value('SELECT count(*) AS value FROM customer_sessions')).toBe(0);
    expect(await repository.challenge(pending.id)).toEqual(pending);
  });

  it('rechaza scopes elevados o no canónicos antes de persistir una sesión', async () => {
    for (const scopes of [
      ['customer:self', 'customer:sessions:revoke'],
      ['customer:sessions:revoke', 'customer:self'],
    ] as const) {
      const db = new SqliteD1();
      const repository = await configuredRepository(db);
      const pending = pendingChallenge();
    await createDeliveredChallenge(repository, pending);
      const planned = consumedAndSession({ challenge: pending });
      const forged: CustomerSession = { ...planned.session, scopes };

      await expect(repository.consumeChallenge({
        challenge: planned.challenge,
        session: forged,
        expectedVersion: 1,
        idempotencyKey: planned.key,
        audit: planned.audit,
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
    await createDeliveredChallenge(repository, pending);
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
      audit: planned.audit,
    })).rejects.toBeInstanceOf(CustomerAuthenticationConflictError);
    await expect(repository.consumeChallenge({
      challenge: planned.challenge,
      session: lateSession,
      expectedVersion: 1,
      idempotencyKey: planned.key,
      audit: { ...planned.audit, occurredAt: lateSession.issuedAt },
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
    await createDeliveredChallenge(repository, pending);
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
      audit: authAudit('issue:step-up', forged.issuedAt),
    })).rejects.toBeInstanceOf(CustomerAuthenticationConflictError);
    expect(db.value('SELECT count(*) AS value FROM customer_session_families')).toBe(0);
    expect(db.value('SELECT count(*) AS value FROM customer_sessions')).toBe(0);
    expect(await repository.challenge(pending.id)).toEqual(pending);
  });

  it('deja un único ganador cuando dos sesiones compiten por el mismo challenge', async () => {
    const db = new SqliteD1();
    const repository = await configuredRepository(db);
    const pending = pendingChallenge();
    await createDeliveredChallenge(repository, pending);
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
        expectedVersion: 1, idempotencyKey: first.key, audit: first.audit }),
      repository.consumeChallenge({ challenge: rival.challenge, session: rival.session,
        expectedVersion: 1, idempotencyKey: rival.key, audit: rival.audit }),
    ]);

    expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === 'rejected')).toHaveLength(1);
    expect(db.value('SELECT count(*) AS value FROM customer_session_families')).toBe(1);
    expect(db.value('SELECT count(*) AS value FROM customer_sessions')).toBe(1);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('bloquea atómicamente el consumo si el quinto fallo durable gana la carrera', async () => {
    const db = new SqliteD1();
    const repository = await configuredRepository(db);
    const rateLimits = createD1CustomerAuthRateLimitRepository(db.asD1());
    const pending = pendingChallenge('auth_challenge:failure-race', '5'.repeat(64));
    await createDeliveredChallenge(repository, pending);
    const planned = consumedAndSession({ challenge: pending });
    for (let index = 1; index <= 4; index += 1) {
      await rateLimits.recordChallengeFailure({
        challengeDigest: pending.secretDigest,
        occurredAt: iso(30_000 + index),
        expiresAt: pending.expiresAt,
        idempotencyKey: `auth:rate:failure-race:${index}`,
      });
    }

    // recordChallengeFailure encola su batch antes de que consume termine sus
    // lecturas previas; ambas factories comparten la misma cola transaccional.
    const fifth = rateLimits.recordChallengeFailure({
      challengeDigest: pending.secretDigest,
      occurredAt: iso(59_000),
      expiresAt: pending.expiresAt,
      idempotencyKey: 'auth:rate:failure-race:5',
    });
    const consume = repository.consumeChallenge({
      challenge: planned.challenge,
      session: planned.session,
      expectedVersion: 1,
      idempotencyKey: planned.key,
      audit: planned.audit,
    });
    const [failureOutcome, consumeOutcome] = await Promise.allSettled([fifth, consume]);

    expect(failureOutcome).toMatchObject({
      status: 'fulfilled', value: { limited: true, failures: 5 },
    });
    expect(consumeOutcome.status).toBe('rejected');
    expect(db.value('SELECT count(*) AS value FROM customer_session_families')).toBe(0);
    expect(db.value('SELECT count(*) AS value FROM customer_sessions')).toBe(0);
    expect(db.value(`SELECT count(*) AS value FROM audit_log
      WHERE audit_id='${planned.audit.auditId}'`)).toBe(0);
    expect(await repository.challenge(pending.id)).toEqual(pending);
  });

  it('conserva la sesión si el consumo gana linealmente antes del quinto fallo', async () => {
    const db = new SqliteD1();
    const repository = await configuredRepository(db);
    const rateLimits = createD1CustomerAuthRateLimitRepository(db.asD1());
    const pending = pendingChallenge('auth_challenge:consume-race', '6'.repeat(64));
    await createDeliveredChallenge(repository, pending);
    const planned = consumedAndSession({ challenge: pending });
    for (let index = 1; index <= 4; index += 1) {
      await rateLimits.recordChallengeFailure({
        challengeDigest: pending.secretDigest,
        occurredAt: iso(30_000 + index),
        expiresAt: pending.expiresAt,
        idempotencyKey: `auth:rate:consume-race:${index}`,
      });
    }

    expect(await repository.consumeChallenge({
      challenge: planned.challenge,
      session: planned.session,
      expectedVersion: 1,
      idempotencyKey: planned.key,
      audit: planned.audit,
    })).toBe('consumed');
    expect(await rateLimits.recordChallengeFailure({
      challengeDigest: pending.secretDigest,
      occurredAt: iso(61_000),
      expiresAt: pending.expiresAt,
      idempotencyKey: 'auth:rate:consume-race:5',
    })).toMatchObject({ limited: true, failures: 5 });
    expect(await repository.sessionByTokenDigest(
      planned.session.tokenDigest,
      iso(2 * 60_000),
    )).toEqual(planned.session);
    expect(db.value(`SELECT count(*) AS value FROM audit_log
      WHERE audit_id='${planned.audit.auditId}'`)).toBe(1);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('confirma el consumo desde la misma batch aunque una revocación lo superseda al devolver', async () => {
    const db = new SqliteD1();
    const repository = await configuredRepository(db);
    const pending = pendingChallenge();
    await createDeliveredChallenge(repository, pending);
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
      audit: planned.audit,
    })).toBe('consumed');
    expect(db.value(`SELECT count(*) AS value FROM customer_sessions
      WHERE id = '${planned.session.id}' AND status = 'revoked'`)).toBe(1);
    expect(await repository.challenge(pending.id)).toEqual(planned.challenge);
  });

  it('rota token atómicamente e invalida la sesión previa con retry seguro', async () => {
    const db = new SqliteD1();
    const repository = await configuredRepository(db);
    const pending = pendingChallenge();
    await createDeliveredChallenge(repository, pending);
    const issued = consumedAndSession({ challenge: pending });
    await repository.consumeChallenge({ challenge: issued.challenge, session: issued.session,
      expectedVersion: 1, idempotencyKey: issued.key, audit: issued.audit });
    const key = 'auth:session:rotate:1';
    const rotated = rotateCustomerSession(issued.session, {
      newSessionId: 'customer_session:2',
      newTokenDigest: 'f'.repeat(64),
      rotatedAt: iso(2 * 60_000),
      expiresAt: iso(24 * 60 * 60 * 1000),
      expectedVersion: 1,
      idempotencyKey: key,
    }).value;

    const rotateAudit = authAudit('rotate:1', rotated.current.issuedAt);
    expect(await repository.rotateSession({ ...rotated, idempotencyKey: key,
      audit: rotateAudit })).toBe('rotated');
    expect(await repository.rotateSession({ ...rotated, idempotencyKey: key,
      audit: rotateAudit })).toBe('replayed');
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
    await createDeliveredChallenge(repository, pending);
    const issued = consumedAndSession({ challenge: pending });
    await repository.consumeChallenge({ challenge: issued.challenge, session: issued.session,
      expectedVersion: 1, idempotencyKey: issued.key, audit: issued.audit });

    const revokeKey = 'auth:session:revoke:1';
    const revoked = revokeCustomerSession(issued.session, {
      revokedAt: iso(3 * 60_000), reasonId: 'reason:user_logout',
      expectedVersion: 1, idempotencyKey: revokeKey,
    }).value;
    expect(await repository.revokeSession({ session: revoked, expectedVersion: 1,
      idempotencyKey: revokeKey,
      audit: authAudit('revoke:1', revoked.revokedAt!) })).toBe('revoked');
    expect(await repository.revokeSession({ session: revoked, expectedVersion: 1,
      idempotencyKey: revokeKey,
      audit: authAudit('revoke:1', revoked.revokedAt!) })).toBe('replayed');

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
    expect(db.query('SELECT action FROM audit_log ORDER BY occurred_at, audit_id')).toEqual([
      { action: 'auth.session_issued' },
      { action: 'auth.session_revoked' },
    ]);
  });

  it('revoca la sesión activa de una familia sin reactivar generaciones rotadas', async () => {
    const db = new SqliteD1();
    const repository = await configuredRepository(db);
    const pending = pendingChallenge();
    await createDeliveredChallenge(repository, pending);
    const issued = consumedAndSession({ challenge: pending });
    await repository.consumeChallenge({ challenge: issued.challenge, session: issued.session,
      expectedVersion: 1, idempotencyKey: issued.key, audit: issued.audit });
    const rotateKey = 'auth:session:rotate:family';
    const rotated = rotateCustomerSession(issued.session, {
      newSessionId: 'customer_session:family:2', newTokenDigest: '8'.repeat(64),
      rotatedAt: iso(2 * 60_000), expiresAt: iso(24 * 60 * 60 * 1000),
      expectedVersion: 1, idempotencyKey: rotateKey,
    }).value;
    await repository.rotateSession({ ...rotated, idempotencyKey: rotateKey,
      audit: authAudit('rotate:family', rotated.current.issuedAt) });
    const familyCommand = {
      familyId: issued.session.familyId,
      occurredAt: iso(3 * 60_000),
      reasonId: 'reason:security_event',
      expectedVersion: 1,
      idempotencyKey: 'auth:family:revoke:1',
      audit: authAudit('family:revoke:1', iso(3 * 60_000)),
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
    expect(db.query('SELECT action FROM audit_log ORDER BY occurred_at, audit_id')).toEqual([
      { action: 'auth.session_issued' },
      { action: 'auth.session_rotated' },
      { action: 'auth.family_revoked' },
    ]);
  });

  it('no acepta como replay una revocación familiar concurrente con datos divergentes', async () => {
    const db = new SqliteD1();
    const repository = await configuredRepository(db);
    const pending = pendingChallenge();
    await createDeliveredChallenge(repository, pending);
    const issued = consumedAndSession({ challenge: pending });
    await repository.consumeChallenge({ challenge: issued.challenge, session: issued.session,
      expectedVersion: 1, idempotencyKey: issued.key, audit: issued.audit });

    const outcomes = await Promise.allSettled([
      repository.revokeSessionFamily({
        familyId: issued.session.familyId,
        occurredAt: iso(3 * 60_000),
        reasonId: 'reason:security_event',
        expectedVersion: 1,
        idempotencyKey: 'auth:family:revoke:race',
        audit: authAudit('family:race:first', iso(3 * 60_000)),
      }),
      repository.revokeSessionFamily({
        familyId: issued.session.familyId,
        occurredAt: iso(4 * 60_000),
        reasonId: 'reason:user_logout',
        expectedVersion: 1,
        idempotencyKey: 'auth:family:revoke:race',
        audit: authAudit('family:race:rival', iso(4 * 60_000)),
      }),
    ]);

    expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === 'rejected')).toHaveLength(1);
  });

  it('deja de autorizar una sesión si el perfil se fusiona o pierde coherencia', async () => {
    const db = new SqliteD1();
    const repository = await configuredRepository(db);
    const pending = pendingChallenge();
    await createDeliveredChallenge(repository, pending);
    const issued = consumedAndSession({ challenge: pending });
    await repository.consumeChallenge({ challenge: issued.challenge, session: issued.session,
      expectedVersion: 1, idempotencyKey: issued.key, audit: issued.audit });
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

  it('revoca durablemente por digest una familia incoherente y no la reactiva al restaurar perfil', async () => {
    const db = new SqliteD1();
    const repository = await configuredRepository(db);
    const pending = pendingChallenge();
    await createDeliveredChallenge(repository, pending);
    const issued = consumedAndSession({ challenge: pending });
    await repository.consumeChallenge({
      challenge: issued.challenge,
      session: issued.session,
      expectedVersion: 1,
      idempotencyKey: issued.key,
      audit: issued.audit,
    });
    expect(await repository.revokeIncoherentSessionFamilyByTokenDigest({
      tokenDigest: issued.session.tokenDigest,
      occurredAt: iso(2 * 60_000),
      reasonId: 'reason:profile_incoherent',
      idempotencyKey: 'auth:family:incoherent:coherent-check',
      audit: authAudit('family:incoherent:coherent-check', iso(2 * 60_000)),
    })).toBe('coherent');

    db.sqlite.prepare(`UPDATE customer_profiles SET email_identity_hash = ?,
      version=version+1, updated_at=? WHERE id='customer_profile:auth:1'`)
      .run('6'.repeat(64), iso(150_000));
    const command = {
      tokenDigest: issued.session.tokenDigest,
      occurredAt: iso(3 * 60_000),
      reasonId: 'reason:profile_incoherent',
      idempotencyKey: 'auth:family:incoherent:1',
      audit: authAudit('family:incoherent:1', iso(3 * 60_000)),
    } as const;
    expect(await repository.revokeIncoherentSessionFamilyByTokenDigest(command)).toBe('revoked');
    expect(await repository.revokeIncoherentSessionFamilyByTokenDigest(command)).toBe('replayed');

    db.sqlite.prepare(`UPDATE customer_profiles SET email_identity_hash = ?,
      version=version+1, updated_at=? WHERE id='customer_profile:auth:1'`)
      .run(identity().contactIdentityHash, iso(4 * 60_000));
    expect(await repository.activeSessionContextByTokenDigest(
      issued.session.tokenDigest,
      iso(5 * 60_000),
    )).toBeNull();
    expect(db.query(`SELECT status, revocation_reason_id FROM customer_session_families
      WHERE id=?`, issued.session.familyId)).toEqual([{
      status: 'revoked', revocation_reason_id: 'reason:profile_incoherent',
    }]);
    expect(db.query(`SELECT actor_kind, actor_id, action, entity_id
      FROM audit_log WHERE audit_id=?`, command.audit.auditId)).toEqual([{
      actor_kind: 'system',
      actor_id: 'customer_auth:session_guard',
      action: 'auth.family_revoked',
      entity_id: issued.session.familyId,
    }]);
    const audit = JSON.stringify(db.query('SELECT * FROM audit_log'));
    expect(audit).not.toContain(issued.session.tokenDigest);
    expect(audit).not.toContain(identity().contactIdentityHash);
    expect(await repository.revokeIncoherentSessionFamilyByTokenDigest({
      ...command,
      tokenDigest: '9'.repeat(64),
      idempotencyKey: 'auth:family:incoherent:missing',
      audit: authAudit('family:incoherent:missing', iso(3 * 60_000)),
    })).toBe('not_found');
  });

  it('revoca todas las familias por perfil o identidad de forma atómica e idempotente', async () => {
    const db = new SqliteD1();
    const repository = await configuredRepository(db);
    const firstPending = pendingChallenge('auth_challenge:all:1', '1'.repeat(64));
    await createDeliveredChallenge(repository, firstPending);
    const first = consumedAndSession({ challenge: firstPending });
    await repository.consumeChallenge({
      challenge: first.challenge, session: first.session, expectedVersion: 1,
      idempotencyKey: first.key, audit: first.audit,
    });
    const secondPending = pendingChallenge('auth_challenge:all:2', '2'.repeat(64));
    await createDeliveredChallenge(repository, secondPending);
    const second = consumedAndSession({
      challenge: secondPending,
      sessionId: 'customer_session:all:2',
      familyId: 'session_family:all:2',
      token: '8'.repeat(64),
      key: 'auth:challenge:consume:all:2',
    });
    await repository.consumeChallenge({
      challenge: second.challenge, session: second.session, expectedVersion: 1,
      idempotencyKey: second.key, audit: second.audit,
    });
    const command = {
      target: { kind: 'profile', id: identity().customerProfileId },
      occurredAt: iso(3 * 60_000),
      reasonId: 'reason:security_event',
      idempotencyKey: 'auth:families:revoke-all:profile:1',
      audit: authAudit('families:revoke-all:profile:1', iso(3 * 60_000)),
    } as const;

    expect(await repository.revokeAllSessionFamilies(command)).toEqual({
      outcome: 'revoked', familiesRevoked: 2, sessionsRevoked: 2,
    });
    expect(await repository.revokeAllSessionFamilies(command)).toEqual({
      outcome: 'replayed', familiesRevoked: 2, sessionsRevoked: 2,
    });
    expect(db.value(`SELECT count(*) AS value FROM customer_session_families
      WHERE status='revoked'`)).toBe(2);
    expect(db.value("SELECT count(*) AS value FROM customer_sessions WHERE status='active'"))
      .toBe(0);
    expect(db.query(`SELECT actor_kind, actor_id, action, entity_type, entity_id
      FROM audit_log WHERE audit_id=?`, command.audit.auditId)).toEqual([{
      actor_kind: 'system', actor_id: 'customer_auth:incident_response',
      action: 'auth.sessions_revoked_all', entity_type: 'customer_profile',
      entity_id: identity().customerProfileId,
    }]);

    expect(await repository.revokeAllSessionFamilies({
      target: { kind: 'identity', id: identity().id },
      occurredAt: iso(4 * 60_000),
      reasonId: 'reason:security_event',
      idempotencyKey: 'auth:families:revoke-all:identity:1',
      audit: authAudit('families:revoke-all:identity:1', iso(4 * 60_000)),
    })).toEqual({ outcome: 'revoked', familiesRevoked: 0, sessionsRevoked: 0 });
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('canoniza revoke-all por key aun si el target no tiene familias', async () => {
    const db = new SqliteD1();
    const repository = await configuredRepository(db);
    const command = {
      target: { kind: 'identity', id: identity().id },
      occurredAt: iso(3 * 60_000),
      reasonId: 'reason:security_event',
      idempotencyKey: 'auth:families:revoke-all:empty:1',
      audit: authAudit('families:revoke-all:empty:1', iso(3 * 60_000)),
    } as const;

    const concurrent = await Promise.all([
      repository.revokeAllSessionFamilies(command),
      repository.revokeAllSessionFamilies(command),
    ]);
    expect(concurrent.map(({ outcome }) => outcome).sort()).toEqual(['replayed', 'revoked']);
    expect(concurrent.every(({ familiesRevoked, sessionsRevoked }) =>
      familiesRevoked === 0 && sessionsRevoked === 0)).toBe(true);
    await expect(repository.revokeAllSessionFamilies({
      ...command,
      audit: authAudit('families:revoke-all:empty:divergent', command.occurredAt),
    })).rejects.toBeInstanceOf(CustomerAuthenticationConflictError);
    await expect(repository.revokeAllSessionFamilies({
      ...command,
      reasonId: 'reason:credential_compromise',
    })).rejects.toBeInstanceOf(CustomerAuthenticationConflictError);

    expect(db.query(`SELECT status, families_revoked, sessions_revoked
      FROM customer_auth_revoke_all_operations`)).toEqual([{
      status: 'completed', families_revoked: 0, sessions_revoked: 0,
    }]);
    expect(db.value(`SELECT count(*) AS value FROM audit_log
      WHERE action='auth.sessions_revoked_all'`)).toBe(1);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('serializa revoke-all contra rotación sin dejar una sesión activa ni auditoría huérfana', async () => {
    const db = new SqliteD1();
    const repository = await configuredRepository(db);
    const pending = pendingChallenge('auth_challenge:all:race', '5'.repeat(64));
    await createDeliveredChallenge(repository, pending);
    const issued = consumedAndSession({ challenge: pending });
    await repository.consumeChallenge({
      challenge: issued.challenge, session: issued.session, expectedVersion: 1,
      idempotencyKey: issued.key, audit: issued.audit,
    });
    const rotateKey = 'auth:session:rotate:revoke-all-race';
    const rotated = rotateCustomerSession(issued.session, {
      newSessionId: 'customer_session:revoke-all-race:2',
      newTokenDigest: '6'.repeat(64),
      rotatedAt: iso(2 * 60_000),
      expiresAt: iso(24 * 60 * 60 * 1000),
      expectedVersion: 1,
      idempotencyKey: rotateKey,
    }).value;
    const rotateAudit = authAudit('rotate:revoke-all-race', rotated.current.issuedAt);
    const revokeAllAudit = authAudit('families:revoke-all:race', iso(3 * 60_000));
    const [rotation, revocation] = await Promise.allSettled([
      repository.rotateSession({
        ...rotated, idempotencyKey: rotateKey, audit: rotateAudit,
      }),
      repository.revokeAllSessionFamilies({
        target: { kind: 'identity', id: identity().id },
        occurredAt: iso(3 * 60_000),
        reasonId: 'reason:security_event',
        idempotencyKey: 'auth:families:revoke-all:race',
        audit: revokeAllAudit,
      }),
    ]);

    expect(revocation.status).toBe('fulfilled');
    expect(db.value("SELECT count(*) AS value FROM customer_sessions WHERE status='active'"))
      .toBe(0);
    expect(db.value("SELECT count(*) AS value FROM customer_session_families WHERE status='revoked'"))
      .toBe(1);
    const rotatedSessions = Number(db.value(`SELECT count(*) AS value FROM customer_sessions
      WHERE id='${rotated.current.id}'`));
    const rotateAudits = Number(db.value(`SELECT count(*) AS value FROM audit_log
      WHERE audit_id='${rotateAudit.auditId}'`));
    expect(rotateAudits).toBe(rotatedSessions);
    if (rotation.status === 'rejected') expect(rotatedSessions).toBe(0);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('persiste expiración ya decidida por dominio y devuelve conflictos estables', async () => {
    const db = new SqliteD1();
    const repository = await configuredRepository(db);
    const pending = pendingChallenge();
    await createDeliveredChallenge(repository, pending);
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
    await createDeliveredChallenge(repository, pending);
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
    await createDeliveredChallenge(repository, pending);
    const issued = consumedAndSession({ challenge: pending });
    await repository.consumeChallenge({ challenge: issued.challenge, session: issued.session,
      expectedVersion: 1, idempotencyKey: issued.key, audit: issued.audit });
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
      await expect(repository.rotateSession({ ...attempt, idempotencyKey: key,
        audit: authAudit('rotate:forged', rotated.current.issuedAt) }))
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
    await createDeliveredChallenge(repository, pending);
    const issued = consumedAndSession({ challenge: pending });
    await repository.consumeChallenge({ challenge: issued.challenge, session: issued.session,
      expectedVersion: 1, idempotencyKey: issued.key, audit: issued.audit });
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
        audit: authAudit('revoke:forged', iso(3 * 60_000)),
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
    await createDeliveredChallenge(repository, pending);
    const issued = consumedAndSession({ challenge: pending });

    await expect(repository.consumeChallenge({
      challenge: { ...issued.challenge, providerReference: 'provider_challenge:attacker' },
      session: issued.session,
      expectedVersion: 1,
      idempotencyKey: issued.key,
      audit: issued.audit,
    })).rejects.toBeInstanceOf(CustomerAuthenticationConflictError);
    expect(await repository.challenge(pending.id)).toEqual(pending);
    expect(db.value('SELECT count(*) AS value FROM customer_sessions')).toBe(0);

    await repository.consumeChallenge({ challenge: issued.challenge, session: issued.session,
      expectedVersion: 1, idempotencyKey: issued.key, audit: issued.audit });
    const key = 'auth:session:revoke:tampered';
    const revoked = revokeCustomerSession(issued.session, {
      revokedAt: iso(3 * 60_000), reasonId: 'reason:user_logout',
      expectedVersion: 1, idempotencyKey: key,
    }).value;
    await expect(repository.revokeSession({
      session: { ...revoked, tokenDigest: '7'.repeat(64) },
      expectedVersion: 1,
      idempotencyKey: key,
      audit: authAudit('revoke:tampered', iso(3 * 60_000)),
    })).rejects.toBeInstanceOf(CustomerAuthenticationConflictError);
    expect(await repository.sessionByTokenDigest(
      issued.session.tokenDigest,
      iso(4 * 60_000),
    ))
      .toEqual(issued.session);
  });

  it('mantiene CUS-003 fail-closed hasta una activación durable y auditada', async () => {
    const db = new SqliteD1();
    const repository = createD1CustomerAuthenticationRepository(db.asD1());
    expect(await repository.customerAuthCapabilityReadiness()).toEqual({
      capabilityId: 'CUS-003',
      state: 'installed',
      version: 0,
      readyForActiveRuntime: false,
    });
    const command = {
      fromState: 'installed' as const,
      toState: 'active' as const,
      expectedVersion: 0,
      occurredAt: iso(0),
      idempotencyKey: 'customer-auth/capability/activate/1',
      audit: authAudit('capability:activate:1', iso(0)),
    };

    expect(await repository.transitionCustomerAuthCapability(command)).toEqual({
      outcome: 'transitioned', state: 'active', version: 1,
    });
    expect(await repository.transitionCustomerAuthCapability(command)).toEqual({
      outcome: 'replayed', state: 'active', version: 1,
    });
    expect(await repository.customerAuthCapabilityReadiness()).toEqual({
      capabilityId: 'CUS-003',
      state: 'active',
      version: 1,
      readyForActiveRuntime: true,
    });
    expect(db.query(`SELECT actor_kind, actor_id, action, entity_type, entity_id,
      diff_json FROM audit_log`)).toEqual([{
      actor_kind: 'system',
      actor_id: 'customer_auth:capability_gate',
      action: 'auth.capability_transitioned',
      entity_type: 'platform_capability',
      entity_id: 'capability:cus-003',
      diff_json: JSON.stringify({
        state: { before: 'installed', after: 'active' },
        version: { before: 0, after: 1 },
      }),
    }]);
    expect(db.value('SELECT count(*) AS value FROM customer_auth_capability_operations'))
      .toBe(1);
  });

  it('serializa activaciones rivales y convierte divergencias de replay en conflicto', async () => {
    const db = new SqliteD1();
    const repository = createD1CustomerAuthenticationRepository(db.asD1());
    const base = {
      fromState: 'installed' as const,
      toState: 'active' as const,
      expectedVersion: 0,
      occurredAt: iso(0),
    };
    const commands = [
      {
        ...base,
        idempotencyKey: 'customer-auth/capability/race/1',
        audit: authAudit('capability:race:1', iso(0)),
      },
      {
        ...base,
        idempotencyKey: 'customer-auth/capability/race/2',
        audit: authAudit('capability:race:2', iso(0)),
      },
    ] as const;
    const outcomes = await Promise.allSettled(
      commands.map((command) => repository.transitionCustomerAuthCapability(command)),
    );
    expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === 'rejected')).toHaveLength(1);
    expect(db.value('SELECT count(*) AS value FROM customer_auth_capability_operations'))
      .toBe(1);
    expect(db.value(`SELECT count(*) AS value FROM audit_log
      WHERE action='auth.capability_transitioned'`)).toBe(1);

    const winner = outcomes[0]?.status === 'fulfilled' ? commands[0]! : commands[1]!;
    await expect(repository.transitionCustomerAuthCapability({
      ...winner,
      audit: authAudit('capability:race:divergent', iso(0)),
    })).rejects.toBeInstanceOf(CustomerAuthenticationConflictError);
    expect(db.value(`SELECT count(*) AS value FROM audit_log
      WHERE action='auth.capability_transitioned'`)).toBe(1);
  });

  it('solo desactiva CUS-003 tras revocar todas las familias activas', async () => {
    const db = new SqliteD1();
    const repository = await configuredRepository(db);
    await repository.transitionCustomerAuthCapability({
      fromState: 'installed', toState: 'active', expectedVersion: 0,
      occurredAt: iso(0), idempotencyKey: 'customer-auth/capability/activate/guard',
      audit: authAudit('capability:activate:guard', iso(0)),
    });
    db.sqlite.prepare(`INSERT INTO customer_session_families (
      id, identity_id, customer_profile_id, status, created_at,
      absolute_expires_at, revoked_at, revocation_reason_id,
      transition_idempotency_key, version
    ) VALUES ('session_family:capability:guard', 'auth_identity:1',
      'customer_profile:auth:1', 'active', ?, ?, NULL, NULL, NULL, 1)`)
      .run(iso(0), iso(30 * 24 * 60 * 60 * 1000));
    const deactivate = {
      fromState: 'active' as const,
      toState: 'installed' as const,
      expectedVersion: 1,
      occurredAt: iso(2 * 60_000),
      idempotencyKey: 'customer-auth/capability/deactivate/guard',
      audit: authAudit('capability:deactivate:guard', iso(2 * 60_000)),
    };

    await expect(repository.transitionCustomerAuthCapability(deactivate))
      .rejects.toBeInstanceOf(CustomerAuthenticationConflictError);
    expect(await repository.customerAuthCapabilityReadiness())
      .toMatchObject({ state: 'active', version: 1, readyForActiveRuntime: true });
    expect(db.value(`SELECT count(*) AS value FROM audit_log
      WHERE audit_id='${deactivate.audit.auditId}'`)).toBe(0);

    await repository.revokeSessionFamily({
      familyId: 'session_family:capability:guard',
      occurredAt: iso(60_000),
      reasonId: 'reason:capability_deactivation',
      expectedVersion: 1,
      idempotencyKey: 'customer-auth/family/revoke/capability-guard',
      audit: authAudit('family:revoke:capability-guard', iso(60_000)),
    });
    expect(await repository.transitionCustomerAuthCapability(deactivate)).toEqual({
      outcome: 'transitioned', state: 'installed', version: 2,
    });
    expect(await repository.transitionCustomerAuthCapability(deactivate)).toEqual({
      outcome: 'replayed', state: 'installed', version: 2,
    });
    expect(await repository.customerAuthCapabilityReadiness()).toEqual({
      capabilityId: 'CUS-003', state: 'installed', version: 2,
      readyForActiveRuntime: false,
    });
  });

  it('falla cerrado si el runtime intenta leer readiness antes de 0040', async () => {
    const db = withoutSecurityMigration();
    const repository = createD1CustomerAuthenticationRepository(db.asD1());
    await expect(repository.customerAuthCapabilityReadiness())
      .rejects.toBeInstanceOf(CustomerAuthenticationConflictError);
  });
});
