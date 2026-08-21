import { describe, expect, it } from 'vitest';
import migration42 from '../migrations/0042_customer_address_access.sql?raw';
import {
  createD1CustomerAddressOwnershipReader,
  createD1CustomerOwnedAddressReader,
  createD1CustomerOwnedAddressRevisionWriter,
  createD1CustomerProfileRepository,
  customerResourceTarget,
  type CustomerAddressData,
} from '../src/modules/customers';
import { SqliteD1 } from './sqlite-d1';

const AT = '2026-08-22T10:00:00.000Z';
const ADDRESS: CustomerAddressData = Object.freeze({
  recipientName: 'Marta Ferrer',
  phone: '+34 600 000 000',
  street: 'Carrer Major 1',
  city: 'Castelló',
  region: null,
  postalCode: '12001',
  countryCode: 'ES',
});

function beforeMigration(): SqliteD1 {
  return new SqliteD1(
    true, true, true, true, true, true, true, true, true,
    true, true, true, true, true, true, true, true, true, false,
  );
}

function insertProfile(db: SqliteD1, id: string, hashCharacter = 'a'): void {
  db.sqlite.prepare(`INSERT INTO customer_profiles (
    id, primary_email, email_identity_hash, status, version, created_at, updated_at
  ) VALUES (?, ?, ?, 'active', 1, ?, ?)`).run(
    id,
    `${id.replaceAll(':', '-')}@example.test`,
    hashCharacter.repeat(64),
    AT,
    AT,
  );
}

function insertAddress(db: SqliteD1, addressId: string, profileId: string, at = AT): void {
  db.sqlite.prepare(`INSERT INTO customer_address_revisions (
    address_id, customer_profile_id, revision, recipient_name, phone,
    street, city, region, postal_code, country_code, valid_from, valid_to
  ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`).run(
    addressId,
    profileId,
    ADDRESS.recipientName,
    ADDRESS.phone,
    ADDRESS.street,
    ADDRESS.city,
    ADDRESS.region,
    ADDRESS.postalCode,
    ADDRESS.countryCode,
    at,
  );
}

function publicRef(db: SqliteD1, addressId: string): string {
  return String(db.value(`SELECT public_ref AS value
    FROM customer_address_access_refs WHERE address_id='${addressId}'`));
}

