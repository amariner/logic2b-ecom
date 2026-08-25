import type { CustomerReturnRequestService } from './customer-return-request-service';
import {
  customerResourceAccessPreflight,
} from './customer-resource-authorization';
import type {
  CustomerOwnershipSubject,
  CustomerResourceDenialReason,
  CustomerResourceScope,
  CustomerSelfServiceCapability,
} from '../modules/customers/domain/resource-ownership';
import { customerResourceTarget } from '../modules/customers/domain/resource-ownership';
import type {
  CustomerReturnHttp,
  CustomerReturnListView,
} from '../modules/customers/presentation/customer-return-http';
import {
  CUSTOMER_ACCOUNT_ROUTES,
} from '../modules/customers/presentation/customer-account-http';
import {
  CUSTOMER_AUTH_SESSION_COOKIE_NAME,
  customerAccountHeaders,
  customerHostCookieValue,
  hasExactCustomerAuthOrigin,
} from '../modules/customers/presentation/passwordless-http';

export type CustomerReturnMetric = Readonly<{
  operation: 'list' | 'read' | 'create';
  outcome: 'allowed' | 'replayed' | 'denied';
  reason?: CustomerResourceDenialReason | 'invalid_request' | 'invalid_reference' |
    'invalid_csrf' | 'missing_session' | 'conflict' | 'edge_rate_limited' |
    'edge_rate_unavailable' | 'runtime_unavailable' | 'invalid_origin';
}>;

type SessionContext = Readonly<{
  subject: CustomerOwnershipSubject;
  csrfToken: string;
  verifyCsrf(token: string): Promise<boolean>;
}>;

type Dependencies = Readonly<{
  sessionContext(sessionToken: string, at: string): Promise<SessionContext | null>;
  returns: CustomerReturnRequestService;
  activeCapabilities: readonly CustomerSelfServiceCapability[];
  grantedScopes: readonly CustomerResourceScope[];
  observability: Readonly<{ count(metric: CustomerReturnMetric): void }>;
  expectedOrigin: string;
  ordersAvailable?: boolean;
  addressesAvailable?: boolean;
  now?: () => string;
}>;

const RETURN_SENTINEL = `ret_${'0'.repeat(32)}`;
const ORDER_SENTINEL = `ord_${'0'.repeat(32)}`;
const MAX_BODY_BYTES = 16_384;

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: customerAccountHeaders() });
}

function denied(): Response {
  return json({ error: { code: 'customer.resource.not_found' } }, 404);
}

function invalid(code = 'customer.request.invalid', status = 400): Response {
  return json({ error: { code } }, status);
}

function signIn(): Response {
  return new Response(null, { status: 303,
    headers: customerAccountHeaders({ location: CUSTOMER_ACCOUNT_ROUTES.access }) });
}

async function boundedBody(request: Request): Promise<string | null> {
  const declared = request.headers.get('content-length');
  if (declared !== null && (!/^(?:0|[1-9]\d*)$/u.test(declared) || Number(declared) > MAX_BODY_BYTES)) return null;
  const reader = request.body?.getReader();
  if (reader === undefined) return null;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let value = ''; let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BODY_BYTES) { await reader.cancel().catch(() => undefined); return null; }
      value += decoder.decode(chunk.value, { stream: true });
    }
    return value + decoder.decode();
  } catch { await reader.cancel().catch(() => undefined); return null; }
}

type CreatePayload = Readonly<{
  orderPublicRef: string;
  ownershipVersion: number;
  reason: 'damaged' | 'defective' | 'wrong_item' | 'not_as_expected' | 'other';
  lines: readonly Readonly<{ orderItemId: number; quantity: number }>[];
  csrfToken: string;
  idempotencyKey: string;
}>;

