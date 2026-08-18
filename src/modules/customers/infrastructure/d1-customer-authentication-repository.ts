import type {
  ActiveCustomerSessionContext,
  CustomerAuthenticationRepository,
} from '../application/passwordless-auth-ports';
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

type ActiveSessionContextRow = SessionRow & Readonly<{
  auth_identity_id: string;
  auth_identity_profile_id: string;
  auth_contact_identity_hash: string;
  auth_identity_status: 'active';
  auth_identity_created_at: string;
  auth_identity_revoked_at: null;
  auth_identity_creation_idempotency_key: string;
  family_status: 'active';
  family_absolute_expires_at: string;
  family_version: number;
  profile_id: string;
  profile_status: 'active';
  profile_email_identity_hash: string;
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
const FAMILY_COLUMNS = `id, identity_id, customer_profile_id, status,
  created_at, absolute_expires_at, revoked_at, revocation_reason_id,
  transition_idempotency_key, version`;
const QUALIFIED_SESSION_COLUMNS = `session.id AS id, session.family_id AS family_id,
  session.identity_id AS identity_id, session.customer_profile_id AS customer_profile_id,
  session.token_digest AS token_digest, session.can_revoke_sessions AS can_revoke_sessions,
  session.status AS status, session.issued_at AS issued_at,
  session.expires_at AS expires_at, session.absolute_expires_at AS absolute_expires_at,
  session.generation AS generation,
  session.rotated_from_session_id AS rotated_from_session_id,
  session.replaced_by_session_id AS replaced_by_session_id,
  session.revoked_at AS revoked_at,
  session.revocation_reason_id AS revocation_reason_id,
  session.transition_idempotency_key AS transition_idempotency_key,
  session.version AS version`;

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

function instant(value: string): string {
  if (!value.endsWith('Z') || !Number.isFinite(Date.parse(value))) return conflict();
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

function firstBatchRow<T>(result: D1Result<unknown> | undefined): T | null {
  const row = result?.results?.[0];
  return row === undefined ? null : row as T;
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

function guardedSessionInsert(db: D1Database, session: CustomerSession): D1PreparedStatement {
  return db.prepare(`INSERT INTO customer_sessions (
    id, family_id, identity_id, customer_profile_id, token_digest,
    can_revoke_sessions, status, issued_at, expires_at, absolute_expires_at,
    generation, rotated_from_session_id, replaced_by_session_id,
    revoked_at, revocation_reason_id, transition_idempotency_key, version
  ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
  FROM customer_session_families family
  JOIN customer_auth_identities identity ON identity.id = family.identity_id
  JOIN customer_profiles profile ON profile.id = family.customer_profile_id
  WHERE family.id = ? AND family.status = 'active'
    AND family.identity_id = ? AND family.customer_profile_id = ?
    AND family.absolute_expires_at = ?
    AND identity.status = 'active' AND identity.customer_profile_id = profile.id
    AND profile.status = 'active' AND profile.merged_into_profile_id IS NULL
    AND identity.contact_identity_hash = profile.email_identity_hash`).bind(
    ...sessionValues(session),
    session.familyId,
    session.identityId,
    session.customerProfileId,
    session.absoluteExpiresAt,
  );
}

function validScopes(scopes: readonly CustomerSessionScope[]): boolean {
  return (scopes.length === 1 && scopes[0] === 'customer:self') ||
    (scopes.length === 2 && scopes[0] === 'customer:self' &&
      scopes[1] === 'customer:sessions:revoke');
}

/** Persistencia interna; no busca emails, no recibe tokens crudos y no abre superficies. */
export function createD1CustomerAuthenticationRepository(
  db: D1Database,
): CustomerAuthenticationRepository {
  async function identityRowById(identityId: string): Promise<IdentityRow | null> {
    return db.prepare(`SELECT ${IDENTITY_COLUMNS} FROM customer_auth_identities WHERE id = ?`)
      .bind(opaque(identityId)).first<IdentityRow>();
  }

  async function identityById(identityId: string): Promise<CustomerAuthIdentity | null> {
    const row = await identityRowById(identityId);
    return row === null ? null : identityOf(row);
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
    if (identity.status !== 'active' || identity.revokedAt !== null) return conflict();
    const key = idempotencyKey(input.idempotencyKey);
    try {
      const results = await db.batch([
        db.prepare(`INSERT OR IGNORE INTO customer_auth_identities (
          id, customer_profile_id, contact_identity_hash, status, created_at,
          revoked_at, creation_idempotency_key
        ) SELECT ?, ?, ?, ?, ?, ?, ?
        FROM customer_profiles profile
        WHERE profile.id = ? AND profile.status = 'active'
          AND profile.merged_into_profile_id IS NULL
          AND profile.email_identity_hash = ?`).bind(
          identity.id, identity.customerProfileId, identity.contactIdentityHash,
          identity.status, identity.createdAt, identity.revokedAt, key,
          identity.customerProfileId, identity.contactIdentityHash,
        ),
        db.prepare(`SELECT ${IDENTITY_COLUMNS}
          FROM customer_auth_identities WHERE id = ?`).bind(identity.id),
      ]);
      const stored = firstBatchRow<IdentityRow>(results[1]);
      if (stored === null || stored.creation_idempotency_key !== key ||
          !same(identityOf(stored), identity)) return conflict();
      return results[0]?.meta.changes === 1 ? 'created' : 'replayed';
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
      const results = await db.batch([
        db.prepare(`INSERT OR IGNORE INTO customer_passwordless_challenges (
          id, identity_id, method, purpose, provider_reference, secret_digest,
          status, requested_at, expires_at, consumed_at, consumed_by_session_id,
          transition_idempotency_key, version
        ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        FROM customer_auth_identities identity
        JOIN customer_profiles profile ON profile.id = identity.customer_profile_id
        WHERE identity.id = ? AND identity.status = 'active'
          AND profile.status = 'active' AND profile.merged_into_profile_id IS NULL
          AND identity.contact_identity_hash = profile.email_identity_hash`).bind(
          value.id, value.identityId, value.method, value.purpose, value.providerReference,
          value.secretDigest, value.status, value.requestedAt, value.expiresAt,
          value.consumedAt, value.consumedBySessionId,
          value.transitionIdempotencyKey, value.version,
          value.identityId,
        ),
        db.prepare(`SELECT ${CHALLENGE_COLUMNS}
          FROM customer_passwordless_challenges challenge
          WHERE challenge.id = ? AND EXISTS (
            SELECT 1 FROM customer_auth_identities identity
            JOIN customer_profiles profile ON profile.id = identity.customer_profile_id
            WHERE identity.id = challenge.identity_id AND identity.status = 'active'
              AND profile.status = 'active' AND profile.merged_into_profile_id IS NULL
              AND identity.contact_identity_hash = profile.email_identity_hash
          )`).bind(value.id),
      ]);
      const storedRow = firstBatchRow<ChallengeRow>(results[1]);
      const stored = storedRow === null ? null : challengeOf(storedRow);
      if (stored === null || !same(stored, value)) return conflict();
      return results[0]?.meta.changes === 1 ? 'created' : 'replayed';
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

  async function activeSessionContextByTokenDigest(
    tokenDigest: string,
    at: string,
  ): Promise<ActiveCustomerSessionContext | null> {
    const now = instant(at);
    const row = await db.prepare(`SELECT ${QUALIFIED_SESSION_COLUMNS},
      identity.id AS auth_identity_id,
      identity.customer_profile_id AS auth_identity_profile_id,
      identity.contact_identity_hash AS auth_contact_identity_hash,
      identity.status AS auth_identity_status,
      identity.created_at AS auth_identity_created_at,
      identity.revoked_at AS auth_identity_revoked_at,
      identity.creation_idempotency_key AS auth_identity_creation_idempotency_key,
      family.status AS family_status,
      family.absolute_expires_at AS family_absolute_expires_at,
      family.version AS family_version,
      profile.id AS profile_id,
      profile.status AS profile_status,
      profile.email_identity_hash AS profile_email_identity_hash
      FROM customer_sessions session
      JOIN customer_session_families family ON family.id = session.family_id
        AND family.identity_id = session.identity_id
        AND family.customer_profile_id = session.customer_profile_id
        AND family.absolute_expires_at = session.absolute_expires_at
      JOIN customer_auth_identities identity ON identity.id = session.identity_id
        AND identity.customer_profile_id = session.customer_profile_id
      JOIN customer_profiles profile ON profile.id = session.customer_profile_id
      WHERE session.token_digest = ? AND session.status = 'active'
        AND family.status = 'active' AND identity.status = 'active'
        AND profile.status = 'active' AND profile.merged_into_profile_id IS NULL
        AND identity.contact_identity_hash = profile.email_identity_hash
        AND julianday(?) >= julianday(session.issued_at)
        AND julianday(?) < julianday(session.expires_at)
        AND julianday(?) < julianday(session.absolute_expires_at)`)
      .bind(digest(tokenDigest), now, now, now).first<ActiveSessionContextRow>();
    if (row === null) return null;
    const identity = identityOf({
      id: row.auth_identity_id,
      customer_profile_id: row.auth_identity_profile_id,
      contact_identity_hash: row.auth_contact_identity_hash,
      status: row.auth_identity_status,
      created_at: row.auth_identity_created_at,
      revoked_at: row.auth_identity_revoked_at,
      creation_idempotency_key: row.auth_identity_creation_idempotency_key,
    });
    return Object.freeze({
      session: sessionOf(row),
      identity,
      family: Object.freeze({
        id: row.family_id,
        status: row.family_status,
        absoluteExpiresAt: row.family_absolute_expires_at,
        version: row.family_version,
      }),
      profile: Object.freeze({
        id: row.profile_id,
        status: row.profile_status,
        emailIdentityHash: row.profile_email_identity_hash,
      }),
    });
  }

  async function sessionByTokenDigest(tokenDigest: string, at: string): Promise<CustomerSession | null> {
    return (await activeSessionContextByTokenDigest(tokenDigest, at))?.session ?? null;
  }

  async function family(familyId: string): Promise<FamilyRow | null> {
    return db.prepare(`SELECT ${FAMILY_COLUMNS}
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
    const sessionIssuedAt = Date.parse(instant(session.issuedAt));
    const challengeExpiresAt = Date.parse(instant(planned.expiresAt));
    const challengeConsumedAt = planned.consumedAt === null
      ? null
      : Date.parse(instant(planned.consumedAt));
    if (planned.status !== 'consumed' || challengeConsumedAt === null ||
        planned.transitionIdempotencyKey !== key ||
        planned.purpose !== 'sign_in' ||
        planned.version !== input.expectedVersion + 1 ||
        planned.consumedBySessionId !== session.id || session.status !== 'active' ||
        session.generation !== 1 || session.identityId !== planned.identityId ||
        sessionIssuedAt < challengeConsumedAt || sessionIssuedAt >= challengeExpiresAt ||
        session.scopes.length !== 1 || session.scopes[0] !== 'customer:self') return conflict();
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
      const results = await db.batch([
        db.prepare(`INSERT OR IGNORE INTO customer_session_families (
          id, identity_id, customer_profile_id, status, created_at,
          absolute_expires_at, revoked_at, revocation_reason_id,
          transition_idempotency_key, version
        ) SELECT ?, ?, ?, 'active', ?, ?, NULL, NULL, NULL, 1
        FROM customer_auth_identities identity
        JOIN customer_profiles profile ON profile.id = identity.customer_profile_id
        WHERE identity.id = ? AND identity.status = 'active'
          AND identity.customer_profile_id = ?
          AND profile.status = 'active' AND profile.merged_into_profile_id IS NULL
          AND identity.contact_identity_hash = profile.email_identity_hash`).bind(
          session.familyId, session.identityId, session.customerProfileId,
          session.issuedAt, session.absoluteExpiresAt,
          session.identityId, session.customerProfileId,
        ),
        guardedSessionInsert(db, session),
        db.prepare(`UPDATE customer_passwordless_challenges SET
          status = ?, consumed_at = ?, consumed_by_session_id = ?,
          transition_idempotency_key = ?, version = ? WHERE id = ?`).bind(
          planned.status, planned.consumedAt, planned.consumedBySessionId,
          key, planned.version, planned.id,
        ),
        db.prepare(`SELECT ${CHALLENGE_COLUMNS}
          FROM customer_passwordless_challenges WHERE id = ?`).bind(planned.id),
        db.prepare(`SELECT ${SESSION_COLUMNS}
          FROM customer_sessions WHERE id = ?`).bind(session.id),
      ]);
      const storedChallengeRow = firstBatchRow<ChallengeRow>(results[3]);
      const storedSessionRow = firstBatchRow<SessionRow>(results[4]);
      const storedChallenge = storedChallengeRow === null ? null : challengeOf(storedChallengeRow);
      const storedSession = storedSessionRow === null ? null : sessionOf(storedSessionRow);
      if (!same(storedChallenge, planned) || !same(storedSession, session)) return conflict();
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
        planned.consumedAt !== null || planned.consumedBySessionId !== null ||
        planned.transitionIdempotencyKey !== key ||
        planned.version !== input.expectedVersion + 1) return conflict();
    const stored = await challenge(planned.id);
    if (same(stored, planned)) return 'replayed';
    if (stored === null || !same(stored, pendingBefore(planned, input.expectedVersion))) {
      return conflict();
    }
    try {
      const results = await db.batch([
        db.prepare(`UPDATE customer_passwordless_challenges SET status = ?,
          transition_idempotency_key = ?, version = ? WHERE id = ?`).bind(
          planned.status, key, planned.version, planned.id,
        ),
        db.prepare(`SELECT ${CHALLENGE_COLUMNS}
          FROM customer_passwordless_challenges WHERE id = ?`).bind(planned.id),
      ]);
      const storedRow = firstBatchRow<ChallengeRow>(results[1]);
      const confirmed = storedRow === null ? null : challengeOf(storedRow);
      if (!same(confirmed, planned)) return conflict();
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
        previous.replacedBySessionId !== current.id || previous.revokedAt !== null ||
        previous.revocationReasonId !== null || previous.version < 2 ||
        current.status !== 'active' || current.rotatedFromSessionId !== previous.id ||
        current.replacedBySessionId !== null || current.revokedAt !== null ||
        current.revocationReasonId !== null || current.transitionIdempotencyKey !== null ||
        current.version !== 1 || current.id === previous.id ||
        current.tokenDigest === previous.tokenDigest ||
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
      const results = await db.batch([
        guardedSessionInsert(db, current),
        db.prepare(`UPDATE customer_sessions SET status = 'rotated',
          replaced_by_session_id = ?, transition_idempotency_key = ?, version = ?
          WHERE id = ?`).bind(current.id, key, previous.version, previous.id),
        db.prepare(`SELECT ${SESSION_COLUMNS}
          FROM customer_sessions WHERE id = ?`).bind(previous.id),
        db.prepare(`SELECT ${SESSION_COLUMNS}
          FROM customer_sessions WHERE id = ?`).bind(current.id),
      ]);
      const storedPreviousRow = firstBatchRow<SessionRow>(results[2]);
      const storedCurrentRow = firstBatchRow<SessionRow>(results[3]);
      const storedPreviousAfter = storedPreviousRow === null ? null : sessionOf(storedPreviousRow);
      const storedCurrentAfter = storedCurrentRow === null ? null : sessionOf(storedCurrentRow);
      if (!same(storedPreviousAfter, previous) || !same(storedCurrentAfter, current)) return conflict();
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
        planned.replacedBySessionId !== null || planned.revokedAt === null ||
        planned.revocationReasonId === null ||
        planned.version !== input.expectedVersion + 1) return conflict();
    const stored = await sessionById(planned.id);
    if (same(stored, planned)) return 'replayed';
    if (stored === null || !same(stored, activeBefore(planned, input.expectedVersion))) {
      return conflict();
    }
    try {
      const results = await db.batch([
        db.prepare(`UPDATE customer_sessions SET status = 'revoked',
          revoked_at = ?, revocation_reason_id = ?, transition_idempotency_key = ?,
          version = ? WHERE id = ?`).bind(
          planned.revokedAt, planned.revocationReasonId, key, planned.version, planned.id,
        ),
        db.prepare(`SELECT ${SESSION_COLUMNS}
          FROM customer_sessions WHERE id = ?`).bind(planned.id),
      ]);
      const storedRow = firstBatchRow<SessionRow>(results[1]);
      const confirmed = storedRow === null ? null : sessionOf(storedRow);
      if (!same(confirmed, planned)) return conflict();
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
        stored.revocation_reason_id === input.reasonId &&
        stored.version === input.expectedVersion + 1) {
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
        db.prepare(`SELECT ${FAMILY_COLUMNS}
          FROM customer_session_families WHERE id = ?`).bind(familyId),
      ]);
      const confirmed = firstBatchRow<FamilyRow>(results[2]);
      if (confirmed?.status !== 'revoked' || confirmed.transition_idempotency_key !== key ||
          confirmed.revoked_at !== input.occurredAt ||
          confirmed.revocation_reason_id !== input.reasonId ||
          confirmed.version !== input.expectedVersion + 1) return conflict();
      return results[1]?.meta.changes ?? 0;
    } catch {
      const replay = await family(familyId).catch(() => null);
      if (replay?.status === 'revoked' && replay.transition_idempotency_key === key &&
          replay.revoked_at === input.occurredAt &&
          replay.revocation_reason_id === input.reasonId &&
          replay.version === input.expectedVersion + 1) {
        return Number(await db.prepare(`SELECT count(*) AS total FROM customer_sessions
          WHERE family_id = ? AND status = 'revoked'
            AND transition_idempotency_key = ?`).bind(familyId, key).first<number>('total') ?? 0);
      }
      return conflict();
    }
  }

  return Object.freeze({
    identityByContactHash,
    identityById,
    createIdentity,
    challenge,
    createChallenge,
    consumeChallenge,
    transitionChallenge,
    activeSessionContextByTokenDigest,
    sessionByTokenDigest,
    rotateSession,
    revokeSession,
    revokeSessionFamily,
  });
}
