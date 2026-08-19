import {
  assertCustomerAuthIdentity,
  consumePasswordlessChallenge,
  createPasswordlessChallenge,
  expirePasswordlessChallenge,
  issueCustomerSession,
  passwordlessPublicAcknowledgement,
  revokeCustomerSession,
  revokePasswordlessChallenge,
  type CustomerAuthIdentity,
  type CustomerSession,
  type PasswordlessChallenge,
  type PasswordlessPublicAcknowledgement,
} from '../modules/customers/domain/passwordless-auth';
import { normalizeCustomerEmail } from '../modules/customers/domain/customer-profile';
import { customerEmailIdentityHash } from '../modules/customers/application/customer-identity';
import type { CustomerProfileRepository } from '../modules/customers/application/customer-profile-repository';
import {
  silentCustomerPasswordlessObservability,
  type CustomerPasswordlessMetric,
  type CustomerPasswordlessObservability,
} from '../modules/customers/application/passwordless-observability';
import type {
  ActiveCustomerSessionContext,
  CustomerAuthAuditCommand,
  CustomerAuthenticationRepository,
  CustomerAuthRateLimitRepository,
  PasswordlessProofProvider,
} from '../modules/customers/application/passwordless-auth-ports';
import {
  createCustomerAuthAttempt,
  createPasswordlessProof,
  customerAuthAttemptCsrfToken,
  customerSessionCsrfToken,
  passwordlessProofDigest,
  verifyCustomerAuthAttempt,
  verifyCustomerSessionCsrfToken,
  type CustomerAuthAttempt,
} from '../modules/customers/infrastructure/passwordless-web-crypto';

export type CustomerPasswordlessApplicationConfiguration = Readonly<{
  origin: string;
  challengeTtlSeconds: number;
  session: Readonly<{ idleTtlSeconds: number; absoluteTtlSeconds: number }>;
  identitySecret: string;
  csrfSecret: string;
}>;

export type CustomerPasswordlessAccessRequest = Readonly<{
  acknowledgement: PasswordlessPublicAcknowledgement;
  attempt: CustomerAuthAttempt;
  /** Efecto ya encadenado tras la persistencia; el runtime debe entregarlo a waitUntil. */
  delivery: Promise<void>;
}>;

export type CustomerPasswordlessConsumption =
  | Readonly<{ outcome: 'rejected' }>
  | Readonly<{ outcome: 'authenticated'; session: CustomerSession; sessionToken: string }>;

export interface CustomerPasswordlessApplication {
  requestAccess(email: unknown, requestedAt: string): Promise<CustomerPasswordlessAccessRequest>;
  consumeAccess(input: Readonly<{
    challengeId: string;
    proof: string;
    attemptCookie: string;
    csrfToken: string;
    consumedAt: string;
  }>): Promise<CustomerPasswordlessConsumption>;
  confirmationCsrf(attemptCookie: string | null): Promise<string>;
  currentSession(sessionToken: string, at: string): Promise<ActiveCustomerSessionContext | null>;
  sessionCsrf(context: ActiveCustomerSessionContext): Promise<string>;
  logout(input: Readonly<{
    sessionToken: string;
    csrfToken: string;
    occurredAt: string;
  }>): Promise<'revoked' | 'replayed' | 'not_found' | 'invalid_csrf'>;
}

type Dependencies = Readonly<{
  profiles: Pick<CustomerProfileRepository, 'findByIdentityHash'>;
  authentication: CustomerAuthenticationRepository;
  rateLimits: CustomerAuthRateLimitRepository;
  provider: PasswordlessProofProvider;
  configuration: CustomerPasswordlessApplicationConfiguration;
  observability?: CustomerPasswordlessObservability;
  randomUuid?: () => string;
  now?: () => string;
}>;

const DAY_MS = 24 * 60 * 60 * 1_000;

function addSeconds(value: string, seconds: number): string {
  const at = Date.parse(value);
  if (!value.endsWith('Z') || !Number.isFinite(at) || !Number.isSafeInteger(seconds) || seconds < 1) {
    throw new RangeError('Ventana temporal passwordless inválida.');
  }
  return new Date(at + seconds * 1_000).toISOString();
}

