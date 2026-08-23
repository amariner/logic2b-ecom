import { createCustomerAddressRevision } from '../domain/customer-profile';
import { customerResourceTarget } from '../domain/resource-ownership';
import type {
  CustomerAddressRepository,
  CustomerAddressWriteOutcome,
} from '../application/customer-address-repository';
import type { CustomerAddressAccessView } from '../application/resource-ownership-ports';

type AddressRow = Readonly<{
  public_ref: string;
  customer_profile_id: string;
  revision: number;
  recipient_name: string;
  phone: string | null;
  street: string;
  city: string;
  region: string | null;
  postal_code: string;
  country_code: string;
  valid_from: string;
  write_payload_fingerprint: string | null;
}>;

function view(row: AddressRow): CustomerAddressAccessView {
  return Object.freeze({
    publicRef: row.public_ref,
    revision: row.revision,
    data: Object.freeze({
      recipientName: row.recipient_name,
      phone: row.phone,
      street: row.street,
      city: row.city,
      region: row.region,
      postalCode: row.postal_code,
      countryCode: row.country_code,
    }),
    validFrom: row.valid_from,
  });
}

function validateEvidence(key: string, fingerprint: string): void {
  if (key.trim() !== key || key.length < 8 || key.length > 200 ||
      /[\u0000-\u001f\u007f]/u.test(key) || !/^[0-9a-f]{64}$/u.test(fingerprint)) {
    throw new RangeError('Evidencia idempotente inválida.');
  }
}

function conflict(): CustomerAddressWriteOutcome {
  return Object.freeze({ outcome: 'conflict', address: null });
}

export function createD1CustomerAddressRepository(db: D1Database): CustomerAddressRepository {
  const byKey = (key: string) => db.prepare(`
    SELECT access.public_ref, revision.customer_profile_id, revision.revision,
      revision.recipient_name, revision.phone, revision.street, revision.city,
      revision.region, revision.postal_code, revision.country_code,
      revision.valid_from, revision.write_payload_fingerprint
    FROM customer_address_revisions revision
    JOIN customer_address_access_refs access ON access.address_id = revision.address_id
    WHERE revision.write_idempotency_key = ?
  `).bind(key).first<AddressRow>();
  const replay = async (
    key: string,
    ownerProfileId: string,
    payloadFingerprint: string,
  ): Promise<CustomerAddressWriteOutcome> => {
    const row = await byKey(key);
    if (row === null || row.customer_profile_id !== ownerProfileId ||
        row.write_payload_fingerprint !== payloadFingerprint) return conflict();
    return Object.freeze({ outcome: 'replayed', address: view(row) });
  };
  return Object.freeze({
    async listOwned(ownerProfileId: string): Promise<readonly CustomerAddressAccessView[]> {
      const result = await db.prepare(`
        SELECT access.public_ref, current.customer_profile_id, current.revision,
          current.recipient_name, current.phone, current.street, current.city,
          current.region, current.postal_code, current.country_code,
          current.valid_from, current.write_payload_fingerprint
        FROM customer_address_access_refs access
        JOIN customer_address_revisions current
          ON current.address_id = access.address_id AND current.valid_to IS NULL
        JOIN customer_profiles profile ON profile.id = current.customer_profile_id
        WHERE current.customer_profile_id = ?
          AND profile.status = 'active' AND profile.merged_into_profile_id IS NULL
        ORDER BY current.valid_from DESC, access.public_ref DESC
        LIMIT 50
      `).bind(ownerProfileId).all<AddressRow>();
      return Object.freeze(result.results.map(view));
    },
    async createOwned(
      input: Parameters<CustomerAddressRepository['createOwned']>[0],
    ): Promise<CustomerAddressWriteOutcome> {
      validateEvidence(input.idempotencyKey, input.payloadFingerprint);
      const normalized = createCustomerAddressRevision({
        addressId: input.addressId,
        customerProfileId: input.ownerProfileId,
        data: input.data,
        at: input.occurredAt,
      });
      const existing = await byKey(input.idempotencyKey);
      if (existing !== null) {
        return replay(input.idempotencyKey, input.ownerProfileId, input.payloadFingerprint);
      }
      try {
        const result = await db.prepare(`INSERT INTO customer_address_revisions (
          address_id, customer_profile_id, revision, recipient_name, phone,
          street, city, region, postal_code, country_code, valid_from, valid_to,
          write_idempotency_key, write_payload_fingerprint
        ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`).bind(
          normalized.addressId,
          normalized.customerProfileId,
          normalized.data.recipientName,
          normalized.data.phone,
          normalized.data.street,
          normalized.data.city,
          normalized.data.region,
          normalized.data.postalCode,
          normalized.data.countryCode,
          normalized.validFrom,
          input.idempotencyKey,
          input.payloadFingerprint,
        ).run();
        if (result.meta.changes !== 1) return conflict();
      } catch {
        return replay(input.idempotencyKey, input.ownerProfileId, input.payloadFingerprint);
      }
      const row = await byKey(input.idempotencyKey);
      return row === null
        ? conflict()
        : Object.freeze({ outcome: 'applied', address: view(row) });
    },
    async reviseOwned(
      input: Parameters<CustomerAddressRepository['reviseOwned']>[0],
    ): Promise<CustomerAddressWriteOutcome> {
      validateEvidence(input.idempotencyKey, input.payloadFingerprint);
      if (input.target.kind !== 'address' || !Number.isSafeInteger(input.expectedRevision) ||
          input.expectedRevision < 1) return conflict();
      let target;
      let normalized;
      try {
        target = customerResourceTarget('address', input.target.publicRef);
        normalized = createCustomerAddressRevision({
          addressId: 'address:revision-validation',
          customerProfileId: input.ownerProfileId,
          data: input.data,
          at: input.occurredAt,
        });
      } catch {
        return conflict();
      }
      const existing = await byKey(input.idempotencyKey);
      if (existing !== null) {
        return replay(input.idempotencyKey, input.ownerProfileId, input.payloadFingerprint);
      }
      try {
        const result = await db.prepare(`
          INSERT INTO customer_address_revisions (
            address_id, customer_profile_id, revision, recipient_name, phone,
            street, city, region, postal_code, country_code, valid_from, valid_to,
            write_idempotency_key, write_payload_fingerprint
          )
          SELECT current.address_id, current.customer_profile_id,
            current.revision + 1, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?
          FROM customer_address_access_refs access
          JOIN customer_address_revisions current
            ON current.address_id = access.address_id AND current.valid_to IS NULL
          JOIN customer_profiles profile ON profile.id = current.customer_profile_id
          WHERE access.public_ref = ? AND current.customer_profile_id = ?
            AND current.revision = ?
            AND profile.status = 'active' AND profile.merged_into_profile_id IS NULL
        `).bind(
          normalized.data.recipientName,
          normalized.data.phone,
          normalized.data.street,
          normalized.data.city,
          normalized.data.region,
          normalized.data.postalCode,
          normalized.data.countryCode,
          normalized.validFrom,
          input.idempotencyKey,
          input.payloadFingerprint,
          target.publicRef,
          input.ownerProfileId,
          input.expectedRevision,
        ).run();
        if (result.meta.changes !== 1) return conflict();
      } catch {
        return replay(input.idempotencyKey, input.ownerProfileId, input.payloadFingerprint);
      }
      const row = await byKey(input.idempotencyKey);
      return row === null
        ? conflict()
        : Object.freeze({ outcome: 'applied', address: view(row) });
    },
  });
}
