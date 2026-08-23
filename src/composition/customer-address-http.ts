import type { CustomerAddressService } from '../modules/customers/application/customer-address-service';
import type { CustomerAddressData } from '../modules/customers/domain/customer-profile';
import {
  customerResourcePublicDenial,
  customerResourceTarget,
  type CustomerOwnershipSubject,
  type CustomerResourceDenialReason,
  type CustomerResourceScope,
  type CustomerSelfServiceCapability,
} from '../modules/customers/domain/resource-ownership';
import type { CustomerResourceAuthorizer } from '../modules/customers/application/resource-ownership-ports';
import type {
  CustomerAddressHttp,
  CustomerAddressListView,
} from '../modules/customers/presentation/customer-address-http';
import {
  CUSTOMER_AUTH_SESSION_COOKIE_NAME,
  customerAccountHeaders,
  customerHostCookieValue,
} from '../modules/customers/presentation/passwordless-http';
import { CUSTOMER_ACCOUNT_ROUTES } from '../modules/customers/presentation/customer-account-http';
import { customerResourceAccessPreflight } from './customer-resource-authorization';

export type CustomerAddressMetric = Readonly<{
  operation: 'list' | 'create' | 'revise';
  outcome: 'allowed' | 'replayed' | 'denied';
  reason?: CustomerResourceDenialReason | 'invalid_request' | 'invalid_reference' |
    'invalid_csrf' | 'missing_session' | 'conflict' | 'edge_rate_limited' |
    'edge_rate_unavailable' | 'runtime_unavailable';
}>;

type SessionContext = Readonly<{
  subject: CustomerOwnershipSubject;
  csrfToken: string;
  verifyCsrf(token: string): Promise<boolean>;
}>;

type Dependencies = Readonly<{
  sessionContext(sessionToken: string, at: string): Promise<SessionContext | null>;
  authorizer: CustomerResourceAuthorizer;
  addresses: CustomerAddressService;
  activeCapabilities: readonly CustomerSelfServiceCapability[];
  grantedScopes: readonly CustomerResourceScope[];
  observability: Readonly<{ count(metric: CustomerAddressMetric): void }>;
  ordersAvailable?: boolean;
  now?: () => string;
}>;

const INVALID_REFERENCE_SENTINEL = `addr_${'0'.repeat(32)}`;
const MAX_BODY_BYTES = 16_384;

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: customerAccountHeaders() });
}

function denied(): Response {
  const denial = customerResourcePublicDenial();
  return json({ error: { code: denial.code } }, denial.status);
}

function invalid(code = 'customer.request.invalid', status = 400): Response {
  return json({ error: { code } }, status);
}