describe('migración 0042 de referencias y ownership de direcciones', () => {
  it('es expand-only, backfillea por address_id y no copia PII', () => {
    const db = beforeMigration();
    insertProfile(db, 'customer_profile:one');
    insertAddress(db, 'address:home', 'customer_profile:one');
    db.sqlite.prepare(`INSERT INTO customer_address_revisions (
      address_id, customer_profile_id, revision, recipient_name, phone,
      street, city, region, postal_code, country_code, valid_from, valid_to
    ) VALUES ('address:home', 'customer_profile:one', 2, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`).run(
      ADDRESS.recipientName, ADDRESS.phone, 'Carrer Major 2', ADDRESS.city,
      ADDRESS.region, ADDRESS.postalCode, ADDRESS.countryCode,
      '2026-08-22T11:00:00.000Z',
    );
    const before = db.query(`SELECT * FROM customer_address_revisions
      ORDER BY address_id, revision`);

    db.sqlite.exec(migration42);

    expect(db.query(`SELECT name FROM pragma_table_info('customer_address_access_refs')
      ORDER BY cid`)).toEqual([{ name: 'address_id' }, { name: 'public_ref' }]);
    expect(db.query(`SELECT * FROM customer_address_revisions
      ORDER BY address_id, revision`)).toEqual(before);
    expect(db.query('SELECT address_id FROM customer_address_access_refs')).toEqual([
      { address_id: 'address:home' },
    ]);
    expect(publicRef(db, 'address:home')).toMatch(/^addr_[0-9a-f]{32}$/u);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('genera el selector con la primera revisión, conserva identidad y falla cerrado', async () => {
    const db = new SqliteD1();
    insertProfile(db, 'customer_profile:one');
    const repository = createD1CustomerProfileRepository(db.asD1());
    const attempts = await Promise.allSettled([
      repository.appendAddressRevision({ addressId: 'address:race',
        customerProfileId: 'customer_profile:one', expectedRevision: null,
        data: ADDRESS, at: AT }),
      repository.appendAddressRevision({ addressId: 'address:race',
        customerProfileId: 'customer_profile:one', expectedRevision: null,
        data: ADDRESS, at: AT }),
    ]);
    expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(db.value(`SELECT count(*) AS value FROM customer_address_access_refs
      WHERE address_id='address:race'`)).toBe(1);
    const ref = publicRef(db, 'address:race');

    await repository.appendAddressRevision({ addressId: 'address:race',
      customerProfileId: 'customer_profile:one', expectedRevision: 1,
      data: { ...ADDRESS, street: 'Carrer Major 2' },
      at: '2026-08-22T11:00:00.000Z' });
    expect(publicRef(db, 'address:race')).toBe(ref);
    expect(() => db.sqlite.prepare(`UPDATE customer_address_access_refs
      SET public_ref='addr_${'f'.repeat(32)}' WHERE address_id='address:race'`).run())
      .toThrow(/customer_address_access_ref_immutable/u);
    expect(() => db.sqlite.prepare(`INSERT INTO customer_address_access_refs
      (address_id, public_ref) VALUES ('address:collision', ?)`).run(ref)).toThrow(/UNIQUE/u);
    expect(() => db.sqlite.prepare(`DELETE FROM customer_address_access_refs
      WHERE address_id='address:race'`).run()).toThrow(/customer_address_access_ref_in_use/u);
  });

  it('resuelve owner desde la revisión vigente, usa su revisión como CAS y deniega merge', async () => {
    const db = new SqliteD1();
    insertProfile(db, 'customer_profile:one');
    insertProfile(db, 'customer_profile:two', 'b');
    insertAddress(db, 'address:home', 'customer_profile:one');
    const ref = publicRef(db, 'address:home');
    const target = customerResourceTarget('address', ref);
    const reader = createD1CustomerAddressOwnershipReader(db.asD1());

    await expect(reader.resolve(target)).resolves.toEqual({
      target,
      ownerProfileId: 'customer_profile:one',
      state: 'owned',
      version: 1,
    });
    for (const invalid of ['address:home', ADDRESS.street, ADDRESS.phone!]) {
      await expect(reader.resolve({ kind: 'address', publicRef: invalid })).resolves.toBeNull();
    }

    db.sqlite.exec(`UPDATE customer_profiles
      SET status='merged', merged_into_profile_id='customer_profile:two', version=2,
        updated_at='2026-08-22T12:00:00.000Z'
      WHERE id='customer_profile:one'`);
    await expect(reader.resolve(target)).resolves.toEqual({
      target,
      ownerProfileId: 'customer_profile:one',
      state: 'incoherent',
      version: 1,
    });
  });

  it('revalida owner y revisión dentro del SQL de lectura y escritura', async () => {
    const db = new SqliteD1();
    insertProfile(db, 'customer_profile:one');
    insertProfile(db, 'customer_profile:two', 'b');
    insertAddress(db, 'address:home', 'customer_profile:one');
    const target = customerResourceTarget('address', publicRef(db, 'address:home'));
    const reader = createD1CustomerOwnedAddressReader(db.asD1());
    const writer = createD1CustomerOwnedAddressRevisionWriter(db.asD1());

    await expect(reader.readOwned({ target, ownerProfileId: 'customer_profile:two',
      expectedOwnershipVersion: 1 })).resolves.toBeNull();
    await expect(reader.readOwned({ target, ownerProfileId: 'customer_profile:one',
      expectedOwnershipVersion: 1 })).resolves.toMatchObject({
      publicRef: target.publicRef, revision: 1, data: ADDRESS,
    });

    const writes = await Promise.all([
      writer.appendOwned({ target, ownerProfileId: 'customer_profile:one',
        expectedOwnershipVersion: 1, data: { ...ADDRESS, street: 'Carrer Major 2' },
        occurredAt: '2026-08-22T11:00:00.000Z' }),
      writer.appendOwned({ target, ownerProfileId: 'customer_profile:one',
        expectedOwnershipVersion: 1, data: { ...ADDRESS, street: 'Carrer Major 3' },
        occurredAt: '2026-08-22T12:00:00.000Z' }),
    ]);
    expect(writes.filter((result) => result !== null)).toHaveLength(1);
    expect(db.value(`SELECT count(*) AS value FROM customer_address_revisions
      WHERE address_id='address:home' AND valid_to IS NULL`)).toBe(1);
    expect(db.value(`SELECT max(revision) AS value FROM customer_address_revisions
      WHERE address_id='address:home'`)).toBe(2);
    await expect(reader.readOwned({ target, ownerProfileId: 'customer_profile:one',
      expectedOwnershipVersion: 1 })).resolves.toBeNull();
    await expect(writer.appendOwned({ target, ownerProfileId: 'customer_profile:two',
      expectedOwnershipVersion: 2, data: ADDRESS,
      occurredAt: '2026-08-22T13:00:00.000Z' })).resolves.toBeNull();
  });

  it('retira el selector solo al purgar la última revisión', () => {
    const db = new SqliteD1();
    insertProfile(db, 'customer_profile:one');
    insertAddress(db, 'address:retention', 'customer_profile:one');
    expect(publicRef(db, 'address:retention')).toMatch(/^addr_/u);
    db.sqlite.exec(`DELETE FROM customer_address_revisions
      WHERE address_id='address:retention'`);
    expect(db.value(`SELECT count(*) AS value FROM customer_address_access_refs
      WHERE address_id='address:retention'`)).toBe(0);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });
});
