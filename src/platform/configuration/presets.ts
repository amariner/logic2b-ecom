import type {
  CapabilityFlags,
  CapabilityManifestEntries,
  CapabilityManifestInput,
  CapabilityPresetName,
  DeploymentConfiguration,
} from './manifest';

const INTERNAL: CapabilityFlags = { routes: false, navigation: false, jobs: false, sideEffects: false };
const ROUTE: CapabilityFlags = { routes: true, navigation: false, jobs: false, sideEffects: false };
const NAVIGATION: CapabilityFlags = { routes: true, navigation: true, jobs: false, sideEffects: false };
const EFFECT: CapabilityFlags = { routes: false, navigation: false, jobs: false, sideEffects: true };
const JOB_EFFECT: CapabilityFlags = { routes: false, navigation: false, jobs: true, sideEffects: true };
const ROUTE_EFFECT: CapabilityFlags = { routes: true, navigation: false, jobs: false, sideEffects: true };
const NAVIGATION_EFFECT: CapabilityFlags = { routes: true, navigation: true, jobs: false, sideEffects: true };

const MINIMAL_CAPABILITIES = {
  'PLT-001': { state: 'active', flags: INTERNAL },
  'PLT-004': { state: 'active', flags: INTERNAL, config: { failFast: true } },
  'CAT-001': { state: 'active', flags: NAVIGATION },
  'PRC-001': { state: 'active', flags: INTERNAL },
  'STO-001': { state: 'active', flags: NAVIGATION },
  'STO-008': { state: 'active', flags: INTERNAL },
  'MKT-001': { state: 'active', flags: INTERNAL, config: { currency: 'EUR' } },
  'SEC-012': { state: 'active', flags: INTERNAL },
} as const satisfies CapabilityManifestEntries;

const STANDARD_CAPABILITIES = {
  ...MINIMAL_CAPABILITIES,
  'INV-001': { state: 'active', flags: INTERNAL },
  // R2.8 está instalado pero exige opt-in explícito: sin flags no reserva,
  // consume ni ejecuta el job de expiración.
  'INV-004': { state: 'installed' },
  'CHK-001': { state: 'active', flags: NAVIGATION },
  'CHK-002': { state: 'active', flags: ROUTE },
  'CHK-003': { state: 'active', flags: ROUTE_EFFECT },
  'CHK-004': { state: 'active', flags: ROUTE_EFFECT },
  'ORD-001': { state: 'active', flags: NAVIGATION },
  'ORD-002': { state: 'active', flags: ROUTE },
  'FUL-001': {
    state: 'active',
    flags: NAVIGATION,
    config: { strategy: 'flat-zone', supportsFreeThreshold: true },
  },
  'CUS-001': { state: 'active', flags: INTERNAL },
  'MKT-002': { state: 'active', flags: INTERNAL, config: { country: 'ES', resolver: 'postal-prefix' } },
  'MAR-003': {
    state: 'active',
    flags: NAVIGATION_EFFECT,
    config: { demoDelivery: 'outbox', clientDelivery: 'provider' },
  },
  'AUT-001': { state: 'active', flags: INTERNAL },
  'AUT-002': { state: 'active', flags: JOB_EFFECT },
  'INT-001': {
    state: 'active',
    flags: EFFECT,
    config: {
      provider: 'stripe-checkout',
      secretRefs: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
    },
  },
  'SEC-001': { state: 'active', flags: ROUTE },
  'SEC-003': { state: 'active', flags: INTERNAL },
  'SEC-004': { state: 'active', flags: INTERNAL },
} as const satisfies CapabilityManifestEntries;

const ADVANCED_CAPABILITIES = {
  ...STANDARD_CAPABILITIES,
  'CAT-002': { state: 'active', flags: INTERNAL },
  'CAT-003': { state: 'active', flags: ROUTE },
  'CAT-007': { state: 'active', flags: ROUTE },
  'CAT-008': { state: 'active', flags: ROUTE },
  'PRC-002': { state: 'active', flags: INTERNAL },
  'FUL-002': { state: 'active', flags: ROUTE },
  'FUL-003': { state: 'active', flags: ROUTE },
  'STO-002': { state: 'active', flags: INTERNAL },
  'MAR-001': { state: 'active', flags: ROUTE_EFFECT },
  'INT-002': {
    state: 'active',
    flags: EFFECT,
    config: { provider: 'resend', delivery: 'send', secretRef: 'RESEND_API_KEY' },
  },
  'INT-003': { state: 'active', flags: EFFECT },
  'INT-004': { state: 'active', flags: ROUTE },
} as const satisfies CapabilityManifestEntries;

/** Perfiles técnicos de prueba/clonado; no representan precios ni planes comerciales. */
export const CAPABILITY_PRESETS = Object.freeze({
  minimal: MINIMAL_CAPABILITIES,
  standard: STANDARD_CAPABILITIES,
  advanced: ADVANCED_CAPABILITIES,
}) satisfies Readonly<Record<CapabilityPresetName, CapabilityManifestEntries>>;

export function createPresetManifest(
  profile: CapabilityPresetName,
  deployment: Omit<DeploymentConfiguration, 'profile'>,
): CapabilityManifestInput {
  return {
    manifestVersion: 1,
    deployment: { ...deployment, profile },
    capabilities: CAPABILITY_PRESETS[profile],
  };
}

/**
 * La demo comercial enseña todas las superficies del panel con fixtures, pero
 * nunca ejecuta cobros, emails, jobs ni mutaciones. No es un cuarto plan: es
 * una composición `custom` específica de la muestra pública.
 */
export function createPublicDemoManifest(
  deployment: Omit<DeploymentConfiguration, 'mode' | 'profile'>,
): CapabilityManifestInput {
  const capabilities = Object.fromEntries(
    Object.entries(ADVANCED_CAPABILITIES).map(([id, entry]) => {
      if (entry.state !== 'active') return [id, entry];
      const config = id === 'INT-002'
        ? { provider: 'resend' as const, delivery: 'capture' as const }
        : 'config' in entry
          ? entry.config
          : undefined;
      return [
        id,
        {
          ...entry,
          flags: { ...entry.flags, jobs: false, sideEffects: false },
          ...(config === undefined ? {} : { config }),
        },
      ];
    }),
  ) as CapabilityManifestEntries;

  return {
    manifestVersion: 1,
    deployment: { ...deployment, mode: 'demo', profile: 'custom' },
    capabilities,
  };
}
