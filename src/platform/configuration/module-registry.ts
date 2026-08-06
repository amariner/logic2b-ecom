import { CAPABILITY_IDS, type CapabilityId } from './capability-definitions';
import type { ResolvedCapabilityManifest } from './manifest';

export const MODULE_IDS = [
  'platform-configuration',
  'platform-security',
  'platform-operations',
  'catalog',
  'pricing',
  'inventory',
  'cart',
  'checkout',
  'payments',
  'orders',
  'fulfillment',
  'customers',
  'notifications',
  'integrations',
  'storefront',
  'marketing',
] as const;

export type ModuleId = (typeof MODULE_IDS)[number];
export type ModuleVersion = `${number}.${number}.${number}`;

export type ModuleNavigationItem = Readonly<{
  id: string;
  href: `/${string}`;
  label: string;
  order: number;
  capabilityId: CapabilityId;
}>;

export type ModuleRoute = Readonly<{
  match: 'exact' | 'prefix';
  path: `/${string}`;
  capabilityId: CapabilityId;
}>;

export type ModuleDescriptor = Readonly<{
  id: ModuleId;
  version: ModuleVersion;
  capabilities: readonly CapabilityId[];
  dependencies: readonly ModuleId[];
  permissions: readonly string[];
  events: readonly string[];
  jobs: readonly string[];
  healthchecks: readonly string[];
  wikiLinks: readonly string[];
  navigation: readonly ModuleNavigationItem[];
  routes: readonly ModuleRoute[];
}>;

const ARCHITECTURE_WIKI = 'docs/plataforma/wiki/arquitectura-modular-ecommerce.md';

/**
 * Catálogo canónico de módulos R1.4. Los arrays vacíos son declaraciones
 * explícitas: eventos, jobs y healthchecks se incorporan en R1.5, R1.11 y
 * R1.10; no se inventan contratos antes de esos bloques.
 */
