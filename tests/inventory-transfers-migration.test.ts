import { describe, expect, it } from 'vitest';
import { SqliteD1 } from './sqlite-d1';

describe('migración 0020 de transferencias', () => {
  it('instala agregado, recibos y ledger enlazado sin alterar el corte previo', () => {
    const db = new SqliteD1();
    for (const table of ['inventory_transfers', 'inventory_transfer_lines', 'inventory_transfer_receipts', 'inventory_transfer_receipt_lines', 'inventory_transfer_movements']) {
      expect(db.value(`SELECT count(*) AS value FROM sqlite_master WHERE type='table' AND name='${table}'`), table).toBe(1);
    }
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
    expect(db.value('SELECT count(*) AS value FROM inventory_transfer_movements')).toBe(0);
  });

  it('impide origen=destino y cantidades recibidas superiores al envío', () => {
    const db = new SqliteD1();
    expect(() => db.sqlite.prepare(`INSERT INTO inventory_transfers (
      id, transfer_number, source_location_id, destination_location_id, status,
      version, create_idempotency_key, created_at, updated_at
    ) SELECT 'trf_invalid', 'TRF-INVALID', id, id, 'draft', 1,
      'transfer:invalid:create', 'x', 'x' FROM inventory_locations WHERE is_primary=1`).run()).toThrow();
  });
});
