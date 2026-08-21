import { describe, expect, expectTypeOf, it } from 'vitest';
import { platformManifest } from '../platform.config';
import { createPlatform } from '../src/composition/create-platform';
import {
  CUSTOMER_SESSION_MAX_ABSOLUTE_TTL_MS,
  CUSTOMER_SESSION_MAX_IDLE_TTL_MS,
  PASSWORDLESS_CHALLENGE_MAX_TTL_MS,
} from '../src/modules/customers';
import {
  CAPABILITY_DEFINITIONS,
  CAPABILITY_IDS,
  CAPABILITY_PRESETS,
  CAPABILITY_STATES,
  CONFIGURED_CAPABILITY_IDS,
  CapabilityManifestError,
  createPresetManifest,
  resolveCapabilityManifest,
  validateCapabilityManifest,
  type CapabilityConfigById,
  type CapabilityState,
} from '../src/platform/configuration';

const deployment = {
  id: 'manifest-test',
  mode: 'client',
  environment: 'development',
} as const;

function mutableCopy<T>(value: T): T {
  return structuredClone(value);
}

type MutableManifest = {
  manifestVersion: 1;
  deployment: Record<string, unknown>;
  capabilities: Record<string, unknown>;
};

const INERT_FLAGS = { routes: false, navigation: false, jobs: false, sideEffects: false } as const;
const CUSTOMER_AUTH_FLAGS = { routes: true, navigation: false, jobs: false, sideEffects: true } as const;

const CUSTOMER_PASSWORDLESS_CONFIG = {
  methods: ['email_magic_link'],
  provider: 'resend',
  origin: 'https://shop.example.com',
  challengeTtlSeconds: 600,
  session: {
    idleTtlSeconds: 24 * 60 * 60,
    absoluteTtlSeconds: 14 * 24 * 60 * 60,
  },
  secretRefs: ['CUSTOMER_PROFILE_HMAC_SECRET', 'CUSTOMER_AUTH_CSRF_SECRET', 'RESEND_API_KEY'],
  rateLimit: {
    enforcement: 'edge-durable',
    failClosed: true,
    attestationRef: 'cloudflare:rate-limit:customer-auth:v1',
  },
  tracking: {
    click: false,
    open: false,
    attestationRef: 'resend:tracking-disabled:customer-auth:v1',
  },
} as const satisfies CapabilityConfigById['CUS-003'];

function activeCustomerPasswordlessManifest(): MutableManifest {
  const input = mutableCopy(createPresetManifest('advanced', deployment)) as unknown as MutableManifest;
  input.capabilities['CUS-002'] = { state: 'active', flags: INERT_FLAGS };
  input.capabilities['CUS-003'] = {
    state: 'active',
    flags: CUSTOMER_AUTH_FLAGS,
    config: mutableCopy(CUSTOMER_PASSWORDLESS_CONFIG),
  };
  return input;
}

function customerPasswordlessConfig(input: MutableManifest): Record<string, unknown> {
  return (input.capabilities['CUS-003'] as Record<string, unknown>).config as Record<string, unknown>;
}

