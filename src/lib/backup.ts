/**
 * Volcado de la D1 a SQL restaurable. Puro: recibe filas, devuelve sentencias.
 * Lo consume GET /api/admin/backup.sql (botón «Copia de seguridad» del panel).
 * Restaurar: `wrangler d1 execute <db> --remote --file copia.sql`.
 */

export type Row = Record<string, string | number | null>;

/** Orden de volcado y de borrado inverso (hijos después de padres al insertar no importa: borramos primero). */
export const BACKUP_TABLES = [
  'products',
  'shipping_rates',
  'orders',
  'order_items',
  'order_events',
  'emails_outbox',
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
    `-- Copia de seguridad LogicEcom — ${generatedAt}`,
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
