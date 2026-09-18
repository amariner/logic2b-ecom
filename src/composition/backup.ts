import { buildBackupSql, type Row } from '../lib/backup';
import {
  CUSTOMER_SEGMENT_BACKUP_COLUMNS,
  buildCustomerSegmentRestoreSql,
  assertCustomerSegmentBackupFingerprints,
} from '../modules/customers';
import {
  createD1BackupReader, exportBackup,
  type BackupExport, type BackupExtension, type BackupSnapshotReader,
} from '../platform/operations';

/** Operaciones desconoce el dominio; esta composición conecta su replay. */
const extensions: readonly BackupExtension[] = Object.freeze([Object.freeze({
  columns: CUSTOMER_SEGMENT_BACKUP_COLUMNS,
  renderRestore: buildCustomerSegmentRestoreSql,
  validate: assertCustomerSegmentBackupFingerprints,
})]);

export function buildComposedBackupSql(tables: Record<string, Row[]>, generatedAt: string): string {
  return buildBackupSql(tables, generatedAt, extensions);
}

export function createComposedD1BackupReader(db: D1Database): BackupSnapshotReader {
  return createD1BackupReader(db, CUSTOMER_SEGMENT_BACKUP_COLUMNS);
}

export function exportComposedBackup(reader: BackupSnapshotReader, now: Date = new Date()): Promise<BackupExport> {
  return exportBackup(reader, now, extensions);
}

export function exportD1Backup(db: D1Database, now: Date = new Date()): Promise<BackupExport> {
  return exportComposedBackup(createComposedD1BackupReader(db), now);
}
