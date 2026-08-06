import type { CapabilityFlagName, CapabilityState } from './manifest';
import type { CapabilityId } from './capability-definitions';

export type CapabilityAccess = Readonly<{
  capabilityState: (id: CapabilityId) => CapabilityState;
  hasCapabilityFlag: (id: CapabilityId, flag: CapabilityFlagName) => boolean;
  capability: (id: CapabilityId) => Readonly<{
    degradation?: Readonly<{ reason: string; fallback: string }>;
  }>;
}>;

export type AccessDecision =
  | Readonly<{
      allowed: true;
      capabilityId: CapabilityId;
      state: 'active' | 'degraded';
      degradation?: Readonly<{ reason: string; fallback: string }>;
    }>
  | Readonly<{
      allowed: false;
      capabilityId: CapabilityId;
      state: CapabilityState;
      status: 403 | 404;
    }>;

export const ADMIN_NAVIGATION_ITEMS = [
  { id: 'pedidos', href: '/demo/admin', label: 'Pedidos', capabilityId: 'ORD-001' },
  { id: 'productos', href: '/demo/admin/productos', label: 'Productos', capabilityId: 'CAT-001' },
  { id: 'envios', href: '/demo/admin/envios', label: 'Envíos', capabilityId: 'FUL-001' },
  { id: 'emails', href: '/demo/admin/emails', label: 'Emails', capabilityId: 'MAR-003' },
] as const satisfies readonly Readonly<{
  id: string;
  href: string;
  label: string;
  capabilityId: CapabilityId;
}>[];

export type AdminNavigationId = (typeof ADMIN_NAVIGATION_ITEMS)[number]['id'];

export function decideCapabilityAccess(
  access: CapabilityAccess,
  capabilityId: CapabilityId,
  flag: CapabilityFlagName,
): AccessDecision {
  const state = access.capabilityState(capabilityId);
  if ((state === 'active' || state === 'degraded') && access.hasCapabilityFlag(capabilityId, flag)) {
    const degradation = access.capability(capabilityId).degradation;
    return {
      allowed: true,
      capabilityId,
      state,
      ...(degradation === undefined ? {} : { degradation }),
    };
  }
  return {
    allowed: false,
    capabilityId,
    state,
    // Una capacidad operativa cuya ruta está cerrada existe, pero no autoriza
    // esta superficie. Las capacidades no operativas se ocultan como ausentes.
    status: state === 'active' || state === 'degraded' ? 403 : 404,
  };
}

export function adminNavigationFor(access: CapabilityAccess) {
  return ADMIN_NAVIGATION_ITEMS.filter((item) =>
    decideCapabilityAccess(access, item.capabilityId, 'navigation').allowed,
  );
}

export function adminHomeHrefFor(access: CapabilityAccess): string | null {
  return adminNavigationFor(access)[0]?.href ?? null;
}

type RouteRule = Readonly<{
  capabilityId: CapabilityId;
  matches: (pathname: string) => boolean;
}>;

const ROUTE_RULES: readonly RouteRule[] = [
  { capabilityId: 'CHK-002', matches: (path) => path === '/api/cart/quote' },
  { capabilityId: 'CHK-003', matches: (path) => path === '/api/checkout/session' },
  { capabilityId: 'CHK-004', matches: (path) => path === '/api/webhooks/stripe' },
  { capabilityId: 'CAT-001', matches: (path) => path.startsWith('/api/admin/products/') },
  { capabilityId: 'FUL-001', matches: (path) => path.startsWith('/api/admin/shipping-rates/') },
  { capabilityId: 'ORD-002', matches: (path) => path.startsWith('/api/admin/orders/') && !path.endsWith('/export.csv') },
  { capabilityId: 'FUL-003', matches: (path) => path === '/api/admin/orders/export.csv' },
  { capabilityId: 'INT-004', matches: (path) => path === '/api/admin/backup.sql' },
  { capabilityId: 'SEC-001', matches: (path) => path === '/demo/admin/login' },
  { capabilityId: 'CAT-001', matches: (path) => path === '/demo/admin/productos' },
  { capabilityId: 'FUL-001', matches: (path) => path === '/demo/admin/envios' },
  { capabilityId: 'MAR-003', matches: (path) => path === '/demo/admin/emails' },
  { capabilityId: 'ORD-001', matches: (path) => path === '/demo/admin' || path.startsWith('/demo/admin/pedidos/') },
];

export function routeCapability(pathname: string): CapabilityId | null {
  return ROUTE_RULES.find((rule) => rule.matches(pathname))?.capabilityId ?? null;
}

export function decideRouteAccess(access: CapabilityAccess, pathname: string): AccessDecision | null {
  const capabilityId = routeCapability(pathname);
  return capabilityId === null ? null : decideCapabilityAccess(access, capabilityId, 'routes');
}