export const MODULE_DESCRIPTORS = [
  {
    id: 'platform-configuration', version: '1.0.0', capabilities: ['PLT-001', 'PLT-004'], dependencies: [],
    permissions: [], events: [], jobs: [], healthchecks: [], wikiLinks: [ARCHITECTURE_WIKI], navigation: [], routes: [],
  },
  {
    id: 'platform-security', version: '1.0.0', capabilities: ['SEC-001', 'SEC-003', 'SEC-004', 'SEC-012'],
    dependencies: ['platform-configuration'], permissions: ['admin.session'], events: [], jobs: [], healthchecks: [],
    wikiLinks: [ARCHITECTURE_WIKI], navigation: [],
    routes: [{ match: 'exact', path: '/demo/admin/login', capabilityId: 'SEC-001' }],
  },
  {
    id: 'platform-operations', version: '1.0.0', capabilities: ['INT-004'], dependencies: ['platform-security'],
    permissions: ['platform.backup.read'], events: [], jobs: [], healthchecks: [], wikiLinks: [ARCHITECTURE_WIKI],
    navigation: [], routes: [{ match: 'exact', path: '/api/admin/backup.sql', capabilityId: 'INT-004' }],
  },
  {
    id: 'catalog', version: '1.0.0', capabilities: ['CAT-001', 'CAT-002'], dependencies: ['platform-configuration'],
    permissions: ['catalog.read', 'catalog.write'], events: [], jobs: [], healthchecks: [], wikiLinks: [ARCHITECTURE_WIKI],
    navigation: [{ id: 'productos', href: '/demo/admin/productos', label: 'Productos', order: 20, capabilityId: 'CAT-001' }],
    routes: [
      { match: 'exact', path: '/demo/admin/productos', capabilityId: 'CAT-001' },
      { match: 'prefix', path: '/api/admin/products/', capabilityId: 'CAT-001' },
    ],
  },
  {
    id: 'pricing', version: '1.0.0', capabilities: ['PRC-001', 'PRC-002', 'MKT-001', 'MKT-002'],
    dependencies: ['platform-configuration', 'catalog'], permissions: [], events: [], jobs: [], healthchecks: [],
    wikiLinks: [ARCHITECTURE_WIKI], navigation: [], routes: [],
  },
  {
    id: 'inventory', version: '1.0.0', capabilities: ['INV-001'], dependencies: ['catalog'], permissions: [],
    events: [], jobs: [], healthchecks: [], wikiLinks: [ARCHITECTURE_WIKI], navigation: [], routes: [],
  },
  {
    id: 'cart', version: '1.0.0', capabilities: ['CHK-001'], dependencies: ['catalog'], permissions: [], events: [],
    jobs: [], healthchecks: [], wikiLinks: [ARCHITECTURE_WIKI], navigation: [], routes: [],
  },
  {
    id: 'customers', version: '1.0.0', capabilities: ['CUS-001'], dependencies: ['platform-configuration'],
    permissions: [], events: [], jobs: [], healthchecks: [], wikiLinks: [ARCHITECTURE_WIKI], navigation: [], routes: [],
  },
  {
    id: 'orders', version: '1.0.0', capabilities: ['ORD-001', 'ORD-002', 'AUT-001'],
    dependencies: ['catalog', 'pricing', 'customers'], permissions: ['orders.read', 'orders.transition'], events: [],
    jobs: [], healthchecks: [], wikiLinks: [ARCHITECTURE_WIKI],
    navigation: [{ id: 'pedidos', href: '/demo/admin', label: 'Pedidos', order: 10, capabilityId: 'ORD-001' }],
    routes: [
      { match: 'exact', path: '/demo/admin', capabilityId: 'ORD-001' },
      { match: 'prefix', path: '/demo/admin/pedidos/', capabilityId: 'ORD-001' },
      { match: 'prefix', path: '/api/admin/orders/', capabilityId: 'ORD-002' },
    ],
  },
  {
    id: 'fulfillment', version: '1.0.0', capabilities: ['FUL-001', 'FUL-002', 'FUL-003'],
    dependencies: ['orders', 'inventory'], permissions: ['fulfillment.read', 'fulfillment.write', 'fulfillment.export'],
    events: [], jobs: [], healthchecks: [], wikiLinks: [ARCHITECTURE_WIKI],
    navigation: [{ id: 'envios', href: '/demo/admin/envios', label: 'Envíos', order: 30, capabilityId: 'FUL-001' }],
    routes: [
      { match: 'exact', path: '/demo/admin/envios', capabilityId: 'FUL-001' },
      { match: 'prefix', path: '/api/admin/shipping-rates/', capabilityId: 'FUL-001' },
      { match: 'exact', path: '/api/admin/orders/export.csv', capabilityId: 'FUL-003' },
    ],
  },
  {
    id: 'notifications', version: '1.0.0', capabilities: ['MAR-003', 'AUT-002', 'INT-002'],
    dependencies: ['platform-configuration'], permissions: ['notifications.read'], events: [], jobs: [], healthchecks: [],
    wikiLinks: [ARCHITECTURE_WIKI],
    navigation: [{ id: 'emails', href: '/demo/admin/emails', label: 'Emails', order: 40, capabilityId: 'MAR-003' }],
    routes: [{ match: 'exact', path: '/demo/admin/emails', capabilityId: 'MAR-003' }],
  },
  {
    id: 'payments', version: '1.0.0', capabilities: ['CHK-004', 'INT-001'], dependencies: ['platform-configuration'],
    permissions: [], events: [], jobs: [], healthchecks: [], wikiLinks: [ARCHITECTURE_WIKI], navigation: [],
    routes: [{ match: 'exact', path: '/api/webhooks/stripe', capabilityId: 'CHK-004' }],
  },
  {
    id: 'checkout', version: '1.0.0', capabilities: ['CHK-002', 'CHK-003'],
    dependencies: ['cart', 'catalog', 'pricing', 'inventory', 'fulfillment', 'customers', 'payments', 'orders'],
    permissions: [], events: [], jobs: [], healthchecks: [], wikiLinks: [ARCHITECTURE_WIKI], navigation: [],
    routes: [
      { match: 'exact', path: '/api/cart/quote', capabilityId: 'CHK-002' },
      { match: 'exact', path: '/api/checkout/session', capabilityId: 'CHK-003' },
    ],
  },
  {
    id: 'integrations', version: '1.0.0', capabilities: ['INT-003'],
    dependencies: ['payments', 'fulfillment', 'notifications'], permissions: [], events: [], jobs: [], healthchecks: [],
    wikiLinks: [ARCHITECTURE_WIKI], navigation: [], routes: [],
  },
  {
    id: 'storefront', version: '1.0.0', capabilities: ['STO-001', 'STO-002', 'STO-008'],
    dependencies: ['platform-configuration', 'platform-security', 'catalog', 'pricing'], permissions: [], events: [],
    jobs: [], healthchecks: [], wikiLinks: [ARCHITECTURE_WIKI], navigation: [], routes: [],
  },
  {
    id: 'marketing', version: '1.0.0', capabilities: ['MAR-001'], dependencies: ['customers', 'notifications'],
    permissions: [], events: [], jobs: [], healthchecks: [], wikiLinks: [ARCHITECTURE_WIKI], navigation: [], routes: [],
  },
] as const satisfies readonly ModuleDescriptor[];

