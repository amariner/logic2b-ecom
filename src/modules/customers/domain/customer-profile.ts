export const CUSTOMER_PROFILE_STATUSES = ['active', 'merged'] as const;
export type CustomerProfileStatus = (typeof CUSTOMER_PROFILE_STATUSES)[number];

export type CustomerProfile = Readonly<{
  id: string;
  primaryEmail: string;
  emailIdentityHash: string;
  status: CustomerProfileStatus;
  mergedIntoProfileId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}>;

export type CustomerAddressData = Readonly<{
  recipientName: string;
  phone: string | null;
  street: string;
  city: string;
  region: string | null;
  postalCode: string;
  countryCode: string;
}>;

export type CustomerAddressRevision = Readonly<{
  addressId: string;
  customerProfileId: string;
  revision: number;
  data: CustomerAddressData;
  validFrom: string;
  validTo: string | null;
}>;

export type CustomerAddressTransition = Readonly<{
  superseded: CustomerAddressRevision;
  current: CustomerAddressRevision;
}>;

export type CustomerIdentityResolution =
  | Readonly<{ action: 'create'; identityHash: string; normalizedEmail: string }>
  | Readonly<{ action: 'link_existing'; profile: CustomerProfile }>
  | Readonly<{
      action: 'requires_review';
      reason: 'identity_conflict' | 'duplicate_identity' | 'merged_profile';
      candidateProfileIds: readonly string[];
    }>;

export type CustomerOrderAssociation =
  | Readonly<{ mode: 'guest'; customerProfileId: null }>
  | Readonly<{ mode: 'profile'; customerProfileId: string }>;

export type CustomerProfileMerge = Readonly<{
  source: CustomerProfile;
  target: CustomerProfile;
  reviewedBy: string;
  reviewedAt: string;
}>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const IDENTITY_HASH_PATTERN = /^[a-f0-9]{64}$/u;
const OPAQUE_ID_PATTERN = /^[a-z][a-z0-9]*(?:[_:-][a-z0-9]+)+$/u;

function instant(value: string, field: string): number {
  const parsed = Date.parse(value);
  if (!value.endsWith('Z') || !Number.isFinite(parsed)) {
    throw new RangeError(`${field} debe ser una fecha ISO-8601 UTC.`);
  }
  return parsed;
}

function opaqueId(value: string, field: string): void {
  if (value.length > 200 || !OPAQUE_ID_PATTERN.test(value)) {
    throw new RangeError(`${field} debe ser un identificador opaco.`);
  }
}

function identityHash(value: string): void {
  if (!IDENTITY_HASH_PATTERN.test(value)) {
    throw new RangeError('emailIdentityHash debe ser un hash hexadecimal de 256 bits.');
  }
}

function text(value: string, field: string, minimum: number, maximum: number): string {
  const normalized = value.normalize('NFKC').trim();
  if (normalized.length < minimum || normalized.length > maximum || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new RangeError(`${field} inválido.`);
  }
  return normalized;
}

/** Canonicalización compartida antes de calcular la identidad HMAC del email. */
export function normalizeCustomerEmail(value: string): string {
  const normalized = value.normalize('NFKC').trim().toLowerCase();
  if (normalized.length < 3 || normalized.length > 200 || !EMAIL_PATTERN.test(normalized) ||
      /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new RangeError('customer.email inválido.');
  }
  return normalized;
}

