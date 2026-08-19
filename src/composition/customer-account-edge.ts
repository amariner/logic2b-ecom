import type { CustomerPasswordlessObservability } from '../modules/customers/application/passwordless-observability';
import { CUSTOMER_ACCOUNT_ROUTES } from '../modules/customers/presentation/customer-account-http';
import { customerAccountHeaders } from '../modules/customers/presentation/passwordless-http';
import { canonicalRoutePathname } from '../platform/configuration';

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
