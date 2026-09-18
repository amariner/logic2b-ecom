import { BACKUP_TABLES, buildBackupSql, type Row, type BackupExtension } from '../../../lib/backup';
export type { BackupExtension } from '../../../lib/backup';

export type BackupSnapshotReader = Readonly<{
  readTables: (tables: readonly string[]) => Promise<Record<string, Row[]>>;
}>;

export type BackupExport = Readonly<{
  filename: string;
  sql: string;
}>;

/** Caso de uso puro: presentación no conoce D1 ni compone consultas SQL. */
export async function exportBackup(
  reader: BackupSnapshotReader,
  now: Date = new Date(),
  extensions: readonly BackupExtension[] = [],
): Promise<BackupExport> {
  const tablesRows = await reader.readTables(BACKUP_TABLES);
  const sql = buildBackupSql(tablesRows, now.toISOString(), extensions);
  for (const extension of extensions) await extension.validate(tablesRows);
  const stamp = now.toISOString().slice(0, 16).replace('T', '-').replace(':', '');
  return Object.freeze({
    filename: `backup-${stamp}.sql`,
    sql,
  });
}
