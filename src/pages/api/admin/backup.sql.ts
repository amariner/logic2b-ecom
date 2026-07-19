import type { APIRoute } from 'astro';
import { BACKUP_TABLES, buildBackupSql, type Row } from '../../../lib/backup';

export const prerender = false;

/** Copia de seguridad completa de la D1 en SQL restaurable (protegido por el middleware). */
export const GET: APIRoute = async ({ locals }) => {
  const db = locals.runtime.env.DB;

  const results = await db.batch(BACKUP_TABLES.map((table) => db.prepare(`SELECT * FROM ${table}`)));
  const tablesRows: Record<string, Row[]> = {};
  BACKUP_TABLES.forEach((table, i) => {
    tablesRows[table] = (results[i]?.results ?? []) as Row[];
  });

  const now = new Date();
  const stamp = now.toISOString().slice(0, 16).replace('T', '-').replace(':', '');
  return new Response(buildBackupSql(tablesRows, now.toISOString()), {
    headers: {
      'content-type': 'application/sql; charset=utf-8',
      'content-disposition': `attachment; filename="backup-${stamp}.sql"`,
      'cache-control': 'no-store',
    },
  });
};
