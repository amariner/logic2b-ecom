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
export {
  DataRightsConflictError,
  createD1DataRightsRepository,
} from './infrastructure/d1-data-rights-repository';
export {
  CUSTOMER_SESSION_MAX_ABSOLUTE_TTL_MS,
  CUSTOMER_SESSION_MAX_IDLE_TTL_MS,
  CUSTOMER_SESSION_SCOPES,
  PASSWORDLESS_CHALLENGE_MAX_TTL_MS,
  PASSWORDLESS_CHALLENGE_PURPOSES,
  PASSWORDLESS_METHODS,
  PasswordlessAuthConflictError,
  assertCustomerAuthIdentity,
  consumePasswordlessChallenge,
  createPasswordlessChallenge,
  customerSessionDecision,
  expirePasswordlessChallenge,
  issueCustomerSession,
  passwordlessPublicAcknowledgement,
  revokeCustomerSession,
  revokePasswordlessChallenge,
  rotateCustomerSession,
  type AuthTransitionOutcome,
  type CustomerAuthIdentity,
  type CustomerSession,
  type CustomerSessionDecision,
  type CustomerSessionScope,
  type PasswordlessChallenge,
  type PasswordlessChallengePurpose,
  type PasswordlessMethod,
  type PasswordlessPublicAcknowledgement,
} from './domain/passwordless-auth';
export type {
  CustomerAuthAuditCommand,
  CustomerAuthCapabilityReadiness,
  CustomerAuthCapabilityState,
  CustomerAuthRateLimitOutcome,
  CustomerAuthRateLimitRepository,
  CustomerAuthenticationRepository,
  CustomerSessionFamilyRevocationTarget,
  PasswordlessProofProvider,
} from './application/passwordless-auth-ports';
export {
  silentCustomerPasswordlessObservability,
  type CustomerPasswordlessMetric,
  type CustomerPasswordlessObservability,
} from './application/passwordless-observability';
export {
  CUSTOMER_AUTH_ATTEMPT_COOKIE_NAME,
  CUSTOMER_AUTH_ATTEMPT_COOKIE_OPTIONS,
  CUSTOMER_AUTH_ATTEMPT_MAX_TTL_MS,
  PASSWORDLESS_PROOF_BYTES,
  createCustomerAuthAttempt,
  createPasswordlessProof,
  customerAuthAttemptCsrfToken,
  customerSessionCsrfToken,
  isPasswordlessProof,
  passwordlessProofDigest,
  verifyCustomerAuthAttempt,
  verifyCustomerSessionCsrfToken,
  type CustomerAuthAttempt,
  type PreparedPasswordlessProof,
} from './infrastructure/passwordless-web-crypto';
export {
  ResendPasswordlessConfigurationError,
  attestResendPasswordlessTracking,
  createResendPasswordlessProofProvider,
  type ResendPasswordlessProofProviderConfig,
  type ResendPasswordlessTrackingAttestation,
  type ResendPasswordlessTrackingConfig,
} from './infrastructure/resend-passwordless-proof-provider';
export {
  CustomerAuthRateLimitConflictError,
  createD1CustomerAuthRateLimitRepository,
} from './infrastructure/d1-customer-auth-rate-limit-repository';
export {
  createCustomerPasswordlessConsoleObservability,
  type CustomerPasswordlessMetricSink,
} from './infrastructure/customer-passwordless-console-observability';
export {
  CustomerAuthenticationConflictError,
  createD1CustomerAuthenticationRepository,
} from './infrastructure/d1-customer-authentication-repository';
export {
  CUSTOMER_RESOURCE_ACTIONS,
  CUSTOMER_RESOURCE_KINDS,
  CUSTOMER_RESOURCE_SCOPES,
  CUSTOMER_SELF_SERVICE_CAPABILITIES,
  customerOwnedWritePrecondition,
  customerResourceAccessDecision,
  customerResourcePublicDenial,
  customerResourceTarget,
  type CustomerOwnedWritePrecondition,
  type CustomerOwnershipSubject,
  type CustomerResourceAccessDecision,
  type CustomerResourceAccessRequest,
  type CustomerResourceAction,
  type CustomerResourceDenialReason,
  type CustomerResourceKind,
  type CustomerResourceOwnership,
  type CustomerResourceScope,
  type CustomerResourceTarget,
  type CustomerSelfServiceCapability,
} from './domain/resource-ownership';
export type {
  CustomerAddressAccessView,
  CustomerOrderAccessView,
  CustomerOrderListCursor,
  CustomerOrderListReadPage,
  CustomerOwnedOrderReader,
  CustomerOwnedAddressReader,
  CustomerOwnedAddressRevisionWriter,
  CustomerOwnedOrderListReader,
  CustomerOwnedMutationOutcome,
  CustomerOwnedResourceWriter,
  CustomerResourceAccessAuditWriter,
  CustomerResourceAuthorizer,
  CustomerResourceOwnershipReader,
} from './application/resource-ownership-ports';
export {
  createD1CustomerAddressOwnershipReader,
  createD1CustomerOwnedAddressReader,
  createD1CustomerOwnedAddressRevisionWriter,
  createD1CustomerOwnedOrderListReader,
  createD1CustomerOwnedOrderReader,
  createD1CustomerOrderOwnershipReader,
} from './infrastructure/d1-customer-resource-ownership-reader';
export {
  CUSTOMER_ORDER_LIST_PAGE_SIZE,
  createCustomerOrderListService,
  decodeCustomerOrderListCursor,
  encodeCustomerOrderListCursor,
} from './application/customer-order-list';
