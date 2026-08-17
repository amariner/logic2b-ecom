import {
  assertCustomerProfile,
  createCustomerAddressRevision,
  createCustomerProfile,
  resolveCustomerIdentity,
  type CustomerAddressRevision,
  type CustomerIdentityResolution,
  type CustomerProfile,
  type CustomerProfileMerge,
} from '../domain/customer-profile';
import type {
  CustomerProfileRepository,
  ResolveOrCreateCustomerProfileInput,
} from '../application/customer-profile-repository';

type ProfileRow = Readonly<{
  id: string;
  primary_email: string;
  email_identity_hash: string;
  status: CustomerProfile['status'];
  merged_into_profile_id: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}>;

type MergeRow = Readonly<{
  idempotency_key: string;
  source_profile_id: string;
  target_profile_id: string;
  source_version_before: number;
  target_version_before: number;
  reviewed_by: string;
  reviewed_at: string;
}>;

type AppendAddressInput = Parameters<CustomerProfileRepository['appendAddressRevision']>[0];
type AssociateOrderInput = Parameters<CustomerProfileRepository['associateOrder']>[0];
type MergeInput = Parameters<CustomerProfileRepository['merge']>[0];

const PROFILE_COLUMNS = `id, primary_email, email_identity_hash, status,
  merged_into_profile_id, version, created_at, updated_at`;

export class CustomerProfileConflictError extends Error {
  readonly code = 'customer_profile_conflict';

  constructor() {
    super('La operación del perfil no pudo confirmarse.');
    this.name = 'CustomerProfileConflictError';
  }
}

