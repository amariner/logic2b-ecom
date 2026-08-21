import type {
  CustomerResourceAuthorizer,
  CustomerResourceOwnershipReader,
} from '../modules/customers/application/resource-ownership-ports';
import { customerResourceAccessDecision } from '../modules/customers/domain/resource-ownership';
import type {
  CustomerResourceAccessRequest,
  CustomerResourceDenialReason,
} from '../modules/customers/domain/resource-ownership';

export type CustomerResourcePreflightDecision =
  | Readonly<{ allowed: true; ownerProfileId: string }>
  | Readonly<{ allowed: false; auditReason: CustomerResourceDenialReason }>;

/** Gates de sujeto/policy para índices que todavía no han resuelto un recurso. */
export function customerResourceAccessPreflight(
  request: Omit<CustomerResourceAccessRequest, 'ownership'>,
): CustomerResourcePreflightDecision {
  const decision = customerResourceAccessDecision({ ...request, ownership: null });
  if (!decision.allowed && decision.auditReason === 'resource_absent') {
    return Object.freeze({ allowed: true, ownerProfileId: request.subject.profile.id });
  }
  return decision.allowed
    ? Object.freeze({ allowed: true, ownerProfileId: decision.ownerProfileId })
    : Object.freeze({ allowed: false, auditReason: decision.auditReason });
}

/** Composición pura de policy/sujeto con el owner canónico resuelto en D1. */
export function createCustomerResourceAuthorizer(
  ownership: CustomerResourceOwnershipReader,
): CustomerResourceAuthorizer {
  return Object.freeze({
    async authorize(request: Parameters<CustomerResourceAuthorizer['authorize']>[0]) {
      const preflight = customerResourceAccessDecision({ ...request, ownership: null });
      if (!preflight.allowed && preflight.auditReason !== 'resource_absent') return preflight;
      return customerResourceAccessDecision({
        ...request,
        ownership: await ownership.resolve(request.target),
      });
    },
  });
}
