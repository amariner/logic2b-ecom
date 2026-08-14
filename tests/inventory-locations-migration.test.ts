import { describe, expect, it } from 'vitest';
import { SqliteD1 } from './sqlite-d1';

describe('migración 0019 de ubicaciones', () => {
  it('crea una única principal y backfillea balances/movimientos sin cambiar el global', () => {
    const db = new SqliteD1();
    expect(db.value('SELECT count(*) AS value FROM inventory_locations WHERE is_primary=1')).toBe(1);
    expect(db.value('SELECT count(*) AS value FROM inventory_location_balances')).toBe(
      db.value('SELECT count(*) AS value FROM inventory_balances'),
    );
    expect(db.value('SELECT count(*) AS value FROM inventory_location_movements')).toBe(
      db.value('SELECT count(*) AS value FROM inventory_movements'),
    );
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('impide una segunda principal y códigos no canónicos', () => {
    const db = new SqliteD1();
    expect(() => db.sqlite.prepare(`INSERT INTO inventory_locations
      (code,name,kind,status,is_primary,timezone,created_at,updated_at)
      VALUES ('segunda','Segunda','warehouse','active',1,'Europe/Madrid','x','x')`).run()).toThrow();
    expect(() => db.sqlite.prepare(`INSERT INTO inventory_locations
      (code,name,kind,status,is_primary,timezone,created_at,updated_at)
      VALUES ('NO VALIDO','Segunda','store','active',0,'Europe/Madrid','x','x')`).run()).toThrow();
  });
});
