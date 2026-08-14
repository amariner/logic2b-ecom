import { describe, expect, it } from 'vitest';
import { SqliteD1 } from './sqlite-d1';

describe('migración 0022 de asignación de inventario', () => {
  it('instala políticas, decisiones, líneas y movimientos sin romper FKs', () => {
    const db = new SqliteD1();
    for (const table of [
      'inventory_routing_policies', 'inventory_allocation_decisions',
      'inventory_allocation_lines', 'inventory_allocation_movements',
    ]) {
      expect(db.value(`SELECT count(*) AS value FROM sqlite_master WHERE type='table' AND name='${table}'`), table).toBe(1);
    }
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('crea una política conservadora para cada nueva ubicación', () => {
    const db = new SqliteD1();
    db.sqlite.exec(`INSERT INTO inventory_locations (
      code, name, kind, status, is_primary, timezone, created_at, updated_at
    ) VALUES ('este', 'Almacén este', 'warehouse', 'active', 0,
      'Europe/Madrid', '2026-08-14', '2026-08-14')`);
    expect(db.query(`SELECT priority, handling_cost_cents, markets_json, channels_json,
      p.enabled, p.version FROM inventory_routing_policies p JOIN inventory_locations l
      ON l.id=p.location_id WHERE l.code='este'`)).toEqual([{
      priority: 1000, handling_cost_cents: 0, markets_json: '["*"]',
      channels_json: '["*"]', enabled: 1, version: 1,
    }]);
  });
});
