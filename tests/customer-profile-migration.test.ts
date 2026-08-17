import { describe, expect, it } from 'vitest';
import migration36 from '../migrations/0036_customer_profiles.sql?raw';
import { SqliteD1 } from './sqlite-d1';

const AT = '2026-08-17T12:00:00.000Z';

function beforeMigration(): SqliteD1 {
  return new SqliteD1(true, true, true, true, true, true, true, true, true,
    true, true, true, false);
}

function insertProfile(db: SqliteD1, id = 'cus_profile_a', hash = 'a'.repeat(64)): void {
  db.sqlite.prepare(`INSERT INTO customer_profiles (
    id, primary_email, email_identity_hash, status, version, created_at, updated_at
  ) VALUES (?, 'client@example.com', ?, 'active', 1, ?, ?)`).run(id, hash, AT, AT);
}

describe('migración 0036 de perfiles de cliente', () => {
  it('es expand-only, deja pedidos existentes como guest y conserva FKs', () => {
    const db = beforeMigration();
    db.sqlite.exec(`INSERT INTO orders (
      order_number, email, customer_name, address_json, subtotal_cents,
      shipping_cents, total_cents, status, stripe_session_id, currency
    ) VALUES ('ORDER-BEFORE-36', 'legacy@example.com', 'Legacy', '{}',
      1000, 0, 1000, 'pending', 'session-before-36', 'EUR')`);
    const before = db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table'",
    ).length;
    db.sqlite.exec(migration36);
    expect(db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'").length)
      .toBe(before + 3);
    expect(db.value("SELECT customer_profile_id AS value FROM orders WHERE order_number='ORDER-BEFORE-36'"))
      .toBeNull();
    expect(db.value('SELECT count(*) AS value FROM customer_profiles')).toBe(0);
    expect(migration36).not.toMatch(/UPDATE\s+orders\s+SET\s+customer_profile_id/iu);
    expect(migration36).not.toMatch(/INSERT\s+INTO\s+customer_profiles\s+SELECT/iu);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('impone HMAC único y una FK nullable sin alterar snapshots del pedido', () => {
    const db = new SqliteD1();
    insertProfile(db);
    expect(() => insertProfile(db, 'cus_profile_duplicate')).toThrow(/UNIQUE/u);
    db.sqlite.exec(`INSERT INTO orders (
      order_number, email, customer_name, address_json, subtotal_cents,
      shipping_cents, total_cents, status, stripe_session_id, currency, customer_profile_id
    ) VALUES ('ORDER-36', 'snapshot@example.com', 'Snapshot', '{"street":"Original"}',
      1000, 0, 1000, 'pending', 'session-36', 'EUR', 'cus_profile_a')`);
    expect(db.query(`SELECT email, customer_name, address_json, customer_profile_id
      FROM orders WHERE order_number='ORDER-36'`)).toEqual([{
      email: 'snapshot@example.com', customer_name: 'Snapshot',
      address_json: '{"street":"Original"}', customer_profile_id: 'cus_profile_a',
    }]);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('añade revisiones de dirección cerrando la anterior en la misma sentencia', () => {
    const db = new SqliteD1();
    insertProfile(db);
    const insert = (revision: number, street: string, at: string) => db.sqlite.prepare(`
      INSERT INTO customer_address_revisions (
        address_id, customer_profile_id, revision, recipient_name, phone,
        street, city, region, postal_code, country_code, valid_from
      ) VALUES ('addr_home', 'cus_profile_a', ?, 'Marta Ferrer', NULL,
        ?, 'Castelló', NULL, '12001', 'ES', ?)
    `).run(revision, street, at);
    insert(1, 'Carrer Major 1', AT);
    insert(2, 'Carrer Major 2', '2026-08-17T13:00:00.000Z');
    expect(db.query(`SELECT revision, street, valid_to FROM customer_address_revisions
      ORDER BY revision`)).toEqual([
      { revision: 1, street: 'Carrer Major 1', valid_to: '2026-08-17T13:00:00.000Z' },
      { revision: 2, street: 'Carrer Major 2', valid_to: null },
    ]);
    expect(() => insert(2, 'Carrera perdedora', '2026-08-17T14:00:00.000Z'))
      .toThrow(/customer_address_revision_conflict|UNIQUE/u);
    expect(db.value(`SELECT count(*) AS value FROM customer_address_revisions
      WHERE valid_to IS NULL`)).toBe(1);
  });

  it('rechaza merges automáticos o entre identidades distintas', () => {
    const db = new SqliteD1();
    insertProfile(db, 'cus_source', 'a'.repeat(64));
    insertProfile(db, 'cus_target', 'b'.repeat(64));
    expect(() => db.sqlite.exec(`INSERT INTO customer_profile_merges (
      idempotency_key, source_profile_id, target_profile_id,
      source_version_before, target_version_before, reviewed_by, reviewed_at
    ) VALUES ('merge:review:01', 'cus_source', 'cus_target', 1, 1,
      'operator_admin', '${AT}')`)).toThrow(/customer_profile_merge_conflict/u);
    expect(db.query(`SELECT id, status, version FROM customer_profiles ORDER BY id`)).toEqual([
      { id: 'cus_source', status: 'active', version: 1 },
      { id: 'cus_target', status: 'active', version: 1 },
    ]);
  });
});
