import { describe, expect, it } from 'vitest';
import migration44 from '../migrations/0044_customer_return_requests.sql?raw';
import { SqliteD1 } from './sqlite-d1';

function beforeMigration(): SqliteD1 {
  return new SqliteD1(
    true, true, true, true, true, true, true, true, true, true,
    true, true, true, true, true, true, true, true, true, true, false,
  );
}

describe('migracion 0044 de solicitudes owner-only', () => {
  it('preserva RMA legacy, genera selectores y exige evidencia customer completa', () => {
    const db = beforeMigration();
    const before = db.query('SELECT * FROM return_requests');
    db.sqlite.exec(migration44);
    expect(db.query(`SELECT id, return_number, order_id, receive_location_id, status,
      reason_code, requested_by_kind, requested_by_id, resolution, refund_id, version,
      create_idempotency_key, authorize_idempotency_key, transit_idempotency_key,
      receive_idempotency_key, inspect_idempotency_key, resolve_idempotency_key,
      note, requested_at, authorized_at, in_transit_at, received_at, inspected_at,
      resolved_at, created_at, updated_at FROM return_requests`)).toEqual(before);
    expect(db.value('SELECT count(*) AS value FROM customer_return_access_refs')).toBe(before.length);
    expect(() => db.sqlite.exec(`INSERT INTO return_requests (
      id, return_number, order_id, status, reason_code, requested_by_kind,
      requested_by_id, create_idempotency_key, requested_at, created_at, updated_at,
      customer_payload_fingerprint, customer_contract_version
    ) VALUES ('rma_invalid_customer', 'RMA-INVALID-CUSTOMER', 1, 'requested', 'other',
      'customer', 'customer_profile:one', 'return:invalid', '2026-08-24T10:00:00Z',
      '2026-08-24T10:00:00Z', '2026-08-24T10:00:00Z', '${'a'.repeat(64)}', 1)`))
      .toThrow(/customer_return_request_(?:evidence_invalid|owner_conflict)/u);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('mantiene selector y evidencia inmutables', () => {
    const db = new SqliteD1();
    db.sqlite.exec(`
      INSERT INTO customer_profiles (id, primary_email, email_identity_hash,
        status, version, created_at, updated_at)
      VALUES ('customer_profile:migration', 'migration@example.test', '${'c'.repeat(64)}',
        'active', 1, '2026-08-24T10:00:00Z', '2026-08-24T10:00:00Z');
      INSERT INTO orders (order_number, email, customer_name, address_json,
        subtotal_cents, shipping_cents, total_cents, status, stripe_session_id,
        customer_profile_id)
      VALUES ('RETURN-MIGRATION', 'private@example.test', 'Private', '{}',
        1000, 0, 1000, 'delivered', 'return-migration', 'customer_profile:migration');
      INSERT INTO return_requests (id, return_number, order_id, status, reason_code,
        requested_by_kind, requested_by_id, create_idempotency_key, requested_at,
        created_at, updated_at, customer_payload_fingerprint,
        customer_ownership_version, customer_contract_version)
      VALUES ('rma_customer_migration', 'RMA-C-MIGRATION', last_insert_rowid(),
        'requested', 'other', 'customer', 'customer_profile:migration',
        'return:migration:create', '2026-08-24T10:00:00Z', '2026-08-24T10:00:00Z',
        '2026-08-24T10:00:00Z', '${'a'.repeat(64)}', 1, 1);
    `);
    const ref = String(db.value(`SELECT public_ref AS value FROM customer_return_access_refs
      WHERE return_id='rma_customer_migration'`));
    expect(ref).toMatch(/^ret_[0-9a-f]{32}$/u);
    expect(() => db.sqlite.exec(`UPDATE customer_return_access_refs SET public_ref='ret_${'b'.repeat(32)}'
      WHERE return_id='rma_customer_migration'`)).toThrow(/immutable/u);
    expect(() => db.sqlite.exec(`UPDATE return_requests SET customer_ownership_version=2
      WHERE id='rma_customer_migration'`)).toThrow(/immutable/u);
  });
});