export type AdminNavigationId = (typeof MODULE_DESCRIPTORS)[number]['navigation'][number]['id'];

export type ModuleRegistryIssue = Readonly<{
  code: 'invalid-descriptor' | 'duplicate-module' | 'unknown-dependency' | 'dependency-cycle' |
    'duplicate-capability' | 'missing-capability' | 'duplicate-navigation' | 'duplicate-route';
  path: string;
  message: string;
}>;

export type ModuleRegistry = Readonly<{
  descriptors: readonly ModuleDescriptor[];
  byId: Readonly<Record<ModuleId, ModuleDescriptor>>;
  capabilityOwners: Readonly<Record<CapabilityId, ModuleId>>;
  navigation: readonly ModuleNavigationItem[];
  routes: readonly ModuleRoute[];
}>;

export type OperationalModule = Readonly<{
  descriptor: ModuleDescriptor;
  state: 'active' | 'degraded';
  activeCapabilities: readonly CapabilityId[];
  degradedCapabilities: readonly CapabilityId[];
}>;

const moduleIdSet = new Set<string>(MODULE_IDS);
const capabilityIdSet = new Set<string>(CAPABILITY_IDS);
const descriptorFields = ['id', 'version', 'capabilities', 'dependencies', 'permissions', 'events', 'jobs', 'healthchecks', 'wikiLinks', 'navigation', 'routes'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function dependencyCycleIssues(descriptors: readonly ModuleDescriptor[]): ModuleRegistryIssue[] {
  const issues: ModuleRegistryIssue[] = [];
  const byId = new Map(descriptors.map((descriptor) => [descriptor.id, descriptor]));
  const state = new Map<ModuleId, 'visiting' | 'done'>();
  const stack: ModuleId[] = [];
  const visit = (id: ModuleId): void => {
    if (state.get(id) === 'done') return;
    if (state.get(id) === 'visiting') {
      const start = stack.indexOf(id);
      issues.push({ code: 'dependency-cycle', path: `modules.${id}`, message: `Ciclo: ${[...stack.slice(start), id].join(' -> ')}.` });
      return;
    }
    state.set(id, 'visiting');
    stack.push(id);
    for (const dependency of byId.get(id)?.dependencies ?? []) if (byId.has(dependency)) visit(dependency);
    stack.pop();
    state.set(id, 'done');
  };
  for (const id of byId.keys()) visit(id);
  return issues;
}

export function validateModuleRegistry(input: unknown): readonly ModuleRegistryIssue[] {
  const issues: ModuleRegistryIssue[] = [];
  if (!Array.isArray(input)) return [{ code: 'invalid-descriptor', path: 'modules', message: 'El registro debe ser un array.' }];

  const descriptors: ModuleDescriptor[] = [];
  const seenModules = new Set<string>();
  const capabilityOwners = new Map<string, string>();
  const navigationIds = new Set<string>();
  const navigationHrefs = new Set<string>();
  const routePaths = new Set<string>();

  input.forEach((raw, index) => {
    const path = `modules.${index}`;
    if (!isRecord(raw)) {
      issues.push({ code: 'invalid-descriptor', path, message: 'Descriptor inválido.' });
      return;
    }
    if (Object.keys(raw).some((key) => !descriptorFields.includes(key))) {
      issues.push({ code: 'invalid-descriptor', path, message: 'El descriptor contiene campos desconocidos.' });
    }
    const id = raw.id;
    if (typeof id !== 'string' || !moduleIdSet.has(id)) {
      issues.push({ code: 'invalid-descriptor', path: `${path}.id`, message: 'Id de módulo desconocido.' });
      return;
    }
    if (seenModules.has(id)) issues.push({ code: 'duplicate-module', path: `${path}.id`, message: `Módulo duplicado: ${id}.` });
    seenModules.add(id);
    if (typeof raw.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(raw.version)) {
      issues.push({ code: 'invalid-descriptor', path: `${path}.version`, message: 'La versión debe ser semver estable.' });
    }
    for (const field of ['capabilities', 'dependencies', 'permissions', 'events', 'jobs', 'healthchecks', 'wikiLinks', 'navigation', 'routes']) {
      if (!Array.isArray(raw[field])) issues.push({ code: 'invalid-descriptor', path: `${path}.${field}`, message: `${field} debe ser un array.` });
    }
    for (const field of ['permissions', 'events', 'jobs', 'healthchecks', 'wikiLinks'] as const) {
      if (Array.isArray(raw[field]) && raw[field].some((value) => typeof value !== 'string' || value.length === 0)) {
        issues.push({ code: 'invalid-descriptor', path: `${path}.${field}`, message: `${field} solo admite cadenas no vacías.` });
      }
    }
    if (!Array.isArray(raw.capabilities) || !Array.isArray(raw.dependencies) || !Array.isArray(raw.navigation) || !Array.isArray(raw.routes)) return;
    for (const capability of raw.capabilities) {
      if (typeof capability !== 'string' || !capabilityIdSet.has(capability)) {
        issues.push({ code: 'invalid-descriptor', path: `${path}.capabilities`, message: `Capacidad desconocida: ${String(capability)}.` });
      } else if (capabilityOwners.has(capability)) {
        issues.push({ code: 'duplicate-capability', path: `${path}.capabilities`, message: `${capability} ya pertenece a ${capabilityOwners.get(capability)}.` });
      } else capabilityOwners.set(capability, id);
    }
    for (const dependency of raw.dependencies) {
      if (typeof dependency !== 'string' || !moduleIdSet.has(dependency)) {
        issues.push({ code: 'unknown-dependency', path: `${path}.dependencies`, message: `Dependencia desconocida: ${String(dependency)}.` });
      }
    }
    for (const [navIndex, navigation] of raw.navigation.entries()) {
      if (!isRecord(navigation) || typeof navigation.id !== 'string' || typeof navigation.href !== 'string' ||
          !navigation.href.startsWith('/') || typeof navigation.label !== 'string' ||
          typeof navigation.order !== 'number' || !Number.isFinite(navigation.order) ||
          typeof navigation.capabilityId !== 'string' ||
          !raw.capabilities.includes(navigation.capabilityId)) {
        issues.push({ code: 'invalid-descriptor', path: `${path}.navigation.${navIndex}`, message: 'Entrada de navegación inválida o ajena al módulo.' });
        continue;
      }
      if (navigationIds.has(navigation.id) || navigationHrefs.has(navigation.href)) {
        issues.push({ code: 'duplicate-navigation', path: `${path}.navigation.${navIndex}`, message: `Id o href de navegación duplicado: ${navigation.id} · ${navigation.href}.` });
      }
      navigationIds.add(navigation.id);
      navigationHrefs.add(navigation.href);
    }
    for (const [routeIndex, route] of raw.routes.entries()) {
      if (!isRecord(route) || (route.match !== 'exact' && route.match !== 'prefix') || typeof route.path !== 'string' ||
          !route.path.startsWith('/') || typeof route.capabilityId !== 'string' || !raw.capabilities.includes(route.capabilityId)) {
        issues.push({ code: 'invalid-descriptor', path: `${path}.routes.${routeIndex}`, message: 'Ruta inválida o ajena al módulo.' });
        continue;
      }
      if (routePaths.has(route.path)) issues.push({ code: 'duplicate-route', path: `${path}.routes.${routeIndex}`, message: `Ruta duplicada: ${route.path}.` });
      routePaths.add(route.path);
    }
    descriptors.push(raw as unknown as ModuleDescriptor);
  });

  for (const id of MODULE_IDS) {
    if (!seenModules.has(id)) issues.push({ code: 'invalid-descriptor', path: `modules.${id}`, message: `Falta el módulo ${id}.` });
  }
  for (const capability of CAPABILITY_IDS) {
    if (!capabilityOwners.has(capability)) issues.push({ code: 'missing-capability', path: `capabilities.${capability}`, message: `${capability} no tiene módulo propietario.` });
  }
  issues.push(...dependencyCycleIssues(descriptors));
  return issues;
}

export class ModuleRegistryError extends Error {
  constructor(readonly issues: readonly ModuleRegistryIssue[]) {
    super(`Registro de módulos inválido:\n${issues.map((issue) => `- ${issue.path}: ${issue.message}`).join('\n')}`);
    this.name = 'ModuleRegistryError';
  }
}

export function createModuleRegistry(input: unknown = MODULE_DESCRIPTORS): ModuleRegistry {
  const issues = validateModuleRegistry(input);
  if (issues.length > 0) throw new ModuleRegistryError(issues);
  const descriptors = Object.freeze((input as readonly ModuleDescriptor[]).map((descriptor): ModuleDescriptor =>
    Object.freeze({
      ...descriptor,
      capabilities: Object.freeze([...descriptor.capabilities]),
      dependencies: Object.freeze([...descriptor.dependencies]),
      permissions: Object.freeze([...descriptor.permissions]),
      events: Object.freeze([...descriptor.events]),
      jobs: Object.freeze([...descriptor.jobs]),
      healthchecks: Object.freeze([...descriptor.healthchecks]),
      wikiLinks: Object.freeze([...descriptor.wikiLinks]),
      navigation: Object.freeze(descriptor.navigation.map((item) => Object.freeze({ ...item }))),
      routes: Object.freeze(descriptor.routes.map((route) => Object.freeze({ ...route }))),
    }),
  ));
  const byId = Object.freeze(Object.fromEntries(descriptors.map((descriptor) => [descriptor.id, descriptor]))) as Readonly<Record<ModuleId, ModuleDescriptor>>;
  const capabilityOwners = Object.freeze(Object.fromEntries(descriptors.flatMap((descriptor) =>
    descriptor.capabilities.map((capability) => [capability, descriptor.id]),
  ))) as Readonly<Record<CapabilityId, ModuleId>>;
  const navigation = Object.freeze(descriptors.flatMap((descriptor) => descriptor.navigation).toSorted((a, b) => a.order - b.order));
  const routes = Object.freeze(descriptors.flatMap((descriptor) => descriptor.routes).toSorted((a, b) =>
    (a.match === b.match ? b.path.length - a.path.length : a.match === 'exact' ? -1 : 1),
  ));
  return Object.freeze({ descriptors, byId, capabilityOwners, navigation, routes });
}

export function resolveOperationalModules(
  registry: ModuleRegistry,
  manifest: ResolvedCapabilityManifest,
): readonly OperationalModule[] {
  const modules = registry.descriptors.flatMap((descriptor): OperationalModule[] => {
    const activeCapabilities = descriptor.capabilities.filter((id) => manifest.capabilities[id].state === 'active');
    const degradedCapabilities = descriptor.capabilities.filter((id) => manifest.capabilities[id].state === 'degraded');
    if (activeCapabilities.length === 0 && degradedCapabilities.length === 0) return [];
    return [{
      descriptor,
      state: activeCapabilities.length > 0 ? 'active' : 'degraded',
      activeCapabilities: Object.freeze(activeCapabilities),
      degradedCapabilities: Object.freeze(degradedCapabilities),
    }];
  });
  const operationalIds = new Set(modules.map((module) => module.descriptor.id));
  for (const module of modules) {
    const missing = module.descriptor.dependencies.filter((dependency) => !operationalIds.has(dependency));
    if (missing.length > 0) {
      throw new ModuleRegistryError([{ code: 'unknown-dependency', path: `modules.${module.descriptor.id}.dependencies`, message: `Dependencias no operativas: ${missing.join(', ')}.` }]);
    }
  }
  return Object.freeze(modules);
}

export const MODULE_REGISTRY = createModuleRegistry();