function profileOf(row: ProfileRow): CustomerProfile {
  const profile: CustomerProfile = Object.freeze({
    id: row.id,
    primaryEmail: row.primary_email,
    emailIdentityHash: row.email_identity_hash,
    status: row.status,
    mergedIntoProfileId: row.merged_into_profile_id,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
  assertCustomerProfile(profile);
  return profile;
}

function conflict(): never {
  throw new CustomerProfileConflictError();
}

function validateIdempotencyKey(value: string): void {
  if (value.trim() !== value || value.length < 8 || value.length > 200 ||
      /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new RangeError('idempotencyKey inválida.');
  }
}

function validateInstant(value: string): void {
  if (!value.endsWith('Z') || !Number.isFinite(Date.parse(value))) {
    throw new RangeError('at debe ser una fecha ISO-8601 UTC.');
  }
}

/** Adaptador interno: ningún método expone búsquedas o errores con email/hash. */
export function createD1CustomerProfileRepository(db: D1Database): CustomerProfileRepository {
  async function findById(profileId: string): Promise<CustomerProfile | null> {
    const row = await db.prepare(`SELECT ${PROFILE_COLUMNS}
      FROM customer_profiles WHERE id = ?`).bind(profileId).first<ProfileRow>();
    return row === null ? null : profileOf(row);
  }

  async function findByIdentityHash(emailIdentityHash: string): Promise<CustomerProfile | null> {
    if (!/^[a-f0-9]{64}$/u.test(emailIdentityHash)) return null;
    const row = await db.prepare(`SELECT ${PROFILE_COLUMNS}
      FROM customer_profiles WHERE email_identity_hash = ?`).bind(emailIdentityHash).first<ProfileRow>();
    return row === null ? null : profileOf(row);
  }

  async function resolveOrCreate(
    input: ResolveOrCreateCustomerProfileInput,
  ): Promise<CustomerIdentityResolution> {
    const proposed = createCustomerProfile({
      id: input.profileId,
      email: input.email,
      emailIdentityHash: input.emailIdentityHash,
      at: input.at,
    });
    const creation = resolveCustomerIdentity({
      email: proposed.primaryEmail,
      identityHash: proposed.emailIdentityHash,
      candidates: [],
    });
    try {
      const results = await db.batch<ProfileRow>([
        db.prepare(`INSERT OR IGNORE INTO customer_profiles (
          id, primary_email, email_identity_hash, status,
          merged_into_profile_id, version, created_at, updated_at
        ) VALUES (?, ?, ?, 'active', NULL, 1, ?, ?)`).bind(
          proposed.id,
          proposed.primaryEmail,
          proposed.emailIdentityHash,
          proposed.createdAt,
          proposed.updatedAt,
        ),
        db.prepare(`SELECT ${PROFILE_COLUMNS}
          FROM customer_profiles WHERE email_identity_hash = ?`).bind(proposed.emailIdentityHash),
      ]);
      const inserted = results[0]?.meta.changes === 1;
      const rows = results[1]?.results ?? [];
      if (rows.length !== 1) return conflict();
      if (inserted) return creation;
      return resolveCustomerIdentity({
        email: proposed.primaryEmail,
        identityHash: proposed.emailIdentityHash,
        candidates: rows.map(profileOf),
      });
    } catch (error) {
      if (error instanceof CustomerProfileConflictError) throw error;
      return conflict();
    }
  }

  return Object.freeze({
    findById,
    findByIdentityHash,
    resolveOrCreate,

    async appendAddressRevision(input: AppendAddressInput): Promise<CustomerAddressRevision> {
      if (input.expectedRevision !== null &&
          (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1)) {
        throw new RangeError('expectedRevision inválida.');
      }
      const normalized = createCustomerAddressRevision({
        addressId: input.addressId,
        customerProfileId: input.customerProfileId,
        data: input.data,
        at: input.at,
      });
      const revision = input.expectedRevision === null ? 1 : input.expectedRevision + 1;
      try {
        const result = await db.prepare(`INSERT INTO customer_address_revisions (
          address_id, customer_profile_id, revision, recipient_name, phone,
          street, city, region, postal_code, country_code, valid_from, valid_to
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`).bind(
          normalized.addressId,
          normalized.customerProfileId,
          revision,
          normalized.data.recipientName,
          normalized.data.phone,
          normalized.data.street,
          normalized.data.city,
          normalized.data.region,
          normalized.data.postalCode,
          normalized.data.countryCode,
          normalized.validFrom,
        ).run();
        if (result.meta.changes !== 1) return conflict();
      } catch {
        return conflict();
      }
      return Object.freeze({ ...normalized, revision });
    },

    async associateOrder(input: AssociateOrderInput) {
      if (!Number.isSafeInteger(input.orderId) || input.orderId < 1) {
        throw new RangeError('orderId inválido.');
      }
      validateInstant(input.at);
      const profileId = input.association.customerProfileId;
      if ((profileId === null && input.expectedCustomerProfileId !== null) ||
          (profileId !== null && input.expectedCustomerProfileId !== null &&
            input.expectedCustomerProfileId !== profileId)) {
        return conflict();
      }
      try {
        const result = await db.prepare(`UPDATE orders
          SET customer_profile_id = ?, updated_at = ?
          WHERE id = ? AND customer_profile_id IS ?
            AND julianday(?) >= julianday(updated_at)
            AND (? IS NULL OR EXISTS (
              SELECT 1 FROM customer_profiles profile
              WHERE profile.id = ? AND profile.status = 'active'
            ))`).bind(
          profileId,
          input.at,
          input.orderId,
          input.expectedCustomerProfileId,
          input.at,
          profileId,
          profileId,
        ).run();
        if (result.meta.changes !== 1) return conflict();
      } catch {
        return conflict();
      }
      return input.association;
    },

    async merge(input: MergeInput): Promise<CustomerProfileMerge> {
      validateIdempotencyKey(input.idempotencyKey);
      validateInstant(input.at);
      try {
        const results = await db.batch<ProfileRow | MergeRow>([
          db.prepare(`INSERT INTO customer_profile_merges (
            idempotency_key, source_profile_id, target_profile_id,
            source_version_before, target_version_before, reviewed_by, reviewed_at
          ) SELECT ?, ?, ?, ?, ?, ?, ?
          WHERE NOT EXISTS (
            SELECT 1 FROM customer_profile_merges WHERE idempotency_key = ?
          )`).bind(
            input.idempotencyKey,
            input.sourceProfileId,
            input.targetProfileId,
            input.expectedSourceVersion,
            input.expectedTargetVersion,
            input.reviewedBy,
            input.at,
            input.idempotencyKey,
          ),
          db.prepare(`SELECT idempotency_key, source_profile_id, target_profile_id,
            source_version_before, target_version_before, reviewed_by, reviewed_at
            FROM customer_profile_merges WHERE idempotency_key = ?`).bind(input.idempotencyKey),
          db.prepare(`SELECT ${PROFILE_COLUMNS} FROM customer_profiles
            WHERE id IN (?, ?) ORDER BY id`).bind(input.sourceProfileId, input.targetProfileId),
        ]);
        const mergeRow = results[1]?.results?.[0] as MergeRow | undefined;
        const storedInputMatches = mergeRow !== undefined &&
          mergeRow.source_profile_id === input.sourceProfileId &&
          mergeRow.target_profile_id === input.targetProfileId &&
          mergeRow.source_version_before === input.expectedSourceVersion &&
          mergeRow.target_version_before === input.expectedTargetVersion &&
          mergeRow.reviewed_by === input.reviewedBy && mergeRow.reviewed_at === input.at;
        if (!storedInputMatches) return conflict();
        const profiles = (results[2]?.results ?? []).map((row) => profileOf(row as ProfileRow));
        const source = profiles.find((profile) => profile.id === input.sourceProfileId);
        const target = profiles.find((profile) => profile.id === input.targetProfileId);
        if (source === undefined || target === undefined || source.status !== 'merged' ||
            source.mergedIntoProfileId !== target.id) return conflict();
        return Object.freeze({ source, target, reviewedBy: mergeRow.reviewed_by,
          reviewedAt: mergeRow.reviewed_at });
      } catch (error) {
        if (error instanceof CustomerProfileConflictError) throw error;
        return conflict();
      }
    },
  });
}
