import { describe, expect, it } from 'vitest';
import {
  CUSTOMER_SESSION_MAX_ABSOLUTE_TTL_MS,
  PASSWORDLESS_CHALLENGE_MAX_TTL_MS,
  PasswordlessAuthConflictError,
  assertCustomerAuthIdentity,
  consumePasswordlessChallenge,
  createPasswordlessChallenge,
  customerSessionDecision,
  expirePasswordlessChallenge,
  issueCustomerSession,
  passwordlessPublicAcknowledgement,
  revokeCustomerSession,
  revokePasswordlessChallenge,
  rotateCustomerSession,
  type CustomerAuthIdentity,
  type CustomerSession,
  type PasswordlessChallenge,
} from '../src/modules/customers';

const START = Date.parse('2026-08-18T09:00:00.000Z');
const iso = (offset: number): string => new Date(START + offset).toISOString();
const SECRET = 'a'.repeat(64);
const NEXT_SECRET = 'b'.repeat(64);

function identity(overrides: Partial<CustomerAuthIdentity> = {}): CustomerAuthIdentity {
  return {
    id: 'auth_identity:1',
    customerProfileId: 'customer_profile:1',
    contactIdentityHash: 'c'.repeat(64),
    status: 'active',
    createdAt: iso(0),
    revokedAt: null,
    ...overrides,
  };
}

function pendingChallenge(overrides: Partial<Parameters<typeof createPasswordlessChallenge>[0]> = {}): PasswordlessChallenge {
  return createPasswordlessChallenge({
    id: 'auth_challenge:1',
    identity: identity(),
    method: 'email_magic_link',
    purpose: 'sign_in',
    providerReference: 'provider_challenge:1',
    secretDigest: SECRET,
    requestedAt: iso(0),
    expiresAt: iso(10 * 60 * 1000),
    ...overrides,
  });
}

function consumedChallenge(): PasswordlessChallenge {
  return consumePasswordlessChallenge(pendingChallenge(), {
    proofDigest: SECRET,
    sessionId: 'customer_session:1',
    consumedAt: iso(60_000),
    expectedVersion: 1,
    idempotencyKey: 'auth:challenge:consume:1',
  }).value;
}

function activeSession(): CustomerSession {
  return issueCustomerSession({
    challenge: consumedChallenge(),
    identity: identity(),
    id: 'customer_session:1',
    familyId: 'session_family:1',
    tokenDigest: 'd'.repeat(64),
    scopes: ['customer:self'],
    issuedAt: iso(60_000),
    expiresAt: iso(24 * 60 * 60 * 1000),
    absoluteExpiresAt: iso(30 * 24 * 60 * 60 * 1000),
  });
}

