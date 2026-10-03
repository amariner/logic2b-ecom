import { describe, expect, it } from 'vitest';
import { canShowCustomerSegmentDemo } from '../src/composition/customer-segment-demo';
import { runtimePlatform } from '../src/composition/runtime-platform';
import { createPlatform } from '../src/composition/create-platform';
import { adminNavigationFor, createPresetManifest, createPublicDemoManifest } from '../src/platform/configuration';

describe('fixture segmentation presentation boundary', () => {
  it.each(['demo', 'client'] as const)('requires consistent demo configuration with a %s manifest', (mode) => {
    const deployment = { id: 'segment-demo-isolation', environment: 'development' as const };
    const platform = createPlatform(mode === 'demo' ? createPublicDemoManifest(deployment)
      : createPresetManifest('standard', { ...deployment, mode }));
    for (const DEMO_MODE of ['true', 'false', '', 'TRUE', undefined]) {
      const env = { DEMO_MODE, get DB(): never { throw new Error('Presentation accessed D1'); } };
      expect(canShowCustomerSegmentDemo(env, platform)).toBe(mode === 'demo' && DEMO_MODE === 'true');
    }
    expect(canShowCustomerSegmentDemo(undefined, platform)).toBe(false);
  });

  it('does not activate segmentation or expose operational navigation or jobs', () => {
    expect(canShowCustomerSegmentDemo({ DEMO_MODE: 'true' })).toBe(true);
    expect(runtimePlatform.capabilityState('CUS-009')).toBe('installed');
    expect(runtimePlatform.isCapabilityActive('CUS-009')).toBe(false);
    expect(adminNavigationFor(runtimePlatform).some((item) => item.href.includes('segmentos'))).toBe(false);
    expect(runtimePlatform.scheduledJobs('*/1 * * * *')).toEqual([]);
    expect(runtimePlatform.scheduledJobs('*/5 * * * *')).toEqual([]);
  });
});
