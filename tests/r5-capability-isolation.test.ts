import { describe, expect, it } from 'vitest';
import { createPlatform } from '../src/composition/create-platform';
import { runtimePlatform } from '../src/composition/runtime-platform';
import { canShowCustomerSegmentDemo } from '../src/composition/customer-segment-demo';
import { canShowMarketContentDemo } from '../src/composition/market-content-demo';
import { canShowMarketPublicationDemo } from '../src/composition/market-publication-demo';
import { canShowTaxDemo } from '../src/composition/tax-demo';
import { canShowCurrencyMethodsDemo } from '../src/composition/currency-methods-demo';
import { createRuntimeCustomerReturnHttp } from '../src/composition/runtime-customer-returns';
import {
  CAPABILITY_FLAG_NAMES,
  adminNavigationFor,
  createPresetManifest,
  decideCapabilityAccess,
  decideRouteAccess,
  type CapabilityId,
} from '../src/platform/configuration';

// Contrato de consolidación R5: disponer de una muestra visual no autoriza
// cuenta, publicación, fiscalidad, monedas ni métodos operativos.
const R5_CAPABILITIES = [
  'CUS-002', 'CUS-003', 'CUS-004', 'CUS-005', 'CUS-006', 'CUS-007', 'CUS-008', 'CUS-009',
  'MKT-003', 'MKT-004', 'MKT-006', 'MKT-007', 'MKT-008', 'MKT-009', 'MKT-010', 'CHK-010',
] as const satisfies readonly CapabilityId[];
const r5Ids = new Set<CapabilityId>(R5_CAPABILITIES);
const deployment = { id: 'r5-isolation-test', mode: 'client', environment: 'development' } as const;
const minimal = createPlatform(createPresetManifest('minimal', deployment));
const standard = createPlatform(createPresetManifest('standard', deployment));
const configurations = [
  { name: 'manifest público real', platform: runtimePlatform, expectedState: 'installed', showFixtures: true },
  { name: 'perfil minimal', platform: minimal, expectedState: 'absent', showFixtures: false },
  { name: 'perfil standard', platform: standard, expectedState: 'absent', showFixtures: false },
] as const;
const showcases = [
  { path: '/demo/admin/segmentos', visible: canShowCustomerSegmentDemo },
  { path: '/demo/admin/mercados', visible: canShowMarketContentDemo },
  { path: '/demo/admin/publicacion', visible: canShowMarketPublicationDemo },
  { path: '/demo/admin/impuestos', visible: canShowTaxDemo },
  { path: '/demo/admin/divisas', visible: canShowCurrencyMethodsDemo },
] as const;

describe('consolidación R5: presentación separada de capacidades operativas', () => {
  it.each(configurations)('$name conserva los gates operativos aunque existan las demos', ({ platform, expectedState, showFixtures }) => {
    for (const id of R5_CAPABILITIES) {
      expect(platform.capabilityState(id), id).toBe(expectedState);
      expect(platform.isCapabilityActive(id), id).toBe(false);
      for (const flag of CAPABILITY_FLAG_NAMES) {
        expect(platform.capability(id).flags[flag], `${id}.${flag}`).toBe(false);
        expect(decideCapabilityAccess(platform, id, flag)).toEqual({
          allowed: false, capabilityId: id, state: expectedState, status: 404,
        });
      }
    }

    // Se consulta el registro completo: una futura ruta o entrada R5 tampoco
    // puede escapar del gate al añadirse al panel o a la cuenta.
    for (const route of platform.registry.routes.filter(({ capabilityId }) => r5Ids.has(capabilityId))) {
      expect(decideRouteAccess(platform, route.path), route.path).toMatchObject({
        allowed: false, capabilityId: route.capabilityId, state: expectedState, status: 404,
      });
    }
    expect(adminNavigationFor(platform).filter(({ capabilityId }) => r5Ids.has(capabilityId))).toEqual([]);
    const operational = platform.modules.flatMap((module) => [...module.activeCapabilities, ...module.degradedCapabilities]);
    expect(operational.filter((id) => r5Ids.has(id))).toEqual([]);
    const crons = new Set(platform.jobRegistry.descriptors.flatMap(({ trigger }) => trigger.kind === 'recurring' ? trigger.crons : []));
    for (const cron of crons) {
      expect(platform.scheduledJobs(cron).filter(({ requiredCapabilityId }) =>
        requiredCapabilityId !== undefined && r5Ids.has(requiredCapabilityId))).toEqual([]);
    }

    // DEMO_MODE por sí solo no expone estas muestras en un perfil cliente;
    // la demo real las muestra sin registrarlas como navegación operativa.
    const operationalPaths = new Set(adminNavigationFor(platform).map(({ href }) => href));
    for (const showcase of showcases) {
      expect(showcase.visible({ DEMO_MODE: 'true' }, platform), showcase.path).toBe(showFixtures);
      expect(operationalPaths.has(showcase.path), showcase.path).toBe(false);
    }
  });

  it('conserva el checkout invitado y los módulos base sin activar cuenta o métodos locales', () => {
    for (const platform of [runtimePlatform, standard]) {
      expect(platform.isCapabilityActive('CUS-001')).toBe(true);
      expect(platform.module('customers')?.activeCapabilities).toContain('CUS-001');
      expect(platform.module('payments')?.activeCapabilities).toContain('CHK-004');
      expect(platform.hasModule('checkout')).toBe(true);
      for (const [path, id] of [
        ['/api/cart/quote', 'CHK-002'],
        ['/api/checkout/session', 'CHK-003'],
      ] as const) {
        expect(decideRouteAccess(platform, path)).toEqual({ allowed: true, capabilityId: id, state: 'active' });
      }
      expect(platform.isCapabilityActive('CUS-003')).toBe(false);
      expect(platform.isCapabilityActive('CHK-010')).toBe(false);
    }
    // Se conserva la ruta compartida, no un permiso para cobrar en la demo.
    expect(runtimePlatform.hasCapabilityFlag('CHK-003', 'sideEffects')).toBe(false);
    expect(standard.hasCapabilityFlag('CHK-003', 'sideEffects')).toBe(true);
    expect(minimal.hasModule('checkout')).toBe(false);
  });

  it.each(configurations)('$name no construye devoluciones de cuenta ni lee sus bindings', async ({ platform }) => {
    // Las fábricas de acceso, pedidos y direcciones ya tienen esta cobertura.
    // R5.12 la completa para devoluciones usando las composiciones reales.
    const forbidden = (): never => { throw new Error('El gate de cuenta accedió al runtime.'); };
    const env = new Proxy({}, { get: forbidden, has: forbidden, ownKeys: forbidden }) as Env;
    await expect(createRuntimeCustomerReturnHttp(env, {
      platform, now: forbidden, idFactory: forbidden, observability: { count: forbidden },
    })).resolves.toBeNull();
    if (platform === runtimePlatform) {
      await expect(createRuntimeCustomerReturnHttp(env)).resolves.toBeNull();
    }
  });
});
