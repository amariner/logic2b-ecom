export {
  CUSTOMER_PROFILE_STATUSES,
  assertCustomerProfile,
  createCustomerAddressRevision,
  createCustomerProfile,
  customerOrderAssociation,
  mergeCustomerProfiles,
  normalizeCustomerEmail,
  resolveCustomerIdentity,
  reviseCustomerAddress,
  type CustomerAddressData,
  type CustomerAddressRevision,
  type CustomerAddressTransition,
  type CustomerIdentityResolution,
  type CustomerOrderAssociation,
  type CustomerProfile,
  type CustomerProfileMerge,
  type CustomerProfileStatus,
} from './domain/customer-profile';
export { customerEmailIdentityHash } from './application/customer-identity';
export {
  type CustomerProfileRepository,
  type ResolveOrCreateCustomerProfileInput,
} from './application/customer-profile-repository';
export {
  CustomerProfileConflictError,
  createD1CustomerProfileRepository,
} from './infrastructure/d1-customer-profile-repository';
