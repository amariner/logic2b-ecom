export const CUSTOMER_SELF_SERVICE_CAPABILITIES = ['CUS-004', 'CUS-005', 'CUS-006'] as const;
export type CustomerSelfServiceCapability = (typeof CUSTOMER_SELF_SERVICE_CAPABILITIES)[number];

export const CUSTOMER_RESOURCE_SCOPES = [
  'customer:orders:read',
  'customer:returns:read',
  'customer:returns:create',
  'customer:addresses:read',
  'customer:addresses:write',
] as const;
export type CustomerResourceScope = (typeof CUSTOMER_RESOURCE_SCOPES)[number];

export const CUSTOMER_RESOURCE_ACTIONS = [
  'orders:read',
  'orders:track',
  'returns:read',
  'returns:create',
  'addresses:read',
  'addresses:write',
] as const;
export type CustomerResourceAction = (typeof CUSTOMER_RESOURCE_ACTIONS)[number];

export const CUSTOMER_RESOURCE_KINDS = ['order', 'address', 'return'] as const;
export type CustomerResourceKind = (typeof CUSTOMER_RESOURCE_KINDS)[number];

export type CustomerResourceTarget = Readonly<{
  kind: CustomerResourceKind;
  publicRef: string;
}>;

export type CustomerOwnershipSubject = Readonly<{
  session: Readonly<{
    id: string;
    identityId: string;
    customerProfileId: string;
    status: 'active' | 'rotated' | 'revoked' | 'expired';
    scopes: readonly string[];
  }>;
  identity: Readonly<{
    id: string;
    customerProfileId: string;
    status: 'active' | 'revoked';
  }>;
  profile: Readonly<{
    id: string;
    status: 'active' | 'merged';
    mergedIntoProfileId: string | null;
  }>;
}>;

export type CustomerResourceOwnership = Readonly<{
  target: CustomerResourceTarget;
  ownerProfileId: string | null;
  state: 'owned' | 'guest' | 'incoherent';
  version: number;
}>;

export type CustomerResourceAccessRequest = Readonly<{
  action: CustomerResourceAction;
  target: CustomerResourceTarget;
  subject: CustomerOwnershipSubject;
  activeCapabilities: readonly CustomerSelfServiceCapability[];
  grantedScopes: readonly CustomerResourceScope[];
  ownership: CustomerResourceOwnership | null;
}>;

export type CustomerResourceDenialReason =
  | 'inactive_session'
  | 'missing_self_scope'
  | 'inactive_identity'
  | 'inactive_profile'
  | 'incoherent_subject'
  | 'invalid_action_target'
  | 'capability_inactive'
  | 'missing_resource_scope'
  | 'resource_absent'
  | 'resource_unowned'
  | 'owner_mismatch'
  | 'ownership_incoherent';

export type CustomerResourceAccessDecision =
  | Readonly<{
      allowed: true;
      capability: CustomerSelfServiceCapability;
      requiredScope: CustomerResourceScope;
      target: CustomerResourceTarget;
      ownerProfileId: string;
      ownershipVersion: number;
    }>
  | Readonly<{
      allowed: false;
      publicCode: 'customer.resource.not_found';
      auditReason: CustomerResourceDenialReason;
    }>;

export type CustomerOwnedWritePrecondition = Readonly<{
  capability: CustomerSelfServiceCapability;
  scope: CustomerResourceScope;
  target: CustomerResourceTarget;
  ownerProfileId: string;
  expectedOwnershipVersion: number;
}>;

type ActionContract = Readonly<{
  capability: CustomerSelfServiceCapability;
  scope: CustomerResourceScope;
  targetKind: CustomerResourceKind;
}>;

const ACTION_CONTRACTS: Readonly<Record<CustomerResourceAction, ActionContract>> = Object.freeze({
  'orders:read': Object.freeze({ capability: 'CUS-004', scope: 'customer:orders:read', targetKind: 'order' }),
  'orders:track': Object.freeze({ capability: 'CUS-004', scope: 'customer:orders:read', targetKind: 'order' }),
  'returns:read': Object.freeze({ capability: 'CUS-005', scope: 'customer:returns:read', targetKind: 'return' }),
  // Crear una devolución prueba primero el ownership del pedido. La futura
  // escritura RMA debe repetir esta precondición dentro de su transacción.
  'returns:create': Object.freeze({ capability: 'CUS-005', scope: 'customer:returns:create', targetKind: 'order' }),
  'addresses:read': Object.freeze({ capability: 'CUS-006', scope: 'customer:addresses:read', targetKind: 'address' }),
  'addresses:write': Object.freeze({ capability: 'CUS-006', scope: 'customer:addresses:write', targetKind: 'address' }),
});

