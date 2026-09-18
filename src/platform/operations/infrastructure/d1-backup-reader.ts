import type { Row } from '../../../lib/backup';
import type { BackupSnapshotReader } from '../application/export-backup';

/** Adaptador D1 del puerto de lectura usado por la exportación administrativa. */
export function createD1BackupReader(
  db: D1Database, tableColumns: Readonly<Record<string, readonly string[]>> = {},
): BackupSnapshotReader {
  return Object.freeze({
    async readTables(tables: readonly string[]): Promise<Record<string, Row[]>> {
      // Un batch transaccional conserva el mismo corte para hechos, progreso y
      // publicaciones; una lectura independiente por tabla podría mezclarlos.
      const results = await db.batch(tables.map((table) => {
        const columns = tableColumns[table];
        return db.prepare(`SELECT ${columns?.join(', ') ?? '*'} FROM ${table}`);
      }));
      if (results.length !== tables.length || results.some((result) => !result.success || !Array.isArray(result.results))) {
        throw new Error('D1 no confirmó el corte completo de la copia de seguridad.');
      }
      return Object.fromEntries(tables.map((table, index) => [
        table,
        results[index]!.results as Row[],
      ]));
    },
  });
}
