import type {
  CustomerOwnedOrderReader,
  CustomerResourceAuthorizer,
} from '../modules/customers/application/resource-ownership-ports';
import {
  customerResourcePublicDenial,
  customerResourceTarget,
  type CustomerOwnershipSubject,
  type CustomerResourceDenialReason,
  type CustomerResourceScope,
  type CustomerSelfServiceCapability,
} from '../modules/customers/domain/resource-ownership';
import type { CustomerOrderAccessHttp } from '../modules/customers/presentation/customer-order-access-http';
import {
  CUSTOMER_AUTH_SESSION_COOKIE_NAME,
  customerAccountHeaders,
  customerHostCookieValue,
} from '../modules/customers/presentation/passwordless-http';

export type CustomerOrderAccessMetric = Readonly<{
  outcome: 'allowed' | 'denied';
  reason?: CustomerResourceDenialReason | 'invalid_reference' | 'missing_session' |
    'edge_rate_limited' | 'edge_rate_unavailable' | 'runtime_unavailable';
}>;

type Dependencies = Readonly<{
  sessionSubject(sessionToken: string, at: string): Promise<CustomerOwnershipSubject | null>;
  authorizer: CustomerResourceAuthorizer;
  orders: CustomerOwnedOrderReader;
  activeCapabilities: readonly CustomerSelfServiceCapability[];
  grantedScopes: readonly CustomerResourceScope[];
  observability: Readonly<{ count(metric: CustomerOrderAccessMetric): void }>;
  now?: () => string;
}>;

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: customerAccountHeaders() });
}

function denied(): Response {
  const denial = customerResourcePublicDenial();
  return json({ error: { code: denial.code } }, denial.status);
}

const INVALID_REFERENCE_SENTINEL = `ord_${'0'.repeat(32)}`;

/** Lectura R5.5c: sesión + policy + owner y revalidación owner/version en SQL. */
export function createCustomerOrderAccessHttp(dependencies: Dependencies): CustomerOrderAccessHttp {
  const clock = dependencies.now ?? (() => new Date().toISOString());
  return Object.freeze({
    async read(request: Request, publicRef: string | undefined): Promise<Response> {
      const sessionToken = customerHostCookieValue(request, CUSTOMER_AUTH_SESSION_COOKIE_NAME);
      if (sessionToken === null) {
        dependencies.observability.count({ outcome: 'denied', reason: 'missing_session' });
        return denied();
      }
      const subject = await dependencies.sessionSubject(sessionToken, clock());
      if (subject === null) {
        dependencies.observability.count({ outcome: 'denied', reason: 'inactive_session' });
        return denied();
      }
      let invalidReference = false;
      let target;
      try {
        target = customerResourceTarget('order', publicRef ?? '');
      } catch {
        invalidReference = true;
        target = customerResourceTarget('order', INVALID_REFERENCE_SENTINEL);
      }
      const decision = await dependencies.authorizer.authorize({
        action: 'orders:read',
        target,
        subject,
        activeCapabilities: dependencies.activeCapabilities,
        grantedScopes: dependencies.grantedScopes,
      });
      if (invalidReference) {
        dependencies.observability.count({ outcome: 'denied', reason: 'invalid_reference' });
        return denied();
      }
      if (!decision.allowed) {
        dependencies.observability.count({ outcome: 'denied', reason: decision.auditReason });
        return denied();
      }
      const view = await dependencies.orders.readOwned({
        target,
        ownerProfileId: decision.ownerProfileId,
        expectedOwnershipVersion: decision.ownershipVersion,
      });
      if (view === null) {
        dependencies.observability.count({ outcome: 'denied', reason: 'ownership_incoherent' });
        return denied();
      }
      dependencies.observability.count({ outcome: 'allowed' });
      return json({ order: view }, 200);
    },
  });
}