function signInRedirect(): Response {
  return new Response(null, { status: 303,
    headers: customerAccountHeaders({ location: CUSTOMER_ACCOUNT_ROUTES.access }) });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringField(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

async function boundedBody(request: Request): Promise<string | null> {
  const lengthValue = request.headers.get('content-length');
  if (lengthValue !== null && (!/^(?:0|[1-9]\d*)$/u.test(lengthValue) ||
      Number(lengthValue) > MAX_BODY_BYTES)) return null;
  const reader = request.body?.getReader();
  if (reader === undefined) return null;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let body = '';
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
    body += decoder.decode();
    return body;
  } catch {
    await reader.cancel().catch(() => undefined);
    return null;
  }
}

async function requestPayload(request: Request): Promise<Readonly<{
  data: CustomerAddressData;
  csrfToken: string;
  idempotencyKey: string;
  expectedRevision: number | null;
}> | null> {
  const type = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  const body = await boundedBody(request);
  if (body === null) return null;
  let source: Record<string, unknown>;
  if (type === 'application/json') {
    let raw: unknown;
    try { raw = JSON.parse(body); } catch { return null; }
    if (!isRecord(raw)) return null;
    const address = raw.address;
    if (!isRecord(address)) return null;
    if (Object.keys(raw).some((key) => !['address', 'revision', 'csrfToken', 'idempotencyKey'].includes(key))) {
      return null;
    }
    source = { ...address, revision: raw.revision, csrfToken: raw.csrfToken,
      idempotencyKey: raw.idempotencyKey };
  } else if (type === 'application/x-www-form-urlencoded') {
    const form = new URLSearchParams(body);
    const keys = [...form.keys()];
    if (new Set(keys).size !== keys.length) return null;
    source = Object.fromEntries(form);
  } else {
    return null;
  }
  const allowed = ['recipientName', 'phone', 'street', 'city', 'region', 'postalCode',
    'countryCode', 'revision', 'csrfToken', 'idempotencyKey', 'operation', 'publicRef'];
  if (Object.keys(source).some((key) => !allowed.includes(key))) return null;
  const revisionValue = source.revision;
  const expectedRevision = revisionValue === undefined || revisionValue === ''
    ? null
    : Number(revisionValue);
  if (expectedRevision !== null && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)) {
    return null;
  }
  return Object.freeze({
    data: Object.freeze({
      recipientName: stringField(source.recipientName),
      phone: stringField(source.phone).trim() === '' ? null : stringField(source.phone),
      street: stringField(source.street),
      city: stringField(source.city),
      region: stringField(source.region).trim() === '' ? null : stringField(source.region),
      postalCode: stringField(source.postalCode),
      countryCode: stringField(source.countryCode),
    }),
    csrfToken: request.headers.get('x-csrf-token') ?? stringField(source.csrfToken),
    idempotencyKey: request.headers.get('idempotency-key') ?? stringField(source.idempotencyKey),
    expectedRevision,
  });
}

