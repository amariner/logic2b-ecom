import type { CustomerAuthenticationRepository } from '../application/passwordless-auth-ports';
import {
  assertCustomerAuthIdentity,
  type CustomerAuthIdentity,
  type CustomerSession,
  type CustomerSessionScope,
  type PasswordlessChallenge,
} from '../domain/passwordless-auth';

type IdentityRow = Readonly<{
  id: string;
  customer_profile_id: string;
  contact_identity_hash: string;
  status: CustomerAuthIdentity['status'];
  created_at: string;
  revoked_at: string | null;
  creation_idempotency_key: string;
}>;

type ChallengeRow = Readonly<{
  id: string;
  identity_id: string;
  method: PasswordlessChallenge['method'];
  purpose: PasswordlessChallenge['purpose'];
  provider_reference: string;
  secret_digest: string;
  status: PasswordlessChallenge['status'];
  requested_at: string;
  expires_at: string;
  consumed_at: string | null;
  consumed_by_session_id: string | null;
  transition_idempotency_key: string | null;
  version: number;
}>;

type SessionRow = Readonly<{
  id: string;
  family_id: string;
  identity_id: string;
  customer_profile_id: string;
  token_digest: string;
  can_revoke_sessions: number;
  status: CustomerSession['status'];
  issued_at: string;
  expires_at: string;
  absolute_expires_at: string;
  generation: number;
  rotated_from_session_id: string | null;
  replaced_by_session_id: string | null;
  revoked_at: string | null;
  revocation_reason_id: string | null;
  transition_idempotency_key: string | null;
  version: number;
}>;

type FamilyRow = Readonly<{
  id: string;
  identity_id: string;
  customer_profile_id: string;
  status: 'active' | 'revoked' | 'expired';
  created_at: string;
  absolute_expires_at: string;
  revoked_at: string | null;
  revocation_reason_id: string | null;
  transition_idempotency_key: string | null;
  version: number;
}>;

const IDENTITY_COLUMNS = `id, customer_profile_id, contact_identity_hash, status,
  created_at, revoked_at, creation_idempotency_key`;
const CHALLENGE_COLUMNS = `id, identity_id, method, purpose, provider_reference,
  secret_digest, status, requested_at, expires_at, consumed_at,
  consumed_by_session_id, transition_idempotency_key, version`;
const SESSION_COLUMNS = `id, family_id, identity_id, customer_profile_id,
  token_digest, can_revoke_sessions, status, issued_at, expires_at,
  absolute_expires_at, generation, rotated_from_session_id,
  replaced_by_session_id, revoked_at, revocation_reason_id,
  transition_idempotency_key, version`;

const OPAQUE_ID_PATTERN = /^[a-z][a-z0-9]*(?:[_:-][a-z0-9]+)+$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;

export class CustomerAuthenticationConflictError extends Error {
  readonly code = 'customer_authentication_persistence_conflict';

  constructor() {
    super('La operación de autenticación no pudo confirmarse.');
    this.name = 'CustomerAuthenticationConflictError';
  }
}

function conflict(): never {
  throw new CustomerAuthenticationConflictError();
}

function opaque(value: string): string {
  if (value.length > 200 || value.trim() !== value || !OPAQUE_ID_PATTERN.test(value)) {
    return conflict();
  }
  return value;
}

function digest(value: string): string {
  if (!HASH_PATTERN.test(value)) return conflict();
  return value;
}

function idempotencyKey(value: string): string {
  if (value.length < 8 || value.length > 200 || value.trim() !== value ||
      /[\u0000-\u001f\u007f]/u.test(value)) return conflict();
  return value;
}

function identityOf(row: IdentityRow): CustomerAuthIdentity {
  return assertCustomerAuthIdentity(Object.freeze({
    id: row.id,
    customerProfileId: row.customer_profile_id,
    contactIdentityHash: row.contact_identity_hash,
    status: row.status,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
  }));
}

