import type { CustomerPasswordlessObservability } from '../modules/customers/application/passwordless-observability';
import { CUSTOMER_ACCOUNT_ROUTES } from '../modules/customers/presentation/customer-account-http';
import { isCustomerOrderAccessPath } from '../modules/customers/presentation/customer-order-access-http';
import { customerAccountHeaders } from '../modules/customers/presentation/passwordless-http';
import { canonicalRoutePathname } from '../platform/configuration';
import type { CustomerOrderAccessMetric } from './customer-order-access-http';
import { isCustomerAddressPath } from '../modules/customers/presentation/customer-address-http';
import type { CustomerAddressMetric } from './customer-address-http';
import { isCustomerReturnPath } from '../modules/customers/presentation/customer-return-http';
import type { CustomerReturnMetric } from './customer-return-http';

const RATE_LIMITED_ROUTES = new Set<string>([
  CUSTOMER_ACCOUNT_ROUTES.access,
  CUSTOMER_ACCOUNT_ROUTES.confirmAccess,
]);

function unavailable(): Response {
  return new Response('Acceso no disponible.', {
    status: 503,
    headers: customerAccountHeaders({ 'content-type': 'text/plain; charset=utf-8' }),
  });
}

/** Guard de borde testeable; nunca se ejecuta antes del gate de capacidad. */
export async function enforceCustomerAccountEdgeRate(input: Readonly<{
  request: Request;
  pathname: string;
  binding: RateLimit | undefined;
  observability: CustomerPasswordlessObservability;
}>): Promise<Response | null> {
  const pathname = canonicalRoutePathname(input.pathname);
  if (input.request.method !== 'POST' || !RATE_LIMITED_ROUTES.has(pathname)) return null;
  if (input.binding === undefined) {
    input.observability.count({ stage: 'edge_rate', outcome: 'unavailable' });
    return unavailable();
  }
  const ip = input.request.headers.get('cf-connecting-ip') ?? 'local';
  let outcome: Awaited<ReturnType<RateLimit['limit']>>;
  try {
    outcome = await input.binding.limit({ key: `${pathname}:${ip}` });
  } catch {
    input.observability.count({ stage: 'edge_rate', outcome: 'unavailable' });
    return unavailable();
  }
  if (outcome.success) return null;
  input.observability.count({ stage: 'edge_rate', outcome: 'limited' });
  return new Response('Demasiadas solicitudes. Inténtalo de nuevo dentro de un minuto.', {
    status: 429,
    headers: customerAccountHeaders({
      'content-type': 'text/plain; charset=utf-8',
      'retry-after': '60',
    }),
  });
}

/** Límite por IP y superficie, no por referencia, para impedir enumeración distribuida. */
export async function enforceCustomerOrderAccessEdgeRate(input: Readonly<{
  request: Request;
  pathname: string;
  binding: RateLimit | undefined;
  observability: Readonly<{ count(metric: CustomerOrderAccessMetric): void }>;
}>): Promise<Response | null> {
  const pathname = canonicalRoutePathname(input.pathname);
  if (!['GET', 'HEAD'].includes(input.request.method) || !isCustomerOrderAccessPath(pathname)) return null;
  if (input.binding === undefined) {
    input.observability.count({ outcome: 'denied', reason: 'edge_rate_unavailable' });
    return unavailable();
  }
  const ip = input.request.headers.get('cf-connecting-ip') ?? 'local';
  try {
    const outcome = await input.binding.limit({ key: `/customer-order-access:${ip}` });
    if (outcome.success) return null;
  } catch {
    input.observability.count({ outcome: 'denied', reason: 'edge_rate_unavailable' });
    return unavailable();
  }
  input.observability.count({ outcome: 'denied', reason: 'edge_rate_limited' });
  return new Response('Demasiadas solicitudes. Inténtalo de nuevo dentro de un minuto.', {
    status: 429,
    headers: customerAccountHeaders({
      'content-type': 'text/plain; charset=utf-8',
      'retry-after': '60',
    }),
  });
}

/** Límite compartido de lectura/escritura por IP, nunca por addr_ ni PII. */
export async function enforceCustomerAddressEdgeRate(input: Readonly<{
  request: Request;
  pathname: string;
  binding: RateLimit | undefined;
  observability: Readonly<{ count(metric: CustomerAddressMetric): void }>;
}>): Promise<Response | null> {
  const pathname = canonicalRoutePathname(input.pathname);
  if (!['GET', 'HEAD', 'POST', 'PATCH'].includes(input.request.method) ||
      !isCustomerAddressPath(pathname)) return null;
  const operation: CustomerAddressMetric['operation'] = input.request.method === 'PATCH'
    ? 'revise' : input.request.method === 'POST' ? 'create' : 'list';
  if (input.binding === undefined) {
    input.observability.count({ operation, outcome: 'denied', reason: 'edge_rate_unavailable' });
    return unavailable();
  }
  const ip = input.request.headers.get('cf-connecting-ip') ?? 'local';
  try {
    const outcome = await input.binding.limit({ key: `/customer-address-access:${ip}` });
    if (outcome.success) return null;
  } catch {
    input.observability.count({ operation, outcome: 'denied', reason: 'edge_rate_unavailable' });
    return unavailable();
  }
  input.observability.count({ operation, outcome: 'denied', reason: 'edge_rate_limited' });
  return new Response('Demasiadas solicitudes. Inténtalo de nuevo dentro de un minuto.', {
    status: 429,
    headers: customerAccountHeaders({
      'content-type': 'text/plain; charset=utf-8', 'retry-after': '60',
    }),
  });
}

/** Bolsa única por IP para consulta y alta; nunca incluye ord_, ret_ ni PII. */
export async function enforceCustomerReturnEdgeRate(input: Readonly<{
  request: Request;
  pathname: string;
  binding: RateLimit | undefined;
  observability: Readonly<{ count(metric: CustomerReturnMetric): void }>;
}>): Promise<Response | null> {
  const pathname = canonicalRoutePathname(input.pathname);
  if (!['GET', 'HEAD', 'POST'].includes(input.request.method) || !isCustomerReturnPath(pathname)) return null;
  const operation: CustomerReturnMetric['operation'] = input.request.method === 'POST'
    ? 'create' : pathname === '/api/customer/returns' || pathname === '/cuenta/devoluciones'
      ? 'list' : 'read';
  if (input.binding === undefined) {
    input.observability.count({ operation, outcome: 'denied', reason: 'edge_rate_unavailable' });
    return unavailable();
  }
  const ip = input.request.headers.get('cf-connecting-ip') ?? 'local';
  try {
    const outcome = await input.binding.limit({ key: `/customer-return-access:${ip}` });
    if (outcome.success) return null;
  } catch {
    input.observability.count({ operation, outcome: 'denied', reason: 'edge_rate_unavailable' });
    return unavailable();
  }
  input.observability.count({ operation, outcome: 'denied', reason: 'edge_rate_limited' });
  return new Response('Demasiadas solicitudes. Inténtalo de nuevo dentro de un minuto.', {
    status: 429,
    headers: customerAccountHeaders({ 'content-type': 'text/plain; charset=utf-8', 'retry-after': '60' }),
  });
}
