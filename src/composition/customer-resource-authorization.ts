import type {
  CustomerResourceAuthorizer,
  CustomerResourceOwnershipReader,
} from '../modules/customers/application/resource-ownership-ports';
import { customerResourceAccessDecision } from '../modules/customers/domain/resource-ownership';

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
