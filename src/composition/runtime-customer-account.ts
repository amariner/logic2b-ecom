import type { CustomerAccountHttp } from '../modules/customers/presentation/customer-account-http';
import type { PasswordlessProofProvider } from '../modules/customers/application/passwordless-auth-ports';
import { createD1CustomerProfileRepository } from '../modules/customers/infrastructure/d1-customer-profile-repository';
import { createD1CustomerAuthenticationRepository } from '../modules/customers/infrastructure/d1-customer-authentication-repository';
import { createD1CustomerAuthRateLimitRepository } from '../modules/customers/infrastructure/d1-customer-auth-rate-limit-repository';
import { createResendPasswordlessProofProvider } from '../modules/customers/infrastructure/resend-passwordless-proof-provider';
import { createCustomerPasswordlessApplication } from './customer-passwordless-auth';
import { createCustomerAccountHttp } from './customer-account-http';
import {
  resolveCustomerPasswordlessRuntimeConfiguration,
  type CustomerPasswordlessRuntimeConfiguration,
} from './customer-passwordless-config';
import { runtimePlatform } from './runtime-platform';
import { customerPasswordlessRuntimeObservability } from './customer-passwordless-observability';
import type { Platform } from './create-platform';
import type { CustomerPasswordlessObservability } from '../modules/customers/application/passwordless-observability';

type ProviderCache = Readonly<{
  apiKey: string;
  origin: string;
  domainId: string;
  domain: string;
  attestationRef: string;
  provider: Promise<PasswordlessProofProvider>;
}>;

let providerCache: ProviderCache | null = null;

export type RuntimeCustomerAccountOptions = Readonly<{
  /** Seam de composición para probar un rollout active sin modificar la demo. */
  platform?: Platform;
  providerFactory?: (
    configuration: CustomerPasswordlessRuntimeConfiguration,
  ) => Promise<PasswordlessProofProvider>;
  now?: () => string;
  observability?: CustomerPasswordlessObservability;
}>;

function passwordlessProvider(
  configuration: CustomerPasswordlessRuntimeConfiguration,
): Promise<PasswordlessProofProvider> {
  const resend = configuration.resend;
  if (providerCache !== null && providerCache.apiKey === resend.apiKey &&
      providerCache.origin === configuration.origin && providerCache.domainId === resend.domainId &&
      providerCache.domain === resend.domain &&
      providerCache.attestationRef === resend.tracking.attestationRef) {
    return providerCache.provider;
  }
  const provider = createResendPasswordlessProofProvider({
    apiKey: resend.apiKey,
    origin: configuration.origin,
    from: resend.from,
    subject: resend.subject,
    tracking: {
      domainId: resend.domainId,
      domain: resend.domain,
      click: false,
      open: false,
      attestationRef: resend.tracking.attestationRef,
    },
  });
  providerCache = Object.freeze({
    apiKey: resend.apiKey,
    origin: configuration.origin,
    domainId: resend.domainId,
    domain: resend.domain,
    attestationRef: resend.tracking.attestationRef,
    provider,
  });
  void provider.catch(() => {
    if (providerCache?.provider === provider) providerCache = null;
  });
  return provider;
}

/**
 * Wiring único de la superficie. Con CUS-003 installed devuelve null sin
 * construir repositorios, resolver secretos ni contactar con Resend.
 */
export async function createRuntimeCustomerAccountHttp(
  env: Env,
  defer: (promise: Promise<unknown>) => void,
  options: RuntimeCustomerAccountOptions = {},
): Promise<CustomerAccountHttp | null> {
  const platform = options.platform ?? runtimePlatform;
  const configuration = resolveCustomerPasswordlessRuntimeConfiguration(
    platform,
    env,
  );
  if (configuration === null) return null;
  const authentication = createD1CustomerAuthenticationRepository(env.DB);
  const readiness = await authentication.customerAuthCapabilityReadiness();
  if (readiness.state !== 'active' || !readiness.readyForActiveRuntime) {
    throw new Error('CUS-003 no dispone de una activación durable válida.');
  }
  const provider = await (options.providerFactory ?? passwordlessProvider)(configuration);
  const application = createCustomerPasswordlessApplication({
    profiles: createD1CustomerProfileRepository(env.DB),
    authentication,
    rateLimits: createD1CustomerAuthRateLimitRepository(env.DB),
    provider,
    configuration,
    observability: options.observability ?? customerPasswordlessRuntimeObservability,
    ...(options.now === undefined ? {} : { now: options.now }),
  });
  return createCustomerAccountHttp({
    application,
    expectedOrigin: configuration.origin,
    defer,
    ordersAvailable: platform.isCapabilityActive('CUS-004') &&
      platform.hasCapabilityFlag('CUS-004', 'routes'),
    addressesAvailable: platform.isCapabilityActive('CUS-006') &&
      platform.hasCapabilityFlag('CUS-006', 'routes'),
    ...(options.now === undefined ? {} : { now: options.now }),
  });
}
