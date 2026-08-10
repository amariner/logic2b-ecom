import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import ledgerSchema from '../docs/plataforma/sql/0009_inventory_ledger.proposed.sql?raw';
import reservationSchema from '../docs/plataforma/sql/0010_inventory_reservations.proposed.sql?raw';
import {
  APPLY_INVENTORY_DELTA_SQL,
  availableStock,
  canTransitionReservation,
  planInventoryMovement,
  type InventoryMovementDraft,
} from '../src/modules/inventory';

const NOW = '2026-08-10T10:00:00.000Z';

function database(withReservations = false): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE product_variants (id INTEGER PRIMARY KEY);
    INSERT INTO product_variants (id) VALUES (1), (2);
  `);
  db.exec(ledgerSchema);
  if (withReservations) db.exec(reservationSchema);
  return db;
}

const saleDraft: InventoryMovementDraft = {
  delta: -1,
  reason: 'sale',
  actor_kind: 'provider',
  actor_id: 'stripe',
  reference_type: 'order',
  reference_id: '42',
  idempotency_key: 'inventory:order:42:variant:1:sale',
  correlation_id: 'order:BM-42',
};

function insertOpening(db: DatabaseSync, variantId: number, stock: number): void {
  db.prepare(`INSERT INTO inventory_balances (variant_id, on_hand, reserved, version, updated_at)
    VALUES (?, ?, 0, 1, ?)`).run(variantId, stock, NOW);
  db.prepare(`INSERT INTO inventory_movements (
    variant_id, delta, reason, balance_after, version_after,
    actor_kind, actor_id, reference_type, reference_id,
    idempotency_key, correlation_id, occurred_at, created_at
  ) VALUES (?, ?, 'legacy_opening_balance', ?, 1,
    'system', 'migration-0009', 'migration', '0009', ?, ?, ?, ?)
  `).run(variantId, stock, stock, `r2:inventory:opening:${variantId}`, `inventory:variant:${variantId}`, NOW, NOW);
}

describe('diseño del ledger de inventario R2.6', () => {
  it('conserva ejecutables los dos DDL históricos propuestos por separado', () => {
    const db = database(true);
    const tables = db.prepare(`SELECT name FROM sqlite_schema
      WHERE type='table' AND name LIKE 'inventory_%' ORDER BY name`).all().map((row) => row.name);
    expect(tables).toEqual([
      'inventory_balances',
      'inventory_movements',
      'inventory_reservation_lines',
      'inventory_reservations',
    ]);
    expect(ledgerSchema).toContain('PROPUESTA R2.6. NO ES UNA MIGRACION APLICABLE');
    expect(reservationSchema).toContain('PROPUESTA HISTORICA R2.6');
    expect(reservationSchema).toContain('migrations/0010_inventory_reservations.sql');
  });

  it('planifica un movimiento válido y rechaza sobreventa o dirección incoherente', () => {
    const balance = { variant_id: 1, on_hand: 3, reserved: 1, version: 7 } as const;
    expect(availableStock(balance)).toBe(2);
    expect(planInventoryMovement(balance, saleDraft)).toMatchObject({
      on_hand: 2,
      reserved: 1,
      version: 8,
      balance_after: 2,
      version_after: 8,
    });
    expect(() => planInventoryMovement(balance, { ...saleDraft, delta: -3 })).toThrow(/disponibilidad negativa/);
    expect(() => planInventoryMovement(balance, { ...saleDraft, delta: 1 })).toThrow(/delta negativo/);
    expect(() => planInventoryMovement(balance, {
      ...saleDraft,
      delta: 0,
      reason: 'manual_adjustment',
    })).toThrow(/distinto de cero/);
  });

  it('la guarda optimista deja un ganador por versión y conserva suma=balance', () => {
    const db = database();
    insertOpening(db, 1, 1);
    const apply = db.prepare(APPLY_INVENTORY_DELTA_SQL);
    const winner = apply.all(-1, 1, 1, saleDraft.idempotency_key, NOW);
    const loser = apply.all(-1, 1, 1, 'otra-clave', NOW);
    expect(winner).toEqual([{ variant_id: 1, on_hand: 0, reserved: 0, version: 2 }]);
    expect(loser).toEqual([]);

    db.prepare(`INSERT INTO inventory_movements (
      variant_id, delta, reason, balance_after, version_after,
      actor_kind, actor_id, reference_type, reference_id,
      idempotency_key, correlation_id, occurred_at, created_at
    ) VALUES (1, -1, 'sale', 0, 2, 'provider', 'stripe', 'order', '42', ?, ?, ?, ?)
    `).run(saleDraft.idempotency_key, saleDraft.correlation_id, NOW, NOW);
    const reconciliation = db.prepare(`
      SELECT b.on_hand, SUM(m.delta) AS ledger_total, MAX(m.version_after) AS max_version
      FROM inventory_balances b JOIN inventory_movements m ON m.variant_id=b.variant_id
      WHERE b.variant_id=1 GROUP BY b.variant_id
    `).get();
    expect(reconciliation).toEqual({ on_hand: 0, ledger_total: 0, max_version: 2 });
  });

  it('deduplica movimientos y permite apertura cero, pero no otro delta cero', () => {
    const db = database();
    insertOpening(db, 1, 0);
    expect(() => db.prepare(`INSERT INTO inventory_movements (
      variant_id, delta, reason, balance_after, version_after,
      actor_kind, actor_id, reference_type, reference_id,
      idempotency_key, correlation_id, occurred_at
    ) VALUES (1, 0, 'manual_adjustment', 0, 2, 'admin', 'panel',
      'adjustment', '1', 'adjustment:1', 'inventory:1', ?)
    `).run(NOW)).toThrow(/CHECK/);
    expect(() => db.prepare(`INSERT INTO inventory_movements (
      variant_id, delta, reason, balance_after, version_after,
      actor_kind, actor_id, reference_type, reference_id,
      idempotency_key, correlation_id, occurred_at
    ) VALUES (2, 1, 'manual_adjustment', 1, 1, 'admin', 'panel',
      'adjustment', '2', 'r2:inventory:opening:1', 'inventory:2', ?)
    `).run(NOW)).toThrow(/UNIQUE/);
  });

  it('fija estados terminales de reserva y constraints estructurales', () => {
    const db = database(true);
    insertOpening(db, 1, 5);
    db.prepare(`INSERT INTO inventory_reservations (
      id, owner_type, owner_id, idempotency_key, expires_at, created_at, updated_at
    ) VALUES ('res_1', 'checkout', 'chk_1', 'reserve:chk_1', ?, ?, ?)
    `).run('2026-08-10T10:15:00.000Z', NOW, NOW);
    db.prepare(`INSERT INTO inventory_reservation_lines (reservation_id, variant_id, quantity)
      VALUES ('res_1', 1, 2)`).run();
    expect(canTransitionReservation('active', 'consumed')).toBe(true);
    expect(canTransitionReservation('expired', 'active')).toBe(false);
    expect(() => db.prepare(`UPDATE inventory_reservations SET status='expired'
      WHERE id='res_1'`).run()).toThrow(/CHECK/);
    expect(() => db.prepare(`INSERT INTO inventory_reservation_lines
      (reservation_id, variant_id, quantity) VALUES ('res_1', 2, 0)`).run()).toThrow(/CHECK/);
  });

  it('no abre columnas de PII, SKU ni respuestas de proveedor', () => {
    const db = database(true);
    const columns = ['inventory_movements', 'inventory_reservations']
      .flatMap((table) => db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name));
    for (const forbidden of ['email', 'customer_name', 'address_json', 'sku', 'provider_response']) {
      expect(columns).not.toContain(forbidden);
    }
  });
});
