import type {
  ActiveCustomerSessionContext,
  CustomerAuthAuditCommand,
  CustomerAuthCapabilityReadiness,
  CustomerAuthCapabilityState,
  CustomerAuthenticationRepository,
  CustomerSessionFamilyRevocationTarget,
} from '../application/passwordless-auth-ports';
import {
  assertCustomerAuthIdentity,
  type CustomerAuthIdentity,
  type CustomerSession,
  type CustomerSessionScope,
  type PasswordlessChallenge,
} from '../domain/passwordless-auth';
import { createAuditDiff, serializeAuditDiff } from '../../../shared-kernel/audit';

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

type AuditRow = Readonly<{
  audit_id: string;
  occurred_at: string;
  actor_kind: 'customer' | 'system';
  actor_id: string;
  actor_label: null;
  action: string;
  entity_type: string;
  entity_id: string;
  entity_reference: null;
  correlation_id: string;
  source_event_id: null;
  diff_json: string;
  created_at: string;
}>;

type RevokeAllOperationRow = Readonly<{
  idempotency_key: string;
  target_kind: CustomerSessionFamilyRevocationTarget['kind'];
  target_id: string;
  occurred_at: string;
  reason_id: string;
  audit_id: string;
  audit_correlation_id: string;
  status: 'pending' | 'completed';
  families_revoked: number;
  sessions_revoked: number;
  created_at: string;
}>;

type CapabilityOperationRow = Readonly<{
  idempotency_key: string;
  capability_id: 'CUS-003';
  from_state: CustomerAuthCapabilityState;
  to_state: CustomerAuthCapabilityState;
  expected_version: number;
  resulting_version: number;
  occurred_at: string;
  audit_id: string;
  audit_correlation_id: string;
  status: 'pending' | 'completed';
  created_at: string;
}>;

type CapabilityStateRow = Readonly<{
  capability_id: 'CUS-003';
  state: CustomerAuthCapabilityState;
  version: number;
  transitioned_at: string;
  transition_idempotency_key: string;
  audit_id: string;
}>;

type ChallengeDeliveryRow = Readonly<{
  challenge_id: string;
  provider_reference: string;
  accepted_at: string;
  idempotency_key: string;
  created_at: string;
}>;

type SessionFamilySecurityRow = FamilyRow & Readonly<{
  session_status: CustomerSession['status'];
  auth_identity_id: string;
  auth_identity_profile_id: string;
  auth_contact_identity_hash: string;
  auth_identity_status: CustomerAuthIdentity['status'];
  profile_id: string;
  profile_status: 'active' | 'merged';
  profile_merged_into_profile_id: string | null;
  profile_email_identity_hash: string;
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
const OPERATION_KEY_PATTERN = /^[a-z][a-z0-9]*(?:[_:/-][a-z0-9]+)+$/u;
const REASON_ID_PATTERN = /^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)+$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const AUDIT_COLUMNS = `audit_id, occurred_at, actor_kind, actor_id, actor_label,
  action, entity_type, entity_id, entity_reference, correlation_id,
  source_event_id, diff_json, created_at`;
const AUDIT_MATCH_PREDICATE = `EXISTS (SELECT 1 FROM audit_log audit
  WHERE audit.audit_id = ? AND audit.occurred_at = ?
    AND audit.actor_kind = ? AND audit.actor_id = ? AND audit.actor_label IS ?
    AND audit.action = ? AND audit.entity_type = ? AND audit.entity_id = ?
    AND audit.entity_reference IS ? AND audit.correlation_id = ?
    AND audit.source_event_id IS ? AND audit.diff_json = ?
    AND audit.created_at = ?)`;
const REVOKE_ALL_OPERATION_COLUMNS = `idempotency_key, target_kind, target_id,
  occurred_at, reason_id, audit_id, audit_correlation_id, status,
  families_revoked, sessions_revoked, created_at`;
const REVOKE_ALL_OPERATION_MATCH_PREDICATE = `EXISTS (
  SELECT 1 FROM customer_auth_revoke_all_operations operation
  WHERE operation.idempotency_key = ? AND operation.target_kind = ?
    AND operation.target_id = ? AND operation.occurred_at = ?
    AND operation.reason_id = ? AND operation.audit_id = ?
    AND operation.audit_correlation_id = ? AND operation.status = 'pending'
    AND operation.created_at = ?
)`;
const CAPABILITY_OPERATION_COLUMNS = `idempotency_key, capability_id,
  from_state, to_state, expected_version, resulting_version, occurred_at,
  audit_id, audit_correlation_id, status, created_at`;
const CAPABILITY_STATE_COLUMNS = `capability_id, state, version,
  transitioned_at, transition_idempotency_key, audit_id`;
const CHALLENGE_DELIVERY_COLUMNS = `challenge_id, provider_reference,
  accepted_at, idempotency_key, created_at`;
const SESSION_GUARD_ACTOR_ID = 'customer_auth:session_guard';
const INCIDENT_RESPONSE_ACTOR_ID = 'customer_auth:incident_response';
const CAPABILITY_GATE_ACTOR_ID = 'customer_auth:capability_gate';

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

function operationKey(value: string): string {
  if (value.length < 8 || value.length > 160 || !OPERATION_KEY_PATTERN.test(value)) {
    return conflict();
  }
  return value;
}

function reasonId(value: string): string {
  if (value.length > 120 || !REASON_ID_PATTERN.test(value)) return conflict();
  return value;
}

function boundedOpaque(value: string, maximum: number): string {
  const normalized = opaque(value);
  if (normalized.length > maximum) return conflict();
  return normalized;
}

type SecurityAuditSpec = Readonly<{
  actorKind: AuditRow['actor_kind'];
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  before: Readonly<Record<string, unknown>>;
  after: Readonly<Record<string, unknown>>;
  allowedFields: readonly string[];
}>;

function securityAudit(
  command: CustomerAuthAuditCommand,
  expectedAt: string,
  spec: SecurityAuditSpec,
): AuditRow {
  const occurredAt = instant(command.occurredAt);
  if (occurredAt !== instant(expectedAt)) return conflict();
  const auditId = boundedOpaque(command.auditId, 80);
  const correlationId = boundedOpaque(command.correlationId, 160);
  const actorId = boundedOpaque(spec.actorId, 100);
  const entityId = boundedOpaque(spec.entityId, 100);
  if (!/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/u.test(spec.action) ||
      spec.action.length > 100 ||
      !/^[a-z][a-z0-9_]*$/u.test(spec.entityType) || spec.entityType.length > 80) {
    return conflict();
  }
  return Object.freeze({
    audit_id: auditId,
    occurred_at: occurredAt,
    actor_kind: spec.actorKind,
    actor_id: actorId,
    actor_label: null,
    action: spec.action,
    entity_type: spec.entityType,
    entity_id: entityId,
    entity_reference: null,
    correlation_id: correlationId,
    source_event_id: null,
    diff_json: serializeAuditDiff(createAuditDiff(
      spec.before,
      spec.after,
      spec.allowedFields,
    )),
    created_at: occurredAt,
  });
}

