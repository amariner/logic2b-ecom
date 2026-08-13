import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import baseSchema from '../migrations/0001_init.sql?raw';
import holdsSchema from '../migrations/0017_order_holds.sql?raw';

function database(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(baseSchema);
  db.exec(holdsSchema);
  db.exec(`INSERT INTO orders (
    id, order_number, email, customer_name, address_json,
    subtotal_cents, shipping_cents, total_cents, status, created_at, updated_at
  ) VALUES (1, 'HOLD-1', 'qa@example.test', 'QA', '{}', 1000, 0, 1000, 'paid',
    '2026-08-13T08:00:00.000Z', '2026-08-13T08:00:00.000Z')`);
  return db;
}

function insertHold(db: DatabaseSync, id = 'hold_0001', key = 'order:1:hold:1'): void {
  db.prepare(`INSERT INTO order_holds (
    id, order_id, status, source, reason_code, owner_kind, owner_id, owner_label,
    due_at, idempotency_key, version, created_at, updated_at
  ) VALUES (?, 1, 'active', 'manual', 'address_issue', 'admin', 'operations',
    'Operaciones', '2026-08-13T12:00:00.000Z', ?, 1,
    '2026-08-13T08:00:00.000Z', '2026-08-13T08:00:00.000Z')`).run(id, key);
}

describe('migración R3.4 de holds e incidencias', () => {
  it('es expand-only y crea cero holds al aplicarse', () => {
    const db = database();
    expect(db.prepare(`SELECT name FROM sqlite_schema
      WHERE type = 'table' AND name LIKE 'order_hold%' ORDER BY name`).all()).toEqual([
      { name: 'order_hold_events' },
      { name: 'order_holds' },
    ]);
    expect(db.prepare('SELECT count(*) AS n FROM order_holds').get()).toEqual({ n: 0 });
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect(holdsSchema).not.toMatch(/ALTER TABLE|DROP TABLE|DELETE FROM|UPDATE orders/iu);
  });

  it('admite varios holds activos y exige idempotencia global', () => {
    const db = database();
    insertHold(db);
    insertHold(db, 'hold_0002', 'order:1:hold:2');
    expect(db.prepare(`SELECT count(*) AS n FROM order_holds
      WHERE order_id = 1 AND status = 'active'`).get()).toEqual({ n: 2 });
    expect(() => insertHold(db, 'hold_0003', 'order:1:hold:1')).toThrow(/UNIQUE/);
  });

  it('fija el ciclo activo/resuelto y rechaza combinaciones inválidas', () => {
    const db = database();
    insertHold(db);
    expect(() => db.prepare(`UPDATE order_holds SET status = 'resolved'
      WHERE id = 'hold_0001'`).run()).toThrow(/CHECK/);
    db.prepare(`UPDATE order_holds SET status = 'resolved', resolution_code = 'cleared',
      resolved_at = '2026-08-13T09:00:00.000Z', version = 2
      WHERE id = 'hold_0001'`).run();
    expect(db.prepare(`SELECT status, resolution_code, version FROM order_holds`).get()).toEqual({
      status: 'resolved', resolution_code: 'cleared', version: 2,
    });
  });

  it('conserva histórico versionado con formas válidas por evento', () => {
    const db = database();
    insertHold(db);
    db.prepare(`INSERT INTO order_hold_events (
      id, hold_id, order_id, event_type, hold_version, source, reason_code,
      owner_kind, owner_id, owner_label, actor_kind, actor_id, actor_label, created_at
    ) VALUES ('hold-event-1', 'hold_0001', 1, 'created', 1, 'manual', 'address_issue',
      'admin', 'operations', 'Operaciones', 'admin', 'admin-panel', 'Panel',
      '2026-08-13T08:00:00.000Z')`).run();
    expect(() => db.prepare(`INSERT INTO order_hold_events (
      id, hold_id, order_id, event_type, hold_version, actor_kind, actor_id, created_at
    ) VALUES ('hold-event-2', 'hold_0001', 1, 'assigned', 2, 'admin', 'admin-panel',
      '2026-08-13T09:00:00.000Z')`).run()).toThrow(/CHECK/);
    expect(() => db.prepare(`INSERT INTO order_hold_events (
      id, hold_id, order_id, event_type, hold_version, source, reason_code,
      owner_kind, owner_id, owner_label, actor_kind, actor_id, created_at
    ) VALUES ('hold-event-3', 'hold_0001', 1, 'created', 1, 'manual', 'address_issue',
      'admin', 'operations', 'Operaciones', 'admin', 'admin-panel',
      '2026-08-13T08:00:00.000Z')`).run()).toThrow(/UNIQUE/);
  });

  it('impide borrar el pedido o el hold mientras exista evidencia', () => {
    const db = database();
    insertHold(db);
    expect(() => db.prepare('DELETE FROM orders WHERE id = 1').run()).toThrow(/FOREIGN KEY/);
    db.prepare(`INSERT INTO order_hold_events (
      id, hold_id, order_id, event_type, hold_version, source, reason_code,
      owner_kind, owner_id, owner_label, actor_kind, actor_id, created_at
    ) VALUES ('hold-event-1', 'hold_0001', 1, 'created', 1, 'manual', 'address_issue',
      'admin', 'operations', 'Operaciones', 'admin', 'admin-panel',
      '2026-08-13T08:00:00.000Z')`).run();
    expect(() => db.prepare("DELETE FROM order_holds WHERE id = 'hold_0001'").run()).toThrow(/FOREIGN KEY/);
  });
});
