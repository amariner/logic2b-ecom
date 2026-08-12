import { describe, expect, it } from 'vitest';
import migration from '../migrations/0014_order_list_indexes.sql?raw';
import { SqliteD1 } from './sqlite-d1';

describe('migración R3.1 del índice de pedidos', () => {
  it('es aditiva y crea los tres índices de orden estable', () => {
    expect(migration).not.toMatch(/\b(?:DROP|ALTER\s+TABLE|DELETE\s+FROM\s+orders\b)\b/iu);
    expect(migration).toContain('idx_orders_status_created_id');
    expect(migration).toContain('idx_orders_total_id');
    expect(migration).toContain('idx_orders_status_total_id');
    expect(migration).toContain('CREATE VIRTUAL TABLE orders_search USING fts5');

    const db = new SqliteD1();
    const indexes = db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'orders'");
    expect(indexes.map(({ name }) => name)).toEqual(expect.arrayContaining([
      'idx_orders_status_created_id',
      'idx_orders_total_id',
      'idx_orders_status_total_id',
    ]));
    expect(db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'orders_search_%'")).toHaveLength(3);
    expect(db.value('PRAGMA foreign_key_check')).toBeUndefined();
  });

  it('mantiene el índice de búsqueda al insertar, editar y borrar un pedido', () => {
    const db = new SqliteD1();
    db.sqlite.exec(`
      INSERT INTO orders (
        order_number, email, customer_name, address_json,
        subtotal_cents, shipping_cents, total_cents, status
      ) VALUES ('SEARCH-0001', 'busqueda@example.com', 'Nombre Inicial', '{}', 1000, 0, 1000, 'paid');
    `);
    const rowId = Number(db.value("SELECT id AS value FROM orders WHERE order_number = 'SEARCH-0001'"));

    expect(db.value("SELECT count(*) AS value FROM orders_search WHERE orders_search MATCH '\"Inicial\"*'")) .toBe(1);
    db.sqlite.prepare('UPDATE orders SET customer_name = ? WHERE id = ?').run('Nombre Actualizado', rowId);
    expect(db.value("SELECT count(*) AS value FROM orders_search WHERE orders_search MATCH '\"Inicial\"*'")) .toBe(0);
    expect(db.value("SELECT count(*) AS value FROM orders_search WHERE orders_search MATCH '\"Actualizado\"*'")) .toBe(1);
    db.sqlite.prepare('DELETE FROM orders WHERE id = ?').run(rowId);
    expect(db.value("SELECT count(*) AS value FROM orders_search WHERE orders_search MATCH '\"Actualizado\"*'")) .toBe(0);
  });
});
