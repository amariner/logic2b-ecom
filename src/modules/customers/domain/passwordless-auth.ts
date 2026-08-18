export const PASSWORDLESS_METHODS = ['email_magic_link', 'webauthn'] as const;
export type PasswordlessMethod = (typeof PASSWORDLESS_METHODS)[number];

export const PASSWORDLESS_CHALLENGE_PURPOSES = ['sign_in', 'step_up', 'link_contact'] as const;
export type PasswordlessChallengePurpose = (typeof PASSWORDLESS_CHALLENGE_PURPOSES)[number];

export const CUSTOMER_SESSION_SCOPES = ['customer:self', 'customer:sessions:revoke'] as const;
export type CustomerSessionScope = (typeof CUSTOMER_SESSION_SCOPES)[number];

export const PASSWORDLESS_CHALLENGE_MAX_TTL_MS = 15 * 60 * 1000;
export const CUSTOMER_SESSION_MAX_IDLE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const CUSTOMER_SESSION_MAX_ABSOLUTE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type CustomerAuthIdentity = Readonly<{
  id: string;
  customerProfileId: string;
  contactIdentityHash: string;
  status: 'active' | 'revoked';
  createdAt: string;
  revokedAt: string | null;
}>;

export type PasswordlessChallenge = Readonly<{
  id: string;
  identityId: string;
  method: PasswordlessMethod;
  purpose: PasswordlessChallengePurpose;
  providerReference: string;
  secretDigest: string;
  status: 'pending' | 'consumed' | 'revoked' | 'expired';
  requestedAt: string;
  expiresAt: string;
  consumedAt: string | null;
  consumedBySessionId: string | null;
  transitionIdempotencyKey: string | null;
  version: number;
}>;

export type CustomerSession = Readonly<{
  id: string;
  familyId: string;
  identityId: string;
  customerProfileId: string;
  tokenDigest: string;
  scopes: readonly CustomerSessionScope[];
  status: 'active' | 'rotated' | 'revoked' | 'expired';
  issuedAt: string;
  expiresAt: string;
  absoluteExpiresAt: string;
  generation: number;
  rotatedFromSessionId: string | null;
  replacedBySessionId: string | null;
  revokedAt: string | null;
  revocationReasonId: string | null;
  transitionIdempotencyKey: string | null;
  version: number;
}>;

export type AuthTransitionOutcome<T> = Readonly<{
  outcome: 'applied' | 'replayed';
  value: T;
}>;

const OPAQUE_ID_PATTERN = /^[a-z][a-z0-9]*(?:[_:-][a-z0-9]+)+$/u;
const NAMESPACED_ID_PATTERN = /^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)+$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;

export class PasswordlessAuthConflictError extends Error {
  readonly code = 'customer_passwordless_auth_conflict';

  constructor() {
    super('La operación de autenticación no pudo confirmarse.');
    this.name = 'PasswordlessAuthConflictError';
  }
}

function conflict(): never {
  throw new PasswordlessAuthConflictError();
}

function clean(value: string, label: string, pattern: RegExp, maximum = 200): string {
  if (value.length > maximum || value.trim() !== value || !pattern.test(value) ||
      /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new RangeError(`${label} inválido.`);
  }
  return value;
}

function opaque(value: string, label: string): string {
  return clean(value, label, OPAQUE_ID_PATTERN);
}

function namespaced(value: string, label: string): string {
  return clean(value, label, NAMESPACED_ID_PATTERN, 120);
}

function digest(value: string, label: string): string {
  return clean(value, label, HASH_PATTERN, 64);
}

function instant(value: string, label: string): number {
  const parsed = Date.parse(value);
  if (!value.endsWith('Z') || !Number.isFinite(parsed)) {
    throw new RangeError(`${label} debe ser una fecha ISO-8601 UTC.`);
  }
  return parsed;
}

function idempotencyKey(value: string): string {
  if (value.length < 8 || value.length > 200 || value.trim() !== value ||
      /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new RangeError('auth.idempotencyKey inválida.');
  }
  return value;
}

function normalizedScopes(values: readonly CustomerSessionScope[]): readonly CustomerSessionScope[] {
  if (values.length < 1 || values.length > CUSTOMER_SESSION_SCOPES.length ||
      values.some((value) => !CUSTOMER_SESSION_SCOPES.includes(value)) ||
      !values.includes('customer:self')) {
    throw new RangeError('auth.session.scopes inválidos.');
  }
  const unique = [...new Set(values)].toSorted();
  if (unique.length !== values.length) throw new RangeError('auth.session.scopes duplicados.');
  return Object.freeze(unique);
}

