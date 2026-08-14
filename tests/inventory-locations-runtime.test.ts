import { beforeEach, describe, expect, it } from 'vitest';
import { createInventoryLocationOperations } from '../src/composition/inventory-location-operations';
import { createD1InventoryLedger } from '../src/modules/inventory';
import { seedStatements } from '../seed/seed';
import { SqliteD1 } from './sqlite-d1';

describe('ubicaciones de inventario R3.6', () => {
  let db: SqliteD1;
  beforeEach(async () => {
    db = new SqliteD1();
    await db.batch(seedStatements().map((sql) => db.prepare(sql)));
  });

  it('backfillea todo el ledger simple en la principal y deja vacías las secundarias', async () => {
    const locations = await createInventoryLocationOperations(db.asD1()).list();
    expect(locations).toHaveLength(2);
    const primary = locations.find((item) => item.is_primary === 1)!;
    const secondary = locations.find((item) => item.is_primary === 0)!;
    expect(primary.variant_count).toBe(Number(db.value('SELECT count(*) AS value FROM inventory_balances')));
    expect(primary.on_hand).toBe(Number(db.value('SELECT sum(on_hand) AS value FROM inventory_balances')));
    expect(secondary).toMatchObject({ variant_count: 0, on_hand: 0, reserved: 0 });
    expect(db.value(`SELECT count(*) AS value FROM inventory_location_movements
      WHERE location_id = ${primary.id}`)).toBe(db.value('SELECT count(*) AS value FROM inventory_movements'));
  });

  it('proyecta cada movimiento global nuevo exactamente una vez en la principal', async () => {
    const variantId = Number(db.value('SELECT variant_id AS value FROM inventory_balances ORDER BY variant_id LIMIT 1'));
    const balance = (await createD1InventoryLedger(db.asD1()).balances([variantId])).get(variantId)!;
    db.sqlite.prepare(`INSERT INTO audit_log (audit_id, occurred_at, actor_kind, actor_id, action,
      entity_type, entity_id, correlation_id, diff_json, created_at)
      VALUES ('loc-test', '2026-08-14T10:00:00Z', 'admin', 'test', 'inventory.adjusted',
      'product', '1', 'loc-test', '{}', '2026-08-14T10:00:00Z')`).run();
    await db.batch([...createD1InventoryLedger(db.asD1()).movementStatements(
      balance, { variant_id: variantId, product_id: 1, is_default: false, delta: 1 },
      { delta: 1, reason: 'manual_adjustment', actor_kind: 'admin', actor_id: 'test', reference_type: 'test', reference_id: 'r3.6', idempotency_key: 'r3.6:mirror', correlation_id: 'r3.6' },
      '2026-08-14T10:00:00Z', { kind: 'audit', id: 'loc-test' },
    )]);
    expect(db.value("SELECT count(*) AS value FROM inventory_location_movements WHERE idempotency_key='location:principal:r3.6:mirror'")).toBe(1);
    expect(db.value(`SELECT count(*) AS value FROM inventory_location_balances lb
      JOIN inventory_balances b ON b.variant_id=lb.variant_id
      JOIN inventory_locations l ON l.id=lb.location_id AND l.is_primary=1
      WHERE lb.on_hand=b.on_hand AND lb.reserved=b.reserved
        AND lb.movement_version=b.version AND lb.reservation_version=b.reservation_version`))
      .toBe(db.value('SELECT count(*) AS value FROM inventory_balances'));
  });

  it('crea y actualiza ubicaciones con auditoría y versión optimista', async () => {
    const operations = createInventoryLocationOperations(db.asD1(), () => '2026-08-14T10:00:00Z');
    expect(await operations.create({ code: 'norte', name: 'Almacén Norte', kind: 'warehouse', timezone: 'Europe/Madrid' })).toBe('applied');
    const created = (await operations.list()).find((item) => item.code === 'norte')!;
    expect(await operations.update(created.id, { expectedVersion: 1, status: 'inactive' })).toBe('applied');
    expect(await operations.update(created.id, { expectedVersion: 1, name: 'Obsoleto' })).toBe('conflict');
    expect(db.value("SELECT count(*) AS value FROM audit_log WHERE action LIKE 'inventory.location_%'")).toBe(2);
  });
});
