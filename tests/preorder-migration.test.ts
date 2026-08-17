import { describe, expect, it } from 'vitest';
import migration33 from '../migrations/0033_preorders_backorders.sql?raw';
import { SqliteD1 } from './sqlite-d1';

const AT = '2026-08-17T12:00:00.000Z';

function database(): SqliteD1 {
  const db = new SqliteD1(true, true, true, true, true, true, true, true, true, false);
  db.sqlite.exec(migration33);
  db.sqlite.exec(`
    INSERT INTO products (id, slug, name, price_cents, stock, category)
    VALUES (1, 'future-product', 'Future product', 2500, 2, 'test');
    INSERT INTO product_variants (id, product_id, sku, title, price_cents, status, is_default, option_signature)
    VALUES (1, 1, 'FUTURE-1', '', 2500, 'active', 1, NULL);
    INSERT INTO preorder_policies (
      id, variant_id, kind, state, label, public_message, sale_starts_at, sale_ends_at,
      availability_starts_at, availability_ends_at, max_deferred_quantity,
      committed_deferred_quantity, payment_policy, version, capacity_version, created_at, updated_at
    ) VALUES (
      'future-stock', 1, 'backorder', 'active', 'Disponible bajo pedido',
      'Disponibilidad prevista en septiembre', '2026-08-01T00:00:00.000Z',
      '2026-08-31T23:59:59.000Z', '2026-09-01T00:00:00.000Z',
      '2026-09-15T23:59:59.000Z', 10, 0, 'charge_now', 1, 1, '${AT}', '${AT}'
    );
    INSERT INTO orders (id, order_number, email, customer_name, address_json,
      subtotal_cents, shipping_cents, total_cents, status, currency)
    VALUES (1, 'PREORDER-ONE', 'future@example.test', 'Future', '{}', 10000, 0, 10000, 'pending', 'EUR');
    INSERT INTO order_items (id, order_id, product_id, variant_id, name_snapshot,
      unit_price_cents, base_unit_price_cents, pricing_snapshot_json, qty, current_qty)
    VALUES (1, 1, 1, 1, 'Future product', 2500, 2500, '{}', 4, 4);
  `);
  return db;
}

const snapshot = JSON.stringify({
  schema: 1, policy_id: 'future-stock', policy_version: 1, kind: 'backorder',
  label: 'Disponible bajo pedido', public_message: 'Disponibilidad prevista en septiembre',
  availability_starts_at: '2026-09-01T00:00:00.000Z',
  availability_ends_at: '2026-09-15T23:59:59.000Z', payment_policy: 'charge_now',
  allocation_policy: 'paid_fifo',
});

function insertCommitment(db: SqliteD1): void {
  db.sqlite.prepare(`INSERT INTO preorder_commitments (
    id, policy_id, policy_version, policy_capacity_version, order_id, order_item_id, variant_id, kind, state,
    immediate_quantity, deferred_quantity, allocated_quantity, restored_quantity,
    cancelled_quantity, snapshot_json, payment_policy, idempotency_key, version,
    created_at, updated_at
  ) VALUES ('commitment-01', 'future-stock', 1, 1, 1, 1, 1, 'backorder', 'pending_payment',
    2, 2, 0, 0, 0, ?, 'charge_now', 'preorder:order:1:item:1', 1, ?, ?)`)
    .run(snapshot, AT, AT);
  db.sqlite.exec(`UPDATE preorder_policies SET committed_deferred_quantity=2,
    capacity_version=2 WHERE id='future-stock'`);
}