function minInstant(...values: string[]): string {
  return new Date(Math.min(...values.map((value) => Date.parse(value)))).toISOString();
}

function sameDigest(left: string, right: string): boolean {
  if (left.length !== 64 || right.length !== 64) return false;
  let difference = 0;
  for (let index = 0; index < 64; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function uuidFactory(input?: () => string): () => string {
  return input ?? (() => crypto.randomUUID());
}

function id(randomUuid: () => string, prefix: string): string {
  return `${prefix}:${randomUuid()}`;
}

function audit(
  randomUuid: () => string,
  occurredAt: string,
): CustomerAuthAuditCommand {
  return Object.freeze({
    auditId: id(randomUuid, 'customer_auth_audit'),
    occurredAt,
    correlationId: id(randomUuid, 'customer_auth_correlation'),
  });
}

function acknowledgement(): PasswordlessPublicAcknowledgement {
  return passwordlessPublicAcknowledgement({ identityFound: false, providerAccepted: false });
}

export function createCustomerPasswordlessApplication(
  dependencies: Dependencies,
): CustomerPasswordlessApplication {
  const {
    profiles,
    authentication,
    rateLimits,
    provider,
    configuration,
  } = dependencies;
  const randomUuid = uuidFactory(dependencies.randomUuid);
  const clock = dependencies.now ?? (() => new Date().toISOString());
  const observability = dependencies.observability ?? silentCustomerPasswordlessObservability;

  function metric(value: CustomerPasswordlessMetric): void {
    try {
      observability.count(value);
    } catch {
      // Una métrica nunca cambia el resultado de autenticación.
    }
  }

  function challengeId(): string {
    return id(randomUuid, 'auth_challenge');
  }

  async function attempt(reference: string, issuedAt: string, expiresAt: string): Promise<CustomerAuthAttempt> {
    return createCustomerAuthAttempt({
      challengeId: reference,
      secret: configuration.csrfSecret,
      issuedAt,
      expiresAt,
    });
  }

  async function dummyAccess(requestedAt: string, expiresAt: string): Promise<CustomerPasswordlessAccessRequest> {
    return Object.freeze({
      acknowledgement: acknowledgement(),
      attempt: await attempt(challengeId(), requestedAt, expiresAt),
      delivery: Promise.resolve(),
    });
  }

  async function eligibleIdentity(
    contactIdentityHash: string,
    at: string,
  ): Promise<Readonly<{ identity: CustomerAuthIdentity; destination: string }> | null> {
    const profile = await profiles.findByIdentityHash(contactIdentityHash);
    if (profile === null || profile.status !== 'active' || profile.mergedIntoProfileId !== null ||
        profile.emailIdentityHash !== contactIdentityHash) return null;
    let identity = await authentication.identityByContactHash(contactIdentityHash);
    if (identity === null) {
      const proposed = assertCustomerAuthIdentity(Object.freeze({
        id: id(randomUuid, 'auth_identity'),
        customerProfileId: profile.id,
        contactIdentityHash,
        status: 'active' as const,
        createdAt: at,
        revokedAt: null,
      }));
      try {
        await authentication.createIdentity({
          identity: proposed,
          idempotencyKey: `customer-auth/identity/${profile.id}`,
        });
        identity = proposed;
      } catch {
        identity = await authentication.identityByContactHash(contactIdentityHash);
      }
    }
    if (identity === null || identity.status !== 'active' ||
        identity.customerProfileId !== profile.id ||
        identity.contactIdentityHash !== contactIdentityHash) return null;
    return Object.freeze({ identity, destination: profile.primaryEmail });
  }

  async function revokeAfterFailedDelivery(
    challenge: PasswordlessChallenge,
    idempotencyKey: string,
  ): Promise<void> {
    await revokePendingChallenge(challenge, clock(), idempotencyKey);
  }

  async function revokePendingChallenge(
    challenge: PasswordlessChallenge,
    occurredAt: string,
    idempotencyKey: string,
  ): Promise<boolean> {
    try {
      const stored = await authentication.challenge(challenge.id);
      if (stored === null || stored.status !== 'pending') return false;
      const transition = revokePasswordlessChallenge(stored, {
        occurredAt,
        expectedVersion: stored.version,
        idempotencyKey,
      });
      await authentication.transitionChallenge({
        challenge: transition.value,
        expectedVersion: stored.version,
        idempotencyKey,
      });
      return true;
    } catch {
      return false;
    }
  }

  async function recordFailureAndPossiblyRevoke(
    challenge: PasswordlessChallenge,
    occurredAt: string,
  ): Promise<void> {
    try {
      const outcome = await rateLimits.recordChallengeFailure({
        challengeDigest: challenge.secretDigest,
        occurredAt,
        expiresAt: minInstant(challenge.expiresAt, new Date(Date.parse(occurredAt) + DAY_MS).toISOString()),
        idempotencyKey: `customer_auth:failure:${randomUuid()}`,
      });
      if (!outcome.limited) return;
      metric({ stage: 'challenge_rate', outcome: 'limited' });
      await revokePendingChallenge(
        challenge,
        occurredAt,
        `customer-auth/failure-limit/${challenge.id}`,
      );
    } catch {
      metric({ stage: 'challenge_rate', outcome: 'unavailable' });
      // Si el contador durable no responde, el challenge se cierra para que
      // un intento posterior no convierta el fallo del guard en un bypass.
      await revokePendingChallenge(
        challenge,
        occurredAt,
        `customer-auth/failure-unavailable/${challenge.id}`,
      );
    }
  }

  async function digestSessionToken(sessionToken: string): Promise<string | null> {
    try {
      return await passwordlessProofDigest(sessionToken);
    } catch {
      return null;
    }
  }

  async function currentSession(
    sessionToken: string,
    at: string,
  ): Promise<ActiveCustomerSessionContext | null> {
    const tokenDigest = await digestSessionToken(sessionToken);
    if (tokenDigest === null) return null;
    const active = await authentication.activeSessionContextByTokenDigest(tokenDigest, at);
    if (active !== null) return active;
    try {
      const outcome = await authentication.revokeIncoherentSessionFamilyByTokenDigest({
        tokenDigest,
        occurredAt: at,
        reasonId: 'customer:profile-incoherent',
        idempotencyKey: `customer-auth/incoherent/${randomUuid()}`,
        audit: audit(randomUuid, at),
      });
      if (outcome === 'revoked') metric({ stage: 'session_guard', outcome: 'revoked' });
    } catch {
      metric({ stage: 'session_guard', outcome: 'unavailable' });
      // La autorización ya está denegada aunque la revocación defensiva falle.
    }
    return null;
  }

  return Object.freeze({
    async requestAccess(email: unknown, requestedAt: string): Promise<CustomerPasswordlessAccessRequest> {
      const expiresAt = addSeconds(requestedAt, configuration.challengeTtlSeconds);
      const fallback = (): Promise<CustomerPasswordlessAccessRequest> => dummyAccess(requestedAt, expiresAt);
      if (typeof email !== 'string') return fallback();
      let normalizedEmail: string;
      try {
        normalizedEmail = normalizeCustomerEmail(email);
      } catch {
        return fallback();
      }
      try {
        const contactIdentityHash = await customerEmailIdentityHash(
          normalizedEmail,
          configuration.identitySecret,
        );
        let rate: Awaited<ReturnType<CustomerAuthRateLimitRepository['recordContactStart']>>;
        try {
          rate = await rateLimits.recordContactStart({
            contactIdentityHash,
            occurredAt: requestedAt,
            expiresAt: new Date(Date.parse(requestedAt) + DAY_MS).toISOString(),
            idempotencyKey: `customer_auth:contact:${randomUuid()}`,
          });
        } catch {
          metric({ stage: 'contact_rate', outcome: 'unavailable' });
          return fallback();
        }
        if (rate.limited) {
          metric({ stage: 'contact_rate', outcome: 'limited' });
          return fallback();
        }
        const eligible = await eligibleIdentity(contactIdentityHash, requestedAt);
        if (eligible === null) return fallback();
        const idValue = challengeId();
        let prepared: Awaited<ReturnType<PasswordlessProofProvider['prepare']>>;
        try {
          prepared = await provider.prepare({
            method: 'email_magic_link',
            challengeId: idValue,
            expectedOrigin: configuration.origin,
            expiresAt,
          });
        } catch {
          metric({ stage: 'provider_delivery', outcome: 'failed' });
          return fallback();
        }
        const challenge = createPasswordlessChallenge({
          id: idValue,
          identity: eligible.identity,
          method: 'email_magic_link',
          purpose: 'sign_in',
          providerReference: prepared.providerReference,
          secretDigest: prepared.proofDigest,
          requestedAt,
          expiresAt,
        });
        await authentication.createChallengeSupersedingPending(challenge);
        const realAttempt = await attempt(challenge.id, requestedAt, expiresAt);
        const deliveryKey = `customer-auth/delivery/${challenge.id}`;
        const delivery = provider.deliver({
          method: challenge.method,
          challengeId: challenge.id,
          providerReference: challenge.providerReference,
          destinationReference: eligible.destination,
          proof: prepared.proof,
          expectedOrigin: configuration.origin,
          expiresAt: challenge.expiresAt,
        }).then(async (result) => {
          if (!result.deliveryAccepted) {
            metric({ stage: 'provider_delivery', outcome: 'failed' });
            await revokeAfterFailedDelivery(challenge, deliveryKey);
            return;
          }
          try {
            await authentication.confirmChallengeDelivery({
              challengeId: challenge.id,
              providerReference: challenge.providerReference,
              acceptedAt: clock(),
              idempotencyKey: deliveryKey,
            });
            metric({ stage: 'provider_delivery', outcome: 'delivered' });
          } catch {
            metric({ stage: 'provider_delivery', outcome: 'failed' });
            await revokeAfterFailedDelivery(challenge, deliveryKey);
          }
        }).catch(async () => {
          metric({ stage: 'provider_delivery', outcome: 'failed' });
          await revokeAfterFailedDelivery(challenge, deliveryKey);
        });
        return Object.freeze({
          acknowledgement: acknowledgement(),
          attempt: realAttempt,
          delivery,
        });
      } catch {
        metric({ stage: 'runtime', outcome: 'unavailable' });
        return fallback();
      }
    },

    async consumeAccess(
      input: Parameters<CustomerPasswordlessApplication['consumeAccess']>[0],
    ): Promise<CustomerPasswordlessConsumption> {
      const attemptValid = await verifyCustomerAuthAttempt({
        challengeId: input.challengeId,
        secret: configuration.csrfSecret,
        cookieValue: input.attemptCookie,
        csrfToken: input.csrfToken,
        at: input.consumedAt,
      }).catch(() => false);
      if (!attemptValid) return Object.freeze({ outcome: 'rejected' });
      let challenge: PasswordlessChallenge | null;
      try {
        challenge = await authentication.challenge(input.challengeId);
      } catch {
        metric({ stage: 'runtime', outcome: 'unavailable' });
        return Object.freeze({ outcome: 'rejected' });
      }
      if (challenge === null || challenge.status !== 'pending') {
        return Object.freeze({ outcome: 'rejected' });
      }
      if (Date.parse(input.consumedAt) >= Date.parse(challenge.expiresAt)) {
        try {
          const key = `customer-auth/expiry/${challenge.id}`;
          const transition = expirePasswordlessChallenge(challenge, {
            occurredAt: input.consumedAt,
            expectedVersion: challenge.version,
            idempotencyKey: key,
          });
          await authentication.transitionChallenge({
            challenge: transition.value,
            expectedVersion: challenge.version,
            idempotencyKey: key,
          });
        } catch {
          // Otro consumidor puede haber cerrado el challenge en la misma carrera.
        }
        return Object.freeze({ outcome: 'rejected' });
      }
      let failureState: Readonly<{ limited: boolean; failures: number }>;
      try {
        failureState = await rateLimits.challengeFailureState({
          challengeDigest: challenge.secretDigest,
          at: input.consumedAt,
        });
      } catch {
        metric({ stage: 'challenge_rate', outcome: 'unavailable' });
        await revokePendingChallenge(
          challenge,
          input.consumedAt,
          `customer-auth/failure-state-unavailable/${challenge.id}`,
        );
        return Object.freeze({ outcome: 'rejected' });
      }
      if (failureState.limited) {
        metric({ stage: 'challenge_rate', outcome: 'limited' });
        await revokePendingChallenge(
          challenge,
          input.consumedAt,
          `customer-auth/failure-limit/${challenge.id}`,
        );
        return Object.freeze({ outcome: 'rejected' });
      }
      const verification = await provider.verify({
        method: challenge.method,
        providerReference: challenge.providerReference,
        proof: input.proof,
        expectedOrigin: configuration.origin,
      }).catch(() => ({ verified: false, proofDigest: null, verificationReference: null }));
      if (!verification.verified || verification.proofDigest === null ||
          !sameDigest(verification.proofDigest, challenge.secretDigest)) {
        metric({ stage: 'verification', outcome: 'rejected' });
        await recordFailureAndPossiblyRevoke(challenge, input.consumedAt);
        return Object.freeze({ outcome: 'rejected' });
      }
      let identity: CustomerAuthIdentity | null;
      try {
        identity = await authentication.identityById(challenge.identityId);
      } catch {
        metric({ stage: 'runtime', outcome: 'unavailable' });
        return Object.freeze({ outcome: 'rejected' });
      }
      if (identity === null || identity.status !== 'active') {
        return Object.freeze({ outcome: 'rejected' });
      }
      try {
        const sessionId = id(randomUuid, 'customer_session');
        const familyId = id(randomUuid, 'customer_session_family');
        const sessionToken = await createPasswordlessProof();
        const transitionKey = `customer-auth/consume/${randomUuid()}`;
        const consumed = consumePasswordlessChallenge(challenge, {
          proofDigest: verification.proofDigest,
          sessionId,
          consumedAt: input.consumedAt,
          expectedVersion: challenge.version,
          idempotencyKey: transitionKey,
        });
        const absoluteExpiresAt = addSeconds(
          input.consumedAt,
          configuration.session.absoluteTtlSeconds,
        );
        const expiresAt = minInstant(
          addSeconds(input.consumedAt, configuration.session.idleTtlSeconds),
          absoluteExpiresAt,
        );
        const session = issueCustomerSession({
          challenge: consumed.value,
          identity,
          id: sessionId,
          familyId,
          tokenDigest: sessionToken.proofDigest,
          scopes: ['customer:self'],
          issuedAt: input.consumedAt,
          expiresAt,
          absoluteExpiresAt,
        });
        await authentication.consumeChallenge({
          challenge: consumed.value,
          session,
          expectedVersion: challenge.version,
          idempotencyKey: transitionKey,
          audit: audit(randomUuid, input.consumedAt),
        });
        return Object.freeze({ outcome: 'authenticated', session, sessionToken: sessionToken.proof });
      } catch {
        return Object.freeze({ outcome: 'rejected' });
      }
    },

    async confirmationCsrf(attemptCookie: string | null): Promise<string> {
      if (attemptCookie !== null) {
        try {
          return await customerAuthAttemptCsrfToken(configuration.csrfSecret, attemptCookie);
        } catch {
          // Una cookie ausente o malformada recibe un token dummy indistinguible.
        }
      }
      return (await createPasswordlessProof()).proof;
    },

    currentSession,

    async sessionCsrf(context: ActiveCustomerSessionContext): Promise<string> {
      return customerSessionCsrfToken(configuration.csrfSecret, {
        sessionId: context.session.id,
        generation: context.session.generation,
      });
    },

    async logout(input: Parameters<CustomerPasswordlessApplication['logout']>[0]) {
      const context = await currentSession(input.sessionToken, input.occurredAt);
      if (context === null) return 'not_found';
      const validCsrf = await verifyCustomerSessionCsrfToken(
        configuration.csrfSecret,
        { sessionId: context.session.id, generation: context.session.generation },
        input.csrfToken,
      ).catch(() => false);
      if (!validCsrf) return 'invalid_csrf';
      const key = `customer-auth/logout/${randomUuid()}`;
      const transition = revokeCustomerSession(context.session, {
        revokedAt: input.occurredAt,
        reasonId: 'customer:logout',
        expectedVersion: context.session.version,
        idempotencyKey: key,
      });
      const outcome = await authentication.revokeSession({
        session: transition.value,
        expectedVersion: context.session.version,
        idempotencyKey: key,
        audit: audit(randomUuid, input.occurredAt),
      });
      return outcome;
    },
  });
}
