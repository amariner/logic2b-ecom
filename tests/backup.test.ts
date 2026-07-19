import { describe, expect, it } from 'vitest';
import { BACKUP_TABLES, buildBackupSql, dumpTable } from '../src/lib/backup';

describe('volcado de copia de seguridad', () => {
  it('genera INSERTs con columnas explícitas y escape de comillas', () => {
    const stmts = dumpTable('products', [
      { id: 1, name: "Queso d'Ovella", price_cents: 950, image: null },
    ]);
    expect(stmts).toEqual([
      "INSERT INTO products (id, name, price_cents, image) VALUES (1, 'Queso d''Ovella', 950, NULL);",
    ]);
  });

  it('tabla vacía → sin sentencias', () => {
    expect(dumpTable('orders', [])).toEqual([]);
  });

  it('el dump completo borra hijos antes que padres e inserta padres antes que hijos', () => {
    const sql = buildBackupSql({ products: [{ id: 1, slug: 'a' }], order_items: [{ id: 1, order_id: 2 }] }, '2026-07-19');
    const deleteChildren = sql.indexOf('DELETE FROM order_items');
    const deleteParent = sql.indexOf('DELETE FROM orders');
    expect(deleteChildren).toBeGreaterThan(-1);
    expect(deleteChildren).toBeLessThan(deleteParent);
    expect(sql.indexOf('INSERT INTO products')).toBeLessThan(sql.indexOf('INSERT INTO order_items'));
    for (const table of BACKUP_TABLES) expect(sql).toContain(`DELETE FROM ${table};`);
  });
});
