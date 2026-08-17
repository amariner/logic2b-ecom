import { describe, expect, it } from 'vitest';
import migration35 from '../migrations/0035_preliminary_orders_deposits.sql?raw';
import { SqliteD1 } from './sqlite-d1';

const AT = '2026-08-17T12:00:00.000Z';
const EXPIRES = '2026-08-24T12:00:00.000Z';

function beforeMigration(): SqliteD1 {
  return new SqliteD1(true, true, true, true, true, true, true, true, true, true, true, false);
}

function database(): SqliteD1 {
  const db = beforeMigration();
  db.sqlite.exec(migration35);
  db.sqlite.exec(`
    INSERT INTO products (id, slug, name, price_cents, stock, category)
    VALUES (1, 'quote-product', 'Quote product', 1000, 10, 'test');
    INSERT INTO product_variants (
      id, product_id, sku, title, price_cents, status, is_default, option_signature
    ) VALUES (1, 1, 'QUOTE-1', '', 1000, 'active', 1, NULL);
  `);
  return db;
}

function insertDraft(db: SqliteD1): void {
  db.sqlite.exec(`
    INSERT INTO preliminary_orders (
      id, reference, email, customer_name, address_json, status, payment_status,
      currency, subtotal_cents, shipping_cents, total_cents, deposit_cents,
      paid_cents, conversion_gate, expires_at, version, created_at, updated_at
    ) VALUES (
      'quote-test-01', 'PRES-0001', 'buyer@example.test', 'Buyer', '{}',
      'draft', 'unpaid', 'EUR', 2000, 500, 2500, 1000, 0, 'deposit',
      '${EXPIRES}', 1, '${AT}', '${AT}'
    );
    INSERT INTO preliminary_order_lines (
      preliminary_order_id, product_id, variant_id, name_snapshot, sku_snapshot,
      unit_price_cents, quantity, line_subtotal_cents, discount_cents,
      line_total_cents, pricing_snapshot_json, created_at
    ) VALUES (
      'quote-test-01', 1, 1, 'Quote product', 'QUOTE-1', 1000, 2,
      2000, 0, 2000, '{"schema":1}', '${AT}'
    );
    INSERT INTO preliminary_order_events (
      preliminary_order_id, event_type, from_status, to_status,
      from_payment_status, to_payment_status, amount_cents, version_after,
      idempotency_key, occurred_at, created_at
    ) VALUES (
      'quote-test-01', 'created', NULL, 'draft', NULL, 'unpaid', 0, 1,
      'quote-test-01:created', '${AT}', '${AT}'
    );
  `);
}

describe('migración 0035 de presupuestos y depósitos', () => {
  it('es expand-only, añade cinco tablas vacías y conserva FKs', () => {
    const db = beforeMigration();
    const before = db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'").length;
    db.sqlite.exec(migration35);
    expect(db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'").length)
      .toBe(before + 5);
    expect(db.value('SELECT count(*) AS value FROM preliminary_orders')).toBe(0);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('exige líneas cuyo subtotal coincide antes de aceptar el alta', () => {
    const db = database();
    db.sqlite.exec(`INSERT INTO preliminary_orders (
      id, reference, email, customer_name, address_json, status, payment_status,
      currency, subtotal_cents, shipping_cents, total_cents, deposit_cents,
      paid_cents, conversion_gate, expires_at, version, created_at, updated_at
    ) VALUES ('quote-empty-01','PRES-EMPTY','buyer@example.test','Buyer','{}','draft',
      'unpaid','EUR',1000,0,1000,0,0,'approval','${EXPIRES}',1,'${AT}','${AT}')`);
    expect(() => db.sqlite.exec(`INSERT INTO preliminary_order_events (
      preliminary_order_id,event_type,from_status,to_status,from_payment_status,
      to_payment_status,amount_cents,version_after,idempotency_key,occurred_at,created_at
    ) VALUES ('quote-empty-01','created',NULL,'draft',NULL,'unpaid',0,1,
      'quote-empty-01:created','${AT}','${AT}')`))
      .toThrow(/preliminary_order_created_conflict/);
  });

  it('impide enlaces con importe o versión manipulados', () => {
    const db = database();
    insertDraft(db);
    db.sqlite.exec(`
      INSERT INTO preliminary_order_events (
        preliminary_order_id,event_type,from_status,to_status,from_payment_status,
        to_payment_status,amount_cents,version_after,idempotency_key,occurred_at,created_at
      ) VALUES ('quote-test-01','issued','draft','issued','unpaid','unpaid',0,2,
        'quote-test-01:issued','2026-08-18T10:00:00.000Z','2026-08-18T10:00:00.000Z');
      UPDATE preliminary_orders SET status='issued',issued_at='2026-08-18T10:00:00.000Z',version=2;
      INSERT INTO preliminary_order_events (
        preliminary_order_id,event_type,from_status,to_status,from_payment_status,
        to_payment_status,amount_cents,version_after,idempotency_key,occurred_at,created_at
      ) VALUES ('quote-test-01','approved','issued','approved','unpaid','unpaid',0,3,
        'quote-test-01:approved','2026-08-18T11:00:00.000Z','2026-08-18T11:00:00.000Z');
      UPDATE preliminary_orders SET status='approved',approved_at='2026-08-18T11:00:00.000Z',version=3;
    `);
    expect(() => db.sqlite.exec(`INSERT INTO preliminary_order_payment_links (
      id,preliminary_order_id,stage,amount_cents,currency,provider_adapter,
      provider_reference,status,expected_order_version,idempotency_key,expires_at,created_at,updated_at
    ) VALUES ('link-invalid-01','quote-test-01','deposit',1,'EUR','simulated-hosted-payment',
      'provider-link-bad','active',3,'link-invalid-01','2026-08-19T12:00:00.000Z',
      '2026-08-18T12:00:00.000Z','2026-08-18T12:00:00.000Z')`))
      .toThrow(/preliminary_payment_link_conflict/);
  });

  it('serializa cada transición y rechaza eventos de pago sin hecho verificado', () => {
    const db = database();
    insertDraft(db);
    expect(() => db.sqlite.exec(`INSERT INTO preliminary_order_events (
      preliminary_order_id,event_type,from_status,to_status,from_payment_status,
      to_payment_status,amount_cents,version_after,idempotency_key,occurred_at,created_at
    ) VALUES ('quote-test-01','payment_confirmed','draft','draft','unpaid','deposit_paid',
      1000,2,'quote-test-01:fake-payment','${AT}','${AT}')`))
      .toThrow(/preliminary_order_event_conflict/);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });
});
