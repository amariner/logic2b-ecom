import { describe, expect, it, vi } from 'vitest';
import { createRuntimeCustomerAccountHttp } from '../src/composition/runtime-customer-account';
import { createRuntimeCustomerOrderAccessHttp } from '../src/composition/runtime-customer-order-access';
import { createRuntimeCustomerAddressHttp } from '../src/composition/runtime-customer-address';
import type { Platform } from '../src/composition/create-platform';
import type { PasswordlessProofProvider } from '../src/modules/customers/application/passwordless-auth-ports';
import type { CapabilityConfigById } from '../src/platform/configuration';
import { customerEmailIdentityHash } from '../src/modules/customers/application/customer-identity';
import { passwordlessProofDigest } from '../src/modules/customers/infrastructure/passwordless-web-crypto';
import { createD1CustomerAuthenticationRepository } from '../src/modules/customers/infrastructure/d1-customer-authentication-repository';
import { SqliteD1 } from './sqlite-d1';
import { shopConfig } from '../shop.config';
import { CUSTOMER_AUTH_SESSION_COOKIE_NAME } from '../src/modules/customers/presentation/passwordless-http';

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
    isCapabilityActive: (id: string) => ['CUS-003', 'CUS-004', 'CUS-006'].includes(id),
    hasCapabilityFlag: (id: string, flag: string) =>
      ['CUS-003', 'CUS-004', 'CUS-006'].includes(id) && flag === 'routes',
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
    await expect(createRuntimeCustomerOrderAccessHttp(unreadable)).resolves.toBeNull();
    await expect(createRuntimeCustomerAddressHttp(unreadable)).resolves.toBeNull();
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

  it('compone token→sesión D1→owner→DTO sin construir proveedor', async () => {
    const db = new SqliteD1();
    const authentication = createD1CustomerAuthenticationRepository(db.asD1());
    await authentication.transitionCustomerAuthCapability({
      fromState: 'installed',
      toState: 'active',
      expectedVersion: 0,
      occurredAt: AT,
      idempotencyKey: 'customer-auth/capability/order-access-active',
      audit: {
        auditId: 'customer_auth_audit:order_access_active',
        occurredAt: AT,
        correlationId: 'customer_auth_correlation:order_access_active',
      },
    });
    const token = 'A'.repeat(43);
    const hash = 'd'.repeat(64);
    db.sqlite.exec(`
      INSERT INTO customer_profiles (
        id, primary_email, email_identity_hash, status, version, created_at, updated_at
      ) VALUES ('customer_profile:runtime_order', 'runtime-order@example.test', '${hash}',
        'active', 1, '${AT}', '${AT}');
      INSERT INTO customer_auth_identities (
        id, customer_profile_id, contact_identity_hash, status, created_at,
        revoked_at, creation_idempotency_key
      ) VALUES ('auth_identity:runtime_order', 'customer_profile:runtime_order', '${hash}',
        'active', '${AT}', NULL, 'auth:identity:runtime_order');
      INSERT INTO customer_session_families (
        id, identity_id, customer_profile_id, status, created_at,
        absolute_expires_at, revoked_at, revocation_reason_id,
        transition_idempotency_key, version
      ) VALUES ('session_family:runtime_order', 'auth_identity:runtime_order',
        'customer_profile:runtime_order', 'active', '${AT}',
        '2026-09-18T10:00:00.000Z', NULL, NULL, NULL, 1);
    `);
    db.sqlite.prepare(`INSERT INTO customer_sessions (
      id, family_id, identity_id, customer_profile_id, token_digest,
      can_revoke_sessions, status, issued_at, expires_at, absolute_expires_at,
      generation, rotated_from_session_id, replaced_by_session_id, revoked_at,
      revocation_reason_id, transition_idempotency_key, version
    ) VALUES ('customer_session:runtime_order', 'session_family:runtime_order',
      'auth_identity:runtime_order', 'customer_profile:runtime_order', ?, 0, 'active',
      ?, '2026-08-20T10:00:00.000Z', '2026-09-18T10:00:00.000Z',
      1, NULL, NULL, NULL, NULL, NULL, 1)`).run(await passwordlessProofDigest(token), AT);
    db.sqlite.exec(`INSERT INTO orders (
      order_number, email, customer_name, address_json, subtotal_cents,
      shipping_cents, total_cents, status, stripe_session_id, currency,
      customer_profile_id
    ) VALUES ('ORDER-RUNTIME-ACCESS', 'runtime-order@example.test', 'Runtime', '{}',
      1000, 0, 1000, 'paid', 'stripe-runtime-order', 'EUR',
      'customer_profile:runtime_order')`);
    const publicRef = String(db.value(`SELECT access.public_ref AS value
      FROM customer_order_access_refs access JOIN orders ON orders.id=access.order_id
      WHERE orders.order_number='ORDER-RUNTIME-ACCESS'`));
    const observability = { count: vi.fn() };
    const http = await createRuntimeCustomerOrderAccessHttp({
      DB: db.asD1(), DEMO_MODE: 'false', ADMIN_COOKIE_SECRET: 'unused',
    }, { platform: activePlatform(), now: () => AT, observability });
    const response = await http!.read(new Request(
      `https://shop.example/api/customer/orders/${publicRef}`,
      { headers: { cookie: `${CUSTOMER_AUTH_SESSION_COOKIE_NAME}=${token}` } },
    ), publicRef);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      order: { publicRef, orderNumber: 'ORDER-RUNTIME-ACCESS', status: 'paid' },
    });
    expect(observability.count).toHaveBeenCalledWith({ outcome: 'allowed' });
  });

  it('compone sesión→CSRF→alta/lista de dirección sin construir proveedor', async () => {
    const db = new SqliteD1();
    const authentication = createD1CustomerAuthenticationRepository(db.asD1());
    await authentication.transitionCustomerAuthCapability({
      fromState: 'installed', toState: 'active', expectedVersion: 0, occurredAt: AT,
      idempotencyKey: 'customer-auth/capability/address-runtime-active',
      audit: { auditId: 'customer_auth_audit:address_runtime_active', occurredAt: AT,
        correlationId: 'customer_auth_correlation:address_runtime_active' },
    });
    const token = 'A'.repeat(43);
    const hash = 'e'.repeat(64);
    db.sqlite.exec(`
      INSERT INTO customer_profiles (
        id, primary_email, email_identity_hash, status, version, created_at, updated_at
      ) VALUES ('customer_profile:runtime_address', 'runtime-address@example.test', '${hash}',
        'active', 1, '${AT}', '${AT}');
      INSERT INTO customer_auth_identities (
        id, customer_profile_id, contact_identity_hash, status, created_at,
        revoked_at, creation_idempotency_key
      ) VALUES ('auth_identity:runtime_address', 'customer_profile:runtime_address', '${hash}',
        'active', '${AT}', NULL, 'auth:identity:runtime_address');
      INSERT INTO customer_session_families (
        id, identity_id, customer_profile_id, status, created_at,
        absolute_expires_at, revoked_at, revocation_reason_id,
        transition_idempotency_key, version
      ) VALUES ('session_family:runtime_address', 'auth_identity:runtime_address',
        'customer_profile:runtime_address', 'active', '${AT}',
        '2026-09-18T10:00:00.000Z', NULL, NULL, NULL, 1);
    `);
    db.sqlite.prepare(`INSERT INTO customer_sessions (
      id, family_id, identity_id, customer_profile_id, token_digest,
      can_revoke_sessions, status, issued_at, expires_at, absolute_expires_at,
      generation, rotated_from_session_id, replaced_by_session_id, revoked_at,
      revocation_reason_id, transition_idempotency_key, version
    ) VALUES ('customer_session:runtime_address', 'session_family:runtime_address',
      'auth_identity:runtime_address', 'customer_profile:runtime_address', ?, 0, 'active',
      ?, '2026-08-24T10:00:00.000Z', '2026-09-18T10:00:00.000Z',
      1, NULL, NULL, NULL, NULL, NULL, 1)`).run(await passwordlessProofDigest(token), AT);
    const env = {
      DB: db.asD1(), DEMO_MODE: 'false',
      ADMIN_COOKIE_SECRET: 'runtime-address-admin-secret-'.padEnd(40, 'a'),
      CUSTOMER_PROFILE_HMAC_SECRET: PROFILE_SECRET,
      CUSTOMER_AUTH_CSRF_SECRET: CSRF_SECRET,
      CUSTOMER_AUTH_RATE_LIMIT: { limit: async () => ({ success: true }) },
      CUSTOMER_AUTH_RATE_LIMIT_ATTESTATION: 'ops:rate:runtime',
      CUSTOMER_AUTH_RESEND_TRACKING_ATTESTATION: 'ops:resend:runtime',
      CUSTOMER_AUTH_RESEND_DOMAIN_ID: 'domain_runtime_123',
      RESEND_API_KEY: 're_runtime_address_credential',
    } as Env;
    const observability = { count: vi.fn() };
    const http = await createRuntimeCustomerAddressHttp(env, {
      platform: activePlatform(), now: () => AT, observability,
      addressIdFactory: () => 'address:runtime-http',
    });
    const cookie = `${CUSTOMER_AUTH_SESSION_COOKIE_NAME}=${token}`;
    const listed = await http!.list(new Request('https://shop.example/api/customer/addresses', {
      headers: { cookie },
    }));
    const csrfToken = (await listed.json() as { csrfToken: string }).csrfToken;
    const created = await http!.create(new Request('https://shop.example/api/customer/addresses', {
      method: 'POST', headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ csrfToken, idempotencyKey: 'address-runtime-create-one',
        address: { recipientName: 'Marta Ferrer', phone: null, street: 'Carrer Major 1',
          city: 'Castelló', region: null, postalCode: '12001', countryCode: 'ES' } }),
    }));
    expect(created.status).toBe(201);
    await expect(created.json()).resolves.toMatchObject({ address: { revision: 1 } });
    expect(observability.count).toHaveBeenCalledWith({ operation: 'create', outcome: 'allowed' });
  });
});
