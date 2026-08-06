import { describe, expect, it } from 'vitest';
import { createPlatform } from '../src/composition/create-platform';
import {
  CAPABILITY_IDS,
  MODULE_DESCRIPTORS,
  MODULE_IDS,
  MODULE_REGISTRY,
  ModuleRegistryError,
  createModuleRegistry,
  createPresetManifest,
  validateModuleRegistry,
} from '../src/platform/configuration';

const deployment = { id: 'module-registry-test', mode: 'client', environment: 'development' } as const;
const mutableDescriptors = () => structuredClone(MODULE_DESCRIPTORS) as unknown as Array<Record<string, unknown>>;

describe('registro de módulos (R1.4)', () => {
  it('declara todos los módulos y asigna cada capacidad exactamente una vez', () => {
    expect(MODULE_REGISTRY.descriptors.map((descriptor) => descriptor.id).toSorted()).toEqual([...MODULE_IDS].toSorted());
    expect(Object.keys(MODULE_REGISTRY.capabilityOwners).toSorted()).toEqual([...CAPABILITY_IDS].toSorted());
    expect(validateModuleRegistry(MODULE_DESCRIPTORS)).toEqual([]);
  });

  it('expone contratos inmutables y versiones semver', () => {
    expect(Object.isFrozen(MODULE_REGISTRY)).toBe(true);
    for (const descriptor of MODULE_REGISTRY.descriptors) {
      expect(descriptor.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(Object.isFrozen(descriptor)).toBe(true);
      expect(Object.isFrozen(descriptor.capabilities)).toBe(true);
      expect(Object.isFrozen(descriptor.navigation)).toBe(true);
      expect(Object.isFrozen(descriptor.routes)).toBe(true);
    }
  });

  it('deriva navegación y rutas del registro con prioridad estable', () => {
    expect(MODULE_REGISTRY.navigation.map(({ id, order }) => [id, order])).toEqual([
      ['pedidos', 10], ['productos', 20], ['envios', 30], ['emails', 40],
    ]);
    expect(MODULE_REGISTRY.routes[0]).toMatchObject({ match: 'exact' });
    const exportIndex = MODULE_REGISTRY.routes.findIndex((route) => route.path === '/api/admin/orders/export.csv');
    const ordersPrefixIndex = MODULE_REGISTRY.routes.findIndex((route) => route.path === '/api/admin/orders/');
    expect(exportIndex).toBeLessThan(ordersPrefixIndex);
  });

  it.each([
    ['minimal', ['platform-configuration', 'platform-security', 'catalog', 'pricing', 'storefront']],
    ['standard', ['platform-configuration', 'platform-security', 'catalog', 'pricing', 'inventory', 'cart', 'customers', 'orders', 'fulfillment', 'notifications', 'payments', 'checkout', 'storefront']],
    ['advanced', MODULE_REGISTRY.descriptors.map((descriptor) => descriptor.id)],
  ] as const)('compone solo los módulos operativos del preset %s', (preset, expected) => {
    const platform = createPlatform(createPresetManifest(preset, deployment));
    expect(platform.modules.map((module) => module.descriptor.id)).toEqual(expected);
    for (const module of platform.modules) expect(platform.hasModule(module.descriptor.id)).toBe(true);
    expect(platform.module('integrations')?.descriptor.id ?? null).toBe(preset === 'advanced' ? 'integrations' : null);
  });

  it('rechaza módulos y capacidades duplicados', () => {
    const descriptors = mutableDescriptors();
    descriptors[1]!.id = descriptors[0]!.id;
    (descriptors[2]!.capabilities as string[]).push('PLT-001');
    const codes = validateModuleRegistry(descriptors).map((issue) => issue.code);
    expect(codes).toContain('duplicate-module');
    expect(codes).toContain('duplicate-capability');
    expect(() => createModuleRegistry(descriptors)).toThrow(ModuleRegistryError);
  });

  it('rechaza capacidades sin propietario, dependencias desconocidas y ciclos', () => {
    const descriptors = mutableDescriptors();
    descriptors[0]!.capabilities = ['PLT-004'];
    descriptors[0]!.dependencies = ['storefront'];
    (descriptors[3]!.dependencies as string[]).push('modulo-inexistente');
    const codes = validateModuleRegistry(descriptors).map((issue) => issue.code);
    expect(codes).toContain('missing-capability');
    expect(codes).toContain('unknown-dependency');
    expect(codes).toContain('dependency-cycle');
  });

  it('rechaza navegación y rutas ajenas al contrato de su módulo', () => {
    const descriptors = mutableDescriptors();
    (descriptors[3]!.navigation as Array<Record<string, unknown>>)[0]!.capabilityId = 'ORD-001';
    (descriptors[3]!.routes as Array<Record<string, unknown>>)[0]!.path = 'sin-barra';
    const invalidPaths = validateModuleRegistry(descriptors)
      .filter((issue) => issue.code === 'invalid-descriptor')
      .map((issue) => issue.path);
    expect(invalidPaths).toContain('modules.3.navigation.0');
    expect(invalidPaths).toContain('modules.3.routes.0');

    const duplicates = mutableDescriptors();
    const navigation = duplicates[3]!.navigation as Array<Record<string, unknown>>;
    navigation.push({ ...navigation[0], href: '/demo/admin/otro-producto' });
    const routes = duplicates[3]!.routes as Array<Record<string, unknown>>;
    routes.push({ ...routes[0], match: 'prefix' });
    const duplicateCodes = validateModuleRegistry(duplicates).map((issue) => issue.code);
    expect(duplicateCodes).toContain('duplicate-navigation');
    expect(duplicateCodes).toContain('duplicate-route');
  });
});
