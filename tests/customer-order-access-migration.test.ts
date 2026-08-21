import { describe, expect, it } from 'vitest';
import migration41 from '../migrations/0041_customer_order_access.sql?raw';
import { seedStatements } from '../seed/seed';
import {
  createD1CustomerOrderOwnershipReader,
  customerResourceTarget,
} from '../src/modules/customers';
import { SqliteD1 } from './sqlite-d1';

const AT = '2026-08-21T10:00:00.000Z';

function beforeMigration(): SqliteD1 {
  return new SqliteD1(
    true, true, true, true, true, true, true, true, true,
    true, true, true, true, true, true, true, true, false,
  );
}

function insertOrderSql(suffix: string): string {
  return `INSERT INTO orders (
    order_number, email, customer_name, address_json, subtotal_cents,
    shipping_cents, total_cents, status, stripe_session_id, currency
  ) VALUES (
    'ORDER-ACCESS-${suffix}', 'private-${suffix}@example.test', 'Private ${suffix}', '{}',
    1000, 0, 1000, 'pending', 'session-access-${suffix}', 'EUR'
  )`;
}

function insertProfile(db: SqliteD1, id: string): void {
  db.sqlite.prepare(`INSERT INTO customer_profiles (
    id, primary_email, email_identity_hash, status, version, created_at, updated_at
  ) VALUES (?, ?, ?, 'active', 1, ?, ?)`).run(
    id,
    `${id.replaceAll(':', '-')}@example.test`,
    (id.endsWith('one') ? 'a' : 'b').repeat(64),
    AT,
    AT,
  );
}