const PUBLIC_REF_PREFIX: Readonly<Record<CustomerResourceKind, string>> = Object.freeze({
  order: 'ord_',
  address: 'addr_',
  return: 'ret_',
});
const PUBLIC_REF_PATTERN = /^[A-Za-z0-9_-]{22,64}$/u;
const OPAQUE_ID_PATTERN = /^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)+$/u;

function opaqueId(value: string): boolean {
  return value.length <= 200 && OPAQUE_ID_PATTERN.test(value);
}

function denied(auditReason: CustomerResourceDenialReason): CustomerResourceAccessDecision {
  return Object.freeze({ allowed: false, publicCode: 'customer.resource.not_found', auditReason });
}

/**
 * Referencia pública de alta entropía. Es solo un selector opaco: nunca prueba
 * ownership y no sustituye la comprobación server-side.
 */
export function customerResourceTarget(
  kind: CustomerResourceKind,
  publicRef: string,
): CustomerResourceTarget {
  if (!CUSTOMER_RESOURCE_KINDS.includes(kind)) throw new RangeError('Tipo de recurso de cliente inválido.');
  const prefix = PUBLIC_REF_PREFIX[kind];
  const entropy = publicRef.startsWith(prefix) ? publicRef.slice(prefix.length) : '';
  if (!PUBLIC_REF_PATTERN.test(entropy)) {
    throw new RangeError('La referencia pública debe ser opaca y tener al menos 128 bits de entropía.');
  }
  return Object.freeze({ kind, publicRef });
}

/**
 * Decisión pura de autorización R5.5a. `customer:self` autentica al sujeto, pero
 * no concede acceso a ningún recurso sin capacidad, scope y ownership exactos.
 */
export function customerResourceAccessDecision(
  request: CustomerResourceAccessRequest,
): CustomerResourceAccessDecision {
  const contract = ACTION_CONTRACTS[request.action];
  if (contract.targetKind !== request.target.kind) return denied('invalid_action_target');

  const { session, identity, profile } = request.subject;
  if (session.status !== 'active') return denied('inactive_session');
  if (!session.scopes.includes('customer:self')) return denied('missing_self_scope');
  if (identity.status !== 'active') return denied('inactive_identity');
  if (profile.status !== 'active' || profile.mergedIntoProfileId !== null) {
    return denied('inactive_profile');
  }
  if (![session.id, session.identityId, session.customerProfileId, identity.id,
    identity.customerProfileId, profile.id].every(opaqueId) ||
      session.identityId !== identity.id ||
      session.customerProfileId !== identity.customerProfileId ||
      identity.customerProfileId !== profile.id) {
    return denied('incoherent_subject');
  }
  if (!request.activeCapabilities.includes(contract.capability)) return denied('capability_inactive');
  if (!request.grantedScopes.includes(contract.scope)) return denied('missing_resource_scope');
  if (request.ownership === null) return denied('resource_absent');
  if (request.ownership.target.kind !== request.target.kind ||
      request.ownership.target.publicRef !== request.target.publicRef ||
      !Number.isSafeInteger(request.ownership.version) || request.ownership.version < 1) {
    return denied('ownership_incoherent');
  }
  if (request.ownership.state === 'incoherent') return denied('ownership_incoherent');
  if (request.ownership.state === 'guest' || request.ownership.ownerProfileId === null) {
    return denied('resource_unowned');
  }
  if (!opaqueId(request.ownership.ownerProfileId) ||
      request.ownership.ownerProfileId !== profile.id) return denied('owner_mismatch');

  return Object.freeze({
    allowed: true,
    capability: contract.capability,
    requiredScope: contract.scope,
    target: request.target,
    ownerProfileId: profile.id,
    ownershipVersion: request.ownership.version,
  });
}

/** Una mutación futura debe revalidar esta precondición dentro de la escritura. */
export function customerOwnedWritePrecondition(
  decision: CustomerResourceAccessDecision,
): CustomerOwnedWritePrecondition {
  if (!decision.allowed) throw new RangeError('Una denegación no puede autorizar una escritura.');
  return Object.freeze({
    capability: decision.capability,
    scope: decision.requiredScope,
    target: decision.target,
    ownerProfileId: decision.ownerProfileId,
    expectedOwnershipVersion: decision.ownershipVersion,
  });
}

/** Forma HTTP estable: existencia, owner y causa interna nunca son enumerables. */
export function customerResourcePublicDenial(): Readonly<{
  status: 404;
  code: 'customer.resource.not_found';
}> {
  return Object.freeze({ status: 404, code: 'customer.resource.not_found' });
}
