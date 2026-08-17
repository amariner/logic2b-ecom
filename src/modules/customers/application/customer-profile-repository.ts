import type {
  CustomerAddressData,
  CustomerAddressRevision,
  CustomerIdentityResolution,
  CustomerOrderAssociation,
  CustomerProfile,
  CustomerProfileMerge,
} from '../domain/customer-profile';

export type ResolveOrCreateCustomerProfileInput = Readonly<{
  profileId: string;
  email: string;
  emailIdentityHash: string;
  at: string;
}>;

/**
 * Puerto de persistencia R5.1. La implementación D1 ejecuta cada mutación de
 * forma atómica y aplica control optimista; no existe fallback a
 * una secuencia read-then-write vulnerable a carreras.
 */
export interface CustomerProfileRepository {
  findById(profileId: string): Promise<CustomerProfile | null>;
  findByIdentityHash(emailIdentityHash: string): Promise<CustomerProfile | null>;
  resolveOrCreate(input: ResolveOrCreateCustomerProfileInput): Promise<CustomerIdentityResolution>;
  appendAddressRevision(input: Readonly<{
    addressId: string;
    customerProfileId: string;
    expectedRevision: number | null;
    data: CustomerAddressData;
    at: string;
  }>): Promise<CustomerAddressRevision>;
  /** Solo persiste la FK opcional; nunca reescribe email/dirección del pedido. */
  associateOrder(input: Readonly<{
    orderId: number;
    association: CustomerOrderAssociation;
    expectedCustomerProfileId: string | null;
    at: string;
  }>): Promise<CustomerOrderAssociation>;
  merge(input: Readonly<{
    idempotencyKey: string;
    sourceProfileId: string;
    targetProfileId: string;
    expectedSourceVersion: number;
    expectedTargetVersion: number;
    reviewedBy: string;
    at: string;
  }>): Promise<CustomerProfileMerge>;
}