describe('migración 0033 de preventa/backorder', () => {
  it('es expand-only y no inventa políticas ni compromisos', () => {
    const db = new SqliteD1(true, true, true, true, true, true, true, true, true, false);
    const before = db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'").length;
    db.sqlite.exec(migration33);
    expect(db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'").length)
      .toBe(before + 4);
    expect(db.value('SELECT count(*) AS value FROM preorder_policies')).toBe(0);
    expect(db.value('SELECT count(*) AS value FROM preorder_commitments')).toBe(0);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('rechaza cobro posterior activo y snapshots o cupos manipulados', () => {
    const db = database();
    expect(() => db.sqlite.exec(`UPDATE preorder_policies SET state='paused',
      payment_policy='charge_on_allocation' WHERE id='future-stock';
      UPDATE preorder_policies SET state='active' WHERE id='future-stock'`))
      .toThrow(/preorder_policy_activation_conflict/);
    db.sqlite.exec(`UPDATE preorder_policies SET payment_policy='charge_now', state='active',
      max_deferred_quantity=1 WHERE id='future-stock'`);
    expect(() => insertCommitment(db)).toThrow(/preorder_commitment_conflict/);
    db.sqlite.exec(`UPDATE preorder_policies SET max_deferred_quantity=10 WHERE id='future-stock'`);
    expect(() => db.sqlite.prepare(`INSERT INTO preorder_commitments (
      id, policy_id, policy_version, policy_capacity_version, order_id, order_item_id, variant_id, kind, state,
      immediate_quantity, deferred_quantity, snapshot_json, payment_policy, idempotency_key,
      created_at, updated_at
    ) VALUES ('commitment-bad', 'future-stock', 1, 1, 1, 1, 1, 'backorder', 'pending_payment',
      2, 2, ?, 'charge_now', 'preorder:bad', ?, ?)`).run(
      JSON.stringify({ ...JSON.parse(snapshot), policy_version: 99 }), AT, AT,
    )).toThrow(/preorder_commitment_conflict/);
  });

  it('serializa pago y asignación y rechaza replay de versión obsoleta', () => {
    const db = database();
    insertCommitment(db);
    db.sqlite.exec(`INSERT INTO preorder_commitment_events (
      commitment_id, transition, from_state, to_state, allocated_delta, restored_delta,
      cancelled_delta, allocated_after, restored_after, cancelled_after, version_after,
      idempotency_key, occurred_at
    ) VALUES ('commitment-01', 'payment_confirmed', 'pending_payment', 'awaiting_stock',
      0, 0, 0, 0, 0, 0, 2, 'preorder:commitment-01:paid', '${AT}');
      UPDATE preorder_commitments SET state='awaiting_stock', version=2, paid_at='${AT}',
        updated_at='${AT}' WHERE id='commitment-01';`);
    expect(() => db.sqlite.exec(`INSERT INTO preorder_commitment_events (
      commitment_id, transition, from_state, to_state, allocated_delta, restored_delta,
      cancelled_delta, allocated_after, restored_after, cancelled_after, version_after,
      idempotency_key, occurred_at
    ) VALUES ('commitment-01', 'allocation', 'awaiting_stock', 'allocated',
      2, 0, 0, 2, 0, 0, 3, 'preorder:commitment-01:allocate:bad', '${AT}')`))
      .not.toThrow();
    expect(() => db.sqlite.exec(`INSERT INTO preorder_commitment_events (
      commitment_id, transition, from_state, to_state, allocated_delta, restored_delta,
      cancelled_delta, allocated_after, restored_after, cancelled_after, version_after,
      idempotency_key, occurred_at
    ) VALUES ('commitment-01', 'allocation', 'awaiting_stock', 'allocated',
      2, 0, 0, 2, 0, 0, 3, 'preorder:commitment-01:allocate:race', '${AT}')`))
      .toThrow(/UNIQUE|conflict/);
  });

  it('rechaza una asignación sin movimientos físicos correlacionados', () => {
    const db = database();
    insertCommitment(db);
    db.sqlite.exec(`INSERT INTO preorder_commitment_events (
      commitment_id, transition, from_state, to_state, allocated_delta, restored_delta,
      cancelled_delta, allocated_after, restored_after, cancelled_after, version_after,
      idempotency_key, occurred_at
    ) VALUES ('commitment-01', 'payment_confirmed', 'pending_payment', 'awaiting_stock',
      0, 0, 0, 0, 0, 0, 2, 'preorder:paid', '${AT}');
      UPDATE preorder_commitments SET state='awaiting_stock', version=2, paid_at='${AT}',
        updated_at='${AT}' WHERE id='commitment-01';
      INSERT INTO preorder_commitment_events (
        commitment_id, transition, from_state, to_state, allocated_delta, restored_delta,
        cancelled_delta, allocated_after, restored_after, cancelled_after, version_after,
        idempotency_key, occurred_at
      ) VALUES ('commitment-01', 'allocation', 'awaiting_stock', 'allocated',
        2, 0, 0, 2, 0, 0, 3, 'preorder:allocate', '${AT}');`);
    const eventId = Number(db.value("SELECT id AS value FROM preorder_commitment_events WHERE transition='allocation'"));
    expect(() => db.sqlite.exec(`INSERT INTO preorder_allocations (
      id, commitment_id, commitment_event_id, location_id, variant_id, quantity,
      inventory_movement_id, location_movement_id, idempotency_key, created_at
    ) VALUES ('allocation-01', 'commitment-01', ${eventId}, 1, 1, 2, 999, 999,
      'preorder:allocation:01', '${AT}')`)).toThrow(/FOREIGN KEY|preorder_allocation_conflict/);
  });
});
