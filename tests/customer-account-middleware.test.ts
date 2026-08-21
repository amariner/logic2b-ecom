import { describe, expect, it } from 'vitest';
import middlewareSource from '../src/middleware.ts?raw';
import { platformManifest } from '../platform.config';
import { createPlatform } from '../src/composition/create-platform';
import { decideRouteAccess } from '../src/platform/configuration';

describe('gate middleware de cuenta en demo', () => {
  it.each([
    '/cuenta/acceso',
    '/cuenta/acceso/',
    '/cuenta/acceso/confirmar',
    '/cuenta/acceso/confirmar/',
    '/cuenta/sesiones',
    '/cuenta/sesiones/',
  ])('resuelve %s como 404 antes del runtime', (pathname) => {
    expect(decideRouteAccess(createPlatform(platformManifest), pathname)).toMatchObject({
      allowed: false,
      status: 404,
      capabilityId: 'CUS-003',
    });
  });

  it('usa la ruta canónica para gate, detección de superficie y rate key', () => {
    expect(middlewareSource).toContain(
      'const pathname = canonicalRoutePathname(context.url.pathname);',
    );
    expect(middlewareSource.indexOf('const routeAccess = decideRouteAccess'))
      .toBeLessThan(middlewareSource.indexOf('if (customerAccountSurface)'));
    expect(middlewareSource).toContain('pathname,\n          binding:');
    expect(middlewareSource).not.toContain("context.rewrite('/404')");
    expect(middlewareSource).toContain("return new Response('Página no encontrada.'");
  });

  it('cierra la API de pedidos por CUS-004 antes de runtime y con forma anti-enumeración', () => {
    const pathname = `/api/customer/orders/ord_${'a'.repeat(32)}`;
    expect(decideRouteAccess(createPlatform(platformManifest), pathname)).toMatchObject({
      allowed: false,
      status: 404,
      capabilityId: 'CUS-004',
    });
    expect(middlewareSource.indexOf('const routeAccess = decideRouteAccess'))
      .toBeLessThan(middlewareSource.indexOf('if (customerOrderSurface)'));
    expect(middlewareSource).toContain("code: 'customer.resource.not_found'");
  });
});
