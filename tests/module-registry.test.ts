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
      expect(Object.isFrozen(descriptor.healthchecks)).toBe(true);
      expect(Object.isFrozen(descriptor.navigation)).toBe(true);
      expect(Object.isFrozen(descriptor.routes)).toBe(true);
    }
  });

  it('enlaza la guía R3 solo desde los módulos operativos que documenta', () => {
    const link = 'docs/plataforma/wiki/operacion-pedidos-inventario-devoluciones.md';
    expect(MODULE_REGISTRY.descriptors
      .filter((descriptor) => descriptor.wikiLinks.includes(link))
      .map((descriptor) => descriptor.id))
      .toEqual(['inventory', 'orders', 'fulfillment']);
  });

  it('versiona y enlaza el contrato de superficie passwordless desde customers', () => {
    const customers = MODULE_REGISTRY.descriptors.find((descriptor) => descriptor.id === 'customers');
    expect(customers).toMatchObject({ version: '1.9.0' });
    expect(customers?.wikiLinks).toContain(
      'docs/plataforma/adr/0043-superficie-passwordless-email-segura.md',
    );
    expect(customers?.wikiLinks).toContain(
      'docs/plataforma/adr/0044-ownership-recursos-autoservicio.md',
    );
    expect(customers?.routes).toEqual([
      { match: 'exact', path: '/cuenta/acceso', capabilityId: 'CUS-003' },
      { match: 'exact', path: '/cuenta/acceso/confirmar', capabilityId: 'CUS-003' },
      { match: 'exact', path: '/cuenta/sesiones', capabilityId: 'CUS-003' },
      { match: 'prefix', path: '/cuenta/pedidos', capabilityId: 'CUS-004' },
      { match: 'prefix', path: '/api/customer/orders/', capabilityId: 'CUS-004' },
    ]);
    expect(customers?.permissions).toContain('customer:orders:read');
  });

  it('asigna cada healthcheck R1.10 a un único módulo propietario', () => {
    expect(MODULE_REGISTRY.healthcheckOwners).toEqual({
      'notifications.resend-email': 'notifications',
      'payments.stripe-checkout': 'payments',
      'integrations.logistics-csv': 'integrations',
    });

    const descriptors = mutableDescriptors();
    (descriptors[12]!.healthchecks as string[]).push('payments.stripe-checkout');
    expect(validateModuleRegistry(descriptors).map((issue) => issue.code)).toContain('duplicate-healthcheck');
  });

  it('asigna cada job R1.11 a un único módulo propietario', () => {
    expect(MODULE_REGISTRY.jobOwners).toEqual({
      'platform-configuration.demo-fixture-reset': 'platform-configuration',
      'notifications.event-outbox-sweep': 'notifications',
      'inventory.expire-reservations': 'inventory',
      'orders.execute-bulk-action': 'orders',
    });
    const descriptors = mutableDescriptors();
    (descriptors[1]!.jobs as string[]).push('platform-configuration.demo-fixture-reset');
    const codes = validateModuleRegistry(descriptors).map((issue) => issue.code);
    expect(codes).toContain('foreign-job');
    expect(codes).toContain('duplicate-job');
  });

  it('deriva navegación y rutas del registro con prioridad estable', () => {
    expect(MODULE_REGISTRY.navigation.map(({ id, order }) => [id, order])).toEqual([
      ['pedidos', 10], ['documentos', 18], ['productos', 20], ['ubicaciones', 25], ['transferencias', 27], ['conteos', 28], ['asignacion', 29], ['envios', 30], ['devoluciones', 32], ['emails', 40],
    ]);
    expect(MODULE_REGISTRY.routes[0]).toMatchObject({ match: 'exact' });
    const exportIndex = MODULE_REGISTRY.routes.findIndex((route) => route.path === '/api/admin/orders/export.csv');
    const ordersPrefixIndex = MODULE_REGISTRY.routes.findIndex((route) => route.path === '/api/admin/orders/');
    expect(exportIndex).toBeLessThan(ordersPrefixIndex);
    expect(MODULE_REGISTRY.capabilityOwners['CAT-007']).toBe('catalog');
    expect(MODULE_REGISTRY.capabilityOwners['CAT-008']).toBe('catalog');
    expect(MODULE_REGISTRY.capabilityOwners['PRC-003']).toBe('pricing');
    expect(MODULE_REGISTRY.capabilityOwners['PRC-004']).toBe('pricing');
    expect(MODULE_REGISTRY.capabilityOwners['PRC-005']).toBe('pricing');
    expect(MODULE_REGISTRY.capabilityOwners['PRC-006']).toBe('pricing');
    expect(MODULE_REGISTRY.capabilityOwners['PRC-007']).toBe('pricing');
    expect(MODULE_REGISTRY.capabilityOwners['PRC-008']).toBe('pricing');
    expect(MODULE_REGISTRY.capabilityOwners['PRC-009']).toBe('pricing');
    expect(MODULE_REGISTRY.capabilityOwners['PRC-012']).toBe('pricing');
    expect(MODULE_REGISTRY.capabilityOwners['PRC-014']).toBe('pricing');
    expect(MODULE_REGISTRY.capabilityOwners['ORD-007']).toBe('orders');
    expect(MODULE_REGISTRY.capabilityOwners['ORD-008']).toBe('orders');
    expect(MODULE_REGISTRY.capabilityOwners['CHK-011']).toBe('checkout');
    expect(MODULE_REGISTRY.capabilityOwners['CUS-002']).toBe('customers');
    expect(MODULE_REGISTRY.capabilityOwners['CUS-003']).toBe('customers');
    expect(MODULE_REGISTRY.capabilityOwners['CUS-004']).toBe('customers');
    expect(MODULE_REGISTRY.capabilityOwners['CUS-007']).toBe('customers');
    expect(MODULE_REGISTRY.capabilityOwners['CUS-008']).toBe('customers');
    expect(MODULE_REGISTRY.capabilityOwners['ORD-005']).toBe('orders');
    expect(MODULE_REGISTRY.capabilityOwners['ORD-010']).toBe('orders');
    expect(MODULE_REGISTRY.capabilityOwners['ORD-011']).toBe('orders');
    expect(MODULE_REGISTRY.capabilityOwners['ORD-012']).toBe('orders');
    expect(MODULE_REGISTRY.capabilityOwners['AUT-011']).toBe('orders');
    expect(MODULE_REGISTRY.capabilityOwners['INV-007']).toBe('inventory');
    expect(MODULE_REGISTRY.capabilityOwners['INV-008']).toBe('inventory');
    expect(MODULE_REGISTRY.capabilityOwners['INV-011']).toBe('inventory');
    expect(MODULE_REGISTRY.routes).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '/api/admin/catalog-attributes/', capabilityId: 'CAT-007' }),
      expect.objectContaining({ path: '/api/admin/catalog-media/', capabilityId: 'CAT-008' }),
      expect.objectContaining({ path: '/api/admin/refunds/', capabilityId: 'ORD-007' }),
      expect.objectContaining({ path: '/api/admin/order-amendments', capabilityId: 'ORD-005' }),
      expect.objectContaining({ path: '/api/admin/order-holds', capabilityId: 'ORD-010' }),
      expect.objectContaining({ path: '/api/admin/inventory-routing', capabilityId: 'INV-011' }),
      expect.objectContaining({ path: '/api/admin/order-documents', capabilityId: 'ORD-012' }),
      expect.objectContaining({ path: '/api/admin/promotion-codes', capabilityId: 'PRC-004' }),
      expect.objectContaining({ path: '/api/admin/automatic-discounts', capabilityId: 'PRC-005' }),
      expect.objectContaining({ path: '/api/admin/quantity-offers', capabilityId: 'PRC-006' }),
      expect.objectContaining({ path: '/api/admin/discount-combinations', capabilityId: 'PRC-008' }),
      expect.objectContaining({ path: '/api/admin/price-lists', capabilityId: 'PRC-009' }),
      expect.objectContaining({ path: '/api/admin/bundles', capabilityId: 'PRC-012' }),
      expect.objectContaining({ path: '/api/admin/subscriptions', capabilityId: 'PRC-013' }),
      expect.objectContaining({ path: '/api/admin/preorders', capabilityId: 'PRC-014' }),
      expect.objectContaining({ path: '/cuenta/acceso', capabilityId: 'CUS-003' }),
      expect.objectContaining({ path: '/cuenta/acceso/confirmar', capabilityId: 'CUS-003' }),
      expect.objectContaining({ path: '/cuenta/sesiones', capabilityId: 'CUS-003' }),
    ]));
  });

  it.each([
    ['minimal', ['platform-configuration', 'platform-security', 'catalog', 'pricing', 'storefront']],
    ['standard', ['platform-configuration', 'platform-security', 'catalog', 'pricing', 'inventory', 'cart', 'customers', 'orders', 'fulfillment', 'notifications', 'payments', 'checkout', 'storefront']],
    ['advanced', MODULE_REGISTRY.descriptors
      .filter((descriptor) => descriptor.id !== 'subscriptions')
      .map((descriptor) => descriptor.id)],
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
