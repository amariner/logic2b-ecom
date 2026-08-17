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
export {
  CONSENT_ACTIONS,
  CONSENT_CHANNELS,
  CONSENT_SOURCE_KINDS,
  communicationDecision,
  consentState,
  recordConsent,
  type CommunicationDecision,
  type ConsentAction,
  type ConsentChannel,
  type ConsentCommand,
  type ConsentEvidence,
  type ConsentScope,
  type ConsentSource,
  type ConsentSourceKind,
  type ConsentState,
  type ConsentSubject,
  type ConsentWriteOutcome,
  type GrantConsentCommand,
  type LegalNoticeVersion,
  type WithdrawConsentCommand,
} from './domain/consent';
export type { ConsentRepository } from './application/consent-repository';
export {
  ConsentConflictError,
  createD1ConsentRepository,
} from './infrastructure/d1-consent-repository';
export {
  DATA_RIGHTS_ACTIONS,
  DATA_RIGHTS_OWNER_OPERATIONS,
  DATA_RIGHTS_REQUEST_KINDS,
  dataRightsState,
  recordDataRightsEvidence,
  type DataRightsAction,
  type DataRightsCommand,
  type DataRightsEvidence,
  type DataRightsEvidenceDetails,
  type DataRightsOwnerOperation,
  type DataRightsPlan,
  type DataRightsPlanDecision,
  type DataRightsRequestKind,
  type DataRightsState,
  type DataRightsSubject,
  type DataRightsWriteOutcome,
} from './domain/data-rights';
export type {
  DataRightsOwner,
  DataRightsRepository,
} from './application/data-rights-repository';
