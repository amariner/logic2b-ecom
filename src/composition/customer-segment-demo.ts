import type { Platform } from './create-platform';
import { runtimePlatform } from './runtime-platform';

/** Presentación ilustrativa: nunca activa la capacidad operativa CUS-009. */
export function canShowCustomerSegmentDemo(
  env: Readonly<{ DEMO_MODE?: string | undefined }> | undefined,
  platform: Platform = runtimePlatform,
): boolean {
  return platform.manifest.deployment.mode === 'demo' && env?.DEMO_MODE === 'true';
}