function auditValues(row: AuditRow): readonly (string | null)[] {
  return [
    row.audit_id, row.occurred_at, row.actor_kind, row.actor_id, row.actor_label,
    row.action, row.entity_type, row.entity_id, row.entity_reference,
    row.correlation_id, row.source_event_id, row.diff_json, row.created_at,
  ];
}

function auditStatement(
  db: D1Database,
  row: AuditRow,
  guardSql: string,
  guardValues: readonly (string | number | null)[],
): D1PreparedStatement {
  return db.prepare(`INSERT OR IGNORE INTO audit_log (${AUDIT_COLUMNS})
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${guardSql}`)
    .bind(...auditValues(row), ...guardValues);
}

function sameAudit(left: AuditRow | null, right: AuditRow): boolean {
  return left !== null && JSON.stringify(left) === JSON.stringify(right);
}

type RevokeAllOperationCommand = Readonly<{
  idempotencyKey: string;
  target: CustomerSessionFamilyRevocationTarget;
  occurredAt: string;
  reasonId: string;
  audit: AuditRow;
}>;

function revokeAllOperationMatchValues(
  command: RevokeAllOperationCommand,
): readonly string[] {
  return [
    command.idempotencyKey,
    command.target.kind,
    command.target.id,
    command.occurredAt,
    command.reasonId,
    command.audit.audit_id,
    command.audit.correlation_id,
    command.occurredAt,
  ];
}

function sameRevokeAllOperation(
  row: RevokeAllOperationRow,
  command: RevokeAllOperationCommand,
): boolean {
  return row.idempotency_key === command.idempotencyKey &&
    row.target_kind === command.target.kind && row.target_id === command.target.id &&
    row.occurred_at === command.occurredAt && row.reason_id === command.reasonId &&
    row.audit_id === command.audit.audit_id &&
    row.audit_correlation_id === command.audit.correlation_id &&
    row.status === 'completed' && row.created_at === command.occurredAt &&
    Number.isSafeInteger(row.families_revoked) && row.families_revoked >= 0 &&
    Number.isSafeInteger(row.sessions_revoked) && row.sessions_revoked >= 0;
}

type CapabilityOperationCommand = Readonly<{
  idempotencyKey: string;
  fromState: CustomerAuthCapabilityState;
  toState: CustomerAuthCapabilityState;
  expectedVersion: number;
  resultingVersion: number;
  occurredAt: string;
  audit: AuditRow;
}>;

function sameCapabilityOperation(
  row: CapabilityOperationRow,
  command: CapabilityOperationCommand,
): boolean {
  return row.idempotency_key === command.idempotencyKey &&
    row.capability_id === 'CUS-003' && row.from_state === command.fromState &&
    row.to_state === command.toState && row.expected_version === command.expectedVersion &&
    row.resulting_version === command.resultingVersion &&
    row.occurred_at === command.occurredAt && row.audit_id === command.audit.audit_id &&
    row.audit_correlation_id === command.audit.correlation_id &&
    row.status === 'completed' && row.created_at === command.occurredAt;
}

function sameCapabilityState(
  row: CapabilityStateRow | null,
  command: CapabilityOperationCommand,
): boolean {
  return row !== null && row.capability_id === 'CUS-003' &&
    row.state === command.toState && row.version === command.resultingVersion &&
    row.transitioned_at === command.occurredAt &&
    row.transition_idempotency_key === command.idempotencyKey &&
    row.audit_id === command.audit.audit_id;
}

