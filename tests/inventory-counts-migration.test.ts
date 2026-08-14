import { describe, expect, it } from 'vitest';
import { SqliteD1 } from './sqlite-d1';

describe('migración 0021 de conteos', () => {
  it('instala sesiones, líneas y enlace al ledger sin romper FKs', () => {
    const db = new SqliteD1();
    for (const table of ['inventory_counts', 'inventory_count_lines', 'inventory_count_movements']) {
      expect(db.value(`SELECT count(*) AS value FROM sqlite_master WHERE type='table' AND name='${table}'`), table).toBe(1);
    }
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('impide aprobar con la misma identidad que realizó el conteo', () => {
    const db = new SqliteD1();
    expect(() => db.sqlite.prepare(`INSERT INTO inventory_counts (
      id, count_number, location_id, status, reason, requires_approval,
      counted_by, reviewed_by, version, create_idempotency_key,
      submit_idempotency_key, approve_idempotency_key, created_at, updated_at,
      submitted_at, applied_at
    ) SELECT 'count_invalid', 'CNT-INVALID', id, 'applied', 'cycle_count', 1,
      'same-user', 'same-user', 3, 'count:invalid:create', 'count:invalid:submit',
      'count:invalid:approve', 'x', 'x', 'x', 'x'
      FROM inventory_locations WHERE is_primary=1`).run()).toThrow();
  });
});
