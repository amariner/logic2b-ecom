import type { CustomerAddressData } from '../domain/customer-profile';
import type { CustomerResourceTarget } from '../domain/resource-ownership';
import type { CustomerAddressAccessView } from './resource-ownership-ports';

export type CustomerAddressWriteOutcome =
  | Readonly<{ outcome: 'applied' | 'replayed'; address: CustomerAddressAccessView }>
  | Readonly<{ outcome: 'conflict'; address: null }>;

export interface CustomerAddressRepository {
  listOwned(ownerProfileId: string): Promise<readonly CustomerAddressAccessView[]>;
  createOwned(input: Readonly<{
    addressId: string;
    ownerProfileId: string;
    data: CustomerAddressData;
    idempotencyKey: string;
    payloadFingerprint: string;
    occurredAt: string;
  }>): Promise<CustomerAddressWriteOutcome>;
  reviseOwned(input: Readonly<{
    target: CustomerResourceTarget;
    ownerProfileId: string;
    expectedRevision: number;
    data: CustomerAddressData;
    idempotencyKey: string;
    payloadFingerprint: string;
    occurredAt: string;
  }>): Promise<CustomerAddressWriteOutcome>;
}
