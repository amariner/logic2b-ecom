import { describe, expect, it } from 'vitest';
import { createPlatform } from '../src/composition/create-platform';
import {
  MODULE_REGISTRY,
  createPresetManifest,
  createPublicDemoManifest,
} from '../src/platform/configuration';
import {
  JOB_DESCRIPTORS,
  JobRegistryError,
  createJobRegistry,
  validateJobRegistry,
} from '../src/platform/jobs';

describe('registro de jobs R1.11', () => {
  it('asigna cada job ejecutable a un único módulo y congela el contrato', () => {
    const registry = createJobRegistry(JOB_DESCRIPTORS, MODULE_REGISTRY);
    expect(validateJobRegistry(JOB_DESCRIPTORS, MODULE_REGISTRY)).toEqual([]);
    expect(MODULE_REGISTRY.jobOwners).toEqual({
      'platform-configuration.demo-order-refresh': 'platform-configuration',
      'notifications.event-outbox-sweep': 'notifications',
      'inventory.expire-reservations': 'inventory',
      'orders.execute-bulk-action': 'orders',
    });
    expect(Object.isFrozen(registry)).toBe(true);
    expect(Object.isFrozen(registry.descriptors)).toBe(true);
    expect(Object.isFrozen(registry.descriptors[0]?.retryDelaysSeconds)).toBe(true);
  });

  it('activa mantenimiento demo sin habilitar jobs comerciales', () => {
    const platform = createPlatform(createPublicDemoManifest({
      id: 'jobs-demo-test',
      environment: 'development',
    }));
    expect(platform.scheduledJobs('17 3 * * 1').map((job) => job.id)).toEqual([
      'platform-configuration.demo-order-refresh',
    ]);
    expect(platform.scheduledJobs('*/5 * * * *')).toEqual([]);
    expect(platform.hasCapabilityFlag('AUT-002', 'jobs')).toBe(false);
  });

  it('activa el barrido del outbox solo cuando la capacidad cliente permite jobs', () => {
    const deployment = { id: 'jobs-client-test', mode: 'client', environment: 'development' } as const;
    const standard = createPlatform(createPresetManifest('standard', deployment));
    const minimal = createPlatform(createPresetManifest('minimal', deployment));
    expect(standard.hasCapabilityFlag('AUT-002', 'jobs')).toBe(true);
    expect(standard.scheduledJobs('*/5 * * * *').map((job) => job.id)).toEqual([
      'notifications.event-outbox-sweep',
    ]);
    expect(standard.scheduledJobs('17 3 * * 1')).toEqual([]);
    expect(minimal.scheduledJobs('*/5 * * * *')).toEqual([]);
    expect(standard.capabilityState('INV-004')).toBe('installed');
    expect(standard.scheduledJobs('*/1 * * * *')).toEqual([]);
  });

  it('solo registra la expiración al activar explícitamente INV-004', () => {
    const base = createPresetManifest('standard', {
      id: 'jobs-reservations-test', mode: 'client', environment: 'development',
    });
    const platform = createPlatform({
      ...base,
      deployment: { ...base.deployment, profile: 'custom' },
      capabilities: {
        ...base.capabilities,
        'INV-004': {
          state: 'active',
          flags: { routes: false, navigation: false, jobs: true, sideEffects: true },
        },
      },
    });
    expect(platform.scheduledJobs('*/1 * * * *').map((job) => job.id)).toEqual([
      'inventory.expire-reservations',
    ]);
  });

  it('registra el bulk como one-off cliente y nunca lo dispara un cron demo', () => {
    const deployment = { id: 'jobs-bulk-client', mode: 'client', environment: 'development' } as const;
    const advanced = createPlatform(createPresetManifest('advanced', deployment));
    expect(advanced.jobRegistry.byId['orders.execute-bulk-action']).toMatchObject({
      moduleId: 'orders', requiredCapabilityId: 'ORD-011', trigger: { kind: 'one-off' },
      modes: ['client'],
    });
    expect(advanced.hasCapabilityFlag('ORD-011', 'jobs')).toBe(true);
    expect(advanced.scheduledJobs('*/1 * * * *').map((job) => job.id)).not.toContain('orders.execute-bulk-action');
    const demo = createPlatform(createPublicDemoManifest({ id: 'jobs-bulk-demo', environment: 'development' }));
    expect(demo.hasCapabilityFlag('ORD-011', 'jobs')).toBe(false);
  });

  it('rechaza ids duplicados, propietarios y capacidades incoherentes', () => {
    const descriptors = structuredClone(JOB_DESCRIPTORS) as unknown as Array<Record<string, unknown>>;
    descriptors.push({ ...descriptors[0] });
    descriptors[1]!.moduleId = 'orders';
    descriptors[1]!.requiredCapabilityId = 'CAT-001';
    const codes = validateJobRegistry(descriptors, MODULE_REGISTRY).map((issue) => issue.code);
    expect(codes).toEqual(expect.arrayContaining([
      'duplicate-job',
      'owner-mismatch',
      'undeclared-job',
      'capability-owner-mismatch',
    ]));
    expect(() => createJobRegistry(descriptors, MODULE_REGISTRY)).toThrow(JobRegistryError);
  });
});