export function assertCustomerAuthIdentity(identity: CustomerAuthIdentity): CustomerAuthIdentity {
  const id = opaque(identity.id, 'auth.identity.id');
  const customerProfileId = opaque(identity.customerProfileId, 'auth.identity.customerProfileId');
  if (id === customerProfileId) throw new RangeError('Identidad de acceso y perfil deben ser distintos.');
  const contactIdentityHash = digest(identity.contactIdentityHash, 'auth.identity.contactIdentityHash');
  const createdAt = instant(identity.createdAt, 'auth.identity.createdAt');
  if (!['active', 'revoked'].includes(identity.status)) throw new RangeError('auth.identity.status inválido.');
  const revokedAt = identity.revokedAt === null ? null : identity.revokedAt;
  if ((identity.status === 'revoked') !== (revokedAt !== null) ||
      (revokedAt !== null && instant(revokedAt, 'auth.identity.revokedAt') < createdAt)) {
    throw new RangeError('Revocación de identidad inválida.');
  }
  return Object.freeze({ id, customerProfileId, contactIdentityHash,
    status: identity.status, createdAt: identity.createdAt, revokedAt });
}

export function createPasswordlessChallenge(input: Readonly<{
  id: string;
  identity: CustomerAuthIdentity;
  method: PasswordlessMethod;
  purpose: PasswordlessChallengePurpose;
  providerReference: string;
  secretDigest: string;
  requestedAt: string;
  expiresAt: string;
}>): PasswordlessChallenge {
  const identity = assertCustomerAuthIdentity(input.identity);
  if (identity.status !== 'active') return conflict();
  if (!PASSWORDLESS_METHODS.includes(input.method) ||
      !PASSWORDLESS_CHALLENGE_PURPOSES.includes(input.purpose)) {
    throw new RangeError('Método o propósito passwordless inválido.');
  }
  const requested = instant(input.requestedAt, 'auth.challenge.requestedAt');
  const expires = instant(input.expiresAt, 'auth.challenge.expiresAt');
  if (expires <= requested || expires - requested > PASSWORDLESS_CHALLENGE_MAX_TTL_MS) {
    throw new RangeError('Caducidad del challenge inválida.');
  }
  return Object.freeze({
    id: opaque(input.id, 'auth.challenge.id'),
    identityId: identity.id,
    method: input.method,
    purpose: input.purpose,
    providerReference: opaque(input.providerReference, 'auth.challenge.providerReference'),
    secretDigest: digest(input.secretDigest, 'auth.challenge.secretDigest'),
    status: 'pending',
    requestedAt: input.requestedAt,
    expiresAt: input.expiresAt,
    consumedAt: null,
    consumedBySessionId: null,
    transitionIdempotencyKey: null,
    version: 1,
  });
}

export function consumePasswordlessChallenge(
  challenge: PasswordlessChallenge,
  input: Readonly<{
    proofDigest: string;
    sessionId: string;
    consumedAt: string;
    expectedVersion: number;
    idempotencyKey: string;
  }>,
): AuthTransitionOutcome<PasswordlessChallenge> {
  const proofDigest = digest(input.proofDigest, 'auth.challenge.proofDigest');
  const sessionId = opaque(input.sessionId, 'auth.challenge.sessionId');
  const key = idempotencyKey(input.idempotencyKey);
  const consumedAt = instant(input.consumedAt, 'auth.challenge.consumedAt');
  if (challenge.status === 'consumed' && challenge.transitionIdempotencyKey === key &&
      challenge.consumedBySessionId === sessionId && challenge.secretDigest === proofDigest &&
      challenge.consumedAt === input.consumedAt) {
    return Object.freeze({ outcome: 'replayed', value: challenge });
  }
  if (challenge.status !== 'pending' || challenge.version !== input.expectedVersion ||
      challenge.secretDigest !== proofDigest || consumedAt < Date.parse(challenge.requestedAt) ||
      consumedAt >= Date.parse(challenge.expiresAt)) {
    return conflict();
  }
  return Object.freeze({ outcome: 'applied', value: Object.freeze({
    ...challenge,
    status: 'consumed',
    consumedAt: input.consumedAt,
    consumedBySessionId: sessionId,
    transitionIdempotencyKey: key,
    version: challenge.version + 1,
  }) });
}

