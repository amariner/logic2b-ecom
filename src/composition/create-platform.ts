import {
  resolveCapabilityManifest,
  type CapabilityFlagName,
  type CapabilityId,
  type CapabilityManifestInput,
  type CapabilityState,
  type ResolvedCapabilityEntry,
  type ResolvedCapabilityManifest,
} from '../platform/configuration';

export type Platform = Readonly<{
  manifest: ResolvedCapabilityManifest;
  capability: <Id extends CapabilityId>(id: Id) => ResolvedCapabilityEntry<Id>;
  capabilityState: (id: CapabilityId) => CapabilityState;
  isCapabilityActive: (id: CapabilityId) => boolean;
  hasCapabilityFlag: (id: CapabilityId, flag: CapabilityFlagName) => boolean;
}>;

/**
 * Composition root puro de R1.2, conectado a presentación por R1.3. R1.4
 * añadirá los descriptores y la selección central de módulos/adaptadores.
 */
export function createPlatform(input: CapabilityManifestInput): Platform {
  const manifest = resolveCapabilityManifest(input);
  return Object.freeze({
    manifest,
    capability: <Id extends CapabilityId>(id: Id): ResolvedCapabilityEntry<Id> => manifest.capabilities[id],
    capabilityState: (id: CapabilityId): CapabilityState => manifest.capabilities[id].state,
    isCapabilityActive: (id: CapabilityId): boolean => manifest.capabilities[id].state === 'active',
    hasCapabilityFlag: (id: CapabilityId, flag: CapabilityFlagName): boolean => {
      const entry = manifest.capabilities[id];
      return (entry.state === 'active' || entry.state === 'degraded') && entry.flags[flag];
    },
  });
}
