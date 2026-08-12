import { describe, expect, it } from 'vitest';
import migration from '../migrations/0015_order_collaboration.sql?raw';
import { SqliteD1 } from './sqlite-d1';

describe('migración R3.2 de colaboración de pedidos', () => {
  it('es aditiva, indexada y conserva claves foráneas', () => {
    expect(migration).not.toMatch(/\b(?:DROP|ALTER\s+TABLE|DELETE\s+FROM)\b/iu);
    const db = new SqliteD1();
    const tables = db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'order_%'",
    ).map(({ name }) => name);
    expect(tables).toEqual(expect.arrayContaining([
      'order_notes', 'order_note_revisions', 'order_tags',
      'order_tag_assignments', 'order_tag_events',
    ]));
    expect(migration).toContain('idx_order_notes_order_updated');
    expect(migration).toContain('idx_order_tag_assignments_tag_order');
    expect(db.value('PRAGMA foreign_key_check')).toBeUndefined();
  });

  it('rechaza visibilidad, actor y revisiones duplicadas inválidas', () => {
    const db = new SqliteD1();
    db.sqlite.exec(`INSERT INTO orders (
      order_number, email, customer_name, address_json,
      subtotal_cents, shipping_cents, total_cents, status
    ) VALUES ('COL-1', 'qa@example.test', 'QA', '{}', 1000, 0, 1000, 'paid')`);
    expect(() => db.sqlite.exec(`INSERT INTO order_notes (
      id, order_id, visibility, body, version, actor_kind, actor_id, created_at, updated_at
    ) VALUES ('n1', 1, 'public', 'Texto', 1, 'admin', 'qa', '2026-08-12', '2026-08-12')`)).toThrow();
    expect(() => db.sqlite.exec(`INSERT INTO order_notes (
      id, order_id, visibility, body, version, actor_kind, actor_id, created_at, updated_at
    ) VALUES ('n2', 1, 'internal', 'Texto', 1, 'robot', 'qa', '2026-08-12', '2026-08-12')`)).toThrow();
  });
});
