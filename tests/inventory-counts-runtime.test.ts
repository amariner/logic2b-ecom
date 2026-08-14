import { beforeEach, describe, expect, it } from 'vitest';
import { createInventoryCountOperations } from '../src/composition/inventory-count-operations';
import { seedStatements } from '../seed/seed';
import { SqliteD1 } from './sqlite-d1';

describe('runtime de conteos R3.8', () => {
  let db: SqliteD1;
  beforeEach(async () => {
    db = new SqliteD1();
    await db.batch(seedStatements().map((sql) => db.prepare(sql)));
  });

  function fixture() {
    const locationId = Number(db.value("SELECT id AS value FROM inventory_locations WHERE code='principal'"));
    const variant = db.query<{ variant_id: number; on_hand: number }>(
      'SELECT variant_id, on_hand FROM inventory_balances WHERE on_hand >= 3 ORDER BY variant_id LIMIT 1',
    )[0]!;
    return { locationId, variant, operations: createInventoryCountOperations(db.asD1(), () => '2026-08-14T14:00:00.000Z') };
  }

  it('aplica una corrección primaria una sola vez y mantiene el espejo legacy', async () => {
    const { locationId, variant, operations } = fixture();
    const created = await operations.create({
      locationId, reason: 'cycle_count', requiresApproval: false, countedBy: 'operaciones',
      lines: [{ variantId: variant.variant_id, countedQuantity: variant.on_hand - 2 }],
      idempotencyKey: 'count:test:create:direct',
    });
    const countId = created.detail!.count.id;
    expect(await operations.submit(countId, 1, 'count:test:submit:direct')).toMatchObject({ outcome: 'applied' });
    expect(await operations.submit(countId, 1, 'count:test:submit:direct')).toMatchObject({ outcome: 'idempotent' });
    expect(db.value('SELECT on_hand AS value FROM inventory_balances WHERE variant_id=?', variant.variant_id)).toBe(variant.on_hand - 2);
    expect(db.value('SELECT on_hand AS value FROM inventory_location_balances WHERE location_id=? AND variant_id=?', locationId, variant.variant_id)).toBe(variant.on_hand - 2);
    expect(db.value('SELECT count(*) AS value FROM inventory_count_movements WHERE count_id=?', countId)).toBe(1);
    expect(db.value("SELECT count(*) AS value FROM audit_log WHERE action='inventory.count_applied' AND entity_id=?", countId)).toBe(1);
  });

  it('aplica doble control solo con un revisor distinto', async () => {
    const { locationId, variant, operations } = fixture();
    const created = await operations.create({
      locationId, reason: 'reconciliation', requiresApproval: true, countedBy: 'contador-a',
      lines: [{ variantId: variant.variant_id, countedQuantity: variant.on_hand + 1 }],
      idempotencyKey: 'count:test:create:approval',
    });
    const countId = created.detail!.count.id;
    const submitted = await operations.submit(countId, 1, 'count:test:submit:approval');
    expect(submitted.detail!.count.status).toBe('pending_approval');
    await expect(operations.approve(countId, 2, 'contador-a', 'count:test:approve:same')).rejects.toThrow(/distinto/);
    const approved = await operations.approve(countId, 2, 'revisor-b', 'count:test:approve:other');
    expect(approved.detail!.count).toMatchObject({ status: 'applied', reviewed_by: 'revisor-b' });
    expect(db.value('SELECT on_hand AS value FROM inventory_balances WHERE variant_id=?', variant.variant_id)).toBe(variant.on_hand + 1);
  });

  it('rechaza aplicar una foto obsoleta si hubo otro movimiento', async () => {
    const { locationId, variant, operations } = fixture();
    const created = await operations.create({
      locationId, reason: 'cycle_count', requiresApproval: false, countedBy: 'operaciones',
      lines: [{ variantId: variant.variant_id, countedQuantity: variant.on_hand - 1 }],
      idempotencyKey: 'count:test:create:stale',
    });
    db.sqlite.prepare(`UPDATE inventory_balances SET on_hand=on_hand+1, version=version+1 WHERE variant_id=?`).run(variant.variant_id);
    await expect(operations.submit(created.detail!.count.id, 1, 'count:test:submit:stale')).rejects.toThrow(/cambió/);
    expect(db.value('SELECT status AS value FROM inventory_counts WHERE id=?', created.detail!.count.id)).toBe('draft');
    expect(db.value('SELECT count(*) AS value FROM inventory_count_movements WHERE count_id=?', created.detail!.count.id)).toBe(0);
  });

  it('ajusta una ubicación secundaria sin alterar el ledger vendible', async () => {
    const { variant, operations } = fixture();
    const secondaryId = Number(db.value("SELECT id AS value FROM inventory_locations WHERE code='tienda-demo'"));
    db.sqlite.prepare(`INSERT INTO inventory_location_balances (
      location_id, variant_id, on_hand, reserved, movement_version, reservation_version, updated_at
    ) VALUES (?, ?, 4, 0, 1, 1, '2026-08-14T13:00:00.000Z')`).run(secondaryId, variant.variant_id);
    const globalBefore = Number(db.value('SELECT on_hand AS value FROM inventory_balances WHERE variant_id=?', variant.variant_id));
    const created = await operations.create({
      locationId: secondaryId, reason: 'reconciliation', requiresApproval: false, countedBy: 'tienda-demo',
      lines: [{ variantId: variant.variant_id, countedQuantity: 3 }],
      idempotencyKey: 'count:test:create:secondary',
    });
    await operations.submit(created.detail!.count.id, 1, 'count:test:submit:secondary');
    expect(db.value('SELECT on_hand AS value FROM inventory_location_balances WHERE location_id=? AND variant_id=?', secondaryId, variant.variant_id)).toBe(3);
    expect(db.value('SELECT on_hand AS value FROM inventory_balances WHERE variant_id=?', variant.variant_id)).toBe(globalBefore);
    expect(db.value('SELECT count(*) AS value FROM inventory_count_movements WHERE count_id=?', created.detail!.count.id)).toBe(1);
  });
});
