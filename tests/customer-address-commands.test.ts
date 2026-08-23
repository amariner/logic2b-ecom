import { describe, expect, it } from 'vitest';
import migration43 from '../migrations/0043_customer_address_commands.sql?raw';
import {
  createCustomerAddressService,
  createD1CustomerAddressRepository,
  type CustomerAddressData,
} from '../src/modules/customers';
import { SqliteD1 } from './sqlite-d1';

const AT = '2026-08-22T14:00:00.000Z';
const ADDRESS: CustomerAddressData = Object.freeze({
  recipientName: 'Marta Ferrer', phone: null, street: 'Carrer Major 1',
  city: 'Castelló', region: null, postalCode: '12001', countryCode: 'ES',
});

function beforeMigration(): SqliteD1 {
  return new SqliteD1(
    true, true, true, true, true, true, true, true, true, true,
    true, true, true, true, true, true, true, true, true, false,
  );
}

function insertProfile(db: SqliteD1, id: string, hash = 'a'): void {
  db.sqlite.prepare(`INSERT INTO customer_profiles (
    id, primary_email, email_identity_hash, status, version, created_at, updated_at
  ) VALUES (?, ?, ?, 'active', 1, ?, ?)`).run(
    id, `${id.replaceAll(':', '-')}@example.test`, hash.repeat(64), AT, AT,
  );
}

