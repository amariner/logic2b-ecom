import type {
  CustomerOrderAccessView,
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
import type {
  CustomerOrderAccessHttp,
  CustomerOrderListView,
} from '../modules/customers/presentation/customer-order-access-http';
import {
  CUSTOMER_AUTH_SESSION_COOKIE_NAME,
  customerAccountHeaders,
  customerHostCookieValue,
} from '../modules/customers/presentation/passwordless-http';
import { CUSTOMER_ACCOUNT_ROUTES } from '../modules/customers/presentation/customer-account-http';
import { customerResourceAccessPreflight } from './customer-resource-authorization';

export type CustomerOrderAccessMetric = Readonly<{
  outcome: 'allowed' | 'denied';
  reason?: CustomerResourceDenialReason | 'invalid_reference' | 'missing_session' |
    'invalid_cursor' | 'edge_rate_limited' | 'edge_rate_unavailable' | 'runtime_unavailable';
}>;

type Dependencies = Readonly<{
  sessionSubject(sessionToken: string, at: string): Promise<CustomerOwnershipSubject | null>;
  authorizer: CustomerResourceAuthorizer;
  orders: CustomerOwnedOrderReader;
  orderList: Readonly<{
    list(input: Readonly<{
      ownerProfileId: string;
      cursorToken: string | null;
    }>): Promise<CustomerOrderListView>;
  }>;
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

function signInRedirect(): Response {
  return new Response(null, {
    status: 303,
    headers: customerAccountHeaders({ location: CUSTOMER_ACCOUNT_ROUTES.access }),
  });
}

function invalidCursor(): Response {
  return json({ error: { code: 'customer.request.invalid' } }, 400);
}

const INVALID_REFERENCE_SENTINEL = `ord_${'0'.repeat(32)}`;

/** Lectura R5.5c: sesión + policy + owner y revalidación owner/version en SQL. */
export function createCustomerOrderAccessHttp(dependencies: Dependencies): CustomerOrderAccessHttp {
  const clock = dependencies.now ?? (() => new Date().toISOString());
  const subjectFor = async (
    request: Request,
    redirectUnauthenticated: boolean,
  ): Promise<CustomerOwnershipSubject | Response> => {
    const sessionToken = customerHostCookieValue(request, CUSTOMER_AUTH_SESSION_COOKIE_NAME);
    if (sessionToken === null) {
      dependencies.observability.count({ outcome: 'denied', reason: 'missing_session' });
      return redirectUnauthenticated ? signInRedirect() : denied();
    }
    const subject = await dependencies.sessionSubject(sessionToken, clock());
    if (subject === null) {
      dependencies.observability.count({ outcome: 'denied', reason: 'inactive_session' });
      return redirectUnauthenticated ? signInRedirect() : denied();
    }
    return subject;
  };
  const readOwned = async (
    request: Request,
    publicRef: string | undefined,
    redirectUnauthenticated: boolean,
  ): Promise<CustomerOrderAccessView | Response> => {
    const subject = await subjectFor(request, redirectUnauthenticated);
    if (subject instanceof Response) return subject;
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
    return view;
  };
  const listOwned = async (
    request: Request,
    cursor: string | null,
    redirectUnauthenticated: boolean,
  ): Promise<CustomerOrderListView | Response> => {
    const subject = await subjectFor(request, redirectUnauthenticated);
    if (subject instanceof Response) return subject;
    const target = customerResourceTarget('order', INVALID_REFERENCE_SENTINEL);
    const preflight = customerResourceAccessPreflight({
      action: 'orders:read',
      target,
      subject,
      activeCapabilities: dependencies.activeCapabilities,
      grantedScopes: dependencies.grantedScopes,
    });
    if (!preflight.allowed) {
      dependencies.observability.count({ outcome: 'denied', reason: preflight.auditReason });
      return denied();
    }
    try {
      const page = await dependencies.orderList.list({
        ownerProfileId: preflight.ownerProfileId,
        cursorToken: cursor,
      });
      dependencies.observability.count({ outcome: 'allowed' });
      return page;
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      dependencies.observability.count({ outcome: 'denied', reason: 'invalid_cursor' });
      return invalidCursor();
    }
  };
  return Object.freeze({
    async list(request: Request, cursor: string | null): Promise<Response> {
      const result = await listOwned(request, cursor, false);
      return result instanceof Response ? result : json(result, 200);
    },
    async read(request: Request, publicRef: string | undefined): Promise<Response> {
      const result = await readOwned(request, publicRef, false);
      return result instanceof Response ? result : json({ order: result }, 200);
    },
    listView(request: Request, cursor: string | null) {
      return listOwned(request, cursor, true);
    },
    readView(request: Request, publicRef: string | undefined) {
      return readOwned(request, publicRef, true);
    },
  });
}
