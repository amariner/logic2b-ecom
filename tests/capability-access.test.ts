import { describe, expect, it } from 'vitest';
import { platformManifest } from '../platform.config';
import productPatchSource from '../src/pages/api/admin/products/[id].ts?raw';
import { createPlatform } from '../src/composition/create-platform';
import {
  adminHomeHrefFor,
  adminNavigationFor,
  createPresetManifest,
  decideRouteAccess,
  type CapabilityManifestInput,
} from '../src/platform/configuration';

const deployment = {
  id: 'access-test',
  mode: 'client',
  environment: 'development',
} as const;

const platformFor = (profile: 'minimal' | 'standard' | 'advanced') =>
  createPlatform(createPresetManifest(profile, deployment));

describe('capability access policy (R1.3)', () => {
  it.each([
    ['minimal', ['productos'], '/demo/admin/productos'],
    ['standard', ['pedidos', 'productos', 'envios', 'emails'], '/demo/admin'],
    ['advanced', ['pedidos', 'productos', 'ubicaciones', 'envios', 'emails'], '/demo/admin'],
  ] as const)('derives %s admin navigation without orphan links', (profile, expectedIds, home) => {
    const platform = platformFor(profile);
    const navigation = adminNavigationFor(platform);
    expect(navigation.map((item) => item.id)).toEqual(expectedIds);
    expect(adminHomeHrefFor(platform)).toBe(home);
    for (const item of navigation) {
      expect(decideRouteAccess(platform, item.href)).toMatchObject({ allowed: true, capabilityId: item.capabilityId });
    }
  });

  it('closes inactive routes as 404 and active capabilities without route permission as 403', () => {
    const minimal = platformFor('minimal');
    expect(decideRouteAccess(minimal, '/demo/admin')).toMatchObject({ allowed: false, status: 404, state: 'absent' });
    expect(decideRouteAccess(minimal, '/api/admin/orders/export.csv')).toMatchObject({ allowed: false, status: 404 });

    const input = structuredClone(createPresetManifest('minimal', deployment)) as CapabilityManifestInput;
    const capabilities = input.capabilities as Record<string, unknown>;
    capabilities['CAT-001'] = {
      state: 'active',
      flags: { routes: false, navigation: false, jobs: false, sideEffects: false },
    };
    const closed = createPlatform(input);
    expect(decideRouteAccess(closed, '/demo/admin/productos')).toMatchObject({ allowed: false, status: 403 });
  });

  it('protege los campos avanzados del PATCH compartido con CAT-003', () => {
    expect(productPatchSource).toContain("runtimePlatform.isCapabilityActive('CAT-003')");
    expect(productPatchSource).toContain("error: 'Recurso no disponible.'");
  });

  it.each([
    ['minimal', '/demo/admin/productos', true],
    ['minimal', '/api/cart/quote', false],
    ['standard', '/api/cart/quote', true],
    ['standard', '/api/admin/orders/export.csv', false],
    ['standard', '/demo/admin/productos/1', false],
    ['standard', '/api/admin/catalog-variants/1', false],
    ['advanced', '/api/admin/orders/export.csv', true],
    ['advanced', '/demo/admin/productos/1', true],
    ['advanced', '/api/admin/catalog-variants/1', true],
    ['advanced', '/api/admin/catalog-attributes/definitions/product/1', true],
    ['advanced', '/api/admin/catalog-media/product/1', true],
    ['advanced', '/api/admin/refunds/7', true],
    ['standard', '/api/admin/catalog-attributes/definitions/product/1', false],
    ['standard', '/api/admin/catalog-media/product/1', false],
    ['standard', '/api/admin/refunds/7', false],
    ['advanced', '/api/admin/backup.sql', true],
  ] as const)('applies the %s preset to %s', (profile, pathname, allowed) => {
    expect(decideRouteAccess(platformFor(profile), pathname)?.allowed).toBe(allowed);
  });

  it('keeps an explicit safe fallback reachable while a capability is degraded', () => {
    const input = structuredClone(createPresetManifest('advanced', deployment)) as CapabilityManifestInput;
    const capabilities = input.capabilities as Record<string, unknown>;
    capabilities['INT-004'] = {
      state: 'degraded',
      flags: { routes: true, navigation: false, jobs: false, sideEffects: false },
      degradation: {
        reason: 'La copia remota no responde.',
        fallback: 'Descarga SQL manual.',
      },
    };
    expect(decideRouteAccess(createPlatform(input), '/api/admin/backup.sql')).toEqual({
      allowed: true,
      capabilityId: 'INT-004',
      state: 'degraded',
      degradation: {
        reason: 'La copia remota no responde.',
        fallback: 'Descarga SQL manual.',
      },
    });
  });

  it('preserves every public demo panel surface while disabling commercial effects', () => {
    const demo = createPlatform(platformManifest);
    expect(adminNavigationFor(demo).map((item) => item.id)).toEqual(['pedidos', 'productos', 'ubicaciones', 'envios', 'emails']);
    for (const pathname of [
      '/demo/admin',
      '/demo/admin/productos',
      '/demo/admin/productos/1',
      '/demo/admin/ubicaciones',
      '/api/admin/inventory-locations',
      '/demo/admin/envios',
      '/demo/admin/emails',
      '/api/admin/orders/export.csv',
      '/api/admin/backup.sql',
      '/api/admin/catalog-options/product/1',
      '/api/admin/catalog-option-values/1',
      '/api/admin/catalog-variants/1',
      '/api/admin/catalog-attributes/definitions/product/1',
      '/api/admin/catalog-media/product/1',
      '/api/admin/refunds/7',
    ]) {
      expect(decideRouteAccess(demo, pathname)?.allowed).toBe(true);
    }
    for (const capability of Object.values(demo.manifest.capabilities)) {
      expect(capability.flags.jobs).toBe(false);
      expect(capability.flags.sideEffects).toBe(false);
    }
  });
});
