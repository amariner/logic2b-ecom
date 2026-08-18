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
  consumeChallenge(input: Readonly<{
    challenge: PasswordlessChallenge;
    session: CustomerSession;
    expectedVersion: number;
    idempotencyKey: string;
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
  }>): Promise<'rotated' | 'replayed'>;
  revokeSession(input: Readonly<{
    session: CustomerSession;
    expectedVersion: number;
    idempotencyKey: string;
  }>): Promise<'revoked' | 'replayed'>;
  revokeSessionFamily(input: Readonly<{
    familyId: string;
    occurredAt: string;
    reasonId: string;
    expectedVersion: number;
    idempotencyKey: string;
  }>): Promise<number>;
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
