import { describe, expect, it } from 'vitest';
import { createPlatform } from '../src/composition/create-platform';
import {
  CapabilityManifestError,
  createPresetManifest,
  createPublicDemoManifest,
  type CapabilityPresetName,
} from '../src/platform/configuration';

const clientDeployment = {
  mode: 'client',
  environment: 'development',
} as const;

const expectedModules: Readonly<Record<CapabilityPresetName, readonly string[]>> = {
  minimal: ['platform-configuration', 'platform-security', 'catalog', 'pricing', 'storefront'],
  standard: [
    'platform-configuration', 'platform-security', 'catalog', 'pricing',
    'inventory', 'cart', 'customers', 'orders', 'fulfillment',
    'notifications', 'payments', 'checkout', 'storefront',
  ],
  advanced: [
    'platform-configuration', 'platform-security', 'platform-operations', 'catalog', 'pricing',
    'inventory', 'cart', 'customers', 'orders', 'fulfillment',
    'notifications', 'payments', 'checkout', 'integrations', 'storefront',
    'marketing',
  ],
};

describe('consolidación de plataforma R1.12', () => {
  it.each(['minimal', 'standard', 'advanced'] as const)(
    'clona el preset %s sin compartir identidad ni estado mutable',
    (profile) => {
      const first = createPlatform(createPresetManifest(profile, {
        ...clientDeployment,
        id: `client-a-${profile}`,
      }));
      const second = createPlatform(createPresetManifest(profile, {
        ...clientDeployment,
        id: `client-b-${profile}`,
      }));

      expect(first.manifest.deployment.id).toBe(`client-a-${profile}`);
      expect(second.manifest.deployment.id).toBe(`client-b-${profile}`);
      expect(first.modules.map((module) => module.descriptor.id)).toEqual(expectedModules[profile]);
      expect(second.modules.map((module) => module.descriptor.id)).toEqual(expectedModules[profile]);
      expect(Object.isFrozen(first.manifest)).toBe(true);
      expect(Object.isFrozen(first.manifest.capabilities)).toBe(true);
      expect(first.manifest).not.toBe(second.manifest);
    },
  );

  it('mantiene jobs comerciales fuera del preset mínimo y de la demo pública', () => {
    const minimal = createPlatform(createPresetManifest('minimal', {
      ...clientDeployment,
      id: 'client-minimal-jobs',
    }));
    const standard = createPlatform(createPresetManifest('standard', {
      ...clientDeployment,
      id: 'client-standard-jobs',
    }));
    const demo = createPlatform(createPublicDemoManifest({
      id: 'public-demo-jobs',
      environment: 'development',
    }));

    expect(minimal.scheduledJobs('*/5 * * * *')).toEqual([]);
    expect(standard.scheduledJobs('*/5 * * * *').map((job) => job.id)).toEqual([
      'notifications.event-outbox-sweep',
    ]);
    expect(demo.scheduledJobs('*/5 * * * *')).toEqual([]);
    expect(demo.scheduledJobs('17 3 * * 1').map((job) => job.id)).toEqual([
      'platform-configuration.demo-order-refresh',
    ]);
  });

  it('falla antes de componer si un clon activa efectos sin sus dependencias', () => {
    const input = structuredClone(createPresetManifest('minimal', {
      ...clientDeployment,
      id: 'client-invalid-clone',
    })) as unknown as {
      capabilities: Record<string, unknown>;
    };
    input.capabilities['INT-002'] = {
      state: 'active',
      flags: { routes: false, navigation: false, jobs: false, sideEffects: true },
      config: { provider: 'resend', delivery: 'send', secretRef: 'RESEND_API_KEY' },
    };

    expect(() => createPlatform(input as never)).toThrow(CapabilityManifestError);
  });
});