describe('capability manifest (R1.2)', () => {
  it('fixes the six lifecycle states from ADR-0004', () => {
    expect(CAPABILITY_STATES).toEqual(['absent', 'installed', 'disabled', 'active', 'degraded', 'retired']);
    expectTypeOf<CapabilityState>().toEqualTypeOf<(typeof CAPABILITY_STATES)[number]>();
  });

  it.each(['minimal', 'standard', 'advanced'] as const)('validates the %s preset', (profile) => {
    const result = validateCapabilityManifest(createPresetManifest(profile, deployment));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.deployment.profile).toBe(profile);
    expect(Object.keys(result.value.capabilities)).toHaveLength(CAPABILITY_IDS.length);
  });

  it('keeps presets cumulative without turning them into commercial tiers', () => {
    const minimalCount = Object.keys(CAPABILITY_PRESETS.minimal).length;
    const standardCount = Object.keys(CAPABILITY_PRESETS.standard).length;
    const advancedCount = Object.keys(CAPABILITY_PRESETS.advanced).length;
    expect(minimalCount).toBeLessThan(standardCount);
    expect(standardCount).toBeLessThan(advancedCount);
    expect('CHK-003' in CAPABILITY_PRESETS.minimal).toBe(false);
    expect('CAT-003' in CAPABILITY_PRESETS.standard).toBe(false);
    expect(CAPABILITY_PRESETS.advanced['CAT-003']?.state).toBe('active');
    expect(CAPABILITY_PRESETS.advanced['CAT-007']?.state).toBe('active');
    expect(CAPABILITY_PRESETS.advanced['CAT-008']?.state).toBe('active');
    expect(CAPABILITY_PRESETS.advanced['PRC-003']?.state).toBe('active');
    expect(CAPABILITY_PRESETS.advanced['PRC-004']?.state).toBe('active');
    expect(CAPABILITY_PRESETS.advanced['PRC-005']?.state).toBe('active');
    expect(CAPABILITY_PRESETS.advanced['PRC-006']?.state).toBe('active');
    expect(CAPABILITY_PRESETS.advanced['PRC-007']?.state).toBe('active');
    expect(CAPABILITY_PRESETS.advanced['PRC-008']?.state).toBe('active');
    expect(CAPABILITY_PRESETS.advanced['PRC-009']?.state).toBe('active');
    expect(CAPABILITY_PRESETS.advanced['PRC-012']?.state).toBe('active');
    expect(CAPABILITY_PRESETS.advanced['PRC-014']?.state).toBe('active');
    expect(CAPABILITY_PRESETS.advanced['ORD-008']?.state).toBe('installed');
    expect(CAPABILITY_PRESETS.advanced['CHK-011']?.state).toBe('installed');
    expect(CAPABILITY_PRESETS.advanced['CUS-002']?.state).toBe('installed');
    expect(CAPABILITY_PRESETS.advanced['CUS-003']?.state).toBe('installed');
    expect(CAPABILITY_PRESETS.advanced['CUS-004']?.state).toBe('installed');
    expect(CAPABILITY_PRESETS.advanced['CUS-007']?.state).toBe('installed');
    expect(CAPABILITY_PRESETS.advanced['CUS-008']?.state).toBe('installed');
    expect('CAT-007' in CAPABILITY_PRESETS.standard).toBe(false);
    expect('CAT-008' in CAPABILITY_PRESETS.standard).toBe(false);
    expect('PRC-003' in CAPABILITY_PRESETS.standard).toBe(false);
    expect('PRC-004' in CAPABILITY_PRESETS.standard).toBe(false);
    expect('PRC-005' in CAPABILITY_PRESETS.standard).toBe(false);
    expect('PRC-006' in CAPABILITY_PRESETS.standard).toBe(false);
    expect('PRC-007' in CAPABILITY_PRESETS.standard).toBe(false);
    expect('PRC-008' in CAPABILITY_PRESETS.standard).toBe(false);
    expect('PRC-009' in CAPABILITY_PRESETS.standard).toBe(false);
    expect('PRC-012' in CAPABILITY_PRESETS.standard).toBe(false);
    expect('PRC-014' in CAPABILITY_PRESETS.standard).toBe(false);
    expect('CUS-002' in CAPABILITY_PRESETS.standard).toBe(false);
    expect('CUS-003' in CAPABILITY_PRESETS.standard).toBe(false);
    expect('CUS-004' in CAPABILITY_PRESETS.standard).toBe(false);
    expect('CUS-007' in CAPABILITY_PRESETS.standard).toBe(false);
    expect('CUS-008' in CAPABILITY_PRESETS.standard).toBe(false);
    expect(CAPABILITY_PRESETS.standard['CHK-003']?.state).toBe('active');
    expect(CAPABILITY_PRESETS.advanced['INT-004']?.state).toBe('active');
    expect(CAPABILITY_PRESETS.advanced['ORD-007']?.state).toBe('active');
    expect(CAPABILITY_PRESETS.advanced['ORD-005']?.state).toBe('active');
    expect(CAPABILITY_PRESETS.advanced['ORD-010']?.state).toBe('active');
    expect(CAPABILITY_PRESETS.advanced['ORD-011']?.state).toBe('active');
    expect(CAPABILITY_PRESETS.advanced['ORD-012']?.state).toBe('active');
    expect(CAPABILITY_PRESETS.advanced['AUT-011']?.state).toBe('active');
    expect(CAPABILITY_PRESETS.advanced['INV-004']?.state).toBe('active');
    expect(CAPABILITY_PRESETS.advanced['INV-007']?.state).toBe('active');
    expect(CAPABILITY_PRESETS.advanced['INV-008']?.state).toBe('active');
    expect(CAPABILITY_PRESETS.advanced['INV-011']?.state).toBe('active');
    expect('ORD-007' in CAPABILITY_PRESETS.standard).toBe(false);
    expect('ORD-005' in CAPABILITY_PRESETS.standard).toBe(false);
    expect('ORD-010' in CAPABILITY_PRESETS.standard).toBe(false);
    expect('ORD-011' in CAPABILITY_PRESETS.standard).toBe(false);
    expect('ORD-012' in CAPABILITY_PRESETS.standard).toBe(false);
    expect('AUT-011' in CAPABILITY_PRESETS.standard).toBe(false);
    expect('INV-007' in CAPABILITY_PRESETS.standard).toBe(false);
    expect('INV-008' in CAPABILITY_PRESETS.standard).toBe(false);
    expect('INV-011' in CAPABILITY_PRESETS.standard).toBe(false);
  });

  it('resolves omitted capabilities as absent with every runtime flag off', () => {
    const manifest = resolveCapabilityManifest(createPresetManifest('minimal', deployment));
    expect(manifest.capabilities['CHK-003']).toEqual({
      id: 'CHK-003',
      state: 'absent',
      flags: { routes: false, navigation: false, jobs: false, sideEffects: false },
    });
  });

  it('rejects an active capability whose dependency is absent', () => {
    const input = mutableCopy(createPresetManifest('minimal', deployment)) as unknown as MutableManifest;
    input.capabilities['CHK-002'] = {
      state: 'active',
      flags: { routes: true, navigation: false, jobs: false, sideEffects: false },
    };
    const result = validateCapabilityManifest(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((issue) => issue.code === 'missing-dependency' && issue.path === 'capabilities.CHK-002')).toBe(true);
  });

  it('rejects flags on disabled capabilities and navigation without routes', () => {
    const input = mutableCopy(createPresetManifest('advanced', deployment)) as unknown as MutableManifest;
    input.capabilities['INT-004'] = {
      state: 'disabled',
      flags: { routes: false, navigation: false, jobs: false, sideEffects: false },
    };
    input.capabilities['STO-001'] = {
      state: 'active',
      flags: { routes: false, navigation: true, jobs: false, sideEffects: false },
    };
    const result = validateCapabilityManifest(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.filter((issue) => issue.code === 'invalid-flags')).toHaveLength(2);
  });

  it('requires a reason and safe fallback for degraded capabilities', () => {
    const input = mutableCopy(createPresetManifest('advanced', deployment)) as unknown as MutableManifest;
    input.capabilities['INT-002'] = {
      state: 'degraded',
      flags: { routes: false, navigation: false, jobs: false, sideEffects: true },
      config: { provider: 'resend', delivery: 'capture' },
      degradation: { reason: '', fallback: '' },
    };
    const result = validateCapabilityManifest(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((issue) => issue.code === 'invalid-degradation')).toBe(true);
  });

  it('rejects unknown capabilities, fields and invalid provider configuration', () => {
    const input = mutableCopy(createPresetManifest('advanced', deployment)) as unknown as MutableManifest;
    input.capabilities['NEW-999'] = { state: 'active', flags: {} };
    input.capabilities['INT-001'] = {
      state: 'active',
      flags: { routes: false, navigation: false, jobs: false, sideEffects: true },
      config: { provider: 'stripe-checkout', secretKey: 'sk_plaintext_is_forbidden' },
      typo: true,
    };
    const result = validateCapabilityManifest(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['unknown-capability', 'unknown-field', 'invalid-config']),
    );
  });

  it('installs the CUS-003 contract without activating it in any preset', () => {
    expect(CONFIGURED_CAPABILITY_IDS).toContain('CUS-003');
    expect(CAPABILITY_DEFINITIONS['CUS-003'].dependencies).toContain('INT-002');
    expect('CUS-003' in CAPABILITY_PRESETS.minimal).toBe(false);
    expect('CUS-003' in CAPABILITY_PRESETS.standard).toBe(false);
    expect(CAPABILITY_PRESETS.advanced['CUS-003']).toEqual({ state: 'installed' });
  });

  it('accepts only the explicit passwordless email contract and freezes it deeply', () => {
    expect(CUSTOMER_PASSWORDLESS_CONFIG.challengeTtlSeconds * 1_000).toBeLessThanOrEqual(
      PASSWORDLESS_CHALLENGE_MAX_TTL_MS,
    );
    expect(CUSTOMER_PASSWORDLESS_CONFIG.session.idleTtlSeconds * 1_000).toBeLessThanOrEqual(
      CUSTOMER_SESSION_MAX_IDLE_TTL_MS,
    );
    expect(CUSTOMER_PASSWORDLESS_CONFIG.session.absoluteTtlSeconds * 1_000).toBeLessThanOrEqual(
      CUSTOMER_SESSION_MAX_ABSOLUTE_TTL_MS,
    );

    const result = validateCapabilityManifest(activeCustomerPasswordlessManifest());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const config = result.value.capabilities['CUS-003'].config;
    expect(config).toEqual(CUSTOMER_PASSWORDLESS_CONFIG);
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config?.methods)).toBe(true);
    expect(Object.isFrozen(config?.session)).toBe(true);
    expect(Object.isFrozen(config?.secretRefs)).toBe(true);
    expect(Object.isFrozen(config?.rateLimit)).toBe(true);
    expect(Object.isFrozen(config?.tracking)).toBe(true);
  });

  it.each([
    ['WebAuthn habilitado', (config: Record<string, unknown>) => { config.methods = ['webauthn']; }],
    ['más de un método', (config: Record<string, unknown>) => { config.methods = ['email_magic_link', 'webauthn']; }],
    ['otro proveedor', (config: Record<string, unknown>) => { config.provider = 'custom'; }],
    ['origin HTTP', (config: Record<string, unknown>) => { config.origin = 'http://shop.example.com'; }],
    ['origin con slash', (config: Record<string, unknown>) => { config.origin = 'https://shop.example.com/'; }],
    ['origin con path', (config: Record<string, unknown>) => { config.origin = 'https://shop.example.com/access'; }],
    ['origin con query', (config: Record<string, unknown>) => { config.origin = 'https://shop.example.com?from=auth'; }],
    ['origin con hash', (config: Record<string, unknown>) => { config.origin = 'https://shop.example.com#auth'; }],
    ['TTL distinto de 600 s', (config: Record<string, unknown>) => { config.challengeTtlSeconds = 601; }],
    ['secretRefs reordenados', (config: Record<string, unknown>) => {
      config.secretRefs = ['CUSTOMER_AUTH_CSRF_SECRET', 'CUSTOMER_PROFILE_HMAC_SECRET', 'RESEND_API_KEY'];
    }],
    ['secreto estático para proof o sesión', (config: Record<string, unknown>) => {
      config.secretRefs = ['CUSTOMER_PROFILE_HMAC_SECRET', 'CUSTOMER_AUTH_TOKEN_SECRET', 'RESEND_API_KEY'];
    }],
    ['secreto literal', (config: Record<string, unknown>) => {
      config.secretRefs = ['CUSTOMER_PROFILE_HMAC_SECRET', 'raw-secret', 'RESEND_API_KEY'];
    }],
    ['campo raíz desconocido', (config: Record<string, unknown>) => { config.cookieSecret = 'forbidden'; }],
    ['idle superior a 7 días', (config: Record<string, unknown>) => {
      (config.session as Record<string, unknown>).idleTtlSeconds = 7 * 24 * 60 * 60 + 1;
    }],
    ['absolute superior a 30 días', (config: Record<string, unknown>) => {
      (config.session as Record<string, unknown>).absoluteTtlSeconds = 30 * 24 * 60 * 60 + 1;
    }],
    ['idle superior a absolute', (config: Record<string, unknown>) => {
      (config.session as Record<string, unknown>).idleTtlSeconds = 2 * 24 * 60 * 60;
      (config.session as Record<string, unknown>).absoluteTtlSeconds = 24 * 60 * 60;
    }],
    ['sesión con segundos fraccionarios', (config: Record<string, unknown>) => {
      (config.session as Record<string, unknown>).idleTtlSeconds = 60.5;
    }],
    ['rate limit de isolate', (config: Record<string, unknown>) => {
      (config.rateLimit as Record<string, unknown>).enforcement = 'isolate';
    }],
    ['rate limit fail-open', (config: Record<string, unknown>) => {
      (config.rateLimit as Record<string, unknown>).failClosed = false;
    }],
    ['atestación vacía', (config: Record<string, unknown>) => {
      (config.rateLimit as Record<string, unknown>).attestationRef = '';
    }],
    ['atestación no opaca', (config: Record<string, unknown>) => {
      (config.rateLimit as Record<string, unknown>).attestationRef = 'https://example.com/policy?token=secret';
    }],
    ['campo rate limit desconocido', (config: Record<string, unknown>) => {
      (config.rateLimit as Record<string, unknown>).fallback = 'allow';
    }],
    ['click tracking activo', (config: Record<string, unknown>) => {
      (config.tracking as Record<string, unknown>).click = true;
    }],
    ['open tracking activo', (config: Record<string, unknown>) => {
      (config.tracking as Record<string, unknown>).open = true;
    }],
    ['atestación de tracking ausente', (config: Record<string, unknown>) => {
      (config.tracking as Record<string, unknown>).attestationRef = '';
    }],
    ['campo tracking desconocido', (config: Record<string, unknown>) => {
      (config.tracking as Record<string, unknown>).redirectHost = 'links.example.com';
    }],
  ])('rejects CUS-003 configuration with %s', (_label, mutate) => {
    const input = activeCustomerPasswordlessManifest();
    mutate(customerPasswordlessConfig(input));
    const result = validateCapabilityManifest(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContainEqual(expect.objectContaining({
      path: 'capabilities.CUS-003.config',
      code: 'invalid-config',
    }));
  });

  it('fails fast when operational CUS-003 lacks its security configuration', () => {
    const input = activeCustomerPasswordlessManifest();
    delete (input.capabilities['CUS-003'] as Record<string, unknown>).config;
    expect(() => resolveCapabilityManifest(input)).toThrow(CapabilityManifestError);
    try {
      resolveCapabilityManifest(input);
    } catch (error) {
      expect(error).toBeInstanceOf(CapabilityManifestError);
      expect((error as CapabilityManifestError).issues).toContainEqual(expect.objectContaining({
        path: 'capabilities.CUS-003.config',
        code: 'invalid-config',
      }));
    }
  });

  it.each([
    { routes: false, navigation: false, jobs: false, sideEffects: true },
    { routes: true, navigation: false, jobs: false, sideEffects: false },
    { routes: true, navigation: true, jobs: false, sideEffects: true },
    { routes: true, navigation: false, jobs: true, sideEffects: true },
  ])('rejects partial or over-broad CUS-003 flags: %o', (flags) => {
    const input = activeCustomerPasswordlessManifest();
    (input.capabilities['CUS-003'] as Record<string, unknown>).flags = flags;
    const result = validateCapabilityManifest(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContainEqual(expect.objectContaining({
      path: 'capabilities.CUS-003.flags',
      code: 'invalid-flags',
    }));
  });

  it('rejects degraded CUS-003 until a safe fallback exists', () => {
    const input = activeCustomerPasswordlessManifest();
    input.capabilities['CUS-003'] = {
      ...(input.capabilities['CUS-003'] as Record<string, unknown>),
      state: 'degraded',
      degradation: { reason: 'Proveedor no disponible.', fallback: 'Acceso deshabilitado.' },
    };
    const result = validateCapabilityManifest(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContainEqual(expect.objectContaining({
      path: 'capabilities.CUS-003.state',
      code: 'invalid-state',
    }));
  });

  it('fails closed when the durable Resend dependency is not operational', () => {
    const input = activeCustomerPasswordlessManifest();
    input.capabilities['INT-002'] = { state: 'installed' };
    const result = validateCapabilityManifest(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContainEqual(expect.objectContaining({
      path: 'capabilities.CUS-003',
      code: 'missing-dependency',
    }));
  });

  it('rejects capture delivery as an operational Resend dependency', () => {
    const input = activeCustomerPasswordlessManifest();
    input.capabilities['INT-002'] = {
      state: 'active',
      flags: INERT_FLAGS,
      config: { provider: 'resend', delivery: 'capture' },
    };
    const result = validateCapabilityManifest(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContainEqual(expect.objectContaining({
      path: 'capabilities.CUS-003.config',
      code: 'invalid-config',
    }));
  });

  it('rejects Resend send configuration when side effects remain disabled', () => {
    const input = activeCustomerPasswordlessManifest();
    input.capabilities['INT-002'] = {
      state: 'active',
      flags: INERT_FLAGS,
      config: { provider: 'resend', delivery: 'send', secretRef: 'RESEND_API_KEY' },
    };
    const result = validateCapabilityManifest(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContainEqual(expect.objectContaining({
      path: 'capabilities.CUS-003.config',
      code: 'invalid-config',
    }));
  });

  it('fails early with structured issues instead of partially starting', () => {
    expect(() => resolveCapabilityManifest({ manifestVersion: 1 })).toThrow(CapabilityManifestError);
    try {
      resolveCapabilityManifest({ manifestVersion: 1 });
    } catch (error) {
      expect(error).toBeInstanceOf(CapabilityManifestError);
      expect((error as CapabilityManifestError).issues.length).toBeGreaterThan(0);
    }
  });

  it('requires isolated platform foundations in every valid deployment', () => {
    const input = mutableCopy(createPresetManifest('minimal', deployment)) as unknown as MutableManifest;
    input.capabilities['PLT-004'] = { state: 'absent' };
    const result = validateCapabilityManifest(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((issue) => issue.path === 'capabilities.PLT-004' && issue.code === 'invalid-state')).toBe(true);
  });

  it('rejects commercial jobs and side effects in the public demo deployment', () => {
    const input = mutableCopy(createPresetManifest('advanced', { ...deployment, mode: 'demo' })) as unknown as MutableManifest;
    const result = validateCapabilityManifest(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((issue) => issue.code === 'invalid-flags' && issue.message.includes('despliegue demo'))).toBe(true);
  });

  it('materializes the pure composition root without choosing infrastructure', () => {
    const platform = createPlatform(platformManifest);
    expect(platform.manifest.deployment).toEqual({
      id: 'logic2b-ecommerce-demo',
      mode: 'demo',
      environment: 'production',
      profile: 'custom',
    });
    expect(platform.capabilityState('CHK-004')).toBe('active');
    expect(platform.hasCapabilityFlag('CHK-004', 'sideEffects')).toBe(false);
    expect(platform.isCapabilityActive('STO-001')).toBe(true);
    expect(platform.isCapabilityActive('CAT-007')).toBe(true);
    expect(platform.isCapabilityActive('CAT-008')).toBe(true);
    expect(platform.isCapabilityActive('ORD-007')).toBe(true);
    expect(platform.hasCapabilityFlag('ORD-007', 'sideEffects')).toBe(false);
    expect(platform.hasCapabilityFlag('STO-001', 'navigation')).toBe(true);
    expect(platform.hasCapabilityFlag('PLT-004', 'sideEffects')).toBe(false);
    expect(Object.isFrozen(platform)).toBe(true);
    expect(Object.isFrozen(platform.manifest.capabilities)).toBe(true);
  });
});
