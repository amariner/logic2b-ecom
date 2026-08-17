import { describe, expect, it } from 'vitest';
import { resolveCheckoutCustomerProfile } from '../src/composition/customer-profile-association';
import {
  CustomerProfileConflictError,
  createD1CustomerProfileRepository,
  customerEmailIdentityHash,
  customerOrderAssociation,
  type CustomerAddressData,
} from '../src/modules/customers';
import { createOrderWriter } from '../src/modules/orders';
import { SqliteD1 } from './sqlite-d1';

const SECRET = 'customer-profile-repository-secret-32-chars';
const EMAIL = 'marta@example.com';
const AT = '2026-08-17T12:00:00.000Z';
const ADDRESS: CustomerAddressData = {
  recipientName: 'Marta Ferrer', phone: null, street: 'Carrer Major 1',
  city: 'Castelló', region: null, postalCode: '12001', countryCode: 'ES',
};

async function createProfile(db: SqliteD1, id = 'cus_profile_a') {
  const hash = await customerEmailIdentityHash(EMAIL, SECRET);
  const result = await createD1CustomerProfileRepository(db.asD1()).resolveOrCreate({
    profileId: id, email: EMAIL, emailIdentityHash: hash, at: AT,
  });
  return { hash, result };
}

describe('repositorio D1 R5.1', () => {
  it('hace converger dos altas concurrentes en un único perfil', async () => {
    const db = new SqliteD1();
    const hash = await customerEmailIdentityHash(' MARTA@EXAMPLE.COM ', SECRET);
    const repository = createD1CustomerProfileRepository(db.asD1());
    const outcomes = await Promise.all([
      repository.resolveOrCreate({ profileId: 'cus_race_a', email: EMAIL,
        emailIdentityHash: hash, at: AT }),
      repository.resolveOrCreate({ profileId: 'cus_race_b', email: EMAIL,
        emailIdentityHash: hash, at: AT }),
    ]);
    expect(outcomes.map((result) => result.action).toSorted()).toEqual(['create', 'link_existing']);
    expect(db.value('SELECT count(*) AS value FROM customer_profiles')).toBe(1);
    expect(db.value('SELECT count(DISTINCT email_identity_hash) AS value FROM customer_profiles')).toBe(1);
  });

  it('mantiene guest sin capacidad/secreto y no revela alta frente a reutilización', async () => {
    const db = new SqliteD1();
    const disabled = await resolveCheckoutCustomerProfile({
      db: db.asD1(), enabled: false, email: EMAIL, identitySecret: SECRET, at: AT,
    });
    const missingSecret = await resolveCheckoutCustomerProfile({
      db: db.asD1(), enabled: true, email: EMAIL, at: AT,
    });
    expect(disabled).toEqual(customerOrderAssociation(null));
    expect(missingSecret).toEqual(customerOrderAssociation(null));
    expect(db.value('SELECT count(*) AS value FROM customer_profiles')).toBe(0);

    const first = await resolveCheckoutCustomerProfile({
      db: db.asD1(), enabled: true, email: EMAIL, identitySecret: SECRET, at: AT,
      profileIdFactory: () => 'cus_checkout_a',
    });
    const second = await resolveCheckoutCustomerProfile({
      db: db.asD1(), enabled: true, email: EMAIL, identitySecret: SECRET,
      at: '2026-08-17T12:01:00.000Z', profileIdFactory: () => 'cus_checkout_b',
    });
    expect(first.mode).toBe('profile');
    expect(second).toEqual(first);
    expect(Object.keys(first)).toEqual(['mode', 'customerProfileId']);
    expect(db.value('SELECT count(*) AS value FROM customer_profiles')).toBe(1);
  });

  it('serializa revisiones concurrentes y conserva una sola dirección vigente', async () => {
    const db = new SqliteD1();
    await createProfile(db);
    const repository = createD1CustomerProfileRepository(db.asD1());
    await repository.appendAddressRevision({ addressId: 'addr_home',
      customerProfileId: 'cus_profile_a', expectedRevision: null, data: ADDRESS, at: AT });
    const attempts = await Promise.allSettled([
      repository.appendAddressRevision({ addressId: 'addr_home',
        customerProfileId: 'cus_profile_a', expectedRevision: 1,
        data: { ...ADDRESS, street: 'Carrer Major 2' }, at: '2026-08-17T13:00:00.000Z' }),
      repository.appendAddressRevision({ addressId: 'addr_home',
        customerProfileId: 'cus_profile_a', expectedRevision: 1,
        data: { ...ADDRESS, street: 'Carrer Major 3' }, at: '2026-08-17T14:00:00.000Z' }),
    ]);
    expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const failure = attempts.find((result) => result.status === 'rejected');
    expect(failure).toMatchObject({ reason: expect.any(CustomerProfileConflictError) });
    expect(db.value(`SELECT count(*) AS value FROM customer_address_revisions
      WHERE valid_to IS NULL`)).toBe(1);
    expect(db.value('SELECT max(revision) AS value FROM customer_address_revisions')).toBe(2);
  });

  it('asocia el pedido con versión optimista sin tocar sus snapshots', async () => {
    const db = new SqliteD1();
    await createProfile(db);
    const orderWriter = createOrderWriter(db.asD1());
    await orderWriter.insertPendingOrderStatement({
      order_number: 'ORDER-PROFILE', email: 'snapshot@example.com',
      customer_name: 'Snapshot', address_json: '{"street":"Frozen"}',
      subtotal_cents: 1000, shipping_cents: 0, total_cents: 1000,
      stripe_session_id: 'session-profile', currency: 'EUR',
    }).run();
    const repository = createD1CustomerProfileRepository(db.asD1());
    await repository.associateOrder({
      orderId: Number(db.value("SELECT id AS value FROM orders WHERE order_number='ORDER-PROFILE'")),
      association: customerOrderAssociation('cus_profile_a'),
      expectedCustomerProfileId: null,
      at: '2026-08-17T12:05:00.000Z',
    });
    expect(db.query(`SELECT email, customer_name, address_json, customer_profile_id
      FROM orders WHERE order_number='ORDER-PROFILE'`)).toEqual([{
      email: 'snapshot@example.com', customer_name: 'Snapshot',
      address_json: '{"street":"Frozen"}', customer_profile_id: 'cus_profile_a',
    }]);
    await expect(repository.associateOrder({
      orderId: Number(db.value("SELECT id AS value FROM orders WHERE order_number='ORDER-PROFILE'")),
      association: customerOrderAssociation(null), expectedCustomerProfileId: null, at: AT,
    })).rejects.toBeInstanceOf(CustomerProfileConflictError);
    await expect(repository.associateOrder({
      orderId: Number(db.value("SELECT id AS value FROM orders WHERE order_number='ORDER-PROFILE'")),
      association: customerOrderAssociation(null), expectedCustomerProfileId: 'cus_profile_a',
      at: '2026-08-17T12:06:00.000Z',
    })).rejects.toBeInstanceOf(CustomerProfileConflictError);

    await orderWriter.insertPendingOrderStatement({
      order_number: 'ORDER-PROFILE-DIRECT', email: 'another-snapshot@example.com',
      customer_name: 'Another Snapshot', address_json: '{"street":"Other frozen"}',
      subtotal_cents: 1200, shipping_cents: 0, total_cents: 1200,
      stripe_session_id: 'session-profile-direct', currency: 'EUR',
      customer_profile_id: 'cus_profile_a',
    }).run();
    expect(db.value(`SELECT customer_profile_id AS value FROM orders
      WHERE order_number='ORDER-PROFILE-DIRECT'`)).toBe('cus_profile_a');
  });

  it('usa errores genéricos que no incluyen PII ni HMAC', async () => {
    const db = new SqliteD1();
    const { hash } = await createProfile(db);
    const repository = createD1CustomerProfileRepository(db.asD1());
    let message = '';
    try {
      await repository.appendAddressRevision({ addressId: 'addr_missing',
        customerProfileId: 'cus_missing', expectedRevision: null, data: ADDRESS, at: AT });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toBe('La operación del perfil no pudo confirmarse.');
    expect(message).not.toContain(EMAIL);
    expect(message).not.toContain(hash);
  });
});
