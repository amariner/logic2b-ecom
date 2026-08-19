import { describe, expect, it } from 'vitest';
import { createCustomerPasswordlessApplication } from '../src/composition/customer-passwordless-auth';
import { customerEmailIdentityHash } from '../src/modules/customers/application/customer-identity';
import type {
  CustomerAuthenticationRepository,
  CustomerAuthRateLimitRepository,
  PasswordlessProofProvider,
} from '../src/modules/customers/application/passwordless-auth-ports';
import { createD1CustomerProfileRepository } from '../src/modules/customers/infrastructure/d1-customer-profile-repository';
import { createD1CustomerAuthenticationRepository } from '../src/modules/customers/infrastructure/d1-customer-authentication-repository';
import { createD1CustomerAuthRateLimitRepository } from '../src/modules/customers/infrastructure/d1-customer-auth-rate-limit-repository';
import {
  createPasswordlessProof,
  passwordlessProofDigest,
} from '../src/modules/customers/infrastructure/passwordless-web-crypto';
import { SqliteD1 } from './sqlite-d1';

const AT = '2026-08-19T10:00:00.000Z';
const EMAIL = 'cliente@example.test';
const PROFILE_SECRET = 'profile-secret-'.padEnd(40, 'p');
const CSRF_SECRET = 'csrf-secret-'.padEnd(40, 'c');

type Delivery = Readonly<{ challengeId: string; proof: string; destination: string }>;

function provider(deliveries: Delivery[], deliveryAccepted = true): PasswordlessProofProvider {
  const value: PasswordlessProofProvider = {
    id: 'test-resend',
    methods: ['email_magic_link'],
    async prepare(input) {
      const proof = await createPasswordlessProof();
      return Object.freeze({ providerReference: `resend_magic:${input.challengeId}`, ...proof });
    },
    async deliver(input) {
      deliveries.push(Object.freeze({
        challengeId: input.challengeId,
        proof: input.proof,
        destination: input.destinationReference,
      }));
      return Object.freeze({ deliveryAccepted });
    },
    async verify(input) {
      try {
        return Object.freeze({
          verified: true,
          proofDigest: await passwordlessProofDigest(input.proof),
          verificationReference: input.providerReference,
        });
      } catch {
        return Object.freeze({ verified: false, proofDigest: null, verificationReference: null });
      }
    },
  };
  return Object.freeze(value);
}

async function fixture(
  withProfile = true,
  deliveryAccepted = true,
  rateOverrides: Partial<CustomerAuthRateLimitRepository> = {},
  authenticationOverrides: Partial<CustomerAuthenticationRepository> = {},
) {
  const db = new SqliteD1();
  const identityHash = await customerEmailIdentityHash(EMAIL, PROFILE_SECRET);
  if (withProfile) {
    db.sqlite.prepare(`INSERT INTO customer_profiles (
      id, primary_email, email_identity_hash, status, merged_into_profile_id,
      version, created_at, updated_at
    ) VALUES (?, ?, ?, 'active', NULL, 1, ?, ?)`).run(
      'customer_profile:application', EMAIL, identityHash, AT, AT,
    );
  }
  const deliveries: Delivery[] = [];
  const persistedRateLimits = createD1CustomerAuthRateLimitRepository(db.asD1());
  const persistedAuthentication = createD1CustomerAuthenticationRepository(db.asD1());
  const application = createCustomerPasswordlessApplication({
    profiles: createD1CustomerProfileRepository(db.asD1()),
    authentication: Object.freeze({ ...persistedAuthentication, ...authenticationOverrides }),
    rateLimits: Object.freeze({ ...persistedRateLimits, ...rateOverrides }),
    provider: provider(deliveries, deliveryAccepted),
    configuration: {
      origin: 'https://shop.example',
      challengeTtlSeconds: 600,
      session: { idleTtlSeconds: 86_400, absoluteTtlSeconds: 2_592_000 },
      identitySecret: PROFILE_SECRET,
      csrfSecret: CSRF_SECRET,
    },
    now: () => AT,
  });
  return { db, application, deliveries };
}

