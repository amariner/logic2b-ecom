import { createCustomerAddressRevision, type CustomerAddressData } from '../domain/customer-profile';
import { customerResourceTarget } from '../domain/resource-ownership';
import type {
  CustomerAddressRepository,
  CustomerAddressWriteOutcome,
} from './customer-address-repository';
import type { CustomerAddressAccessView } from './resource-ownership-ports';

export interface CustomerAddressService {
  listOwned(ownerProfileId: string): Promise<readonly CustomerAddressAccessView[]>;
  createOwned(input: Readonly<{
    ownerProfileId: string;
    data: CustomerAddressData;
    idempotencyKey: string;
    occurredAt: string;
  }>): Promise<CustomerAddressWriteOutcome>;
  reviseOwned(input: Readonly<{
    publicRef: string;
    ownerProfileId: string;
    expectedRevision: number;
    data: CustomerAddressData;
    idempotencyKey: string;
    occurredAt: string;
  }>): Promise<CustomerAddressWriteOutcome>;
}

function assertKey(value: string): void {
  if (value.trim() !== value || value.length < 8 || value.length > 200 ||
      /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new RangeError('Idempotency-Key inválida.');
  }
}

async function fingerprint(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function normalizedData(ownerProfileId: string, data: CustomerAddressData, at: string) {
  return createCustomerAddressRevision({
    addressId: 'address:command-validation',
    customerProfileId: ownerProfileId,
    data,
    at,
  }).data;
}

export function createCustomerAddressService(
  repository: CustomerAddressRepository,
  addressIdFactory: () => string = () => `address:${crypto.randomUUID().toLowerCase()}`,
): CustomerAddressService {
  return Object.freeze({
    listOwned(ownerProfileId: string) {
      return repository.listOwned(ownerProfileId);
    },
    async createOwned(input: Parameters<CustomerAddressService['createOwned']>[0]) {
      assertKey(input.idempotencyKey);
      const data = normalizedData(input.ownerProfileId, input.data, input.occurredAt);
      const payloadFingerprint = await fingerprint(Object.freeze({
        v: 1,
        kind: 'create',
        ownerProfileId: input.ownerProfileId,
        data,
      }));
      return repository.createOwned({
        addressId: addressIdFactory(),
        ownerProfileId: input.ownerProfileId,
        data,
        idempotencyKey: input.idempotencyKey,
        payloadFingerprint,
        occurredAt: input.occurredAt,
      });
    },
    async reviseOwned(input: Parameters<CustomerAddressService['reviseOwned']>[0]) {
      assertKey(input.idempotencyKey);
      if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1) {
        throw new RangeError('expectedRevision inválida.');
      }
      const target = customerResourceTarget('address', input.publicRef);
      const data = normalizedData(input.ownerProfileId, input.data, input.occurredAt);
      const payloadFingerprint = await fingerprint(Object.freeze({
        v: 1,
        kind: 'revise',
        target: target.publicRef,
        ownerProfileId: input.ownerProfileId,
        expectedRevision: input.expectedRevision,
        data,
      }));
      return repository.reviseOwned({
        target,
        ownerProfileId: input.ownerProfileId,
        expectedRevision: input.expectedRevision,
        data,
        idempotencyKey: input.idempotencyKey,
        payloadFingerprint,
        occurredAt: input.occurredAt,
      });
    },
  });
}
