import { describe, expect, it } from 'vitest';
import migration32 from '../migrations/0032_stored_value.sql?raw';
import { SqliteD1 } from './sqlite-d1';

const AT = '2026-08-14T12:00:00.000Z';

describe('migración 0032 de valor almacenado', () => {
  it('es expand-only, añade cinco tablas y conserva pagos anteriores', () => {
    const db = new SqliteD1(true, true, true, true, true, true, true, true, false);
    db.sqlite.exec(`INSERT INTO orders (id,order_number,email,customer_name,address_json,
      subtotal_cents,shipping_cents,total_cents,status,currency) VALUES
      (1,'SV-OLD','old@example.test','Old','{}',1000,0,1000,'pending','EUR');
      INSERT INTO payments (id,order_id,provider,currency,expected_amount_cents,status,version,
      idempotency_key,created_at,updated_at) VALUES
      (1,1,'simulated','EUR',1000,'pending',1,'r2:payment:order:1:primary','${AT}','${AT}');`);
    const before = db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'").length;
    db.sqlite.exec(migration32);
    expect(db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'").length)
      .toBe(before + 5);
    expect(db.query('SELECT expected_amount_cents,stored_value_expected_cents FROM payments'))
      .toEqual([{ expected_amount_cents: 1000, stored_value_expected_cents: 0 }]);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('impide asientos no consecutivos y pagos mixtos que no suman el pedido', () => {
    const db = new SqliteD1();
    db.sqlite.exec(`INSERT INTO stored_value_accounts (id,kind,state,currency,label,code_hash,
      balance_cents,reserved_cents,policy_json,version,created_at,updated_at) VALUES
      ('gift_test','gift_card','active','EUR','Regalo',
       'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',1000,0,'{}',2,'${AT}','${AT}');`);
    expect(() => db.sqlite.exec(`INSERT INTO stored_value_ledger_entries (id,account_id,type,
      balance_delta_cents,reserved_delta_cents,balance_after_cents,reserved_after_cents,version_after,
      idempotency_key,metadata_json,occurred_at) VALUES
      ('ledger_bad','gift_test','issuance',100,0,1100,0,4,'bad','{}','${AT}')`))
      .toThrow(/stored_value_ledger_conflict/);
    db.sqlite.exec(`INSERT INTO orders (id,order_number,email,customer_name,address_json,
      subtotal_cents,shipping_cents,total_cents,status,currency) VALUES
      (99,'SV-MIX','mix@example.test','Mix','{}',1000,0,1000,'pending','EUR');`);
    expect(() => db.sqlite.exec(`INSERT INTO payments (order_id,provider,currency,
      expected_amount_cents,stored_value_expected_cents,status,version,idempotency_key,
      created_at,updated_at) VALUES (99,'simulated','EUR',500,400,'pending',1,
      'sv:bad-payment','${AT}','${AT}')`)).toThrow(/stored_value_payment_conflict/);
  });
});