function closeChallenge(
  challenge: PasswordlessChallenge,
  input: Readonly<{
    action: 'revoked' | 'expired';
    occurredAt: string;
    expectedVersion: number;
    idempotencyKey: string;
  }>,
): AuthTransitionOutcome<PasswordlessChallenge> {
  const key = idempotencyKey(input.idempotencyKey);
  const occurredAt = instant(input.occurredAt, 'auth.challenge.transitionAt');
  if (challenge.status === input.action && challenge.transitionIdempotencyKey === key) {
    return Object.freeze({ outcome: 'replayed', value: challenge });
  }
  if (challenge.status !== 'pending' || challenge.version !== input.expectedVersion ||
      occurredAt < Date.parse(challenge.requestedAt) ||
      (input.action === 'expired' && occurredAt < Date.parse(challenge.expiresAt))) {
    return conflict();
  }
  return Object.freeze({ outcome: 'applied', value: Object.freeze({
    ...challenge,
    status: input.action,
    transitionIdempotencyKey: key,
    version: challenge.version + 1,
  }) });
}

export function revokePasswordlessChallenge(
  challenge: PasswordlessChallenge,
  input: Omit<Parameters<typeof closeChallenge>[1], 'action'>,
): AuthTransitionOutcome<PasswordlessChallenge> {
  return closeChallenge(challenge, { ...input, action: 'revoked' });
}

export function expirePasswordlessChallenge(
  challenge: PasswordlessChallenge,
  input: Omit<Parameters<typeof closeChallenge>[1], 'action'>,
): AuthTransitionOutcome<PasswordlessChallenge> {
  return closeChallenge(challenge, { ...input, action: 'expired' });
}

function sessionWindow(input: Readonly<{
  issuedAt: string;
  expiresAt: string;
  absoluteExpiresAt: string;
}>): void {
  const issued = instant(input.issuedAt, 'auth.session.issuedAt');
  const expires = instant(input.expiresAt, 'auth.session.expiresAt');
  const absolute = instant(input.absoluteExpiresAt, 'auth.session.absoluteExpiresAt');
  if (expires <= issued || absolute < expires ||
      expires - issued > CUSTOMER_SESSION_MAX_IDLE_TTL_MS ||
      absolute - issued > CUSTOMER_SESSION_MAX_ABSOLUTE_TTL_MS) {
    throw new RangeError('Ventana de sesión inválida.');
  }
}

export function issueCustomerSession(input: Readonly<{
  challenge: PasswordlessChallenge;
  identity: CustomerAuthIdentity;
  id: string;
  familyId: string;
  tokenDigest: string;
  scopes: readonly CustomerSessionScope[];
  issuedAt: string;
  expiresAt: string;
  absoluteExpiresAt: string;
}>): CustomerSession {
  const identity = assertCustomerAuthIdentity(input.identity);
  const id = opaque(input.id, 'auth.session.id');
  const scopes = normalizedScopes(input.scopes);
  if (identity.status !== 'active' || input.challenge.status !== 'consumed' ||
      input.challenge.consumedAt === null ||
      input.challenge.purpose !== 'sign_in' ||
      scopes.length !== 1 || scopes[0] !== 'customer:self' ||
      input.challenge.identityId !== identity.id || input.challenge.consumedBySessionId !== id ||
      Date.parse(input.issuedAt) < Date.parse(input.challenge.consumedAt) ||
      Date.parse(input.issuedAt) >= Date.parse(input.challenge.expiresAt)) {
    return conflict();
  }
  sessionWindow(input);
  return Object.freeze({
    id,
    familyId: opaque(input.familyId, 'auth.session.familyId'),
    identityId: identity.id,
    customerProfileId: identity.customerProfileId,
    tokenDigest: digest(input.tokenDigest, 'auth.session.tokenDigest'),
    scopes,
    status: 'active',
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
    absoluteExpiresAt: input.absoluteExpiresAt,
    generation: 1,
    rotatedFromSessionId: null,
    replacedBySessionId: null,
    revokedAt: null,
    revocationReasonId: null,
    transitionIdempotencyKey: null,
    version: 1,
  });
}