function challengeOf(row: ChallengeRow): PasswordlessChallenge {
  return Object.freeze({
    id: row.id,
    identityId: row.identity_id,
    method: row.method,
    purpose: row.purpose,
    providerReference: row.provider_reference,
    secretDigest: row.secret_digest,
    status: row.status,
    requestedAt: row.requested_at,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
    consumedBySessionId: row.consumed_by_session_id,
    transitionIdempotencyKey: row.transition_idempotency_key,
    version: row.version,
  });
}

function scopesOf(row: SessionRow): readonly CustomerSessionScope[] {
  return Object.freeze(row.can_revoke_sessions === 1
    ? ['customer:self', 'customer:sessions:revoke']
    : ['customer:self']);
}

function sessionOf(row: SessionRow): CustomerSession {
  return Object.freeze({
    id: row.id,
    familyId: row.family_id,
    identityId: row.identity_id,
    customerProfileId: row.customer_profile_id,
    tokenDigest: row.token_digest,
    scopes: scopesOf(row),
    status: row.status,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    absoluteExpiresAt: row.absolute_expires_at,
    generation: row.generation,
    rotatedFromSessionId: row.rotated_from_session_id,
    replacedBySessionId: row.replaced_by_session_id,
    revokedAt: row.revoked_at,
    revocationReasonId: row.revocation_reason_id,
    transitionIdempotencyKey: row.transition_idempotency_key,
    version: row.version,
  });
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function pendingBefore(
  challenge: PasswordlessChallenge,
  expectedVersion: number,
): PasswordlessChallenge {
  return Object.freeze({
    ...challenge,
    status: 'pending',
    consumedAt: null,
    consumedBySessionId: null,
    transitionIdempotencyKey: null,
    version: expectedVersion,
  });
}

function activeBefore(
  session: CustomerSession,
  expectedVersion: number,
): CustomerSession {
  return Object.freeze({
    ...session,
    status: 'active',
    replacedBySessionId: null,
    revokedAt: null,
    revocationReasonId: null,
    transitionIdempotencyKey: null,
    version: expectedVersion,
  });
}

function sessionValues(session: CustomerSession): readonly (string | number | null)[] {
  return [
    session.id,
    session.familyId,
    session.identityId,
    session.customerProfileId,
    session.tokenDigest,
    session.scopes.includes('customer:sessions:revoke') ? 1 : 0,
    session.status,
    session.issuedAt,
    session.expiresAt,
    session.absoluteExpiresAt,
    session.generation,
    session.rotatedFromSessionId,
    session.replacedBySessionId,
    session.revokedAt,
    session.revocationReasonId,
    session.transitionIdempotencyKey,
    session.version,
  ];
}

function validScopes(scopes: readonly CustomerSessionScope[]): boolean {
  return scopes.length >= 1 && scopes.length <= 2 && scopes.includes('customer:self') &&
    new Set(scopes).size === scopes.length &&
    scopes.every((scope) => scope === 'customer:self' || scope === 'customer:sessions:revoke');
}

/** Persistencia interna; no busca emails, no recibe tokens crudos y no abre superficies. */
export function createD1CustomerAuthenticationRepository(
  db: D1Database,
): CustomerAuthenticationRepository {
  async function identityById(identityId: string): Promise<IdentityRow | null> {
    return db.prepare(`SELECT ${IDENTITY_COLUMNS} FROM customer_auth_identities WHERE id = ?`)
      .bind(opaque(identityId)).first<IdentityRow>();
  }

  async function identityByContactHash(contactIdentityHash: string): Promise<CustomerAuthIdentity | null> {
    const row = await db.prepare(`SELECT ${IDENTITY_COLUMNS}
      FROM customer_auth_identities WHERE contact_identity_hash = ?`)
      .bind(digest(contactIdentityHash)).first<IdentityRow>();
    return row === null ? null : identityOf(row);
  }

  async function createIdentity(input: Readonly<{
    identity: CustomerAuthIdentity;
    idempotencyKey: string;
  }>): Promise<'created' | 'replayed'> {
    const identity = assertCustomerAuthIdentity(input.identity);
    const key = idempotencyKey(input.idempotencyKey);
    try {
      const result = await db.prepare(`INSERT OR IGNORE INTO customer_auth_identities (
        id, customer_profile_id, contact_identity_hash, status, created_at,
        revoked_at, creation_idempotency_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(
        identity.id, identity.customerProfileId, identity.contactIdentityHash,
        identity.status, identity.createdAt, identity.revokedAt, key,
      ).run();
      const stored = await identityById(identity.id);
      if (stored === null || stored.creation_idempotency_key !== key ||
          !same(identityOf(stored), identity)) return conflict();
      return result.meta.changes === 1 ? 'created' : 'replayed';
    } catch (error) {
      if (error instanceof CustomerAuthenticationConflictError) throw error;
      return conflict();
    }
  }

  async function challenge(challengeId: string): Promise<PasswordlessChallenge | null> {
    const row = await db.prepare(`SELECT ${CHALLENGE_COLUMNS}
      FROM customer_passwordless_challenges WHERE id = ?`)
      .bind(opaque(challengeId)).first<ChallengeRow>();
    return row === null ? null : challengeOf(row);
  }

  async function createChallenge(value: PasswordlessChallenge): Promise<'created' | 'replayed'> {
    if (value.status !== 'pending' || value.version !== 1) return conflict();
    try {
      const result = await db.prepare(`INSERT OR IGNORE INTO customer_passwordless_challenges (
        id, identity_id, method, purpose, provider_reference, secret_digest,
        status, requested_at, expires_at, consumed_at, consumed_by_session_id,
        transition_idempotency_key, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        value.id, value.identityId, value.method, value.purpose, value.providerReference,
        value.secretDigest, value.status, value.requestedAt, value.expiresAt,
        value.consumedAt, value.consumedBySessionId,
        value.transitionIdempotencyKey, value.version,
      ).run();
      const stored = await challenge(value.id);
      if (stored === null || !same(stored, value)) return conflict();
      return result.meta.changes === 1 ? 'created' : 'replayed';
    } catch (error) {
      if (error instanceof CustomerAuthenticationConflictError) throw error;
      return conflict();
    }
  }

  async function sessionById(sessionId: string): Promise<CustomerSession | null> {
    const row = await db.prepare(`SELECT ${SESSION_COLUMNS} FROM customer_sessions WHERE id = ?`)
      .bind(opaque(sessionId)).first<SessionRow>();
    return row === null ? null : sessionOf(row);
  }

  async function sessionByTokenDigest(tokenDigest: string): Promise<CustomerSession | null> {
    const row = await db.prepare(`SELECT ${SESSION_COLUMNS}
      FROM customer_sessions WHERE token_digest = ?`)
      .bind(digest(tokenDigest)).first<SessionRow>();
    return row === null ? null : sessionOf(row);
  }

  async function family(familyId: string): Promise<FamilyRow | null> {
    return db.prepare(`SELECT id, identity_id, customer_profile_id, status,
      created_at, absolute_expires_at, revoked_at, revocation_reason_id,
      transition_idempotency_key, version
      FROM customer_session_families WHERE id = ?`)
      .bind(opaque(familyId)).first<FamilyRow>();
  }

  async function consumeChallenge(input: Readonly<{
    challenge: PasswordlessChallenge;
    session: CustomerSession;
    expectedVersion: number;
    idempotencyKey: string;
  }>): Promise<'consumed' | 'replayed'> {
    const key = idempotencyKey(input.idempotencyKey);
    const planned = input.challenge;
    const session = input.session;
    if (planned.status !== 'consumed' || planned.transitionIdempotencyKey !== key ||
        planned.version !== input.expectedVersion + 1 ||
        planned.consumedBySessionId !== session.id || session.status !== 'active' ||
        session.generation !== 1 || session.identityId !== planned.identityId ||
        !validScopes(session.scopes)) return conflict();
    const stored = await challenge(planned.id);
    if (stored?.status === 'consumed') {
      const storedSession = await sessionById(session.id);
      if (same(stored, planned) && same(storedSession, session)) return 'replayed';
      return conflict();
    }
    if (stored === null || !same(stored, pendingBefore(planned, input.expectedVersion))) {
      return conflict();
    }
    try {
      await db.batch([
        db.prepare(`INSERT OR IGNORE INTO customer_session_families (
          id, identity_id, customer_profile_id, status, created_at,
          absolute_expires_at, revoked_at, revocation_reason_id,
          transition_idempotency_key, version
        ) VALUES (?, ?, ?, 'active', ?, ?, NULL, NULL, NULL, 1)`).bind(
          session.familyId, session.identityId, session.customerProfileId,
          session.issuedAt, session.absoluteExpiresAt,
        ),
        db.prepare(`INSERT INTO customer_sessions (
          id, family_id, identity_id, customer_profile_id, token_digest,
          can_revoke_sessions, status, issued_at, expires_at, absolute_expires_at,
          generation, rotated_from_session_id, replaced_by_session_id,
          revoked_at, revocation_reason_id, transition_idempotency_key, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
          ...sessionValues(session),
        ),
        db.prepare(`UPDATE customer_passwordless_challenges SET
          status = ?, consumed_at = ?, consumed_by_session_id = ?,
          transition_idempotency_key = ?, version = ? WHERE id = ?`).bind(
          planned.status, planned.consumedAt, planned.consumedBySessionId,
          key, planned.version, planned.id,
        ),
      ]);
      if (!same(await challenge(planned.id), planned) ||
          !same(await sessionById(session.id), session)) return conflict();
      return 'consumed';
    } catch {
      const replayChallenge = await challenge(planned.id).catch(() => null);
      const replaySession = await sessionById(session.id).catch(() => null);
      if (same(replayChallenge, planned) && same(replaySession, session)) return 'replayed';
      return conflict();
    }
  }

  async function transitionChallenge(input: Readonly<{
    challenge: PasswordlessChallenge;
    expectedVersion: number;
    idempotencyKey: string;
  }>): Promise<'transitioned' | 'replayed'> {
    const key = idempotencyKey(input.idempotencyKey);
    const planned = input.challenge;
    if (!['revoked', 'expired'].includes(planned.status) ||
        planned.transitionIdempotencyKey !== key ||
        planned.version !== input.expectedVersion + 1) return conflict();
    const stored = await challenge(planned.id);
    if (same(stored, planned)) return 'replayed';
    if (stored === null || !same(stored, pendingBefore(planned, input.expectedVersion))) {
      return conflict();
    }
    try {
      await db.prepare(`UPDATE customer_passwordless_challenges SET status = ?,
        transition_idempotency_key = ?, version = ? WHERE id = ?`).bind(
        planned.status, key, planned.version, planned.id,
      ).run();
      if (!same(await challenge(planned.id), planned)) return conflict();
      return 'transitioned';
    } catch {
      if (same(await challenge(planned.id).catch(() => null), planned)) return 'replayed';
      return conflict();
    }
  }

  async function rotateSession(input: Readonly<{
    previous: CustomerSession;
    current: CustomerSession;
    idempotencyKey: string;
  }>): Promise<'rotated' | 'replayed'> {
    const key = idempotencyKey(input.idempotencyKey);
    const previous = input.previous;
    const current = input.current;
    if (previous.status !== 'rotated' || previous.transitionIdempotencyKey !== key ||
        current.status !== 'active' || current.rotatedFromSessionId !== previous.id ||
        current.familyId !== previous.familyId || current.identityId !== previous.identityId ||
        current.customerProfileId !== previous.customerProfileId ||
        current.generation !== previous.generation + 1 ||
        current.absoluteExpiresAt !== previous.absoluteExpiresAt ||
        !same(current.scopes, previous.scopes) || !validScopes(current.scopes)) return conflict();
    const storedPrevious = await sessionById(previous.id);
    if (same(storedPrevious, previous) && same(await sessionById(current.id), current)) {
      return 'replayed';
    }
    if (storedPrevious === null ||
        !same(storedPrevious, activeBefore(previous, previous.version - 1))) return conflict();
    try {
      await db.batch([
        db.prepare(`INSERT INTO customer_sessions (
          id, family_id, identity_id, customer_profile_id, token_digest,
          can_revoke_sessions, status, issued_at, expires_at, absolute_expires_at,
          generation, rotated_from_session_id, replaced_by_session_id,
          revoked_at, revocation_reason_id, transition_idempotency_key, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
          ...sessionValues(current),
        ),
        db.prepare(`UPDATE customer_sessions SET status = 'rotated',
          replaced_by_session_id = ?, transition_idempotency_key = ?, version = ?
          WHERE id = ?`).bind(current.id, key, previous.version, previous.id),
      ]);
      if (!same(await sessionById(previous.id), previous) ||
          !same(await sessionById(current.id), current)) return conflict();
      return 'rotated';
    } catch {
      if (same(await sessionById(previous.id).catch(() => null), previous) &&
          same(await sessionById(current.id).catch(() => null), current)) return 'replayed';
      return conflict();
    }
  }

  async function revokeSession(input: Readonly<{
    session: CustomerSession;
    expectedVersion: number;
    idempotencyKey: string;
  }>): Promise<'revoked' | 'replayed'> {
    const key = idempotencyKey(input.idempotencyKey);
    const planned = input.session;
    if (planned.status !== 'revoked' || planned.transitionIdempotencyKey !== key ||
        planned.version !== input.expectedVersion + 1) return conflict();
    const stored = await sessionById(planned.id);
    if (same(stored, planned)) return 'replayed';
    if (stored === null || !same(stored, activeBefore(planned, input.expectedVersion))) {
      return conflict();
    }
    try {
      await db.prepare(`UPDATE customer_sessions SET status = 'revoked',
        revoked_at = ?, revocation_reason_id = ?, transition_idempotency_key = ?,
        version = ? WHERE id = ?`).bind(
        planned.revokedAt, planned.revocationReasonId, key, planned.version, planned.id,
      ).run();
      if (!same(await sessionById(planned.id), planned)) return conflict();
      return 'revoked';
    } catch {
      if (same(await sessionById(planned.id).catch(() => null), planned)) return 'replayed';
      return conflict();
    }
  }

  async function revokeSessionFamily(input: Readonly<{
    familyId: string;
    occurredAt: string;
    reasonId: string;
    expectedVersion: number;
    idempotencyKey: string;
  }>): Promise<number> {
    const familyId = opaque(input.familyId);
    const key = idempotencyKey(input.idempotencyKey);
    const stored = await family(familyId);
    if (stored?.status === 'revoked' && stored.transition_idempotency_key === key &&
        stored.revoked_at === input.occurredAt &&
        stored.revocation_reason_id === input.reasonId) {
      return Number(await db.prepare(`SELECT count(*) AS total FROM customer_sessions
        WHERE family_id = ? AND status = 'revoked'
          AND transition_idempotency_key = ?`).bind(familyId, key).first<number>('total') ?? 0);
    }
    if (stored === null || stored.status !== 'active' ||
        stored.version !== input.expectedVersion) return conflict();
    try {
      const results = await db.batch([
        db.prepare(`UPDATE customer_session_families SET status = 'revoked',
          revoked_at = ?, revocation_reason_id = ?, transition_idempotency_key = ?,
          version = ? WHERE id = ?`).bind(
          input.occurredAt, input.reasonId, key, input.expectedVersion + 1, familyId,
        ),
        db.prepare(`UPDATE customer_sessions SET status = 'revoked', revoked_at = ?,
          revocation_reason_id = ?, transition_idempotency_key = ?, version = version + 1
          WHERE family_id = ? AND status = 'active'`).bind(
          input.occurredAt, input.reasonId, key, familyId,
        ),
      ]);
      return results[1]?.meta.changes ?? 0;
    } catch {
      const replay = await family(familyId).catch(() => null);
      if (replay?.status === 'revoked' && replay.transition_idempotency_key === key) {
        return Number(await db.prepare(`SELECT count(*) AS total FROM customer_sessions
          WHERE family_id = ? AND status = 'revoked'
            AND transition_idempotency_key = ?`).bind(familyId, key).first<number>('total') ?? 0);
      }
      return conflict();
    }
  }

  return Object.freeze({
    identityByContactHash,
    createIdentity,
    challenge,
    createChallenge,
    consumeChallenge,
    transitionChallenge,
    sessionByTokenDigest,
    rotateSession,
    revokeSession,
    revokeSessionFamily,
  });
}
