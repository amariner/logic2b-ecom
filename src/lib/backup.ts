/**
 * Volcado de la D1 a SQL restaurable. Puro: recibe filas, devuelve sentencias.
 * Lo consume GET /api/admin/backup.sql (botón «Copia de seguridad» del panel).
 * Restaurar: `wrangler d1 execute <db> --remote --file copia.sql`.
 */

export type Row = Record<string, string | number | null>;

/** Orden de volcado y de borrado inverso (hijos después de padres al insertar no importa: borramos primero). */
export const BACKUP_SCHEMA_VERSION = 15;

export const BACKUP_TABLES = [
  'products',
  'product_media',
  'product_options',
  'product_option_values',
  'product_variants',
  'product_variant_option_values',
  'product_variant_media',
  'attribute_definitions',
  'product_attribute_values',
  'inventory_balances',
  'inventory_movements',
  'inventory_locations',
  'inventory_location_balances',
  'inventory_location_movements',
  'inventory_transfers',
  'inventory_transfer_lines',
  'inventory_transfer_receipts',
  'inventory_transfer_receipt_lines',
  'inventory_transfer_movements',
  'inventory_counts',
  'inventory_count_lines',
  'inventory_count_movements',
  'inventory_reservations',
  'inventory_reservation_lines',
  'inventory_reservation_events',
  'inventory_reservation_balance_events',
  'shipping_rates',
  'order_tags',
  'order_bulk_batches',
  'order_bulk_batch_rows',
  'orders',
  'order_items',
  'order_holds',
  'order_hold_events',
  'order_notes',
  'order_note_revisions',
  'order_tag_assignments',
  'order_tag_events',
  'order_amendments',
  'order_amendment_lines',
  'payments',
  'payment_transactions',
  'refunds',
  'refund_items',
  'refund_payment_allocations',
  'fulfillments',
  'fulfillment_items',
  'order_events',
  'event_outbox_events',
  'event_outbox_deliveries',
  'emails_outbox',
  // `audit_log` NO se exporta por HTTP: es evidencia interna y la demo tiene
  // credenciales públicas. Su extracción se hace solo con Wrangler/Cloudflare.
  // `contact_requests` NO entra a propósito: son datos personales de leads
  // reales y esta copia se descarga desde el panel, que en la demo pública es
  // accesible con la contraseña que la propia demo enseña. Ver migración 0003.
] as const;

function sqlValue(value: string | number | null): string {
  if (value === null) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${value.replaceAll("'", "''")}'`;
}

/** INSERTs de una tabla (con columnas explícitas, ids incluidos para conservar FKs). */
export function dumpTable(table: string, rows: Row[]): string[] {
  if (rows.length === 0) return [];
  const columns = Object.keys(rows[0]!);
  return rows.map(
    (row) =>
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns
        .map((col) => sqlValue(row[col] ?? null))
        .join(', ')});`,
  );
}

/** Dump completo: limpieza (hijos primero) + INSERTs en orden de FK. */
export function buildBackupSql(tablesRows: Record<string, Row[]>, generatedAt: string): string {
  const lines = [
    `-- Copia de seguridad Logic2B Ecommerce — ${generatedAt}`,
    `-- logic2b-backup-schema: ${BACKUP_SCHEMA_VERSION}`,
    '-- Requiere una base con la migración 0021_inventory_counts aplicada; las tablas/columnas explícitas abortan un restore incompatible.',
    `-- Restaurar con: wrangler d1 execute <database> --remote --file <este fichero>`,
    'PRAGMA defer_foreign_keys = true;',
  ];
  for (const table of [...BACKUP_TABLES].reverse()) {
    lines.push(`DELETE FROM ${table};`);
  }
  for (const table of BACKUP_TABLES) {
    lines.push(...dumpTable(table, tablesRows[table] ?? []));
  }
  return lines.join('\n') + '\n';
}
