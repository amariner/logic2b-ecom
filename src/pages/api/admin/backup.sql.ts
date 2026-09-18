import type { APIRoute } from 'astro';
import { exportD1Backup } from '../../../composition/backup';

export const prerender = false;

/** Copia de seguridad completa de la D1 en SQL restaurable (protegido por el middleware). */
export const GET: APIRoute = async ({ locals }) => {
  const backup = await exportD1Backup(locals.runtime.env.DB);
  return new Response(backup.sql, {
    headers: {
      'content-type': 'application/sql; charset=utf-8',
      'content-disposition': `attachment; filename="${backup.filename}"`,
      'cache-control': 'no-store',
    },
  });
};
