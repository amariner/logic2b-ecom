import { shopConfig } from '../../shop.config';
import type { Platform } from './create-platform';
import type { CapabilityConfigById } from '../platform/configuration';
import { SITEMAP_ORIGIN } from '../modules/storefront/application/sitemap';

export type CustomerPasswordlessRuntimeEnv = Readonly<{
  DEMO_MODE?: string;
  ADMIN_COOKIE_SECRET?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  CUSTOMER_PROFILE_HMAC_SECRET?: string;
  CUSTOMER_AUTH_CSRF_SECRET?: string;
  CUSTOMER_AUTH_RATE_LIMIT?: RateLimit;
  CUSTOMER_AUTH_RATE_LIMIT_ATTESTATION?: string;
  CUSTOMER_AUTH_RESEND_TRACKING_ATTESTATION?: string;
  CUSTOMER_AUTH_RESEND_DOMAIN_ID?: string;
  RESEND_API_KEY?: string;
}>;

export type CustomerPasswordlessRuntimeConfiguration = Readonly<{
  origin: `https://${string}`;
  challengeTtlSeconds: number;
  session: Readonly<{ idleTtlSeconds: number; absoluteTtlSeconds: number }>;
  identitySecret: string;
  csrfSecret: string;
  rateLimit: RateLimit;
  resend: Readonly<{
    apiKey: string;
    domainId: string;
    domain: string;
    from: Readonly<{ name: string; address: string }>;
    subject: string;
    tracking: Readonly<{
      click: false;
      open: false;
      attestationRef: string;
    }>;
  }>;
}>;

export class CustomerPasswordlessRuntimeConfigurationError extends Error {
  readonly code = 'customer_passwordless_runtime_configuration_invalid';

  constructor() {
    super('La autenticación de clientes no dispone de una configuración operativa segura.');
    this.name = 'CustomerPasswordlessRuntimeConfigurationError';
  }
}

function invalid(): never {
  throw new CustomerPasswordlessRuntimeConfigurationError();
}

function safeSecret(value: string | undefined): value is string {
  return typeof value === 'string' && value.length >= 32 && value.length <= 4_096 &&
    value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value);
}

function safeProviderCredential(value: string | undefined): value is string {
  return typeof value === 'string' && value.length >= 8 && value.length <= 512 &&
    value.trim() === value && !/[\u0000-\u0020\u007f]/u.test(value);
}

function secretsAreSeparated(env: CustomerPasswordlessRuntimeEnv): boolean {
  const values = [
    env.CUSTOMER_PROFILE_HMAC_SECRET,
    env.CUSTOMER_AUTH_CSRF_SECRET,
    env.ADMIN_COOKIE_SECRET,
    env.STRIPE_SECRET_KEY,
    env.STRIPE_WEBHOOK_SECRET,
    env.RESEND_API_KEY,
  ].filter((value): value is string => typeof value === 'string' && value.length > 0);
  return new Set(values).size === values.length;
}

function exactHttpsOrigin(value: string): value is `https://${string}` {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && parsed.origin === value;
  } catch {
    return false;
  }
}

function emailDomain(value: string): string | null {
  const separator = value.lastIndexOf('@');
  if (separator < 1 || separator === value.length - 1) return null;
  const domain = value.slice(separator + 1);
  return /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u.test(domain) ? domain : null;
}

function rateLimitBinding(value: RateLimit | undefined): value is RateLimit {
  return value !== undefined && typeof value.limit === 'function';
}

type OperatorIdentity = Readonly<{
  baseUrl: string;
  siteOrigin: string;
  name: string;
  email: string;
}>;

const DEFAULT_OPERATOR: OperatorIdentity = Object.freeze({
  baseUrl: shopConfig.baseUrl,
  siteOrigin: SITEMAP_ORIGIN,
  name: shopConfig.name,
  email: shopConfig.email,
});

/**
 * Resuelve bindings y secretos solo si CUS-003 está active. Un manifest
 * installed (incluida la demo pública) devuelve null antes de leer `env`.
 */
export function resolveCustomerPasswordlessRuntimeConfiguration(
  platform: Platform,
  env: CustomerPasswordlessRuntimeEnv,
  operator: OperatorIdentity = DEFAULT_OPERATOR,
): CustomerPasswordlessRuntimeConfiguration | null {
  const capability = platform.capability('CUS-003');
  if (capability.state !== 'active') return null;
  const config = capability.config as CapabilityConfigById['CUS-003'] | undefined;
  const domain = emailDomain(operator.email);
  if (config === undefined || env.DEMO_MODE === 'true' ||
      !exactHttpsOrigin(config.origin) || config.origin !== operator.baseUrl ||
      config.origin !== operator.siteOrigin || domain === null ||
      !safeSecret(env.CUSTOMER_PROFILE_HMAC_SECRET) ||
      !safeSecret(env.CUSTOMER_AUTH_CSRF_SECRET) ||
      !safeProviderCredential(env.RESEND_API_KEY) ||
      !secretsAreSeparated(env) ||
      !rateLimitBinding(env.CUSTOMER_AUTH_RATE_LIMIT) ||
      env.CUSTOMER_AUTH_RATE_LIMIT_ATTESTATION !== config.rateLimit.attestationRef ||
      env.CUSTOMER_AUTH_RESEND_TRACKING_ATTESTATION !== config.tracking.attestationRef ||
      typeof env.CUSTOMER_AUTH_RESEND_DOMAIN_ID !== 'string' ||
      !/^[A-Za-z0-9_-]{8,200}$/u.test(env.CUSTOMER_AUTH_RESEND_DOMAIN_ID)) {
    return invalid();
  }
  return Object.freeze({
    origin: config.origin,
    challengeTtlSeconds: config.challengeTtlSeconds,
    session: Object.freeze({ ...config.session }),
    identitySecret: env.CUSTOMER_PROFILE_HMAC_SECRET,
    csrfSecret: env.CUSTOMER_AUTH_CSRF_SECRET,
    rateLimit: env.CUSTOMER_AUTH_RATE_LIMIT,
    resend: Object.freeze({
      apiKey: env.RESEND_API_KEY,
      domainId: env.CUSTOMER_AUTH_RESEND_DOMAIN_ID,
      domain,
      from: Object.freeze({ name: operator.name, address: operator.email }),
      subject: `Accede a tu cuenta de ${operator.name}`,
      tracking: Object.freeze({
        click: false,
        open: false,
        attestationRef: config.tracking.attestationRef,
      }),
    }),
  });
}