describe('migración 0041 de referencias y ownership de pedidos', () => {
  it('es expand-only, backfillea solo referencias y conserva pedidos guest', async () => {
    const db = beforeMigration();
    await db.batch(seedStatements().map((sql) => db.prepare(sql)));
    const beforeOrders = db.query('SELECT * FROM orders ORDER BY id');
    const beforeTables = Number(db.value(
      "SELECT count(*) AS value FROM sqlite_master WHERE type='table'",
    ));

    db.sqlite.exec(migration41);

    expect(Number(db.value(
      "SELECT count(*) AS value FROM sqlite_master WHERE type='table'",
    ))).toBe(beforeTables + 1);
    expect(db.query('SELECT * FROM orders ORDER BY id')).toEqual(beforeOrders);
    expect(db.value('SELECT count(*) AS value FROM customer_order_access_refs')).toBe(
      beforeOrders.length,
    );
    expect(db.value(`SELECT count(*) AS value FROM customer_order_access_refs
      WHERE length(public_ref) <> 36 OR substr(public_ref, 1, 4) <> 'ord_'
        OR substr(public_ref, 5) GLOB '*[^0-9a-f]*'`)).toBe(0);
    expect(db.value(`SELECT count(*) AS value FROM (
      SELECT public_ref FROM customer_order_access_refs GROUP BY public_ref HAVING count(*) > 1
    )`)).toBe(0);
    expect(db.value('SELECT count(*) AS value FROM orders WHERE customer_profile_id IS NOT NULL'))
      .toBe(0);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('genera referencias atómicas para altas concurrentes y falla cerrado ante colisión', async () => {
    const db = new SqliteD1();
    await Promise.all(Array.from({ length: 16 }, (_, index) => db.batch([
      db.prepare(insertOrderSql(`race-${index}`)),
    ])));
    const refs = db.query<{ order_id: number; public_ref: string }>(`
      SELECT access.order_id, access.public_ref
      FROM customer_order_access_refs access
      JOIN orders ON orders.id=access.order_id
      WHERE orders.order_number LIKE 'ORDER-ACCESS-race-%'
      ORDER BY access.order_id
    `);
    expect(refs).toHaveLength(16);
    expect(new Set(refs.map((row) => row.public_ref))).toHaveLength(16);

    const [first, second] = refs;
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    db.sqlite.prepare('DELETE FROM customer_order_access_refs WHERE order_id=?')
      .run(second!.order_id);
    expect(() => db.sqlite.prepare(`INSERT INTO customer_order_access_refs (
      order_id, public_ref, ownership_version
    ) VALUES (?, ?, 1)`).run(second!.order_id, first!.public_ref)).toThrow(/UNIQUE/u);
    db.sqlite.prepare('DELETE FROM orders WHERE id=?').run(first!.order_id);
    expect(db.value(`SELECT count(*) AS value FROM customer_order_access_refs
      WHERE order_id=${first!.order_id}`)).toBe(0);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('versiona cambios de owner y el reader no acepta PII ni ids comerciales', async () => {
    const db = new SqliteD1();
    db.sqlite.exec(insertOrderSql('owned'));
    const row = db.query<{ order_id: number; public_ref: string }>(`
      SELECT access.order_id, access.public_ref
      FROM customer_order_access_refs access
      JOIN orders ON orders.id=access.order_id
      WHERE orders.order_number='ORDER-ACCESS-owned'
    `)[0]!;
    const reader = createD1CustomerOrderOwnershipReader(db.asD1());
    const target = customerResourceTarget('order', row.public_ref);
    await expect(reader.resolve(target)).resolves.toEqual({
      target,
      ownerProfileId: null,
      state: 'guest',
      version: 1,
    });
    for (const invalid of ['ORDER-ACCESS-owned', 'private-owned@example.test', String(row.order_id)]) {
      await expect(reader.resolve({ kind: 'order', publicRef: invalid })).resolves.toBeNull();
    }

    insertProfile(db, 'customer_profile:one');
    db.sqlite.prepare('UPDATE orders SET customer_profile_id=? WHERE id=?')
      .run('customer_profile:one', row.order_id);
    await expect(reader.resolve(target)).resolves.toEqual({
      target,
      ownerProfileId: 'customer_profile:one',
      state: 'owned',
      version: 2,
    });
    db.sqlite.prepare('UPDATE orders SET customer_profile_id=? WHERE id=?')
      .run('customer_profile:one', row.order_id);
    expect(db.value(`SELECT ownership_version AS value
      FROM customer_order_access_refs WHERE order_id=${row.order_id}`)).toBe(2);
  });

  it('deniega owner fusionado y protege referencia/versión contra escrituras directas', async () => {
    const db = new SqliteD1();
    db.sqlite.exec(insertOrderSql('merged'));
    const row = db.query<{ order_id: number; public_ref: string }>(`
      SELECT access.order_id, access.public_ref FROM customer_order_access_refs access
      JOIN orders ON orders.id=access.order_id
      WHERE orders.order_number='ORDER-ACCESS-merged'
    `)[0]!;
    insertProfile(db, 'customer_profile:one');
    insertProfile(db, 'customer_profile:two');
    db.sqlite.prepare('UPDATE orders SET customer_profile_id=? WHERE id=?')
      .run('customer_profile:one', row.order_id);
    db.sqlite.exec(`UPDATE customer_profiles
      SET status='merged', merged_into_profile_id='customer_profile:two', version=2,
        updated_at='2026-08-21T10:01:00.000Z'
      WHERE id='customer_profile:one'`);
    const reader = createD1CustomerOrderOwnershipReader(db.asD1());
    await expect(reader.resolve(customerResourceTarget('order', row.public_ref))).resolves
      .toMatchObject({ state: 'incoherent', ownerProfileId: 'customer_profile:one', version: 2 });
    expect(() => db.sqlite.prepare(`UPDATE customer_order_access_refs
      SET public_ref=? WHERE order_id=?`).run(
      'ord_ffffffffffffffffffffffffffffffff', row.order_id,
    )).toThrow(/customer_order_access_ref_immutable/u);
    expect(() => db.sqlite.prepare(`UPDATE customer_order_access_refs
      SET ownership_version=ownership_version+2 WHERE order_id=?`).run(row.order_id))
      .toThrow(/customer_order_access_ref_immutable/u);
  });
});
