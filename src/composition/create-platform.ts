import {
  resolveCapabilityManifest,
  resolveOperationalModules,
  MODULE_REGISTRY,
  type CapabilityFlagName,
  type CapabilityId,
  type CapabilityManifestInput,
  type CapabilityState,
  type ResolvedCapabilityEntry,
  type ResolvedCapabilityManifest,
  type ModuleId,
  type ModuleRegistry,
  type OperationalModule,
} from '../platform/configuration';

export type Platform = Readonly<{
  manifest: ResolvedCapabilityManifest;
  registry: ModuleRegistry;
  modules: readonly OperationalModule[];
  module: (id: ModuleId) => OperationalModule | null;
  hasModule: (id: ModuleId) => boolean;
  capability: <Id extends CapabilityId>(id: Id) => ResolvedCapabilityEntry<Id>;
  capabilityState: (id: CapabilityId) => CapabilityState;
  isCapabilityActive: (id: CapabilityId) => boolean;
  hasCapabilityFlag: (id: CapabilityId, flag: CapabilityFlagName) => boolean;
}>;

/**
 * Composition root puro: resuelve capacidades y compone solo los módulos que
 * quedan operativos para ese manifiesto.
 */
export function createPlatform(input: CapabilityManifestInput, registry: ModuleRegistry = MODULE_REGISTRY): Platform {
  const manifest = resolveCapabilityManifest(input);
  const modules = resolveOperationalModules(registry, manifest);
  const modulesById = new Map(modules.map((module) => [module.descriptor.id, module]));
  return Object.freeze({
    manifest,
    registry,
    modules,
    module: (id: ModuleId): OperationalModule | null => modulesById.get(id) ?? null,
    hasModule: (id: ModuleId): boolean => modulesById.has(id),
    capability: <Id extends CapabilityId>(id: Id): ResolvedCapabilityEntry<Id> => manifest.capabilities[id],
    capabilityState: (id: CapabilityId): CapabilityState => manifest.capabilities[id].state,
    isCapabilityActive: (id: CapabilityId): boolean => manifest.capabilities[id].state === 'active',
    hasCapabilityFlag: (id: CapabilityId, flag: CapabilityFlagName): boolean => {
      const entry = manifest.capabilities[id];
      return (entry.state === 'active' || entry.state === 'degraded') && entry.flags[flag];
    },
  });
}