function sameChallengeDelivery(
  row: ChallengeDeliveryRow | null,
  input: Readonly<{
    challengeId: string;
    providerReference: string;
    acceptedAt: string;
    idempotencyKey: string;
  }>,
): boolean {
  return row !== null && row.challenge_id === input.challengeId &&
    row.provider_reference === input.providerReference &&
    row.accepted_at === input.acceptedAt &&
    row.idempotency_key === input.idempotencyKey && row.created_at === input.acceptedAt;
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

function sameChallengeEmission(
  stored: PasswordlessChallenge,
  requested: PasswordlessChallenge,
): boolean {
  return requested.status === 'pending' && requested.version === 1 &&
    requested.consumedAt === null && requested.consumedBySessionId === null &&
    requested.transitionIdempotencyKey === null &&
    stored.id === requested.id && stored.identityId === requested.identityId &&
    stored.method === requested.method && stored.purpose === requested.purpose &&
    stored.providerReference === requested.providerReference &&
    stored.secretDigest === requested.secretDigest &&
    stored.requestedAt === requested.requestedAt && stored.expiresAt === requested.expiresAt;
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

function guardedSessionInsert(
  db: D1Database,
  session: CustomerSession,
  audit?: AuditRow,
): D1PreparedStatement {
  const auditGuard = audit === undefined ? '' : ` AND ${AUDIT_MATCH_PREDICATE}`;
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
    AND identity.contact_identity_hash = profile.email_identity_hash${auditGuard}`).bind(
    ...sessionValues(session),
    session.familyId,
    session.identityId,
    session.customerProfileId,
    session.absoluteExpiresAt,
    ...(audit === undefined ? [] : auditValues(audit)),
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
  async function auditById(auditId: string): Promise<AuditRow | null> {
    return db.prepare(`SELECT ${AUDIT_COLUMNS} FROM audit_log WHERE audit_id = ?`)
      .bind(boundedOpaque(auditId, 80)).first<AuditRow>();
  }

  async function revokeAllOperationByKey(
    idempotencyKeyValue: string,
  ): Promise<RevokeAllOperationRow | null> {
    return db.prepare(`SELECT ${REVOKE_ALL_OPERATION_COLUMNS}
      FROM customer_auth_revoke_all_operations WHERE idempotency_key = ?`)
      .bind(operationKey(idempotencyKeyValue)).first<RevokeAllOperationRow>();
  }

  async function capabilityOperationByKey(
    idempotencyKeyValue: string,
  ): Promise<CapabilityOperationRow | null> {
    return db.prepare(`SELECT ${CAPABILITY_OPERATION_COLUMNS}
      FROM customer_auth_capability_operations WHERE idempotency_key = ?`)
      .bind(operationKey(idempotencyKeyValue)).first<CapabilityOperationRow>();
  }

  async function capabilityStateRow(): Promise<CapabilityStateRow | null> {
    return db.prepare(`SELECT ${CAPABILITY_STATE_COLUMNS}
      FROM customer_auth_capability_state WHERE capability_id = 'CUS-003'`)
      .first<CapabilityStateRow>();
  }

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

  /**
   * 0040 revoca los pending anteriores en el AFTER INSERT. INSERT OR IGNORE no
   * dispara el trigger, así que un replay no puede superseder un intento nuevo.
   */
  async function createChallengeSupersedingPending(
    value: PasswordlessChallenge,
  ): Promise<'created' | 'replayed'> {
    try {
      return await createChallenge(value);
    } catch (error) {
      if (error instanceof CustomerAuthenticationConflictError) {
        const stored = await challenge(value.id).catch(() => null);
        if (stored !== null && sameChallengeEmission(stored, value)) return 'replayed';
      }
      throw error;
    }
  }

  async function confirmChallengeDelivery(input: Readonly<{
    challengeId: string;
    providerReference: string;
    acceptedAt: string;
    idempotencyKey: string;
  }>): Promise<'confirmed' | 'replayed'> {
    const command = Object.freeze({
      challengeId: opaque(input.challengeId),
      providerReference: opaque(input.providerReference),
      acceptedAt: instant(input.acceptedAt),
      idempotencyKey: operationKey(input.idempotencyKey),
    });
    const byKey = (): Promise<ChallengeDeliveryRow | null> =>
      db.prepare(`SELECT ${CHALLENGE_DELIVERY_COLUMNS}
        FROM customer_passwordless_challenge_deliveries WHERE idempotency_key = ?`)
        .bind(command.idempotencyKey).first<ChallengeDeliveryRow>();
    const byChallenge = (): Promise<ChallengeDeliveryRow | null> =>
      db.prepare(`SELECT ${CHALLENGE_DELIVERY_COLUMNS}
        FROM customer_passwordless_challenge_deliveries WHERE challenge_id = ?`)
        .bind(command.challengeId).first<ChallengeDeliveryRow>();
    const existing = await byKey();
    const existingChallenge = await byChallenge();
    if (existing !== null || existingChallenge !== null) {
      if (sameChallengeDelivery(existing, command) &&
          sameChallengeDelivery(existingChallenge, command)) return 'replayed';
      return conflict();
    }
    try {
      const results = await db.batch([
        db.prepare(`INSERT INTO customer_passwordless_challenge_deliveries (
          challenge_id, provider_reference, accepted_at, idempotency_key, created_at
        ) VALUES (?, ?, ?, ?, ?)`).bind(
          command.challengeId, command.providerReference, command.acceptedAt,
          command.idempotencyKey, command.acceptedAt,
        ),
        db.prepare(`SELECT ${CHALLENGE_DELIVERY_COLUMNS}
          FROM customer_passwordless_challenge_deliveries WHERE challenge_id = ?`)
          .bind(command.challengeId),
      ]);
      const stored = firstBatchRow<ChallengeDeliveryRow>(results[1]);
      if (!sameChallengeDelivery(stored, command)) return conflict();
      return 'confirmed';
    } catch {
      const replayByKey = await byKey().catch(() => null);
      const replayByChallenge = await byChallenge().catch(() => null);
      if (sameChallengeDelivery(replayByKey, command) &&
          sameChallengeDelivery(replayByChallenge, command)) return 'replayed';
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

  async function sessionFamilySecurityByTokenDigest(
    tokenDigest: string,
  ): Promise<SessionFamilySecurityRow | null> {
    return db.prepare(`SELECT
      family.id AS id, family.identity_id AS identity_id,
      family.customer_profile_id AS customer_profile_id,
      family.status AS status, family.created_at AS created_at,
      family.absolute_expires_at AS absolute_expires_at,
      family.revoked_at AS revoked_at,
      family.revocation_reason_id AS revocation_reason_id,
      family.transition_idempotency_key AS transition_idempotency_key,
      family.version AS version,
      session.status AS session_status,
      identity.id AS auth_identity_id,
      identity.customer_profile_id AS auth_identity_profile_id,
      identity.contact_identity_hash AS auth_contact_identity_hash,
      identity.status AS auth_identity_status,
      profile.id AS profile_id, profile.status AS profile_status,
      profile.merged_into_profile_id AS profile_merged_into_profile_id,
      profile.email_identity_hash AS profile_email_identity_hash
      FROM customer_sessions session
      JOIN customer_session_families family ON family.id = session.family_id
        AND family.identity_id = session.identity_id
        AND family.customer_profile_id = session.customer_profile_id
        AND family.absolute_expires_at = session.absolute_expires_at
      JOIN customer_auth_identities identity ON identity.id = family.identity_id
      JOIN customer_profiles profile ON profile.id = family.customer_profile_id
      WHERE session.token_digest = ?`).bind(digest(tokenDigest))
      .first<SessionFamilySecurityRow>();
  }

  function coherentSessionFamily(row: SessionFamilySecurityRow): boolean {
    return row.status === 'active' && row.auth_identity_status === 'active' &&
      row.auth_identity_id === row.identity_id &&
      row.auth_identity_profile_id === row.customer_profile_id &&
      row.profile_id === row.customer_profile_id && row.profile_status === 'active' &&
      row.profile_merged_into_profile_id === null &&
      row.auth_contact_identity_hash === row.profile_email_identity_hash;
  }

  async function consumeChallenge(input: Readonly<{
    challenge: PasswordlessChallenge;
    session: CustomerSession;
    expectedVersion: number;
    idempotencyKey: string;
    audit: CustomerAuthAuditCommand;
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
    const audit = securityAudit(input.audit, session.issuedAt, {
      actorKind: 'customer',
      actorId: session.identityId,
      action: 'auth.session_issued',
      entityType: 'customer_session',
      entityId: session.id,
      before: { status: null, generation: null },
      after: { status: 'active', generation: session.generation },
      allowedFields: ['status', 'generation'],
    });
    const stored = await challenge(planned.id);
    if (stored?.status === 'consumed') {
      const storedSession = await sessionById(session.id);
      if (same(stored, planned) && same(storedSession, session) &&
          sameAudit(await auditById(audit.audit_id), audit)) return 'replayed';
      return conflict();
    }
    if (stored === null || !same(stored, pendingBefore(planned, input.expectedVersion))) {
      return conflict();
    }
    const existingAudit = await auditById(audit.audit_id);
    if (existingAudit !== null && !sameAudit(existingAudit, audit)) return conflict();
    try {
      const results = await db.batch([
        auditStatement(db, audit, `EXISTS (
          SELECT 1 FROM customer_passwordless_challenges
          WHERE id = ? AND identity_id = ? AND status = 'pending' AND version = ?
        ) AND EXISTS (
          SELECT 1 FROM customer_passwordless_challenge_deliveries delivery
          WHERE delivery.challenge_id = ? AND delivery.provider_reference = ?
            AND julianday(delivery.accepted_at) <= julianday(?)
        ) AND (
          SELECT count(*) FROM customer_auth_throttle_events
          WHERE scope = 'challenge_failure' AND subject_digest = ?
            AND expires_at > ?
        ) < 5`, [
          planned.id, planned.identityId, input.expectedVersion,
          planned.id, planned.providerReference, planned.consumedAt,
          planned.secretDigest, session.issuedAt,
        ]),
        db.prepare(`INSERT INTO customer_session_families (
          id, identity_id, customer_profile_id, status, created_at,
          absolute_expires_at, revoked_at, revocation_reason_id,
          transition_idempotency_key, version
        ) SELECT ?, ?, ?, 'active', ?, ?, NULL, NULL, NULL, 1
        FROM customer_auth_identities identity
        JOIN customer_profiles profile ON profile.id = identity.customer_profile_id
        WHERE identity.id = ? AND identity.status = 'active'
          AND identity.customer_profile_id = ?
          AND profile.status = 'active' AND profile.merged_into_profile_id IS NULL
          AND identity.contact_identity_hash = profile.email_identity_hash
          AND ${AUDIT_MATCH_PREDICATE}`).bind(
          session.familyId, session.identityId, session.customerProfileId,
          session.issuedAt, session.absoluteExpiresAt,
          session.identityId, session.customerProfileId,
          ...auditValues(audit),
        ),
        guardedSessionInsert(db, session, audit),
        db.prepare(`UPDATE customer_passwordless_challenges SET
          status = ?, consumed_at = ?, consumed_by_session_id = ?,
          transition_idempotency_key = ?, version = ?
          WHERE id = ? AND status = 'pending' AND version = ?
            AND EXISTS (
              SELECT 1 FROM customer_passwordless_challenge_deliveries delivery
              WHERE delivery.challenge_id = customer_passwordless_challenges.id
                AND delivery.provider_reference =
                  customer_passwordless_challenges.provider_reference
                AND julianday(delivery.accepted_at) <= julianday(?)
            )
            AND ${AUDIT_MATCH_PREDICATE}`).bind(
          planned.status, planned.consumedAt, planned.consumedBySessionId,
          key, planned.version, planned.id, input.expectedVersion,
          planned.consumedAt,
          ...auditValues(audit),
        ),
        db.prepare(`SELECT ${CHALLENGE_COLUMNS}
          FROM customer_passwordless_challenges WHERE id = ?`).bind(planned.id),
        db.prepare(`SELECT ${SESSION_COLUMNS}
          FROM customer_sessions WHERE id = ?`).bind(session.id),
        db.prepare(`SELECT ${AUDIT_COLUMNS} FROM audit_log WHERE audit_id = ?`)
          .bind(audit.audit_id),
      ]);
      const storedChallengeRow = firstBatchRow<ChallengeRow>(results[4]);
      const storedSessionRow = firstBatchRow<SessionRow>(results[5]);
      const storedAudit = firstBatchRow<AuditRow>(results[6]);
      const storedChallenge = storedChallengeRow === null ? null : challengeOf(storedChallengeRow);
      const storedSession = storedSessionRow === null ? null : sessionOf(storedSessionRow);
      if (!same(storedChallenge, planned) || !same(storedSession, session) ||
          !sameAudit(storedAudit, audit)) return conflict();
      return 'consumed';
    } catch {
      const replayChallenge = await challenge(planned.id).catch(() => null);
      const replaySession = await sessionById(session.id).catch(() => null);
      const replayAudit = await auditById(audit.audit_id).catch(() => null);
      if (same(replayChallenge, planned) && same(replaySession, session) &&
          sameAudit(replayAudit, audit)) return 'replayed';
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
    audit: CustomerAuthAuditCommand;
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
    const audit = securityAudit(input.audit, current.issuedAt, {
      actorKind: 'customer',
      actorId: previous.identityId,
      action: 'auth.session_rotated',
      entityType: 'customer_session',
      entityId: previous.id,
      before: { status: 'active', generation: previous.generation },
      after: { status: 'rotated', generation: current.generation },
      allowedFields: ['status', 'generation'],
    });
    const storedPrevious = await sessionById(previous.id);
    if (same(storedPrevious, previous) && same(await sessionById(current.id), current) &&
        sameAudit(await auditById(audit.audit_id), audit)) {
      return 'replayed';
    }
    if (storedPrevious === null ||
        !same(storedPrevious, activeBefore(previous, previous.version - 1))) return conflict();
    const existingAudit = await auditById(audit.audit_id);
    if (existingAudit !== null && !sameAudit(existingAudit, audit)) return conflict();
    try {
      const results = await db.batch([
        auditStatement(db, audit, `EXISTS (
          SELECT 1 FROM customer_sessions
          WHERE id = ? AND status = 'active' AND version = ?
        )`, [previous.id, previous.version - 1]),
        guardedSessionInsert(db, current, audit),
        db.prepare(`UPDATE customer_sessions SET status = 'rotated',
          replaced_by_session_id = ?, transition_idempotency_key = ?, version = ?
          WHERE id = ? AND status = 'active' AND version = ?
            AND ${AUDIT_MATCH_PREDICATE}`).bind(
          current.id, key, previous.version, previous.id, previous.version - 1,
          ...auditValues(audit),
        ),
        db.prepare(`SELECT ${SESSION_COLUMNS}
          FROM customer_sessions WHERE id = ?`).bind(previous.id),
        db.prepare(`SELECT ${SESSION_COLUMNS}
          FROM customer_sessions WHERE id = ?`).bind(current.id),
        db.prepare(`SELECT ${AUDIT_COLUMNS} FROM audit_log WHERE audit_id = ?`)
          .bind(audit.audit_id),
      ]);
      const storedPreviousRow = firstBatchRow<SessionRow>(results[3]);
      const storedCurrentRow = firstBatchRow<SessionRow>(results[4]);
      const storedAudit = firstBatchRow<AuditRow>(results[5]);
      const storedPreviousAfter = storedPreviousRow === null ? null : sessionOf(storedPreviousRow);
      const storedCurrentAfter = storedCurrentRow === null ? null : sessionOf(storedCurrentRow);
      if (!same(storedPreviousAfter, previous) || !same(storedCurrentAfter, current) ||
          !sameAudit(storedAudit, audit)) return conflict();
      return 'rotated';
    } catch {
      if (same(await sessionById(previous.id).catch(() => null), previous) &&
          same(await sessionById(current.id).catch(() => null), current) &&
          sameAudit(await auditById(audit.audit_id).catch(() => null), audit)) return 'replayed';
      return conflict();
    }
  }

  async function revokeSession(input: Readonly<{
    session: CustomerSession;
    expectedVersion: number;
    idempotencyKey: string;
    audit: CustomerAuthAuditCommand;
  }>): Promise<'revoked' | 'replayed'> {
    const key = idempotencyKey(input.idempotencyKey);
    const planned = input.session;
    if (planned.status !== 'revoked' || planned.transitionIdempotencyKey !== key ||
        planned.replacedBySessionId !== null || planned.revokedAt === null ||
        planned.revocationReasonId === null ||
        planned.version !== input.expectedVersion + 1) return conflict();
    const audit = securityAudit(input.audit, planned.revokedAt, {
      actorKind: 'customer',
      actorId: planned.identityId,
      action: 'auth.session_revoked',
      entityType: 'customer_session',
      entityId: planned.id,
      before: { status: 'active', reason: null },
      after: { status: 'revoked', reason: reasonId(planned.revocationReasonId) },
      allowedFields: ['status', 'reason'],
    });
    const stored = await sessionById(planned.id);
    if (same(stored, planned) && sameAudit(await auditById(audit.audit_id), audit)) {
      return 'replayed';
    }
    if (stored === null || !same(stored, activeBefore(planned, input.expectedVersion))) {
      return conflict();
    }
    const existingAudit = await auditById(audit.audit_id);
    if (existingAudit !== null && !sameAudit(existingAudit, audit)) return conflict();
    try {
      const results = await db.batch([
        auditStatement(db, audit, `EXISTS (
          SELECT 1 FROM customer_sessions
          WHERE id = ? AND status = 'active' AND version = ?
        )`, [planned.id, input.expectedVersion]),
        db.prepare(`UPDATE customer_sessions SET status = 'revoked',
          revoked_at = ?, revocation_reason_id = ?, transition_idempotency_key = ?,
          version = ? WHERE id = ? AND status = 'active' AND version = ?
            AND ${AUDIT_MATCH_PREDICATE}`).bind(
          planned.revokedAt, planned.revocationReasonId, key, planned.version,
          planned.id, input.expectedVersion, ...auditValues(audit),
        ),
        db.prepare(`SELECT ${SESSION_COLUMNS}
          FROM customer_sessions WHERE id = ?`).bind(planned.id),
        db.prepare(`SELECT ${AUDIT_COLUMNS} FROM audit_log WHERE audit_id = ?`)
          .bind(audit.audit_id),
      ]);
      const storedRow = firstBatchRow<SessionRow>(results[2]);
      const storedAudit = firstBatchRow<AuditRow>(results[3]);
      const confirmed = storedRow === null ? null : sessionOf(storedRow);
      if (!same(confirmed, planned) || !sameAudit(storedAudit, audit)) return conflict();
      return 'revoked';
    } catch {
      if (same(await sessionById(planned.id).catch(() => null), planned) &&
          sameAudit(await auditById(audit.audit_id).catch(() => null), audit)) return 'replayed';
      return conflict();
    }
  }

  async function revokeSessionFamily(input: Readonly<{
    familyId: string;
    occurredAt: string;
    reasonId: string;
    expectedVersion: number;
    idempotencyKey: string;
    audit: CustomerAuthAuditCommand;
  }>): Promise<number> {
    const familyId = opaque(input.familyId);
    const key = idempotencyKey(input.idempotencyKey);
    const occurredAt = instant(input.occurredAt);
    const reason = reasonId(input.reasonId);
    const stored = await family(familyId);
    if (stored === null) return conflict();
    const audit = securityAudit(input.audit, occurredAt, {
      actorKind: 'customer',
      actorId: stored.identity_id,
      action: 'auth.family_revoked',
      entityType: 'customer_session_family',
      entityId: familyId,
      before: { status: 'active', reason: null },
      after: { status: 'revoked', reason },
      allowedFields: ['status', 'reason'],
    });
    if (stored?.status === 'revoked' && stored.transition_idempotency_key === key &&
        stored.revoked_at === occurredAt &&
        stored.revocation_reason_id === reason &&
        stored.version === input.expectedVersion + 1 &&
        sameAudit(await auditById(audit.audit_id), audit)) {
      return Number(await db.prepare(`SELECT count(*) AS total FROM customer_sessions
        WHERE family_id = ? AND status = 'revoked'
          AND transition_idempotency_key = ?`).bind(familyId, key).first<number>('total') ?? 0);
    }
    if (stored === null || stored.status !== 'active' ||
        stored.version !== input.expectedVersion) return conflict();
    const existingAudit = await auditById(audit.audit_id);
    if (existingAudit !== null && !sameAudit(existingAudit, audit)) return conflict();
    try {
      const results = await db.batch([
        auditStatement(db, audit, `EXISTS (
          SELECT 1 FROM customer_session_families
          WHERE id = ? AND status = 'active' AND version = ?
        )`, [familyId, input.expectedVersion]),
        db.prepare(`UPDATE customer_session_families SET status = 'revoked',
          revoked_at = ?, revocation_reason_id = ?, transition_idempotency_key = ?,
          version = ? WHERE id = ? AND status = 'active' AND version = ?
            AND ${AUDIT_MATCH_PREDICATE}`).bind(
          occurredAt, reason, key, input.expectedVersion + 1, familyId,
          input.expectedVersion, ...auditValues(audit),
        ),
        db.prepare(`UPDATE customer_sessions SET status = 'revoked', revoked_at = ?,
          revocation_reason_id = ?, transition_idempotency_key = ?, version = version + 1
          WHERE family_id = ? AND status = 'active'
            AND ${AUDIT_MATCH_PREDICATE}`).bind(
          occurredAt, reason, key, familyId, ...auditValues(audit),
        ),
        db.prepare(`SELECT ${FAMILY_COLUMNS}
          FROM customer_session_families WHERE id = ?`).bind(familyId),
        db.prepare(`SELECT ${AUDIT_COLUMNS} FROM audit_log WHERE audit_id = ?`)
          .bind(audit.audit_id),
      ]);
      const confirmed = firstBatchRow<FamilyRow>(results[3]);
      const storedAudit = firstBatchRow<AuditRow>(results[4]);
      if (confirmed?.status !== 'revoked' || confirmed.transition_idempotency_key !== key ||
          confirmed.revoked_at !== occurredAt ||
          confirmed.revocation_reason_id !== reason ||
          confirmed.version !== input.expectedVersion + 1 ||
          !sameAudit(storedAudit, audit)) return conflict();
      return results[2]?.meta.changes ?? 0;
    } catch {
      const replay = await family(familyId).catch(() => null);
      if (replay?.status === 'revoked' && replay.transition_idempotency_key === key &&
          replay.revoked_at === occurredAt &&
          replay.revocation_reason_id === reason &&
          replay.version === input.expectedVersion + 1 &&
          sameAudit(await auditById(audit.audit_id).catch(() => null), audit)) {
        return Number(await db.prepare(`SELECT count(*) AS total FROM customer_sessions
          WHERE family_id = ? AND status = 'revoked'
            AND transition_idempotency_key = ?`).bind(familyId, key).first<number>('total') ?? 0);
      }
      return conflict();
    }
  }

  async function revokeIncoherentSessionFamilyByTokenDigest(input: Readonly<{
    tokenDigest: string;
    occurredAt: string;
    reasonId: string;
    idempotencyKey: string;
    audit: CustomerAuthAuditCommand;
  }>): Promise<'revoked' | 'replayed' | 'coherent' | 'not_found'> {
    const tokenDigest = digest(input.tokenDigest);
    const occurredAt = instant(input.occurredAt);
    const reason = reasonId(input.reasonId);
    const key = idempotencyKey(input.idempotencyKey);
    const stored = await sessionFamilySecurityByTokenDigest(tokenDigest);
    if (stored === null) return 'not_found';
    if (coherentSessionFamily(stored)) return 'coherent';
    const audit = securityAudit(input.audit, occurredAt, {
      actorKind: 'system',
      actorId: SESSION_GUARD_ACTOR_ID,
      action: 'auth.family_revoked',
      entityType: 'customer_session_family',
      entityId: stored.id,
      before: { status: 'active', reason: null },
      after: { status: 'revoked', reason },
      allowedFields: ['status', 'reason'],
    });
    if (stored.status === 'revoked' && stored.transition_idempotency_key === key &&
        stored.revoked_at === occurredAt && stored.revocation_reason_id === reason &&
        sameAudit(await auditById(audit.audit_id), audit)) return 'replayed';
    if (stored.status !== 'active') return 'not_found';
    const existingAudit = await auditById(audit.audit_id);
    if (existingAudit !== null && !sameAudit(existingAudit, audit)) return conflict();
    const incoherentGuard = `EXISTS (
      SELECT 1 FROM customer_sessions guarded_session
      JOIN customer_session_families guarded_family
        ON guarded_family.id = guarded_session.family_id
        AND guarded_family.identity_id = guarded_session.identity_id
        AND guarded_family.customer_profile_id = guarded_session.customer_profile_id
        AND guarded_family.absolute_expires_at = guarded_session.absolute_expires_at
      JOIN customer_auth_identities guarded_identity
        ON guarded_identity.id = guarded_family.identity_id
      JOIN customer_profiles guarded_profile
        ON guarded_profile.id = guarded_family.customer_profile_id
      WHERE guarded_session.token_digest = ? AND guarded_family.id = ?
        AND guarded_family.status = 'active' AND guarded_family.version = ?
        AND NOT (
          guarded_identity.status = 'active'
          AND guarded_identity.customer_profile_id = guarded_family.customer_profile_id
          AND guarded_profile.status = 'active'
          AND guarded_profile.merged_into_profile_id IS NULL
          AND guarded_identity.contact_identity_hash = guarded_profile.email_identity_hash
        )
    )`;
    try {
      const results = await db.batch([
        auditStatement(db, audit, incoherentGuard,
          [tokenDigest, stored.id, stored.version]),
        db.prepare(`UPDATE customer_session_families SET status = 'revoked',
          revoked_at = ?, revocation_reason_id = ?, transition_idempotency_key = ?,
          version = version + 1
          WHERE id = ? AND status = 'active' AND version = ?
            AND ${AUDIT_MATCH_PREDICATE}`).bind(
          occurredAt, reason, key, stored.id, stored.version, ...auditValues(audit),
        ),
        db.prepare(`UPDATE customer_sessions SET status = 'revoked',
          revoked_at = ?, revocation_reason_id = ?, transition_idempotency_key = ?,
          version = version + 1 WHERE family_id = ? AND status = 'active'
            AND ${AUDIT_MATCH_PREDICATE}`).bind(
          occurredAt, reason, key, stored.id, ...auditValues(audit),
        ),
        db.prepare(`SELECT ${FAMILY_COLUMNS}
          FROM customer_session_families WHERE id = ?`).bind(stored.id),
        db.prepare(`SELECT ${AUDIT_COLUMNS} FROM audit_log WHERE audit_id = ?`)
          .bind(audit.audit_id),
      ]);
      const confirmed = firstBatchRow<FamilyRow>(results[3]);
      const storedAudit = firstBatchRow<AuditRow>(results[4]);
      if (confirmed?.status === 'revoked' &&
          confirmed.transition_idempotency_key === key &&
          confirmed.revoked_at === occurredAt &&
          confirmed.revocation_reason_id === reason &&
          confirmed.version === stored.version + 1 && sameAudit(storedAudit, audit)) {
        return 'revoked';
      }
      const current = await sessionFamilySecurityByTokenDigest(tokenDigest);
      if (current === null || current.status !== 'active') return 'not_found';
      if (coherentSessionFamily(current)) return 'coherent';
      return conflict();
    } catch {
      const replay = await sessionFamilySecurityByTokenDigest(tokenDigest).catch(() => null);
      if (replay?.status === 'revoked' && replay.transition_idempotency_key === key &&
          replay.revoked_at === occurredAt && replay.revocation_reason_id === reason &&
          sameAudit(await auditById(audit.audit_id).catch(() => null), audit)) {
        return 'replayed';
      }
      return conflict();
    }
  }

  function targetSql(target: CustomerSessionFamilyRevocationTarget, alias: string): string {
    return target.kind === 'identity'
      ? `${alias}.identity_id = ?`
      : `${alias}.customer_profile_id = ?`;
  }

  async function revokeAllSessionFamilies(input: Readonly<{
    target: CustomerSessionFamilyRevocationTarget;
    occurredAt: string;
    reasonId: string;
    idempotencyKey: string;
    audit: CustomerAuthAuditCommand;
  }>): Promise<Readonly<{
    outcome: 'revoked' | 'replayed';
    familiesRevoked: number;
    sessionsRevoked: number;
  }>> {
    const target = Object.freeze({
      kind: input.target.kind,
      id: opaque(input.target.id),
    }) as CustomerSessionFamilyRevocationTarget;
    const occurredAt = instant(input.occurredAt);
    const reason = reasonId(input.reasonId);
    const key = operationKey(input.idempotencyKey);
    const audit = securityAudit(input.audit, occurredAt, {
      actorKind: 'system',
      actorId: INCIDENT_RESPONSE_ACTOR_ID,
      action: 'auth.sessions_revoked_all',
      entityType: target.kind === 'identity' ? 'customer_auth_identity' : 'customer_profile',
      entityId: target.id,
      before: { status: 'active', reason: null },
      after: { status: 'revoked', reason },
      allowedFields: ['status', 'reason'],
    });
    const operation = Object.freeze({
      idempotencyKey: key,
      target,
      occurredAt,
      reasonId: reason,
      audit,
    });
    const existingOperation = await revokeAllOperationByKey(key);
    if (existingOperation !== null) {
      if (!sameRevokeAllOperation(existingOperation, operation) ||
          !sameAudit(await auditById(audit.audit_id), audit)) return conflict();
      return Object.freeze({
        outcome: 'replayed',
        familiesRevoked: existingOperation.families_revoked,
        sessionsRevoked: existingOperation.sessions_revoked,
      });
    }
    const existingAudit = await auditById(audit.audit_id);
    if (existingAudit !== null) return conflict();
    const targetExists = target.kind === 'identity'
      ? `EXISTS (SELECT 1 FROM customer_auth_identities WHERE id = ?)`
      : `EXISTS (SELECT 1 FROM customer_profiles WHERE id = ?)`;
    try {
      const results = await db.batch([
        auditStatement(db, audit, `${targetExists} AND NOT EXISTS (
          SELECT 1 FROM customer_auth_revoke_all_operations
          WHERE idempotency_key = ?
        )`, [target.id, key]),
        db.prepare(`INSERT OR IGNORE INTO customer_auth_revoke_all_operations (
          idempotency_key, target_kind, target_id, occurred_at, reason_id,
          audit_id, audit_correlation_id, status, families_revoked,
          sessions_revoked, created_at
        ) SELECT ?, ?, ?, ?, ?, ?, ?, 'pending',
          (SELECT count(*) FROM customer_session_families family
            WHERE ${targetSql(target, 'family')} AND status = 'active'),
          (SELECT count(*) FROM customer_sessions session
            WHERE ${targetSql(target, 'session')} AND status = 'active'), ?
        WHERE changes() = 1 AND ${AUDIT_MATCH_PREDICATE}`).bind(
          key, target.kind, target.id, occurredAt, reason,
          audit.audit_id, audit.correlation_id,
          target.id, target.id, occurredAt, ...auditValues(audit),
        ),
        db.prepare(`UPDATE customer_session_families AS family
          SET status = 'revoked', revoked_at = ?, revocation_reason_id = ?,
            transition_idempotency_key = ? || ':' || printf('%016x', rowid),
            version = version + 1
          WHERE ${targetSql(target, 'family')} AND status = 'active'
            AND ${REVOKE_ALL_OPERATION_MATCH_PREDICATE}
            AND ${AUDIT_MATCH_PREDICATE}`).bind(
          occurredAt, reason, key, target.id,
          ...revokeAllOperationMatchValues(operation), ...auditValues(audit),
        ),
        db.prepare(`UPDATE customer_sessions AS session
          SET status = 'revoked', revoked_at = ?, revocation_reason_id = ?,
            transition_idempotency_key = ?, version = version + 1
          WHERE ${targetSql(target, 'session')} AND status = 'active'
            AND ${REVOKE_ALL_OPERATION_MATCH_PREDICATE}
            AND ${AUDIT_MATCH_PREDICATE}`).bind(
          occurredAt, reason, key, target.id,
          ...revokeAllOperationMatchValues(operation), ...auditValues(audit),
        ),
        db.prepare(`UPDATE customer_auth_revoke_all_operations
          SET status = 'completed'
          WHERE idempotency_key = ? AND status = 'pending'
            AND ${REVOKE_ALL_OPERATION_MATCH_PREDICATE}
            AND ${AUDIT_MATCH_PREDICATE}`).bind(
          key, ...revokeAllOperationMatchValues(operation), ...auditValues(audit),
        ),
        db.prepare(`SELECT ${REVOKE_ALL_OPERATION_COLUMNS}
          FROM customer_auth_revoke_all_operations WHERE idempotency_key = ?`)
          .bind(key),
        db.prepare(`SELECT ${AUDIT_COLUMNS} FROM audit_log WHERE audit_id = ?`)
          .bind(audit.audit_id),
      ]);
      const storedOperation = firstBatchRow<RevokeAllOperationRow>(results[5]);
      const storedAudit = firstBatchRow<AuditRow>(results[6]);
      if (storedOperation === null || !sameRevokeAllOperation(storedOperation, operation) ||
          !sameAudit(storedAudit, audit)) return conflict();
      return Object.freeze({
        outcome: results[1]?.meta.changes === 1 ? 'revoked' : 'replayed',
        familiesRevoked: storedOperation.families_revoked,
        sessionsRevoked: storedOperation.sessions_revoked,
      });
    } catch {
      const replayOperation = await revokeAllOperationByKey(key).catch(() => null);
      if (replayOperation !== null && sameRevokeAllOperation(replayOperation, operation) &&
          sameAudit(await auditById(audit.audit_id).catch(() => null), audit)) {
        return Object.freeze({
          outcome: 'replayed',
          familiesRevoked: replayOperation.families_revoked,
          sessionsRevoked: replayOperation.sessions_revoked,
        });
      }
      return conflict();
    }
  }

  async function transitionCustomerAuthCapability(input: Readonly<{
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
  }>> {
    const fromState = input.fromState;
    const toState = input.toState;
    if (!['installed', 'active'].includes(fromState) ||
        !['installed', 'active'].includes(toState) || fromState === toState ||
        !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0 ||
        (input.expectedVersion === 0 &&
          (fromState !== 'installed' || toState !== 'active'))) return conflict();
    const expectedVersion = input.expectedVersion;
    const resultingVersion = expectedVersion + 1;
    const occurredAt = instant(input.occurredAt);
    const key = operationKey(input.idempotencyKey);
    const audit = securityAudit(input.audit, occurredAt, {
      actorKind: 'system',
      actorId: CAPABILITY_GATE_ACTOR_ID,
      action: 'auth.capability_transitioned',
      entityType: 'platform_capability',
      entityId: 'capability:cus-003',
      before: { state: fromState, version: expectedVersion },
      after: { state: toState, version: resultingVersion },
      allowedFields: ['state', 'version'],
    });
    const operation = Object.freeze({
      idempotencyKey: key,
      fromState,
      toState,
      expectedVersion,
      resultingVersion,
      occurredAt,
      audit,
    });
    const replayResult = (): Readonly<{
      outcome: 'replayed'; state: CustomerAuthCapabilityState; version: number;
    }> => Object.freeze({ outcome: 'replayed', state: toState, version: resultingVersion });
    const existingOperation = await capabilityOperationByKey(key);
    if (existingOperation !== null) {
      if (!sameCapabilityOperation(existingOperation, operation) ||
          !sameAudit(await auditById(audit.audit_id), audit)) return conflict();
      return replayResult();
    }
    if (await auditById(audit.audit_id) !== null) return conflict();
    try {
      const stateTransition = expectedVersion === 0
        ? db.prepare(`INSERT INTO customer_auth_capability_state (
            capability_id, state, version, transitioned_at,
            transition_idempotency_key, audit_id
          ) VALUES ('CUS-003', ?, ?, ?, ?, ?)`).bind(
            toState, resultingVersion, occurredAt, key, audit.audit_id,
          )
        : db.prepare(`UPDATE customer_auth_capability_state SET
            state = ?, version = ?, transitioned_at = ?,
            transition_idempotency_key = ?, audit_id = ?
          WHERE capability_id = 'CUS-003' AND state = ? AND version = ?`).bind(
            toState, resultingVersion, occurredAt, key, audit.audit_id,
            fromState, expectedVersion,
          );
      const results = await db.batch([
        db.prepare(`INSERT INTO audit_log (${AUDIT_COLUMNS})
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(...auditValues(audit)),
        db.prepare(`INSERT INTO customer_auth_capability_operations (
          idempotency_key, capability_id, from_state, to_state,
          expected_version, resulting_version, occurred_at, audit_id,
          audit_correlation_id, status, created_at
        ) VALUES (?, 'CUS-003', ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`).bind(
          key, fromState, toState, expectedVersion, resultingVersion,
          occurredAt, audit.audit_id, audit.correlation_id, occurredAt,
        ),
        stateTransition,
        db.prepare(`UPDATE customer_auth_capability_operations
          SET status = 'completed'
          WHERE idempotency_key = ? AND status = 'pending'`).bind(key),
        db.prepare(`SELECT ${CAPABILITY_OPERATION_COLUMNS}
          FROM customer_auth_capability_operations WHERE idempotency_key = ?`)
          .bind(key),
        db.prepare(`SELECT ${AUDIT_COLUMNS} FROM audit_log WHERE audit_id = ?`)
          .bind(audit.audit_id),
        db.prepare(`SELECT ${CAPABILITY_STATE_COLUMNS}
          FROM customer_auth_capability_state WHERE capability_id = 'CUS-003'`),
      ]);
      const storedOperation = firstBatchRow<CapabilityOperationRow>(results[4]);
      const storedAudit = firstBatchRow<AuditRow>(results[5]);
      const storedState = firstBatchRow<CapabilityStateRow>(results[6]);
      if (storedOperation === null || !sameCapabilityOperation(storedOperation, operation) ||
          !sameAudit(storedAudit, audit) || !sameCapabilityState(storedState, operation)) {
        return conflict();
      }
      return Object.freeze({
        outcome: 'transitioned',
        state: toState,
        version: resultingVersion,
      });
    } catch {
      const replayOperation = await capabilityOperationByKey(key).catch(() => null);
      if (replayOperation !== null && sameCapabilityOperation(replayOperation, operation) &&
          sameAudit(await auditById(audit.audit_id).catch(() => null), audit)) {
        return replayResult();
      }
      return conflict();
    }
  }

  async function customerAuthCapabilityReadiness(): Promise<CustomerAuthCapabilityReadiness> {
    try {
      const state = await capabilityStateRow();
      const summary = await db.prepare(`SELECT
        count(*) AS total,
        coalesce(min(resulting_version), 0) AS minimum_version,
        coalesce(max(resulting_version), 0) AS maximum_version,
        count(DISTINCT resulting_version) AS distinct_versions
      FROM customer_auth_capability_operations`).first<Readonly<{
        total: number;
        minimum_version: number;
        maximum_version: number;
        distinct_versions: number;
      }>>();
      const invalid = await db.prepare(`SELECT count(*) AS value
        FROM customer_auth_capability_operations operation
        LEFT JOIN customer_auth_capability_operations previous
          ON previous.capability_id = operation.capability_id
          AND previous.resulting_version = operation.expected_version
        LEFT JOIN audit_log audit ON audit.audit_id = operation.audit_id
        WHERE operation.status <> 'completed'
          OR (operation.resulting_version = 1 AND NOT (
            operation.expected_version = 0
            AND operation.from_state = 'installed'
            AND operation.to_state = 'active'
          ))
          OR (operation.resulting_version > 1 AND NOT (
            previous.status = 'completed'
            AND previous.to_state = operation.from_state
          ))
          OR audit.audit_id IS NULL
          OR audit.occurred_at <> operation.occurred_at
          OR audit.actor_kind <> 'system'
          OR audit.actor_id <> 'customer_auth:capability_gate'
          OR audit.actor_label IS NOT NULL
          OR audit.action <> 'auth.capability_transitioned'
          OR audit.entity_type <> 'platform_capability'
          OR audit.entity_id <> 'capability:cus-003'
          OR audit.entity_reference IS NOT NULL
          OR audit.correlation_id <> operation.audit_correlation_id
          OR audit.source_event_id IS NOT NULL
          OR audit.diff_json <> '{"state":{"before":"' || operation.from_state
            || '","after":"' || operation.to_state || '"},"version":{"before":'
            || operation.expected_version || ',"after":' || operation.resulting_version || '}}'
          OR audit.created_at <> operation.occurred_at`).first<number>('value');
      if (summary === null) return conflict();
      const total = Number(summary.total);
      if (state === null) {
        if (total !== 0 || Number(invalid) !== 0) return conflict();
        return Object.freeze({
          capabilityId: 'CUS-003',
          state: 'installed',
          version: 0,
          readyForActiveRuntime: false,
        });
      }
      const latest = await capabilityOperationByKey(state.transition_idempotency_key);
      if (latest === null || latest.status !== 'completed' ||
          latest.to_state !== state.state || latest.resulting_version !== state.version ||
          latest.occurred_at !== state.transitioned_at || latest.audit_id !== state.audit_id ||
          Number(invalid) !== 0 || total !== state.version ||
          Number(summary.minimum_version) !== 1 ||
          Number(summary.maximum_version) !== state.version ||
          Number(summary.distinct_versions) !== total) return conflict();
      return Object.freeze({
        capabilityId: 'CUS-003',
        state: state.state,
        version: state.version,
        readyForActiveRuntime: state.state === 'active',
      });
    } catch (error) {
      if (error instanceof CustomerAuthenticationConflictError) throw error;
      return conflict();
    }
  }

  return Object.freeze({
    identityByContactHash,
    identityById,
    createIdentity,
    challenge,
    createChallenge,
    createChallengeSupersedingPending,
    confirmChallengeDelivery,
    consumeChallenge,
    transitionChallenge,
    activeSessionContextByTokenDigest,
    sessionByTokenDigest,
    rotateSession,
    revokeSession,
    revokeSessionFamily,
    revokeIncoherentSessionFamilyByTokenDigest,
    revokeAllSessionFamilies,
    transitionCustomerAuthCapability,
    customerAuthCapabilityReadiness,
  });
}