function positive(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

async function payload(request: Request): Promise<CreatePayload | null> {
  const type = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  const body = await boundedBody(request);
  if (body === null) return null;
  let raw: Record<string, unknown>;
  if (type === 'application/json') {
    try {
      const parsed: unknown = JSON.parse(body);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
      raw = parsed as Record<string, unknown>;
    } catch { return null; }
  } else if (type === 'application/x-www-form-urlencoded') {
    const form = new URLSearchParams(body);
    const keys = [...form.keys()];
    if (new Set(keys).size !== keys.length) return null;
    raw = Object.fromEntries(form);
    if (raw.lines !== undefined) {
      try { raw.lines = JSON.parse(String(raw.lines)); } catch { return null; }
    } else {
      raw.lines = [{ orderItemId: raw.orderItemId, quantity: raw.quantity }];
      delete raw.orderItemId;
      delete raw.quantity;
    }
  } else return null;
  const allowed = ['orderPublicRef', 'ownershipVersion', 'reason', 'lines', 'csrfToken',
    'idempotencyKey', 'operation'];
  if (Object.keys(raw).some((key) => !allowed.includes(key)) || !Array.isArray(raw.lines)) return null;
  const ownershipVersion = positive(raw.ownershipVersion);
  const reasons = ['damaged', 'defective', 'wrong_item', 'not_as_expected', 'other'] as const;
  if (ownershipVersion === null || typeof raw.orderPublicRef !== 'string' ||
      typeof raw.reason !== 'string' || !reasons.includes(raw.reason as typeof reasons[number]) ||
      raw.lines.length < 1 || raw.lines.length > 100) return null;
  const lines = raw.lines.map((entry) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry) ||
        Object.keys(entry).some((key) => !['orderItemId', 'quantity'].includes(key))) return null;
    const source = entry as Record<string, unknown>;
    const orderItemId = positive(source.orderItemId); const quantity = positive(source.quantity);
    return orderItemId === null || quantity === null ? null : Object.freeze({ orderItemId, quantity });
  });
  if (lines.some((line) => line === null)) return null;
  return Object.freeze({
    orderPublicRef: raw.orderPublicRef,
    ownershipVersion,
    reason: raw.reason as CreatePayload['reason'],
    lines: Object.freeze(lines as CreatePayload['lines']),
    csrfToken: request.headers.get('x-csrf-token') ?? String(raw.csrfToken ?? ''),
    idempotencyKey: request.headers.get('idempotency-key') ?? String(raw.idempotencyKey ?? ''),
  });
}

