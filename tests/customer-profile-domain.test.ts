import { describe, expect, it } from 'vitest';
import {
  createCustomerAddressRevision,
  createCustomerProfile,
  customerEmailIdentityHash,
  customerOrderAssociation,
  mergeCustomerProfiles,
  normalizeCustomerEmail,
  resolveCustomerIdentity,
  reviseCustomerAddress,
  type CustomerAddressData,
  type CustomerProfileRepository,
} from '../src/modules/customers';

const SECRET = 'customer-identity-test-secret-with-32-chars';
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const AT = '2026-08-17T12:00:00.000Z';

function profile(overrides: Partial<{
  id: string;
  email: string;
  emailIdentityHash: string;
  at: string;
}> = {}) {
  return createCustomerProfile({
    id: 'cus_profile_a',
    email: 'client@example.com',
    emailIdentityHash: HASH_A,
    at: AT,
    ...overrides,
  });
}

const ADDRESS: CustomerAddressData = {
  recipientName: 'Marta Ferrer',
  phone: '+34 600 000 000',
  street: 'Carrer Major 1',
  city: 'Castelló de la Plana',
  region: 'Castelló',
  postalCode: '12001',
  countryCode: 'ES',
};

describe('R5.1 perfil de cliente deduplicable', () => {
  it('normaliza el email y genera una identidad HMAC estable pero aislada por despliegue', async () => {
    expect(normalizeCustomerEmail('  ＭＡＲＴＡ＠ＥＸＡＭＰＬＥ．ＣＯＭ  '))
      .toBe('marta@example.com');
    const first = await customerEmailIdentityHash(' Marta@Example.com ', SECRET);
    const equivalent = await customerEmailIdentityHash('marta@example.com', SECRET);
    const isolated = await customerEmailIdentityHash(
      'marta@example.com',
      'another-customer-identity-secret-32-chars',
    );
    expect(first).toMatch(/^[a-f0-9]{64}$/u);
    expect(equivalent).toBe(first);
    expect(isolated).not.toBe(first);
    expect(first).not.toContain('marta');
    expect(() => normalizeCustomerEmail('marta@example.com\nblind-copy@example.com'))
      .toThrow(/inválido/u);
    await expect(customerEmailIdentityHash('marta@example.com', 'short'))
      .rejects.toThrow(/32 caracteres/u);
  });

  it('distingue alta, convergencia y conflictos sin fusionar identidades', () => {
    expect(resolveCustomerIdentity({ email: ' CLIENT@EXAMPLE.COM ', identityHash: HASH_A,
      candidates: [] }))
      .toEqual({ action: 'create', identityHash: HASH_A, normalizedEmail: 'client@example.com' });
    const existing = profile();
    expect(resolveCustomerIdentity({ email: 'client@example.com', identityHash: HASH_A,
      candidates: [existing] }))
      .toEqual({ action: 'link_existing', profile: existing });
    expect(resolveCustomerIdentity({
      email: 'client@example.com',
      identityHash: HASH_A,
      candidates: [existing, profile({ id: 'cus_profile_duplicate' })],
    })).toEqual({
      action: 'requires_review',
      reason: 'duplicate_identity',
      candidateProfileIds: ['cus_profile_a', 'cus_profile_duplicate'],
    });
    expect(resolveCustomerIdentity({
      email: 'client@example.com',
      identityHash: HASH_A,
      candidates: [profile({ id: 'cus_profile_other', email: 'other@example.com',
        emailIdentityHash: HASH_B })],
    })).toEqual({
      action: 'requires_review',
      reason: 'identity_conflict',
      candidateProfileIds: ['cus_profile_other'],
    });
  });

  it('mantiene guest checkout y expresa una relación opcional sin snapshots de pedido', () => {
    expect(customerOrderAssociation(null)).toEqual({ mode: 'guest', customerProfileId: null });
    expect(customerOrderAssociation('cus_profile_a'))
      .toEqual({ mode: 'profile', customerProfileId: 'cus_profile_a' });
    expect(() => customerOrderAssociation('1')).toThrow(/opaco/u);

    type AssociateOrderInput = Parameters<CustomerProfileRepository['associateOrder']>[0];
    const linked: AssociateOrderInput = {
      orderId: 42,
      association: customerOrderAssociation('cus_profile_a'),
      expectedCustomerProfileId: null,
      at: AT,
    };
    expect(Object.keys(linked).toSorted()).toEqual([
      'association', 'at', 'expectedCustomerProfileId', 'orderId',
    ]);
    expect(JSON.stringify(linked)).not.toMatch(/email|address|customer_name/u);
  });

  it('versiona direcciones sin modificar la revisión histórica', () => {
    const first = createCustomerAddressRevision({
      addressId: 'addr_home',
      customerProfileId: 'cus_profile_a',
      data: ADDRESS,
      at: AT,
    });
    const transition = reviseCustomerAddress(first, {
      expectedRevision: 1,
      data: { ...ADDRESS, street: 'Carrer Major 2', countryCode: 'es' },
      at: '2026-08-17T13:00:00.000Z',
    });
    expect(first.validTo).toBeNull();
    expect(first.data.street).toBe('Carrer Major 1');
    expect(transition.superseded).toMatchObject({ revision: 1,
      validTo: '2026-08-17T13:00:00.000Z' });
    expect(transition.current).toMatchObject({ revision: 2, validTo: null,
      data: { street: 'Carrer Major 2', countryCode: 'ES' } });
    expect(() => reviseCustomerAddress(first, {
      expectedRevision: 2,
      data: ADDRESS,
      at: '2026-08-17T13:00:00.000Z',
    })).toThrow(/Conflicto de versión/u);
  });

  it('fusiona solo con revisión explícita, identidad coincidente y versiones vigentes', () => {
    const source = profile({ id: 'cus_source' });
    const target = profile({ id: 'cus_target' });
    const merged = mergeCustomerProfiles({
      source,
      target,
      expectedSourceVersion: 1,
      expectedTargetVersion: 1,
      reviewedBy: 'operator_admin',
      at: '2026-08-17T14:00:00.000Z',
    });
    expect(merged.source).toMatchObject({ status: 'merged', mergedIntoProfileId: 'cus_target',
      version: 2 });
    expect(merged.target).toMatchObject({ status: 'active', version: 2 });
    expect(source).toMatchObject({ status: 'active', version: 1 });
    expect(() => mergeCustomerProfiles({
      source,
      target: profile({ id: 'cus_other', email: 'other@example.com', emailIdentityHash: HASH_B }),
      expectedSourceVersion: 1,
      expectedTargetVersion: 1,
      reviewedBy: 'operator_admin',
      at: '2026-08-17T14:00:00.000Z',
    })).toThrow(/identidades distintas/u);
    expect(() => mergeCustomerProfiles({
      source,
      target,
      expectedSourceVersion: 2,
      expectedTargetVersion: 1,
      reviewedBy: 'operator_admin',
      at: '2026-08-17T14:00:00.000Z',
    })).toThrow(/Conflicto de versión/u);
  });
});