export function assertCustomerProfile(profile: CustomerProfile): void {
  opaqueId(profile.id, 'customerProfile.id');
  const normalizedEmail = normalizeCustomerEmail(profile.primaryEmail);
  if (normalizedEmail !== profile.primaryEmail) {
    throw new RangeError('customerProfile.primaryEmail debe estar normalizado.');
  }
  identityHash(profile.emailIdentityHash);
  if (!CUSTOMER_PROFILE_STATUSES.includes(profile.status)) {
    throw new RangeError('customerProfile.status inválido.');
  }
  if (!Number.isSafeInteger(profile.version) || profile.version < 1) {
    throw new RangeError('customerProfile.version inválida.');
  }
  const createdAt = instant(profile.createdAt, 'customerProfile.createdAt');
  const updatedAt = instant(profile.updatedAt, 'customerProfile.updatedAt');
  if (updatedAt < createdAt) throw new RangeError('updatedAt no puede preceder a createdAt.');
  if (profile.status === 'active' && profile.mergedIntoProfileId !== null) {
    throw new RangeError('Un perfil activo no puede apuntar a otro perfil.');
  }
  if (profile.status === 'merged') {
    if (profile.mergedIntoProfileId === null || profile.mergedIntoProfileId === profile.id) {
      throw new RangeError('Un perfil fusionado debe apuntar a otro perfil.');
    }
    opaqueId(profile.mergedIntoProfileId, 'customerProfile.mergedIntoProfileId');
  }
}

export function createCustomerProfile(input: Readonly<{
  id: string;
  email: string;
  emailIdentityHash: string;
  at: string;
}>): CustomerProfile {
  const profile: CustomerProfile = Object.freeze({
    id: input.id,
    primaryEmail: normalizeCustomerEmail(input.email),
    emailIdentityHash: input.emailIdentityHash,
    status: 'active',
    mergedIntoProfileId: null,
    version: 1,
    createdAt: input.at,
    updatedAt: input.at,
  });
  assertCustomerProfile(profile);
  return profile;
}

/**
 * Decide el alta o enlace sin consultar datos externos. El repositorio debe
 * repetir esta decisión dentro de la misma transacción que impone UNIQUE al
 * hash para que dos altas concurrentes converjan.
 */
export function resolveCustomerIdentity(input: Readonly<{
  email: string;
  identityHash: string;
  candidates: readonly CustomerProfile[];
}>): CustomerIdentityResolution {
  const normalizedEmail = normalizeCustomerEmail(input.email);
  identityHash(input.identityHash);
  for (const candidate of input.candidates) assertCustomerProfile(candidate);
  const ids = new Set(input.candidates.map((candidate) => candidate.id));
  if (ids.size !== input.candidates.length) {
    throw new RangeError('Los perfiles candidatos deben ser únicos.');
  }
  if (input.candidates.length === 0) {
    return Object.freeze({ action: 'create', identityHash: input.identityHash, normalizedEmail });
  }
  const matching = input.candidates.filter((candidate) =>
    candidate.emailIdentityHash === input.identityHash && candidate.primaryEmail === normalizedEmail);
  if (matching.some((candidate) => candidate.status === 'merged')) {
    return Object.freeze({ action: 'requires_review', reason: 'merged_profile',
      candidateProfileIds: Object.freeze(input.candidates.map((candidate) => candidate.id)) });
  }
  if (matching.length === 1 && input.candidates.length === 1) {
    return Object.freeze({ action: 'link_existing', profile: matching[0]! });
  }
  return Object.freeze({
    action: 'requires_review',
    reason: matching.length > 1 ? 'duplicate_identity' : 'identity_conflict',
    candidateProfileIds: Object.freeze(input.candidates.map((candidate) => candidate.id)),
  });
}

function normalizeAddressData(data: CustomerAddressData): CustomerAddressData {
  const countryCode = data.countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/u.test(countryCode)) throw new RangeError('address.countryCode inválido.');
  return Object.freeze({
    recipientName: text(data.recipientName, 'address.recipientName', 2, 160),
    phone: data.phone === null ? null : text(data.phone, 'address.phone', 3, 30),
    street: text(data.street, 'address.street', 3, 200),
    city: text(data.city, 'address.city', 2, 100),
    region: data.region === null ? null : text(data.region, 'address.region', 1, 100),
    postalCode: text(data.postalCode, 'address.postalCode', 1, 20),
    countryCode,
  });
}

export function createCustomerAddressRevision(input: Readonly<{
  addressId: string;
  customerProfileId: string;
  data: CustomerAddressData;
  at: string;
}>): CustomerAddressRevision {
  opaqueId(input.addressId, 'address.id');
  opaqueId(input.customerProfileId, 'address.customerProfileId');
  instant(input.at, 'address.at');
  return Object.freeze({
    addressId: input.addressId,
    customerProfileId: input.customerProfileId,
    revision: 1,
    data: normalizeAddressData(input.data),
    validFrom: input.at,
    validTo: null,
  });
}

