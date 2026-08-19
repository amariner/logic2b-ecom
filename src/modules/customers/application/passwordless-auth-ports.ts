import type {
  CustomerAuthIdentity,
  CustomerSession,
  PasswordlessChallenge,
  PasswordlessMethod,
} from '../domain/passwordless-auth';

export type ActiveCustomerSessionContext = Readonly<{
  session: CustomerSession;
  identity: CustomerAuthIdentity;
  family: Readonly<{
    id: string;
    status: 'active';
    absoluteExpiresAt: string;
    version: number;
  }>;
  profile: Readonly<{
    id: string;
    status: 'active';
    emailIdentityHash: string;
  }>;
}>;

/**
 * Identidad mínima de un hecho de seguridad. El repositorio fija acción,
 * entidad y diff; ningún caller puede inyectar PII ni material de autenticación.
 */
export type CustomerAuthAuditCommand = Readonly<{
  auditId: string;
  occurredAt: string;
  correlationId: string;
}>;

export type CustomerSessionFamilyRevocationTarget =
  | Readonly<{ kind: 'identity'; id: string }>
  | Readonly<{ kind: 'profile'; id: string }>;

export type CustomerAuthRateLimitOutcome = Readonly<{
  outcome: 'accepted' | 'limited' | 'replayed';
  limited: boolean;
}>;

export type CustomerAuthCapabilityState = 'installed' | 'active';

export type CustomerAuthCapabilityReadiness = Readonly<{
  capabilityId: 'CUS-003';
  state: CustomerAuthCapabilityState;
  version: number;
  readyForActiveRuntime: boolean;
}>;

/** Persistencia futura. Crear/consumir y rotar/revocar deben ser transacciones atómicas. */
export interface CustomerAuthenticationRepository {
  identityByContactHash(contactIdentityHash: string): Promise<CustomerAuthIdentity | null>;
  identityById(identityId: string): Promise<CustomerAuthIdentity | null>;
  createIdentity(input: Readonly<{
    identity: CustomerAuthIdentity;
    idempotencyKey: string;
  }>): Promise<'created' | 'replayed'>;
  challenge(challengeId: string): Promise<PasswordlessChallenge | null>;
  createChallenge(challenge: PasswordlessChallenge): Promise<'created' | 'replayed'>;
  createChallengeSupersedingPending(
    challenge: PasswordlessChallenge,
  ): Promise<'created' | 'replayed'>;
  confirmChallengeDelivery(input: Readonly<{
    challengeId: string;
    providerReference: string;
    acceptedAt: string;
    idempotencyKey: string;
  }>): Promise<'confirmed' | 'replayed'>;
  consumeChallenge(input: Readonly<{
    challenge: PasswordlessChallenge;
    session: CustomerSession;
    expectedVersion: number;
    idempotencyKey: string;
    audit: CustomerAuthAuditCommand;
  }>): Promise<'consumed' | 'replayed'>;
  transitionChallenge(input: Readonly<{
    challenge: PasswordlessChallenge;
    expectedVersion: number;
    idempotencyKey: string;
  }>): Promise<'transitioned' | 'replayed'>;
  activeSessionContextByTokenDigest(
    tokenDigest: string,
    at: string,
  ): Promise<ActiveCustomerSessionContext | null>;
  /** Compatibilidad interna: exige contexto activo, coherente y vigente en `at`. */
  sessionByTokenDigest(tokenDigest: string, at: string): Promise<CustomerSession | null>;
  rotateSession(input: Readonly<{
    previous: CustomerSession;
    current: CustomerSession;
    idempotencyKey: string;
    audit: CustomerAuthAuditCommand;
  }>): Promise<'rotated' | 'replayed'>;
  revokeSession(input: Readonly<{
    session: CustomerSession;
    expectedVersion: number;
    idempotencyKey: string;
    audit: CustomerAuthAuditCommand;
  }>): Promise<'revoked' | 'replayed'>;
  revokeSessionFamily(input: Readonly<{
    familyId: string;
    occurredAt: string;
    reasonId: string;
    expectedVersion: number;
    idempotencyKey: string;
    audit: CustomerAuthAuditCommand;
  }>): Promise<number>;
  revokeIncoherentSessionFamilyByTokenDigest(input: Readonly<{
    tokenDigest: string;
    occurredAt: string;
    reasonId: string;
    idempotencyKey: string;
    audit: CustomerAuthAuditCommand;
  }>): Promise<'revoked' | 'replayed' | 'coherent' | 'not_found'>;
  revokeAllSessionFamilies(input: Readonly<{
    target: CustomerSessionFamilyRevocationTarget;
    occurredAt: string;
    reasonId: string;
    idempotencyKey: string;
    audit: CustomerAuthAuditCommand;
  }>): Promise<Readonly<{
    outcome: 'revoked' | 'replayed';
    familiesRevoked: number;
    sessionsRevoked: number;
  }>>;
  transitionCustomerAuthCapability(input: Readonly<{
    fromState: CustomerAuthCapabilityState;
    toState: CustomerAuthCapabilityState;
    expectedVersion: number;
    occurredAt: string;
    idempotencyKey: string;
    audit: CustomerAuthAuditCommand;
  }>): Promise<Readonly<{
    outcome: 'transitioned' | 'replayed';
    state: CustomerAuthCapabilityState;
    version: number;
  }>>;
  customerAuthCapabilityReadiness(): Promise<CustomerAuthCapabilityReadiness>;
}

/** Persistencia efímera y durable; nunca recibe email, IP ni challenge crudos. */
export interface CustomerAuthRateLimitRepository {
  recordContactStart(input: Readonly<{
    contactIdentityHash: string;
    occurredAt: string;
    expiresAt: string;
    idempotencyKey: string;
  }>): Promise<CustomerAuthRateLimitOutcome & Readonly<{
    count15m: number;
    count24h: number;
  }>>;
  recordChallengeFailure(input: Readonly<{
    challengeDigest: string;
    occurredAt: string;
    expiresAt: string;
    idempotencyKey: string;
  }>): Promise<CustomerAuthRateLimitOutcome & Readonly<{
    failures: number;
  }>>;
  challengeFailureState(input: Readonly<{
    challengeDigest: string;
    at: string;
  }>): Promise<Readonly<{ limited: boolean; failures: number }>>;
  purgeExpired(at: string): Promise<number>;
}

/**
 * Adaptador de prueba passwordless. `prepare` es puro respecto a efectos
 * externos: crea el proof efímero y su digest para que la aplicación persista
 * primero el challenge. Solo después puede llamar a `deliver`; el proof crudo
 * vive en memoria durante esa llamada y nunca entra en D1 ni en una outbox.
 */
export interface PasswordlessProofProvider {
  readonly id: string;
  readonly methods: readonly PasswordlessMethod[];
  prepare(input: Readonly<{
    method: PasswordlessMethod;
    challengeId: string;
    expectedOrigin: string;
    expiresAt: string;
  }>): Promise<Readonly<{
    providerReference: string;
    proof: string;
    proofDigest: string;
  }>>;
  deliver(input: Readonly<{
    method: PasswordlessMethod;
    challengeId: string;
    providerReference: string;
    destinationReference: string;
    proof: string;
    expectedOrigin: string;
    expiresAt: string;
  }>): Promise<Readonly<{
    deliveryAccepted: boolean;
  }>>;
  verify(input: Readonly<{
    method: PasswordlessMethod;
    providerReference: string;
    proof: string;
    expectedOrigin: string;
  }>): Promise<Readonly<{
    verified: boolean;
    proofDigest: string | null;
    verificationReference: string | null;
  }>>;
}