describe('orquestación passwordless', () => {
  it('persiste antes de entregar, consume una vez y audita la sesión sin material bearer', async () => {
    const { db, application, deliveries } = await fixture();
    const request = await application.requestAccess(EMAIL, AT);
    await request.delivery;
    expect(deliveries).toHaveLength(1);
    const delivered = deliveries[0]!;
    expect(delivered.destination).toBe(EMAIL);
    const challenge = db.query<{
      id: string; status: string; secret_digest: string;
    }>('SELECT id, status, secret_digest FROM customer_passwordless_challenges')[0]!;
    expect(challenge).toMatchObject({ id: delivered.challengeId, status: 'pending' });
    expect(challenge.secret_digest).toBe(await passwordlessProofDigest(delivered.proof));
    expect(JSON.stringify(challenge)).not.toContain(delivered.proof);
    expect(db.query<{
      challenge_id: string; provider_reference: string; accepted_at: string;
    }>('SELECT challenge_id, provider_reference, accepted_at FROM customer_passwordless_challenge_deliveries'))
      .toEqual([{
        challenge_id: delivered.challengeId,
        provider_reference: `resend_magic:${delivered.challengeId}`,
        accepted_at: AT,
      }]);

    const csrfToken = await application.confirmationCsrf(request.attempt.cookieValue);
    const consumed = await application.consumeAccess({
      challengeId: delivered.challengeId,
      proof: delivered.proof,
      attemptCookie: request.attempt.cookieValue,
      csrfToken,
      consumedAt: AT,
    });
    expect(consumed.outcome).toBe('authenticated');
    if (consumed.outcome !== 'authenticated') throw new Error('sesión esperada');
    expect(await application.currentSession(consumed.sessionToken, AT)).toMatchObject({
      session: { id: consumed.session.id, scopes: ['customer:self'] },
      profile: { id: 'customer_profile:application', status: 'active' },
    });
    expect(db.query<{ action: string; actor_kind: string; diff_json: string }>(
      `SELECT action, actor_kind, diff_json FROM audit_log`,
    )).toEqual([expect.objectContaining({
      action: 'auth.session_issued',
      actor_kind: 'customer',
    })]);
    const auditDump = JSON.stringify(db.query('SELECT * FROM audit_log'));
    expect(auditDump).not.toContain(EMAIL);
    expect(auditDump).not.toContain(delivered.proof);
    expect(auditDump).not.toContain(consumed.sessionToken);

    await expect(application.consumeAccess({
      challengeId: delivered.challengeId,
      proof: delivered.proof,
      attemptCookie: request.attempt.cookieValue,
      csrfToken,
      consumedAt: AT,
    })).resolves.toEqual({ outcome: 'rejected' });

    const sessionCsrf = await application.sessionCsrf((await application.currentSession(
      consumed.sessionToken, AT,
    ))!);
    await expect(application.logout({
      sessionToken: consumed.sessionToken,
      csrfToken: sessionCsrf,
      occurredAt: AT,
    })).resolves.toBe('revoked');
    await expect(application.currentSession(consumed.sessionToken, AT)).resolves.toBeNull();
  });

  it('sustituye pending de la misma identidad y el replay del enlace viejo no revive nada', async () => {
    const { db, application, deliveries } = await fixture();
    const first = await application.requestAccess(EMAIL, AT);
    await first.delivery;
    const secondAt = '2026-08-19T10:01:00.000Z';
    const second = await application.requestAccess(EMAIL, secondAt);
    await second.delivery;
    expect(deliveries).toHaveLength(2);
    expect(db.query<{ id: string; status: string }>(
      `SELECT id, status FROM customer_passwordless_challenges ORDER BY requested_at`,
    )).toEqual([
      { id: deliveries[0]!.challengeId, status: 'revoked' },
      { id: deliveries[1]!.challengeId, status: 'pending' },
    ]);
    await expect(application.consumeAccess({
      challengeId: deliveries[0]!.challengeId,
      proof: deliveries[0]!.proof,
      attemptCookie: first.attempt.cookieValue,
      csrfToken: await application.confirmationCsrf(first.attempt.cookieValue),
      consumedAt: secondAt,
    })).resolves.toEqual({ outcome: 'rejected' });
    expect(db.query<{ id: string; status: string }>(
      `SELECT id, status FROM customer_passwordless_challenges ORDER BY requested_at`,
    )[1]!.status).toBe('pending');
  });

  it('deniega y revoca durablemente la familia si el perfil deja de ser coherente', async () => {
    const { db, application, deliveries } = await fixture();
    const requested = await application.requestAccess(EMAIL, AT);
    await requested.delivery;
    const delivered = deliveries[0]!;
    const consumed = await application.consumeAccess({
      challengeId: delivered.challengeId,
      proof: delivered.proof,
      attemptCookie: requested.attempt.cookieValue,
      csrfToken: await application.confirmationCsrf(requested.attempt.cookieValue),
      consumedAt: AT,
    });
    if (consumed.outcome !== 'authenticated') throw new Error('sesión esperada');
    db.sqlite.prepare(`UPDATE customer_profiles SET email_identity_hash = ?,
      version = version + 1, updated_at = ? WHERE id = ?`).run(
      'f'.repeat(64), '2026-08-19T10:01:00.000Z', 'customer_profile:application',
    );

    await expect(application.currentSession(
      consumed.sessionToken, '2026-08-19T10:01:00.000Z',
    )).resolves.toBeNull();
    expect(db.query<{ status: string; revocation_reason_id: string }>(
      `SELECT status, revocation_reason_id FROM customer_session_families`,
    )).toEqual([{ status: 'revoked', revocation_reason_id: 'customer:profile-incoherent' }]);
    expect(db.query<{ status: string }>(`SELECT status FROM customer_sessions`))
      .toEqual([{ status: 'revoked' }]);
    expect(db.query<{ action: string; actor_kind: string; actor_id: string }>(
      `SELECT action, actor_kind, actor_id FROM audit_log ORDER BY occurred_at, audit_id`,
    )).toEqual(expect.arrayContaining([
      {
        action: 'auth.family_revoked',
        actor_kind: 'system',
        actor_id: 'customer_auth:session_guard',
      },
    ]));
  });

  it('mantiene ausencia y límite de contacto en el mismo camino público dummy', async () => {
    const absent = await fixture(false);
    const absentRequest = await absent.application.requestAccess(EMAIL, AT);
    await absentRequest.delivery;
    expect(absent.deliveries).toEqual([]);
    expect(absent.db.value('SELECT count(*) AS value FROM customer_passwordless_challenges')).toBe(0);

    const present = await fixture();
    const attempts = [];
    for (let index = 0; index < 4; index += 1) {
      const at = new Date(Date.parse(AT) + index * 1_000).toISOString();
      const result = await present.application.requestAccess(EMAIL, at);
      await result.delivery;
      attempts.push(result);
    }
    expect(present.deliveries).toHaveLength(3);
    expect(attempts[0]!.attempt.cookieValue).toHaveLength(absentRequest.attempt.cookieValue.length);
    expect(attempts[3]!.acknowledgement).toEqual(absentRequest.acknowledgement);
  });

  it('mantiene el acknowledgement y revoca el challenge si Resend no acepta la entrega', async () => {
    const { db, application } = await fixture(true, false);
    const result = await application.requestAccess(EMAIL, AT);
    await result.delivery;
    expect(result.acknowledgement).toEqual({
      accepted: true,
      messageKey: 'customer.auth.request.accepted',
    });
    expect(db.query<{ status: string }>(`SELECT status FROM customer_passwordless_challenges`))
      .toEqual([{ status: 'revoked' }]);
  });

  it('no emite sesión si Resend pudo aceptar pero confirmar y revocar en D1 fallan', async () => {
    const { db, application, deliveries } = await fixture(true, true, {}, {
      confirmChallengeDelivery: async () => { throw new Error('delivery confirmation unavailable'); },
      transitionChallenge: async () => { throw new Error('challenge revocation unavailable'); },
    });
    const requested = await application.requestAccess(EMAIL, AT);
    await requested.delivery;
    expect(deliveries).toHaveLength(1);
    expect(db.query<{ status: string }>('SELECT status FROM customer_passwordless_challenges'))
      .toEqual([{ status: 'pending' }]);
    expect(db.value(
      'SELECT count(*) AS value FROM customer_passwordless_challenge_deliveries',
    )).toBe(0);

    await expect(application.consumeAccess({
      challengeId: deliveries[0]!.challengeId,
      proof: deliveries[0]!.proof,
      attemptCookie: requested.attempt.cookieValue,
      csrfToken: await application.confirmationCsrf(requested.attempt.cookieValue),
      consumedAt: AT,
    })).resolves.toEqual({ outcome: 'rejected' });
    expect(db.value('SELECT count(*) AS value FROM customer_sessions')).toBe(0);
  });

  it('cierra el challenge al quinto proof incorrecto e impide una sesión posterior', async () => {
    const { db, application, deliveries } = await fixture();
    const requested = await application.requestAccess(EMAIL, AT);
    await requested.delivery;
    const csrfToken = await application.confirmationCsrf(requested.attempt.cookieValue);
    for (let index = 0; index < 5; index += 1) {
      await expect(application.consumeAccess({
        challengeId: deliveries[0]!.challengeId,
        proof: `${String(index).padStart(2, '0')}${'x'.repeat(41)}`,
        attemptCookie: requested.attempt.cookieValue,
        csrfToken,
        consumedAt: new Date(Date.parse(AT) + index).toISOString(),
      })).resolves.toEqual({ outcome: 'rejected' });
    }
    expect(db.query<{ status: string }>('SELECT status FROM customer_passwordless_challenges'))
      .toEqual([{ status: 'revoked' }]);
    await expect(application.consumeAccess({
      challengeId: deliveries[0]!.challengeId,
      proof: deliveries[0]!.proof,
      attemptCookie: requested.attempt.cookieValue,
      csrfToken,
      consumedAt: '2026-08-19T10:00:01.000Z',
    })).resolves.toEqual({ outcome: 'rejected' });
    expect(db.value('SELECT count(*) AS value FROM customer_sessions')).toBe(0);
  });

  it('falla cerrado y revoca si el contador durable no puede comprobar el challenge', async () => {
    const { db, application, deliveries } = await fixture(true, true, {
      challengeFailureState: async () => { throw new Error('durable throttle unavailable'); },
    });
    const requested = await application.requestAccess(EMAIL, AT);
    await requested.delivery;
    await expect(application.consumeAccess({
      challengeId: deliveries[0]!.challengeId,
      proof: deliveries[0]!.proof,
      attemptCookie: requested.attempt.cookieValue,
      csrfToken: await application.confirmationCsrf(requested.attempt.cookieValue),
      consumedAt: AT,
    })).resolves.toEqual({ outcome: 'rejected' });
    expect(db.query<{ status: string }>('SELECT status FROM customer_passwordless_challenges'))
      .toEqual([{ status: 'revoked' }]);
    expect(db.value('SELECT count(*) AS value FROM customer_sessions')).toBe(0);
  });

  it('falla cerrado si registrar un proof incorrecto no llega al contador durable', async () => {
    const { db, application, deliveries } = await fixture(true, true, {
      recordChallengeFailure: async () => { throw new Error('durable throttle unavailable'); },
    });
    const requested = await application.requestAccess(EMAIL, AT);
    await requested.delivery;
    const csrfToken = await application.confirmationCsrf(requested.attempt.cookieValue);
    await expect(application.consumeAccess({
      challengeId: deliveries[0]!.challengeId,
      proof: 'x'.repeat(43),
      attemptCookie: requested.attempt.cookieValue,
      csrfToken,
      consumedAt: AT,
    })).resolves.toEqual({ outcome: 'rejected' });
    expect(db.query<{ status: string }>('SELECT status FROM customer_passwordless_challenges'))
      .toEqual([{ status: 'revoked' }]);
    await expect(application.consumeAccess({
      challengeId: deliveries[0]!.challengeId,
      proof: deliveries[0]!.proof,
      attemptCookie: requested.attempt.cookieValue,
      csrfToken,
      consumedAt: '2026-08-19T10:00:01.000Z',
    })).resolves.toEqual({ outcome: 'rejected' });
    expect(db.value('SELECT count(*) AS value FROM customer_sessions')).toBe(0);
  });
});