export function reviseCustomerAddress(
  current: CustomerAddressRevision,
  input: Readonly<{ expectedRevision: number; data: CustomerAddressData; at: string }>,
): CustomerAddressTransition {
  opaqueId(current.addressId, 'address.id');
  opaqueId(current.customerProfileId, 'address.customerProfileId');
  if (current.validTo !== null) throw new RangeError('Solo la revisión vigente puede sustituirse.');
  if (current.revision !== input.expectedRevision) throw new RangeError('Conflicto de versión de dirección.');
  if (!Number.isSafeInteger(current.revision) || current.revision < 1) {
    throw new RangeError('address.revision inválida.');
  }
  const validFrom = instant(current.validFrom, 'address.validFrom');
  const at = instant(input.at, 'address.at');
  if (at < validFrom) throw new RangeError('La revisión no puede preceder a la dirección vigente.');
  const data = normalizeAddressData(input.data);
  const superseded = Object.freeze({ ...current, validTo: input.at });
  const next = Object.freeze({ ...current, revision: current.revision + 1, data,
    validFrom: input.at, validTo: null });
  return Object.freeze({ superseded, current: next });
}

/** La ausencia de perfil es un resultado válido y conserva guest checkout. */
export function customerOrderAssociation(
  customerProfileId: string | null,
): CustomerOrderAssociation {
  if (customerProfileId === null) return Object.freeze({ mode: 'guest', customerProfileId: null });
  opaqueId(customerProfileId, 'customerProfileId');
  return Object.freeze({ mode: 'profile', customerProfileId });
}

/**
 * Una fusión solo admite la misma identidad ya deduplicada y exige una orden
 * revisada. Identidades distintas permanecen en revisión hasta que un flujo de
 * verificación posterior (R5.4) pueda acreditar su propiedad.
 */
export function mergeCustomerProfiles(input: Readonly<{
  source: CustomerProfile;
  target: CustomerProfile;
  expectedSourceVersion: number;
  expectedTargetVersion: number;
  reviewedBy: string;
  at: string;
}>): CustomerProfileMerge {
  assertCustomerProfile(input.source);
  assertCustomerProfile(input.target);
  if (input.source.id === input.target.id) throw new RangeError('No se puede fusionar un perfil consigo mismo.');
  if (input.source.status !== 'active' || input.target.status !== 'active') {
    throw new RangeError('Solo se pueden fusionar perfiles activos.');
  }
  if (input.source.version !== input.expectedSourceVersion ||
      input.target.version !== input.expectedTargetVersion) {
    throw new RangeError('Conflicto de versión al fusionar perfiles.');
  }
  if (input.source.emailIdentityHash !== input.target.emailIdentityHash) {
    throw new RangeError('Las identidades distintas requieren verificación y revisión separadas.');
  }
  if (input.source.primaryEmail !== input.target.primaryEmail) {
    throw new RangeError('Las identidades con emails distintos requieren revisión separada.');
  }
  opaqueId(input.reviewedBy, 'reviewedBy');
  const reviewedBy = input.reviewedBy;
  const reviewedAt = instant(input.at, 'reviewedAt');
  if (reviewedAt < instant(input.source.createdAt, 'source.createdAt') ||
      reviewedAt < instant(input.target.createdAt, 'target.createdAt')) {
    throw new RangeError('La revisión no puede preceder a los perfiles.');
  }
  const source = Object.freeze({ ...input.source, status: 'merged' as const,
    mergedIntoProfileId: input.target.id, version: input.source.version + 1, updatedAt: input.at });
  const target = Object.freeze({ ...input.target, version: input.target.version + 1, updatedAt: input.at });
  assertCustomerProfile(source);
  assertCustomerProfile(target);
  return Object.freeze({ source, target, reviewedBy, reviewedAt: input.at });
}
