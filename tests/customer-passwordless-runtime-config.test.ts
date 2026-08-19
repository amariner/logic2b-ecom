import { describe, expect, it } from 'vitest';
import type { Platform } from '../src/composition/create-platform';
import {
  CustomerPasswordlessRuntimeConfigurationError,
  resolveCustomerPasswordlessRuntimeConfiguration,
  type CustomerPasswordlessRuntimeEnv,
} from '../src/composition/customer-passwordless-config';
import type { CapabilityConfigById } from '../src/platform/configuration';

const config = Object.freeze({
  methods: ['email_magic_link'],
  provider: 'resend',
  origin: 'https://shop.example',
  challengeTtlSeconds: 600,
  session: { idleTtlSeconds: 86_400, absoluteTtlSeconds: 2_592_000 },
  secretRefs: ['CUSTOMER_PROFILE_HMAC_SECRET', 'CUSTOMER_AUTH_CSRF_SECRET', 'RESEND_API_KEY'],
  rateLimit: { enforcement: 'edge-durable', failClosed: true, attestationRef: 'ops:rate:test' },
  tracking: { click: false, open: false, attestationRef: 'ops:resend:test' },
} as const satisfies CapabilityConfigById['CUS-003']);

function platform(state: 'active' | 'installed'): Platform {
  return {
    capability: () => state === 'active'
      ? { id: 'CUS-003', state, flags: { routes: true, navigation: false, jobs: false, sideEffects: true }, config }
      : { id: 'CUS-003', state, flags: { routes: false, navigation: false, jobs: false, sideEffects: false } },
  } as unknown as Platform;
}

const binding: RateLimit = { limit: async () => ({ success: true }) };
const env = (): CustomerPasswordlessRuntimeEnv => ({
  DEMO_MODE: 'false',
  ADMIN_COOKIE_SECRET: 'admin-secret-'.padEnd(40, 'a'),
  STRIPE_SECRET_KEY: 'stripe-secret-'.padEnd(40, 's'),
  STRIPE_WEBHOOK_SECRET: 'stripe-webhook-'.padEnd(40, 'w'),
  CUSTOMER_PROFILE_HMAC_SECRET: 'profile-secret-'.padEnd(40, 'p'),
  CUSTOMER_AUTH_CSRF_SECRET: 'csrf-secret-'.padEnd(40, 'c'),
  CUSTOMER_AUTH_RATE_LIMIT: binding,
  CUSTOMER_AUTH_RATE_LIMIT_ATTESTATION: 'ops:rate:test',
  CUSTOMER_AUTH_RESEND_TRACKING_ATTESTATION: 'ops:resend:test',
  CUSTOMER_AUTH_RESEND_DOMAIN_ID: 'domain_test_123',
  RESEND_API_KEY: 're_test_credential',
});
const operator = {
  baseUrl: 'https://shop.example',
  siteOrigin: 'https://shop.example',
  name: 'Tienda de prueba',
  email: 'acceso@shop.example',
};

describe('preflight runtime de CUS-003', () => {
  it('no toca bindings ni secretos cuando la capacidad está installed', () => {
    const unreadable = new Proxy({}, {
      get: () => { throw new Error('env no debe resolverse'); },
    }) as CustomerPasswordlessRuntimeEnv;
    expect(resolveCustomerPasswordlessRuntimeConfiguration(platform('installed'), unreadable, operator)).toBeNull();
  });

  it('resuelve una configuración active completa y cerrada', () => {
    expect(resolveCustomerPasswordlessRuntimeConfiguration(platform('active'), env(), operator))
      .toMatchObject({
        origin: 'https://shop.example',
        challengeTtlSeconds: 600,
        identitySecret: expect.any(String),
        csrfSecret: expect.any(String),
        rateLimit: binding,
        resend: {
          domainId: 'domain_test_123',
          domain: 'shop.example',
          from: { name: 'Tienda de prueba', address: 'acceso@shop.example' },
          tracking: { click: false, open: false, attestationRef: 'ops:resend:test' },
        },
      });
  });

  it.each([
    ['demo', (value: Record<string, unknown>) => { value.DEMO_MODE = 'true'; }],
    ['profile secret', (value: Record<string, unknown>) => { delete value.CUSTOMER_PROFILE_HMAC_SECRET; }],
    ['csrf secret', (value: Record<string, unknown>) => { delete value.CUSTOMER_AUTH_CSRF_SECRET; }],
    ['Resend', (value: Record<string, unknown>) => { delete value.RESEND_API_KEY; }],
    ['rate binding', (value: Record<string, unknown>) => { delete value.CUSTOMER_AUTH_RATE_LIMIT; }],
    ['rate attestation', (value: Record<string, unknown>) => { value.CUSTOMER_AUTH_RATE_LIMIT_ATTESTATION = 'wrong'; }],
    ['tracking attestation', (value: Record<string, unknown>) => { value.CUSTOMER_AUTH_RESEND_TRACKING_ATTESTATION = 'wrong'; }],
    ['Resend domain', (value: Record<string, unknown>) => { delete value.CUSTOMER_AUTH_RESEND_DOMAIN_ID; }],
  ])('falla cerrado con %s inválido', (_label, mutate) => {
    const candidate = { ...env() } as Record<string, unknown>;
    mutate(candidate);
    expect(() => resolveCustomerPasswordlessRuntimeConfiguration(
      platform('active'), candidate as CustomerPasswordlessRuntimeEnv, operator,
    )).toThrow(CustomerPasswordlessRuntimeConfigurationError);
  });

  it('rechaza divergencias entre manifest, tienda y site', () => {
    expect(() => resolveCustomerPasswordlessRuntimeConfiguration(platform('active'), env(), {
      ...operator,
      siteOrigin: 'https://alias.example',
    })).toThrow(CustomerPasswordlessRuntimeConfigurationError);
  });

  it.each([
    ['profile y CSRF', 'CUSTOMER_AUTH_CSRF_SECRET', 'CUSTOMER_PROFILE_HMAC_SECRET'],
    ['profile y admin', 'ADMIN_COOKIE_SECRET', 'CUSTOMER_PROFILE_HMAC_SECRET'],
    ['CSRF y Stripe', 'STRIPE_SECRET_KEY', 'CUSTOMER_AUTH_CSRF_SECRET'],
    ['CSRF y webhook', 'STRIPE_WEBHOOK_SECRET', 'CUSTOMER_AUTH_CSRF_SECRET'],
    ['profile y Resend', 'RESEND_API_KEY', 'CUSTOMER_PROFILE_HMAC_SECRET'],
  ] as const)('rechaza reutilizar el secreto entre %s', (_label, target, source) => {
    const candidate = { ...env(), [target]: env()[source] };
    expect(() => resolveCustomerPasswordlessRuntimeConfiguration(
      platform('active'), candidate, operator,
    )).toThrow(CustomerPasswordlessRuntimeConfigurationError);
  });
});