export function rotateCustomerSession(
  session: CustomerSession,
  input: Readonly<{
    newSessionId: string;
    newTokenDigest: string;
    rotatedAt: string;
    expiresAt: string;
    expectedVersion: number;
    idempotencyKey: string;
  }>,
): AuthTransitionOutcome<Readonly<{ previous: CustomerSession; current: CustomerSession }>> {
  const newSessionId = opaque(input.newSessionId, 'auth.session.newSessionId');
  const newTokenDigest = digest(input.newTokenDigest, 'auth.session.newTokenDigest');
  const key = idempotencyKey(input.idempotencyKey);
  const rotatedAt = instant(input.rotatedAt, 'auth.session.rotatedAt');
  const makeCurrent = (): CustomerSession => Object.freeze({
    ...session,
    id: newSessionId,
    tokenDigest: newTokenDigest,
    status: 'active',
    issuedAt: input.rotatedAt,
    expiresAt: input.expiresAt,
    generation: session.generation + 1,
    rotatedFromSessionId: session.id,
    replacedBySessionId: null,
    transitionIdempotencyKey: null,
    version: 1,
  });
  if (session.status === 'rotated' && session.transitionIdempotencyKey === key &&
      session.replacedBySessionId === newSessionId) {
    return Object.freeze({ outcome: 'replayed', value: Object.freeze({
      previous: session, current: makeCurrent(),
    }) });
  }
  if (session.status !== 'active' || session.version !== input.expectedVersion ||
      newSessionId === session.id || newTokenDigest === session.tokenDigest ||
      rotatedAt < Date.parse(session.issuedAt) || rotatedAt >= Date.parse(session.expiresAt) ||
      rotatedAt >= Date.parse(session.absoluteExpiresAt)) {
    return conflict();
  }
  sessionWindow({ issuedAt: input.rotatedAt, expiresAt: input.expiresAt,
    absoluteExpiresAt: session.absoluteExpiresAt });
  const previous = Object.freeze({
    ...session,
    status: 'rotated' as const,
    replacedBySessionId: newSessionId,
    transitionIdempotencyKey: key,
    version: session.version + 1,
  });
  return Object.freeze({ outcome: 'applied', value: Object.freeze({
    previous, current: makeCurrent(),
  }) });
}

export function revokeCustomerSession(
  session: CustomerSession,
  input: Readonly<{
    revokedAt: string;
    reasonId: string;
    expectedVersion: number;
    idempotencyKey: string;
  }>,
): AuthTransitionOutcome<CustomerSession> {
  const key = idempotencyKey(input.idempotencyKey);
  const reasonId = namespaced(input.reasonId, 'auth.session.reasonId');
  const revokedAt = instant(input.revokedAt, 'auth.session.revokedAt');
  if (session.status === 'revoked' && session.transitionIdempotencyKey === key &&
      session.revokedAt === input.revokedAt && session.revocationReasonId === reasonId) {
    return Object.freeze({ outcome: 'replayed', value: session });
  }
  if (session.status !== 'active' || session.version !== input.expectedVersion ||
      revokedAt < Date.parse(session.issuedAt)) {
    return conflict();
  }
  return Object.freeze({ outcome: 'applied', value: Object.freeze({
    ...session,
    status: 'revoked',
    revokedAt: input.revokedAt,
    revocationReasonId: reasonId,
    transitionIdempotencyKey: key,
    version: session.version + 1,
  }) });
}

export type CustomerSessionDecision = Readonly<{
  allowed: boolean;
  reason: 'allowed' | 'inactive' | 'expired' | 'wrong_identity' | 'missing_scope';
}>;

export function customerSessionDecision(input: Readonly<{
  session: CustomerSession;
  identityId: string;
  requiredScope: CustomerSessionScope;
  now: string;
}>): CustomerSessionDecision {
  const now = instant(input.now, 'auth.session.now');
  if (input.session.status !== 'active') return Object.freeze({ allowed: false, reason: 'inactive' });
  if (now < Date.parse(input.session.issuedAt)) {
    return Object.freeze({ allowed: false, reason: 'inactive' });
  }
  if (now >= Date.parse(input.session.expiresAt) || now >= Date.parse(input.session.absoluteExpiresAt)) {
    return Object.freeze({ allowed: false, reason: 'expired' });
  }
  if (input.session.identityId !== input.identityId) {
    return Object.freeze({ allowed: false, reason: 'wrong_identity' });
  }
  if (!input.session.scopes.includes(input.requiredScope)) {
    return Object.freeze({ allowed: false, reason: 'missing_scope' });
  }
  return Object.freeze({ allowed: true, reason: 'allowed' });
}

export type PasswordlessPublicAcknowledgement = Readonly<{
  accepted: true;
  messageKey: 'customer.auth.request.accepted';
}>;

/** La respuesta pública no revela si existe identidad ni si el proveedor aceptó. */
export function passwordlessPublicAcknowledgement(_input: Readonly<{
  identityFound: boolean;
  providerAccepted: boolean;
}>): PasswordlessPublicAcknowledgement {
  return Object.freeze({ accepted: true, messageKey: 'customer.auth.request.accepted' });
}
