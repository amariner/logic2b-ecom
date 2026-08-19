import { describe, expect, it, vi } from 'vitest';
import { createRuntimeCustomerAccountHttp } from '../src/composition/runtime-customer-account';
import type { Platform } from '../src/composition/create-platform';
import type { PasswordlessProofProvider } from '../src/modules/customers/application/passwordless-auth-ports';
import type { CapabilityConfigById } from '../src/platform/configuration';
import { customerEmailIdentityHash } from '../src/modules/customers/application/customer-identity';
import { passwordlessProofDigest } from '../src/modules/customers/infrastructure/passwordless-web-crypto';
import { createD1CustomerAuthenticationRepository } from '../src/modules/customers/infrastructure/d1-customer-authentication-repository';
import { SqliteD1 } from './sqlite-d1';
import { shopConfig } from '../shop.config';

const AT = '2026-08-19T10:00:00.000Z';
const PROFILE_SECRET = 'runtime-profile-secret-'.padEnd(40, 'p');
const CSRF_SECRET = 'runtime-csrf-secret-'.padEnd(40, 'c');

const activeConfig = Object.freeze({
  methods: ['email_magic_link'],
  provider: 'resend',
  origin: shopConfig.baseUrl as `https://${string}`,
  challengeTtlSeconds: 600,
  session: { idleTtlSeconds: 86_400, absoluteTtlSeconds: 2_592_000 },
  secretRefs: ['CUSTOMER_PROFILE_HMAC_SECRET', 'CUSTOMER_AUTH_CSRF_SECRET', 'RESEND_API_KEY'],
  rateLimit: { enforcement: 'edge-durable', failClosed: true, attestationRef: 'ops:rate:runtime' },
  tracking: { click: false, open: false, attestationRef: 'ops:resend:runtime' },
} as const satisfies CapabilityConfigById['CUS-003']);

function activePlatform(): Platform {
  return {
    capability: () => ({
      id: 'CUS-003', state: 'active',
      flags: { routes: true, navigation: false, jobs: false, sideEffects: true },
      config: activeConfig,
    }),
  } as unknown as Platform;
}

describe('wiring runtime de cuenta', () => {
  it('no resuelve DB, secretos, binding ni Resend en el manifest demo installed', async () => {
    const unreadable = new Proxy({}, {
      get: () => { throw new Error('el runtime no debe leerse con CUS-003 installed'); },
    }) as Env;
    await expect(createRuntimeCustomerAccountHttp(unreadable, () => undefined)).resolves.toBeNull();
  });

  it('compone el rollout active completo y difiere Resend después de persistir', async () => {
    const db = new SqliteD1();
    await createD1CustomerAuthenticationRepository(db.asD1())
      .transitionCustomerAuthCapability({
        fromState: 'installed',
        toState: 'active',
        expectedVersion: 0,
        occurredAt: AT,
        idempotencyKey: 'customer-auth/capability/runtime-active',
        audit: {
          auditId: 'customer_auth_audit:runtime_active',
          occurredAt: AT,
          correlationId: 'customer_auth_correlation:runtime_active',
        },
      });
    const email = 'cliente@example.test';
    const identityHash = await customerEmailIdentityHash(email, PROFILE_SECRET);
    db.sqlite.prepare(`INSERT INTO customer_profiles (
      id, primary_email, email_identity_hash, status, merged_into_profile_id,
      version, created_at, updated_at
    ) VALUES (?, ?, ?, 'active', NULL, 1, ?, ?)`).run(
      'customer_profile:runtime', email, identityHash, AT, AT,
    );
    const proof = 'A'.repeat(43);
    const deliver = vi.fn(async () => ({ deliveryAccepted: true }));
    const provider: PasswordlessProofProvider = Object.freeze({
      id: 'resend-test',
      methods: ['email_magic_link'] as const,
      prepare: vi.fn(async ({ challengeId }) => ({
        providerReference: `resend_magic:${challengeId}`,
        proof,
        proofDigest: await passwordlessProofDigest(proof),
      })),
      deliver,
      verify: vi.fn(async () => ({ verified: false, proofDigest: null, verificationReference: null })),
    });
    const providerFactory = vi.fn(async () => provider);
    const observability = { count: vi.fn() };
    const deferred: Promise<unknown>[] = [];
    const env = {
      DB: db.asD1(), DEMO_MODE: 'false',
      ADMIN_COOKIE_SECRET: 'runtime-admin-secret-'.padEnd(40, 'a'),
      CUSTOMER_PROFILE_HMAC_SECRET: PROFILE_SECRET,
      CUSTOMER_AUTH_CSRF_SECRET: CSRF_SECRET,
      CUSTOMER_AUTH_RATE_LIMIT: { limit: async () => ({ success: true }) },
      CUSTOMER_AUTH_RATE_LIMIT_ATTESTATION: 'ops:rate:runtime',
      CUSTOMER_AUTH_RESEND_TRACKING_ATTESTATION: 'ops:resend:runtime',
      CUSTOMER_AUTH_RESEND_DOMAIN_ID: 'domain_runtime_123',
      RESEND_API_KEY: 're_runtime_credential',
    } as Env;
    const http = await createRuntimeCustomerAccountHttp(
      env,
      (promise) => deferred.push(promise),
      { platform: activePlatform(), providerFactory, now: () => AT, observability },
    );
    expect(http).not.toBeNull();
    const response = await http!.requestAccess(new Request(`${shopConfig.baseUrl}/cuenta/acceso`, {
      method: 'POST',
      headers: { origin: shopConfig.baseUrl, 'content-type': 'application/x-www-form-urlencoded' },
      body: `email=${encodeURIComponent(email)}`,
    }));
    expect(response.status).toBe(202);
    expect(providerFactory).toHaveBeenCalledOnce();
    expect(deferred).toHaveLength(1);
    expect(db.query<{ status: string }>('SELECT status FROM customer_passwordless_challenges'))
      .toEqual([{ status: 'pending' }]);
    await Promise.all(deferred);
    expect(deliver).toHaveBeenCalledOnce();
    expect(observability.count).toHaveBeenCalledWith({
      stage: 'provider_delivery', outcome: 'delivered',
    });
  });
});
