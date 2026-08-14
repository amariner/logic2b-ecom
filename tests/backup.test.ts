import { describe, expect, it } from 'vitest';
import { BACKUP_SCHEMA_VERSION, BACKUP_TABLES, buildBackupSql, dumpTable } from '../src/lib/backup';
import { seedStatements } from '../seed/seed';
import { createD1BackupReader, exportBackup } from '../src/platform/operations';
import { SqliteD1 } from './sqlite-d1';
import { createOrderBulkActionOperations } from '../src/composition/order-bulk-action-operations';

describe('volcado de copia de seguridad', () => {
  it('declara el contrato que incluye la colaboración de pedidos', () => {
    expect(BACKUP_SCHEMA_VERSION).toBe(20);
    expect(buildBackupSql({}, '2026-08-14')).toContain('0026_promotion_codes');
  });

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
    expect(sql).toContain(`logic2b-backup-schema: ${BACKUP_SCHEMA_VERSION}`);
    expect(sql.indexOf('DELETE FROM product_variant_option_values')).toBeLessThan(
      sql.indexOf('DELETE FROM product_variants'),
    );
    expect(BACKUP_TABLES).toEqual(expect.arrayContaining([
      'product_options',
      'product_option_values',
      'product_variants',
      'product_variant_option_values',
      'product_media',
      'product_variant_media',
      'attribute_definitions',
      'product_attribute_values',
      'inventory_balances',
      'inventory_movements',
      'inventory_reservations',
      'inventory_reservation_lines',
      'inventory_reservation_events',
      'inventory_reservation_balance_events',
      'payments',
      'payment_transactions',
      'refunds',
      'refund_items',
      'fulfillments',
      'fulfillment_items',
      'order_tags',
      'order_notes',
      'order_note_revisions',
      'order_tag_assignments',
      'order_tag_events',
      'order_amendments',
      'order_amendment_lines',
      'refund_payment_allocations',
      'order_holds',
      'order_hold_events',
      'order_bulk_batches',
      'order_bulk_batch_rows',
      'inventory_transfers',
      'inventory_transfer_lines',
      'inventory_transfer_receipts',
      'inventory_transfer_receipt_lines',
      'inventory_transfer_movements',
      'inventory_counts',
      'inventory_routing_policies',
      'inventory_allocation_decisions',
      'inventory_allocation_lines',
      'inventory_allocation_movements',
      'inventory_count_lines',
      'inventory_count_movements',
      'return_requests',
      'return_request_lines',
      'return_events',
      'return_inventory_movements',
      'return_exchange_lines',
      'order_document_templates',
      'order_documents',
      'order_document_artifacts',
      'order_document_events',
    ]));
    for (const table of BACKUP_TABLES) expect(sql).toContain(`DELETE FROM ${table};`);
  });

  it('el caso de uso pide el contrato completo y genera un nombre estable', async () => {
    const requested: string[][] = [];
    const backup = await exportBackup({
      async readTables(tables) {
        requested.push([...tables]);
        return { products: [{ id: 1, slug: 'a' }] };
      },
    }, new Date('2026-08-06T14:35:00.000Z'));
    expect(requested).toEqual([[...BACKUP_TABLES]]);
    expect(backup.filename).toBe('backup-2026-08-06-1435.sql');
    expect(backup.sql).toContain('INSERT INTO products');
    expect(backup.sql).not.toContain('audit_log');
  });

  it('restaura productos v2, combinaciones y pedidos sin romper FKs', async () => {
    const source = new SqliteD1();
    await source.batch(seedStatements().map((sql) => source.prepare(sql)));
    const reservable = source.query<{
      variant_id: number; reserved: number; reservation_version: number;
    }>(`
      SELECT variant_id, reserved, reservation_version
      FROM inventory_balances WHERE on_hand > reserved ORDER BY variant_id LIMIT 1
    `)[0]!;
    source.sqlite.prepare(`
      INSERT INTO inventory_reservations (
        id, owner_type, owner_id, status, idempotency_key, expires_at,
        version, created_at, updated_at
      ) VALUES (
        'backup-reservation', 'order', 'BACKUP-ORDER', 'active',
        'backup:reservation:create', '2026-08-08T17:00:00.000Z', 1,
        '2026-08-08T16:00:00.000Z', '2026-08-08T16:00:00.000Z'
      )
    `).run();
    source.sqlite.prepare(`
      INSERT INTO inventory_reservation_lines (reservation_id, variant_id, quantity)
      VALUES ('backup-reservation', ?, 1)
    `).run(reservable.variant_id);
    source.sqlite.prepare(`
      INSERT INTO inventory_reservation_balance_events (
        reservation_id, variant_id, transition, quantity_delta, reserved_after,
        reservation_version_after, idempotency_key, occurred_at
      ) VALUES (
        'backup-reservation', ?, 'created', 1, ?, ?,
        'backup:reservation:create:line', '2026-08-08T16:00:00.000Z'
      )
    `).run(
      reservable.variant_id,
      reservable.reserved + 1,
      reservable.reservation_version + 1,
    );
    source.sqlite.prepare(`
      UPDATE inventory_balances
      SET reserved = reserved + 1, reservation_version = reservation_version + 1
      WHERE variant_id = ?
    `).run(reservable.variant_id);
    const bulkOperations = createOrderBulkActionOperations(source.asD1(), {
      now: () => '2026-08-08T16:00:00.000Z',
    });
    const bulkOrderId = Number(source.value("SELECT id AS value FROM orders WHERE order_number = 'BM-DEMO-1004'"));
    const bulkTagId = Number(source.value("SELECT id AS value FROM order_tags WHERE slug = 'prioritario'"));
    const bulkPreview = await bulkOperations.preview({
      orderIds: [bulkOrderId],
      action: { type: 'add_tag', tagId: bulkTagId },
    });
    const bulkBatch = await bulkOperations.confirm(bulkPreview);
    const backup = await exportBackup(
      createD1BackupReader(source.asD1()),
      new Date('2026-08-08T16:00:00.000Z'),
    );

    const restored = new SqliteD1();
    restored.sqlite.exec(backup.sql);

    for (const table of BACKUP_TABLES) {
      expect(restored.value(`SELECT count(*) AS value FROM ${table}`), table).toBe(
        source.value(`SELECT count(*) AS value FROM ${table}`),
      );
    }
    expect(restored.query(`
      SELECT pv.sku, po.name AS option_name, pov.value
      FROM product_variants pv
      JOIN product_variant_option_values pvov ON pvov.variant_id = pv.id
      JOIN product_options po ON po.id = pvov.option_id
      JOIN product_option_values pov ON pov.id = pvov.option_value_id
      WHERE pv.is_default = 1 AND pv.sku = 'SUM-SHELL-07-M'
    `)).toEqual([{ sku: 'SUM-SHELL-07-M', option_name: 'Talla', value: 'M' }]);
    expect(restored.query('PRAGMA foreign_key_check')).toEqual([]);
    expect(restored.value("SELECT count(*) AS value FROM inventory_reservations WHERE status='active'")).toBe(1);
    expect(restored.value(`SELECT count(*) AS value FROM order_bulk_batch_rows
      WHERE batch_id = '${bulkBatch.view.batch.id}' AND outcome = 'pending'`)).toBe(1);
    expect(restored.value('SELECT count(*) AS value FROM orders_search')).toBe(
      restored.value('SELECT count(*) AS value FROM orders'),
    );
  });
});
