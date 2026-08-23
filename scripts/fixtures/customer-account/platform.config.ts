import {
  createPresetManifest,
  type CapabilityManifestInput,
} from '../../../src/platform/configuration';

const INTERNAL = Object.freeze({
  routes: false,
  navigation: false,
  jobs: false,
  sideEffects: false,
});

const CUSTOMER_ACCOUNT = Object.freeze({
  routes: true,
  navigation: false,
  jobs: false,
  sideEffects: true,
});

const CUSTOMER_ORDER_READ = Object.freeze({
  routes: true,
  navigation: false,
  jobs: false,
  sideEffects: false,
});

const baseline = createPresetManifest('advanced', {
  id: 'customer-account-local-audit',
  mode: 'client',
  environment: 'development',
});

/**
 * Manifest cliente exclusivo del arnés local R5.4d. No lo importa el runtime
 * normal: la configuración Astro de la fixture lo sustituye mediante alias.
 */
export const platformManifest = Object.freeze({
  ...baseline,
  deployment: Object.freeze({ ...baseline.deployment, profile: 'custom' }),
  capabilities: Object.freeze({
    ...baseline.capabilities,
    'CUS-002': Object.freeze({ state: 'active', flags: INTERNAL }),
    'CUS-003': Object.freeze({
      state: 'active',
      flags: CUSTOMER_ACCOUNT,
      config: Object.freeze({
        methods: ['email_magic_link'] as const,
        provider: 'resend',
        origin: 'https://ecom.logic2b.com',
        challengeTtlSeconds: 600,
        session: Object.freeze({
          idleTtlSeconds: 86_400,
          absoluteTtlSeconds: 2_592_000,
        }),
        secretRefs: [
          'CUSTOMER_PROFILE_HMAC_SECRET',
          'CUSTOMER_AUTH_CSRF_SECRET',
          'RESEND_API_KEY',
        ] as const,
        rateLimit: Object.freeze({
          enforcement: 'edge-durable',
          failClosed: true,
          attestationRef: 'ops:rate:local-audit',
        }),
        tracking: Object.freeze({
          click: false,
          open: false,
          attestationRef: 'ops:resend:local-audit',
        }),
      }),
    }),
    'CUS-004': Object.freeze({ state: 'active', flags: CUSTOMER_ORDER_READ }),
    'CUS-006': Object.freeze({ state: 'active', flags: CUSTOMER_ORDER_READ }),
  }),
}) satisfies CapabilityManifestInput;