describe('autenticación passwordless R5.4a', () => {
  it('separa identidad autenticable de perfil y no activa una identidad revocada', () => {
    expect(assertCustomerAuthIdentity(identity())).toMatchObject({
      id: 'auth_identity:1', customerProfileId: 'customer_profile:1', status: 'active',
    });
    expect(() => assertCustomerAuthIdentity(identity({ id: 'customer_profile:1' })))
      .toThrow(/deben ser distintos/i);
    expect(() => pendingChallenge({ identity: identity({
      status: 'revoked', revokedAt: iso(1),
    }) })).toThrow(PasswordlessAuthConflictError);
  });

  it('acota el challenge a quince minutos y nunca guarda el proof crudo', () => {
    const challenge = pendingChallenge();
    expect(challenge).toMatchObject({ status: 'pending', secretDigest: SECRET, version: 1 });
    expect(JSON.stringify(challenge)).not.toContain('raw-magic-link-token');
    expect(() => pendingChallenge({
      expiresAt: iso(PASSWORDLESS_CHALLENGE_MAX_TTL_MS + 1),
    })).toThrow(/Caducidad del challenge inválida/i);
  });

  it('consume una sola vez y converge un retry semánticamente idéntico', () => {
    const challenge = pendingChallenge();
    const command = {
      proofDigest: SECRET,
      sessionId: 'customer_session:1',
      consumedAt: iso(60_000),
      expectedVersion: 1,
      idempotencyKey: 'auth:challenge:consume:1',
    } as const;
    const consumed = consumePasswordlessChallenge(challenge, command);
    expect(consumed).toMatchObject({ outcome: 'applied', value: {
      status: 'consumed', consumedBySessionId: 'customer_session:1', version: 2,
    } });
    expect(consumePasswordlessChallenge(consumed.value, command).outcome).toBe('replayed');
    expect(() => consumePasswordlessChallenge(consumed.value, {
      ...command, sessionId: 'customer_session:attacker',
    })).toThrow(PasswordlessAuthConflictError);
  });

  it('rechaza proof incorrecto o tardío con el mismo error estable', () => {
    for (const input of [
      { proofDigest: NEXT_SECRET, consumedAt: iso(60_000) },
      { proofDigest: SECRET, consumedAt: iso(10 * 60 * 1000) },
    ]) {
      expect(() => consumePasswordlessChallenge(pendingChallenge(), {
        ...input,
        sessionId: 'customer_session:1',
        expectedVersion: 1,
        idempotencyKey: 'auth:challenge:consume:private',
      })).toThrow('La operación de autenticación no pudo confirmarse.');
    }
  });

  it('revoca o expira un challenge pendiente de forma idempotente', () => {
    const revoked = revokePasswordlessChallenge(pendingChallenge(), {
      occurredAt: iso(30_000), expectedVersion: 1,
      idempotencyKey: 'auth:challenge:revoke:1',
    });
    expect(revoked.value.status).toBe('revoked');
    expect(revokePasswordlessChallenge(revoked.value, {
      occurredAt: iso(30_000), expectedVersion: 1,
      idempotencyKey: 'auth:challenge:revoke:1',
    }).outcome).toBe('replayed');

    const expired = expirePasswordlessChallenge(pendingChallenge(), {
      occurredAt: iso(10 * 60 * 1000), expectedVersion: 1,
      idempotencyKey: 'auth:challenge:expire:1',
    });
    expect(expired.value.status).toBe('expired');
  });

  it('emite sesión solo desde challenge consumido para la misma identidad', () => {
    expect(activeSession()).toMatchObject({
      status: 'active', generation: 1, identityId: 'auth_identity:1',
      customerProfileId: 'customer_profile:1', scopes: ['customer:self'],
    });
    expect(() => issueCustomerSession({
      challenge: pendingChallenge(),
      identity: identity(),
      id: 'customer_session:1',
      familyId: 'session_family:1',
      tokenDigest: 'd'.repeat(64),
      scopes: ['customer:self'],
      issuedAt: iso(60_000),
      expiresAt: iso(24 * 60 * 60 * 1000),
      absoluteExpiresAt: iso(CUSTOMER_SESSION_MAX_ABSOLUTE_TTL_MS),
    })).toThrow(PasswordlessAuthConflictError);
    expect(() => issueCustomerSession({
      challenge: consumedChallenge(),
      identity: identity(),
      id: 'customer_session:1',
      familyId: 'session_family:1',
      tokenDigest: 'd'.repeat(64),
      scopes: ['customer:self', 'customer:sessions:revoke'],
      issuedAt: iso(60_000),
      expiresAt: iso(24 * 60 * 60 * 1000),
      absoluteExpiresAt: iso(CUSTOMER_SESSION_MAX_ABSOLUTE_TTL_MS),
    })).toThrow(PasswordlessAuthConflictError);
    expect(() => issueCustomerSession({
      challenge: { ...consumedChallenge(), consumedAt: null },
      identity: identity(),
      id: 'customer_session:1',
      familyId: 'session_family:1',
      tokenDigest: 'd'.repeat(64),
      scopes: ['customer:self'],
      issuedAt: iso(60_000),
      expiresAt: iso(24 * 60 * 60 * 1000),
      absoluteExpiresAt: iso(CUSTOMER_SESSION_MAX_ABSOLUTE_TTL_MS),
    })).toThrow(PasswordlessAuthConflictError);
  });

  it('no emite una sesión cuando el challenge ya ha vencido', () => {
    const challenge = consumedChallenge();
    expect(() => issueCustomerSession({
      challenge,
      identity: identity(),
      id: 'customer_session:1',
      familyId: 'session_family:expired-challenge',
      tokenDigest: 'd'.repeat(64),
      scopes: ['customer:self'],
      issuedAt: challenge.expiresAt,
      expiresAt: iso(24 * 60 * 60 * 1000),
      absoluteExpiresAt: iso(CUSTOMER_SESSION_MAX_ABSOLUTE_TTL_MS),
    })).toThrow(PasswordlessAuthConflictError);
  });

  it('no convierte challenges de step-up o vinculación en una sesión nueva', () => {
    for (const purpose of ['step_up', 'link_contact'] as const) {
      const pending = pendingChallenge({ purpose });
      const consumed = consumePasswordlessChallenge(pending, {
        proofDigest: SECRET,
        sessionId: 'customer_session:purpose',
        consumedAt: iso(60_000),
        expectedVersion: 1,
        idempotencyKey: `auth:challenge:consume:${purpose}`,
      }).value;
      expect(() => issueCustomerSession({
        challenge: consumed,
        identity: identity(),
        id: 'customer_session:purpose',
        familyId: 'session_family:purpose',
        tokenDigest: 'd'.repeat(64),
        scopes: ['customer:self'],
        issuedAt: iso(60_000),
        expiresAt: iso(24 * 60 * 60 * 1000),
        absoluteExpiresAt: iso(CUSTOMER_SESSION_MAX_ABSOLUTE_TTL_MS),
      })).toThrow(PasswordlessAuthConflictError);
    }
  });

  it('rota token y sesión sin elevar scopes ni reactivar el token anterior', () => {
    const previous = activeSession();
    const command = {
      newSessionId: 'customer_session:2',
      newTokenDigest: 'e'.repeat(64),
      rotatedAt: iso(2 * 60 * 1000),
      expiresAt: iso(24 * 60 * 60 * 1000),
      expectedVersion: 1,
      idempotencyKey: 'auth:session:rotate:1',
    } as const;
    const rotated = rotateCustomerSession(previous, command);
    expect(rotated).toMatchObject({ outcome: 'applied', value: {
      previous: { status: 'rotated', replacedBySessionId: 'customer_session:2' },
      current: { status: 'active', generation: 2, rotatedFromSessionId: 'customer_session:1' },
    } });
    expect(rotated.value.current.scopes).toEqual(previous.scopes);
    expect(customerSessionDecision({
      session: rotated.value.previous,
      identityId: previous.identityId,
      requiredScope: 'customer:self',
      now: iso(3 * 60 * 1000),
    })).toEqual({ allowed: false, reason: 'inactive' });
    expect(rotateCustomerSession(rotated.value.previous, command).outcome).toBe('replayed');
  });

  it('revoca sesión con retry seguro y deniega identidad o scope ajenos', () => {
    const session = activeSession();
    expect(customerSessionDecision({
      session, identityId: session.identityId,
      requiredScope: 'customer:self', now: iso(30_000),
    })).toEqual({ allowed: false, reason: 'inactive' });
    expect(customerSessionDecision({
      session, identityId: session.identityId,
      requiredScope: 'customer:self', now: iso(2 * 60 * 1000),
    })).toEqual({ allowed: true, reason: 'allowed' });
    expect(customerSessionDecision({
      session, identityId: 'auth_identity:other',
      requiredScope: 'customer:self', now: iso(2 * 60 * 1000),
    })).toEqual({ allowed: false, reason: 'wrong_identity' });

    const command = {
      revokedAt: iso(3 * 60 * 1000),
      reasonId: 'reason:user_logout',
      expectedVersion: 1,
      idempotencyKey: 'auth:session:revoke:1',
    } as const;
    const revoked = revokeCustomerSession(session, command);
    expect(revoked.value.status).toBe('revoked');
    expect(revokeCustomerSession(revoked.value, command).outcome).toBe('replayed');
  });

  it('caducidad absoluta impide ampliar indefinidamente una familia', () => {
    const session = activeSession();
    expect(() => rotateCustomerSession(session, {
      newSessionId: 'customer_session:2',
      newTokenDigest: 'e'.repeat(64),
      rotatedAt: iso(29 * 24 * 60 * 60 * 1000),
      expiresAt: iso(31 * 24 * 60 * 60 * 1000),
      expectedVersion: 1,
      idempotencyKey: 'auth:session:rotate:late',
    })).toThrow(PasswordlessAuthConflictError);
  });

  it('responde igual exista o no identidad y acepte o no el proveedor', () => {
    const outcomes = [
      passwordlessPublicAcknowledgement({ identityFound: true, providerAccepted: true }),
      passwordlessPublicAcknowledgement({ identityFound: false, providerAccepted: false }),
      passwordlessPublicAcknowledgement({ identityFound: true, providerAccepted: false }),
    ];
    expect(new Set(outcomes.map((outcome) => JSON.stringify(outcome)))).toHaveLength(1);
    expect(outcomes[0]).toEqual({
      accepted: true, messageKey: 'customer.auth.request.accepted',
    });
  });
});
