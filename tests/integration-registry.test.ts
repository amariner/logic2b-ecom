import { describe, expect, it } from 'vitest';
import { createPlatform } from '../src/composition/create-platform';
import { inspectIntegrations, integrationSecretPresence } from '../src/composition/integration-status';
import {
  INTEGRATION_DESCRIPTORS,
  INTEGRATION_IDS,
  INTEGRATION_REGISTRY,
  IntegrationRegistryError,
  createIntegrationRegistry,
  validateIntegrationRegistry,
} from '../src/integrations';
import { createPresetManifest, createPublicDemoManifest } from '../src/platform/configuration';

const clientDeployment = { id: 'integration-test', mode: 'client', environment: 'development' } as const;

describe('registro de integraciones (R1.10)', () => {
  it('registra solo los tres adaptadores reales y enlaza sus healthchecks', () => {
    expect(INTEGRATION_REGISTRY.descriptors.map((descriptor) => descriptor.id)).toEqual(INTEGRATION_IDS);
    expect(validateIntegrationRegistry(INTEGRATION_DESCRIPTORS)).toEqual([]);
    expect(INTEGRATION_REGISTRY.descriptors.map(({ capabilityId, healthcheckId }) => [capabilityId, healthcheckId])).toEqual([
      ['INT-001', 'payments.stripe-checkout'],
      ['INT-002', 'notifications.resend-email'],
      ['INT-003', 'integrations.logistics-csv'],
    ]);
    expect(Object.isFrozen(INTEGRATION_REGISTRY)).toBe(true);
    expect(Object.isFrozen(INTEGRATION_REGISTRY.descriptors)).toBe(true);
  });

  it('forma parte del composition root sin activar infraestructura', () => {
    const platform = createPlatform(createPresetManifest('advanced', clientDeployment));
    expect(platform.integration('stripe-checkout')).toBe(INTEGRATION_REGISTRY.byId['stripe-checkout']);
    expect(platform.integrationRegistry).toBe(INTEGRATION_REGISTRY);
    expect(Object.isFrozen(platform)).toBe(true);
  });

  it('mantiene Stripe y Resend inactivos en demo, y reconoce el CSV manual disponible', () => {
    const manifest = createPlatform(createPublicDemoManifest({
      id: 'integration-demo',
      environment: 'production',
    })).manifest;
    const statuses = inspectIntegrations(manifest, {
      STRIPE_SECRET_KEY: 'sk_test_must_not_escape',
      STRIPE_WEBHOOK_SECRET: 'whsec_must_not_escape',
      RESEND_API_KEY: 're_must_not_escape',
    });

    expect(statuses.byId['stripe-checkout']).toMatchObject({ state: 'inactive', health: 'not-applicable' });
    expect(statuses.byId['resend-email']).toMatchObject({
      state: 'inactive',
      health: 'not-applicable',
      configuration: { delivery: 'capture' },
    });
    expect(statuses.byId['logistics-csv']).toMatchObject({ state: 'active', health: 'healthy' });
    expect(JSON.stringify(statuses)).not.toMatch(/sk_test|whsec|re_must|SECRET|API_KEY/);
    expect(Object.isFrozen(statuses)).toBe(true);
    expect(Object.isFrozen(statuses.all)).toBe(true);
    expect(Object.isFrozen(statuses.byId['logistics-csv'].configuration)).toBe(true);
  });

  it('degrada una configuración de Stripe incompleta y Resend sin credencial', () => {
    const manifest = createPlatform(createPresetManifest('advanced', clientDeployment)).manifest;
    const statuses = inspectIntegrations(manifest, { STRIPE_SECRET_KEY: 'sk_test_present' });

    expect(statuses.byId['stripe-checkout']).toMatchObject({
      state: 'degraded',
      health: 'degraded',
      lastError: { code: 'configuration.incomplete', at: null },
      configuration: { apiCredentialConfigured: true, webhookCredentialConfigured: false },
    });
    expect(statuses.byId['resend-email']).toMatchObject({
      state: 'degraded',
      health: 'degraded',
      lastError: { code: 'configuration.missing', at: null },
    });
    expect(statuses.byId['logistics-csv']).toMatchObject({ state: 'active', health: 'healthy' });
  });

  it('conserva última sincronización y último error solo como evidencia segura', () => {
    const manifest = createPlatform(createPresetManifest('advanced', clientDeployment)).manifest;
    const statuses = inspectIntegrations(
      manifest,
      {
        STRIPE_SECRET_KEY: 'sk_test_present',
        STRIPE_WEBHOOK_SECRET: 'whsec_present',
        RESEND_API_KEY: 're_present',
      },
      {
        'stripe-checkout': { lastSyncAt: '2026-08-07T08:00:00.000Z', lastError: null },
        'resend-email': {
          lastSyncAt: null,
          lastError: { code: 'provider.unavailable', at: '2026-08-07T08:05:00.000Z' },
        },
      },
    );

    expect(statuses.byId['stripe-checkout']).toMatchObject({
      state: 'active',
      health: 'healthy',
      lastSyncAt: '2026-08-07T08:00:00.000Z',
      lastError: null,
    });
    expect(statuses.byId['resend-email']).toMatchObject({
      state: 'degraded',
      health: 'degraded',
      lastError: { code: 'provider.unavailable', at: '2026-08-07T08:05:00.000Z' },
    });
  });

  it('reduce secretos a presencia antes de entrar al registro', () => {
    const presence = integrationSecretPresence({
      STRIPE_SECRET_KEY: '  ',
      STRIPE_WEBHOOK_SECRET: 'whsec_private',
      RESEND_API_KEY: 're_private',
    });
    expect(presence).toEqual({
      stripeApiCredential: false,
      stripeWebhookCredential: true,
      resendApiCredential: true,
    });
    expect(JSON.stringify(presence)).not.toContain('private');
  });

  it('rechaza duplicados, propietarios falsos, healthchecks ajenos y evidencia no ISO', () => {
    const descriptors = structuredClone(INTEGRATION_DESCRIPTORS) as unknown as Array<Record<string, unknown>>;
    descriptors[1]!.id = descriptors[0]!.id;
    descriptors[1]!.ownerModuleId = 'payments';
    descriptors[2]!.healthcheckId = 'integrations.missing';
    const codes = validateIntegrationRegistry(descriptors).map((issue) => issue.code);
    expect(codes).toEqual(expect.arrayContaining([
      'duplicate-integration',
      'missing-integration',
      'capability-owner-mismatch',
      'unknown-healthcheck',
    ]));
    expect(() => createIntegrationRegistry(descriptors)).toThrow(IntegrationRegistryError);

    const remapped = structuredClone(INTEGRATION_DESCRIPTORS) as unknown as Array<Record<string, unknown>>;
    remapped[0]!.capabilityId = 'INT-002';
    remapped[0]!.ownerModuleId = 'notifications';
    remapped[0]!.healthcheckId = 'notifications.resend-email';
    remapped[0]!.mode = 'transactional-email';
    remapped[0]!.implementation = 'src/lib/send-email.ts';
    expect(validateIntegrationRegistry(remapped).map((issue) => issue.code)).toContain('invalid-descriptor');

    const manifest = createPlatform(createPresetManifest('advanced', clientDeployment)).manifest;
    expect(() => inspectIntegrations(manifest, {}, {
      'logistics-csv': { lastSyncAt: 'ayer', lastError: null },
    })).toThrow(IntegrationRegistryError);
  });
});