/** Frontera HTTP R5.5f: auth, capability, scope, CSRF, owner, CAS e idempotencia. */
export function createCustomerAddressHttp(dependencies: Dependencies): CustomerAddressHttp {
  const clock = dependencies.now ?? (() => new Date().toISOString());
  const contextFor = async (
    request: Request,
    redirectUnauthenticated: boolean,
    operation: CustomerAddressMetric['operation'],
  ): Promise<SessionContext | Response> => {
    const token = customerHostCookieValue(request, CUSTOMER_AUTH_SESSION_COOKIE_NAME);
    if (token === null) {
      dependencies.observability.count({ operation, outcome: 'denied', reason: 'missing_session' });
      return redirectUnauthenticated ? signInRedirect() : denied();
    }
    const context = await dependencies.sessionContext(token, clock());
    if (context === null) {
      dependencies.observability.count({ operation, outcome: 'denied', reason: 'inactive_session' });
      return redirectUnauthenticated ? signInRedirect() : denied();
    }
    return context;
  };
  const listOwned = async (
    request: Request,
    redirectUnauthenticated: boolean,
  ): Promise<CustomerAddressListView | Response> => {
    const context = await contextFor(request, redirectUnauthenticated, 'list');
    if (context instanceof Response) return context;
    const target = customerResourceTarget('address', INVALID_REFERENCE_SENTINEL);
    const decision = customerResourceAccessPreflight({
      action: 'addresses:read', target, subject: context.subject,
      activeCapabilities: dependencies.activeCapabilities,
      grantedScopes: dependencies.grantedScopes,
    });
    if (!decision.allowed) {
      dependencies.observability.count({ operation: 'list', outcome: 'denied', reason: decision.auditReason });
      return denied();
    }
    const addresses = await dependencies.addresses.listOwned(decision.ownerProfileId);
    dependencies.observability.count({ operation: 'list', outcome: 'allowed' });
    return Object.freeze({
      addresses,
      csrfToken: context.csrfToken,
      ordersAvailable: dependencies.ordersAvailable ?? false,
    });
  };
  const mutationContext = async (
    request: Request,
    operation: 'create' | 'revise',
  ): Promise<Readonly<{ context: SessionContext; payload: NonNullable<Awaited<ReturnType<typeof requestPayload>>> }> | Response> => {
    const context = await contextFor(request, false, operation);
    if (context instanceof Response) return context;
    const payload = await requestPayload(request);
    if (payload === null) {
      dependencies.observability.count({ operation, outcome: 'denied', reason: 'invalid_request' });
      return invalid();
    }
    if (!(await context.verifyCsrf(payload.csrfToken).catch(() => false))) {
      dependencies.observability.count({ operation, outcome: 'denied', reason: 'invalid_csrf' });
      return invalid('customer.request.forbidden', 403);
    }
    return Object.freeze({ context, payload });
  };
  return Object.freeze({
    async list(request: Request) {
      const result = await listOwned(request, false);
      return result instanceof Response ? result : json(result, 200);
    },
    async create(request: Request) {
      const prepared = await mutationContext(request, 'create');
      if (prepared instanceof Response) return prepared;
      const target = customerResourceTarget('address', INVALID_REFERENCE_SENTINEL);
      const preflight = customerResourceAccessPreflight({
        action: 'addresses:write', target, subject: prepared.context.subject,
        activeCapabilities: dependencies.activeCapabilities,
        grantedScopes: dependencies.grantedScopes,
      });
      if (!preflight.allowed) {
        dependencies.observability.count({ operation: 'create', outcome: 'denied', reason: preflight.auditReason });
        return denied();
      }
      if (prepared.payload.expectedRevision !== null) return invalid();
      try {
        const result = await dependencies.addresses.createOwned({
          ownerProfileId: preflight.ownerProfileId,
          data: prepared.payload.data,
          idempotencyKey: prepared.payload.idempotencyKey,
          occurredAt: clock(),
        });
        if (result.outcome === 'conflict') {
          dependencies.observability.count({ operation: 'create', outcome: 'denied', reason: 'conflict' });
          return invalid('customer.address.conflict', 409);
        }
        dependencies.observability.count({ operation: 'create',
          outcome: result.outcome === 'replayed' ? 'replayed' : 'allowed' });
        return json({ address: result.address }, result.outcome === 'applied' ? 201 : 200);
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        return invalid();
      }
    },
    async revise(request: Request, publicRef: string | undefined) {
      const prepared = await mutationContext(request, 'revise');
      if (prepared instanceof Response) return prepared;
      let target;
      try {
        target = customerResourceTarget('address', publicRef ?? '');
      } catch {
        dependencies.observability.count({ operation: 'revise', outcome: 'denied', reason: 'invalid_reference' });
        return denied();
      }
      const decision = await dependencies.authorizer.authorize({
        action: 'addresses:write', target, subject: prepared.context.subject,
        activeCapabilities: dependencies.activeCapabilities,
        grantedScopes: dependencies.grantedScopes,
      });
      if (!decision.allowed) {
        dependencies.observability.count({ operation: 'revise', outcome: 'denied', reason: decision.auditReason });
        return denied();
      }
      if (prepared.payload.expectedRevision === null) {
        dependencies.observability.count({ operation: 'revise', outcome: 'denied', reason: 'conflict' });
        return invalid('customer.address.conflict', 409);
      }
      try {
        const result = await dependencies.addresses.reviseOwned({
          publicRef: target.publicRef,
          ownerProfileId: decision.ownerProfileId,
          expectedRevision: prepared.payload.expectedRevision,
          data: prepared.payload.data,
          idempotencyKey: prepared.payload.idempotencyKey,
          occurredAt: clock(),
        });
        if (result.outcome === 'conflict') {
          dependencies.observability.count({ operation: 'revise', outcome: 'denied', reason: 'conflict' });
          return invalid('customer.address.conflict', 409);
        }
        dependencies.observability.count({ operation: 'revise',
          outcome: result.outcome === 'replayed' ? 'replayed' : 'allowed' });
        return json({ address: result.address }, 200);
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        return invalid();
      }
    },
    listView(request: Request) {
      return listOwned(request, true);
    },
  });
}
