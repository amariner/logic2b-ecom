import { describe, expect, expectTypeOf, it } from 'vitest';
import { platformManifest } from '../platform.config';
import { createPlatform } from '../src/composition/create-platform';
import {
  CAPABILITY_IDS,
  CAPABILITY_PRESETS,
  CAPABILITY_STATES,
  CapabilityManifestError,
  createPresetManifest,
  resolveCapabilityManifest,
  validateCapabilityManifest,
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
    expect('CAT-007' in CAPABILITY_PRESETS.standard).toBe(false);
    expect('CAT-008' in CAPABILITY_PRESETS.standard).toBe(false);
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