export function createCustomerReturnHttp(dependencies: Dependencies): CustomerReturnHttp {
  const clock = dependencies.now ?? (() => new Date().toISOString());
  const contextFor = async (request: Request, redirect: boolean,
    operation: CustomerReturnMetric['operation']): Promise<SessionContext | Response> => {
    const token = customerHostCookieValue(request, CUSTOMER_AUTH_SESSION_COOKIE_NAME);
    if (token === null) {
      dependencies.observability.count({ operation, outcome: 'denied', reason: 'missing_session' });
      return redirect ? signIn() : denied();
    }
    const context = await dependencies.sessionContext(token, clock());
    if (context === null) {
      dependencies.observability.count({ operation, outcome: 'denied', reason: 'inactive_session' });
      return redirect ? signIn() : denied();
    }
    return context;
  };
  const preflight = (context: SessionContext, action: 'returns:read' | 'returns:create') =>
    customerResourceAccessPreflight({ action,
      target: customerResourceTarget(action === 'returns:read' ? 'return' : 'order',
        action === 'returns:read' ? RETURN_SENTINEL : ORDER_SENTINEL),
      subject: context.subject, activeCapabilities: dependencies.activeCapabilities,
      grantedScopes: dependencies.grantedScopes });
  const listView = async (request: Request, redirect: boolean): Promise<CustomerReturnListView | Response> => {
    const context = await contextFor(request, redirect, 'list');
    if (context instanceof Response) return context;
    const decision = preflight(context, 'returns:read');
    if (!decision.allowed) {
      dependencies.observability.count({ operation: 'list', outcome: 'denied', reason: decision.auditReason });
      return denied();
    }
    const [requests, eligibility] = await Promise.all([
      dependencies.returns.listOwned(decision.ownerProfileId),
      dependencies.returns.listEligibilityOwned(decision.ownerProfileId, clock()),
    ]);
    dependencies.observability.count({ operation: 'list', outcome: 'allowed' });
    return Object.freeze({ requests, eligibility, csrfToken: context.csrfToken,
      ordersAvailable: dependencies.ordersAvailable ?? false,
      addressesAvailable: dependencies.addressesAvailable ?? false });
  };
  const readView = async (request: Request, publicRef: string | undefined,
    redirect: boolean) => {
    const context = await contextFor(request, redirect, 'read');
    if (context instanceof Response) return context;
    const decision = preflight(context, 'returns:read');
    if (!decision.allowed) {
      dependencies.observability.count({ operation: 'read', outcome: 'denied', reason: decision.auditReason });
      return denied();
    }
    if (!/^ret_[0-9a-f]{32}$/u.test(publicRef ?? '')) {
      dependencies.observability.count({ operation: 'read', outcome: 'denied', reason: 'invalid_reference' });
      return denied();
    }
    const result = await dependencies.returns.readOwned(decision.ownerProfileId, publicRef!);
    if (result === null) {
      dependencies.observability.count({ operation: 'read', outcome: 'denied', reason: 'resource_absent' });
      return denied();
    }
    dependencies.observability.count({ operation: 'read', outcome: 'allowed' });
    return result;
  };
  return Object.freeze({
    async list(request: Request) { const result = await listView(request, false); return result instanceof Response ? result : json(result, 200); },
    async read(request: Request, publicRef: string | undefined) { const result = await readView(request, publicRef, false); return result instanceof Response ? result : json({ request: result }, 200); },
    async create(request: Request) {
      const context = await contextFor(request, false, 'create');
      if (context instanceof Response) return context;
      const decision = preflight(context, 'returns:create');
      if (!decision.allowed) {
        dependencies.observability.count({ operation: 'create', outcome: 'denied', reason: decision.auditReason });
        return denied();
      }
      if (!hasExactCustomerAuthOrigin(request, dependencies.expectedOrigin)) {
        dependencies.observability.count({ operation: 'create', outcome: 'denied', reason: 'invalid_origin' });
        return invalid('customer.request.forbidden', 403);
      }
      const input = await payload(request);
      if (input === null) {
        dependencies.observability.count({ operation: 'create', outcome: 'denied', reason: 'invalid_request' });
        return invalid();
      }
      if (!(await context.verifyCsrf(input.csrfToken).catch(() => false))) {
        dependencies.observability.count({ operation: 'create', outcome: 'denied', reason: 'invalid_csrf' });
        return invalid('customer.request.forbidden', 403);
      }
      try {
        const result = await dependencies.returns.createOwned({
          orderPublicRef: input.orderPublicRef, ownerProfileId: decision.ownerProfileId,
          expectedOwnershipVersion: input.ownershipVersion, reason: input.reason,
          lines: input.lines, idempotencyKey: input.idempotencyKey, occurredAt: clock(),
        });
        if (result.outcome === 'conflict') {
          dependencies.observability.count({ operation: 'create', outcome: 'denied', reason: 'conflict' });
          return invalid('customer.return.conflict', 409);
        }
        dependencies.observability.count({ operation: 'create',
          outcome: result.outcome === 'replayed' ? 'replayed' : 'allowed' });
        return json({ request: result.request }, result.outcome === 'applied' ? 201 : 200);
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        dependencies.observability.count({ operation: 'create', outcome: 'denied', reason: 'invalid_request' });
        return invalid();
      }
    },
    listView(request: Request) { return listView(request, true); },
    readView(request: Request, publicRef: string | undefined) { return readView(request, publicRef, true); },
  });
}
