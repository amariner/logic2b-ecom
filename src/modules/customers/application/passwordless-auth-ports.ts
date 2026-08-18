import type {
  CustomerAuthIdentity,
  CustomerSession,
  PasswordlessChallenge,
  PasswordlessMethod,
} from '../domain/passwordless-auth';

/** Persistencia futura. Crear/consumir y rotar/revocar deben ser transacciones atómicas. */
export interface CustomerAuthenticationRepository {
  identityByContactHash(contactIdentityHash: string): Promise<CustomerAuthIdentity | null>;
  challenge(challengeId: string): Promise<PasswordlessChallenge | null>;
  createChallenge(challenge: PasswordlessChallenge): Promise<'created' | 'replayed'>;
  consumeChallenge(input: Readonly<{
    challengeId: string;
    proofDigest: string;
    session: CustomerSession;
    expectedVersion: number;
    idempotencyKey: string;
  }>): Promise<'consumed' | 'replayed'>;
  sessionByTokenDigest(tokenDigest: string): Promise<CustomerSession | null>;
  rotateSession(input: Readonly<{
    previous: CustomerSession;
    current: CustomerSession;
    idempotencyKey: string;
  }>): Promise<'rotated' | 'replayed'>;
  revokeSessionFamily(input: Readonly<{
    familyId: string;
    occurredAt: string;
    reasonId: string;
    idempotencyKey: string;
  }>): Promise<number>;
}

/**
 * Adaptador de prueba passwordless. Resuelve fuera del dominio el destino
 * protegido y el proof crudo; solo devuelve referencias/digests opacos.
 */
export interface PasswordlessProofProvider {
  readonly id: string;
  readonly methods: readonly PasswordlessMethod[];
  begin(input: Readonly<{
    method: PasswordlessMethod;
    challengeId: string;
    destinationReference: string;
    expiresAt: string;
  }>): Promise<Readonly<{
    providerReference: string;
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
