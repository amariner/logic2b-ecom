import { beforeEach, describe, expect, it } from 'vitest';
import { createInventoryTransferOperations } from '../src/composition/inventory-transfer-operations';
import { seedStatements } from '../seed/seed';
import { SqliteD1 } from './sqlite-d1';

describe('runtime de transferencias R3.7', () => {
  let db: SqliteD1;
  beforeEach(async () => {
    db = new SqliteD1();
    await db.batch(seedStatements().map((sql) => db.prepare(sql)));
  });

  async function createTransfer(quantity = 4) {
    const source = Number(db.value("SELECT id AS value FROM inventory_locations WHERE code='principal'"));
    const destination = Number(db.value("SELECT id AS value FROM inventory_locations WHERE code='tienda-demo'"));
    const variant = db.query<{ variant_id: number; on_hand: number }>('SELECT variant_id, on_hand FROM inventory_balances WHERE on_hand >= ? ORDER BY variant_id LIMIT 1', quantity)[0]!;
    const operations = createInventoryTransferOperations(db.asD1(), () => '2026-08-14T12:00:00.000Z');
    const created = await operations.create({
      sourceLocationId: source,
      destinationLocationId: destination,
      lines: [{ variantId: variant.variant_id, quantity }],
      idempotencyKey: `transfer:test:create:${quantity}`,
    });
    return { operations, detail: created.detail!, variant, source, destination };
  }

  it('crea borrador sin stock y envía desde la principal una sola vez', async () => {
    const { operations, detail, variant, source } = await createTransfer();
    const before = Number(db.value('SELECT on_hand AS value FROM inventory_balances WHERE variant_id=?', variant.variant_id));
    expect(detail.transfer.status).toBe('draft');
    expect(await operations.ship(detail.transfer.id, 1, 'transfer:test:ship:0001')).toMatchObject({ outcome: 'applied' });
    expect(await operations.ship(detail.transfer.id, 1, 'transfer:test:ship:0001')).toMatchObject({ outcome: 'idempotent' });
    expect(db.value('SELECT on_hand AS value FROM inventory_balances WHERE variant_id=?', variant.variant_id)).toBe(before - 4);
    expect(db.value('SELECT on_hand AS value FROM inventory_location_balances WHERE location_id=? AND variant_id=?', source, variant.variant_id)).toBe(before - 4);
    expect(db.value(`SELECT count(*) AS value FROM inventory_transfer_movements
      WHERE transfer_id=? AND direction='dispatch'`, detail.transfer.id)).toBe(1);
    expect(db.value("SELECT count(*) AS value FROM audit_log WHERE action='inventory.transfer_shipped' AND entity_id=?", detail.transfer.id)).toBe(1);
  });

  it('recibe parcialmente, declara discrepancia y conserva principal=legacy', async () => {
    const { operations, detail, variant, source, destination } = await createTransfer();
    const initial = variant.on_hand;
    const shipped = await operations.ship(detail.transfer.id, 1, 'transfer:test:ship:0002');
    const line = shipped.detail!.lines[0]!;
    const partial = await operations.receive(detail.transfer.id, {
      expectedVersion: 2,
      idempotencyKey: 'transfer:test:receive:0001',
      lines: [{ transferLineId: line.id, receivedQuantity: 2, discrepancyQuantity: 0 }],
    });
    expect(partial.detail!.transfer.status).toBe('partially_received');
    expect(await operations.receive(detail.transfer.id, {
      expectedVersion: 2,
      idempotencyKey: 'transfer:test:receive:0001',
      lines: [{ transferLineId: line.id, receivedQuantity: 2, discrepancyQuantity: 0 }],
    })).toMatchObject({ outcome: 'idempotent' });
    const completed = await operations.receive(detail.transfer.id, {
      expectedVersion: 3,
      idempotencyKey: 'transfer:test:receive:0002',
      lines: [{ transferLineId: line.id, receivedQuantity: 1, discrepancyQuantity: 1 }],
    });
    expect(completed.detail!.transfer).toMatchObject({ status: 'received', received_quantity: 3, discrepancy_quantity: 1 });
    expect(db.value('SELECT on_hand AS value FROM inventory_location_balances WHERE location_id=? AND variant_id=?', destination, variant.variant_id)).toBe(3);
    expect(db.value('SELECT on_hand AS value FROM inventory_location_balances WHERE location_id=? AND variant_id=?', source, variant.variant_id)).toBe(initial - 4);
    expect(db.value('SELECT on_hand AS value FROM inventory_balances WHERE variant_id=?', variant.variant_id)).toBe(initial - 4);
    expect(db.value('SELECT count(*) AS value FROM inventory_transfer_receipts WHERE transfer_id=?', detail.transfer.id)).toBe(2);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('serializa dos envíos concurrentes con versiones distintas', async () => {
    const { operations, detail } = await createTransfer(2);
    const outcomes = await Promise.all([
      operations.ship(detail.transfer.id, 1, 'transfer:test:race:ship-a'),
      operations.ship(detail.transfer.id, 1, 'transfer:test:race:ship-b'),
    ]);
    expect(outcomes.map((item) => item.outcome).sort()).toEqual(['applied', 'conflict']);
    expect(db.value(`SELECT count(*) AS value FROM inventory_transfer_movements
      WHERE transfer_id=? AND direction='dispatch'`, detail.transfer.id)).toBe(1);
  });

  it('mueve desde una secundaria y solo devuelve al ledger vendible al recibir en la principal', async () => {
    const first = await createTransfer(2);
    const shipped = await first.operations.ship(first.detail.transfer.id, 1, 'transfer:test:reverse:seed-ship');
    const firstLine = shipped.detail!.lines[0]!;
    await first.operations.receive(first.detail.transfer.id, {
      expectedVersion: 2,
      idempotencyKey: 'transfer:test:reverse:seed-receive',
      lines: [{ transferLineId: firstLine.id, receivedQuantity: 2, discrepancyQuantity: 0 }],
    });
    const globalBefore = Number(db.value('SELECT on_hand AS value FROM inventory_balances WHERE variant_id=?', first.variant.variant_id));
    const reverse = await first.operations.create({
      sourceLocationId: first.destination,
      destinationLocationId: first.source,
      lines: [{ variantId: first.variant.variant_id, quantity: 1 }],
      idempotencyKey: 'transfer:test:reverse:create',
    });
    const reverseShipped = await first.operations.ship(reverse.detail!.transfer.id, 1, 'transfer:test:reverse:ship');
    expect(db.value('SELECT on_hand AS value FROM inventory_balances WHERE variant_id=?', first.variant.variant_id)).toBe(globalBefore);
    const reverseLine = reverseShipped.detail!.lines[0]!;
    await first.operations.receive(reverse.detail!.transfer.id, {
      expectedVersion: 2,
      idempotencyKey: 'transfer:test:reverse:receive',
      lines: [{ transferLineId: reverseLine.id, receivedQuantity: 1, discrepancyQuantity: 0 }],
    });
    expect(db.value('SELECT on_hand AS value FROM inventory_balances WHERE variant_id=?', first.variant.variant_id)).toBe(globalBefore + 1);
    expect(db.value('SELECT on_hand AS value FROM inventory_location_balances WHERE location_id=? AND variant_id=?', first.source, first.variant.variant_id)).toBe(globalBefore + 1);
  });
});