describe('comandos idempotentes de direcciones R5.5f', () => {
  it('migra sin reescribir revisiones y exige evidencia completa e inmutable', () => {
    const db = beforeMigration();
    insertProfile(db, 'customer_profile:one');
    db.sqlite.exec(`INSERT INTO customer_address_revisions (
      address_id, customer_profile_id, revision, recipient_name, phone,
      street, city, region, postal_code, country_code, valid_from, valid_to
    ) VALUES ('address:legacy', 'customer_profile:one', 1, 'Legacy Customer', NULL,
      'Carrer Major 1', 'Castelló', NULL, '12001', 'ES', '${AT}', NULL)`);
    const before = db.query('SELECT * FROM customer_address_revisions');

    db.sqlite.exec(migration43);

    expect(db.query(`SELECT address_id, customer_profile_id, revision, recipient_name,
      phone, street, city, region, postal_code, country_code, valid_from, valid_to
      FROM customer_address_revisions`)).toEqual(before);
    expect(db.query(`SELECT write_idempotency_key, write_payload_fingerprint
      FROM customer_address_revisions`)).toEqual([{
      write_idempotency_key: null, write_payload_fingerprint: null,
    }]);
    expect(() => db.sqlite.exec(`INSERT INTO customer_address_revisions (
      address_id, customer_profile_id, revision, recipient_name, street, city,
      postal_code, country_code, valid_from, write_idempotency_key
    ) VALUES ('address:invalid', 'customer_profile:one', 1, 'Invalid Customer',
      'Carrer Major 1', 'Castelló', '12001', 'ES', '${AT}', 'write:invalid')`))
      .toThrow(/customer_address_write_evidence_invalid/u);
    expect(() => db.sqlite.exec(`UPDATE customer_address_revisions
      SET write_idempotency_key='write:changed', write_payload_fingerprint='${'f'.repeat(64)}'
      WHERE address_id='address:legacy'`)).toThrow(/customer_address_write_evidence_immutable/u);
  });

  it('crea una vez, reproduce la misma revisión y rechaza reutilizar la clave', async () => {
    const db = new SqliteD1();
    insertProfile(db, 'customer_profile:one');
    let sequence = 0;
    const service = createCustomerAddressService(
      createD1CustomerAddressRepository(db.asD1()),
      () => `address:created-${++sequence}`,
    );
    const command = {
      ownerProfileId: 'customer_profile:one', data: ADDRESS,
      idempotencyKey: 'customer-address:create:one', occurredAt: AT,
    } as const;

    const first = await service.createOwned(command);
    const replay = await service.createOwned(command);
    expect(first).toMatchObject({ outcome: 'applied', address: { revision: 1, data: ADDRESS } });
    expect(replay).toEqual({ outcome: 'replayed', address: first.address });
    expect(first.address?.publicRef).toMatch(/^addr_[0-9a-f]{32}$/u);
    expect(db.value('SELECT count(*) AS value FROM customer_address_revisions')).toBe(1);
    expect(db.value('SELECT count(*) AS value FROM customer_address_access_refs')).toBe(1);

    await expect(service.createOwned({ ...command, data: { ...ADDRESS, city: 'València' } }))
      .resolves.toEqual({ outcome: 'conflict', address: null });
    expect(db.value(`SELECT count(*) AS value FROM customer_address_revisions
      WHERE write_idempotency_key='customer-address:create:one'`)).toBe(1);
  });

  it('serializa revisión por selector+owner+CAS y conserva replay tras avanzar', async () => {
    const db = new SqliteD1();
    insertProfile(db, 'customer_profile:one');
    insertProfile(db, 'customer_profile:two', 'b');
    const service = createCustomerAddressService(
      createD1CustomerAddressRepository(db.asD1()),
      () => 'address:home',
    );
    const created = await service.createOwned({
      ownerProfileId: 'customer_profile:one', data: ADDRESS,
      idempotencyKey: 'customer-address:create:home', occurredAt: AT,
    });
    if (created.address === null) throw new Error('fixture no creada');
    const command = {
      publicRef: created.address.publicRef,
      ownerProfileId: 'customer_profile:one',
      expectedRevision: 1,
      data: { ...ADDRESS, street: 'Carrer Major 2' },
      idempotencyKey: 'customer-address:revise:home:2',
      occurredAt: '2026-08-22T15:00:00.000Z',
    } as const;
    const [left, right] = await Promise.all([
      service.reviseOwned(command), service.reviseOwned(command),
    ]);
    expect([left.outcome, right.outcome].toSorted()).toEqual(['applied', 'replayed']);
    expect(left.address).toEqual(right.address);
    expect(left.address).toMatchObject({ revision: 2, data: { street: 'Carrer Major 2' } });

    await expect(service.reviseOwned({
      ...command,
      ownerProfileId: 'customer_profile:two',
      expectedRevision: 2,
      idempotencyKey: 'customer-address:revise:wrong-owner',
    })).resolves.toEqual({ outcome: 'conflict', address: null });
    await expect(service.reviseOwned({
      ...command,
      expectedRevision: 1,
      idempotencyKey: 'customer-address:revise:stale',
    })).resolves.toEqual({ outcome: 'conflict', address: null });
    await expect(service.reviseOwned(command)).resolves.toEqual({
      outcome: 'replayed', address: left.address,
    });
    expect(db.value(`SELECT count(*) AS value FROM customer_address_revisions
      WHERE address_id='address:home' AND valid_to IS NULL`)).toBe(1);
  });

  it('lista solo revisiones vigentes del owner activo y cierra perfil fusionado', async () => {
    const db = new SqliteD1();
    insertProfile(db, 'customer_profile:one');
    insertProfile(db, 'customer_profile:two', 'b');
    const service = createCustomerAddressService(
      createD1CustomerAddressRepository(db.asD1()),
      () => 'address:list',
    );
    await service.createOwned({ ownerProfileId: 'customer_profile:one', data: ADDRESS,
      idempotencyKey: 'customer-address:create:list', occurredAt: AT });
    await expect(service.listOwned('customer_profile:one')).resolves.toHaveLength(1);
    await expect(service.listOwned('customer_profile:two')).resolves.toEqual([]);
    db.sqlite.exec(`UPDATE customer_profiles SET status='merged',
      merged_into_profile_id='customer_profile:two', version=2,
      updated_at='2026-08-22T16:00:00.000Z' WHERE id='customer_profile:one'`);
    await expect(service.listOwned('customer_profile:one')).resolves.toEqual([]);
  });
});
