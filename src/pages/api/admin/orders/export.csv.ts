import type { APIRoute } from 'astro';
import { csvField } from '../../../../lib/csv';

export const prerender = false;

type ExportRow = {
  order_number: string;
  customer_name: string;
  email: string;
  address_json: string;
  total_cents: number;
  status: string;
  items_summary: string | null;
};

/**
 * Export CSV con columnas compatibles con la importación de Packlink PRO /
 * SendCloud: un envío por fila, dirección desglosada, contenido y valor.
 * Exporta los pedidos en estado 'paid' (pendientes de enviar).
 */
export const GET: APIRoute = async ({ locals }) => {
  const { results } = await locals.runtime.env.DB.prepare(
    `SELECT o.order_number, o.customer_name, o.email, o.address_json, o.total_cents, o.status,
            (SELECT group_concat(name_snapshot || ' x' || qty, '; ') FROM order_items WHERE order_id = o.id) AS items_summary
     FROM orders o WHERE o.status = 'paid' ORDER BY o.created_at`,
  ).all<ExportRow>();

  const header = [
    'reference', 'name', 'email', 'phone', 'street', 'city', 'postal_code', 'country', 'contents', 'value_eur',
  ].join(',');

  const rows = results.map((row) => {
    const addr = JSON.parse(row.address_json) as {
      name: string; phone: string | null; street: string; city: string; postal_code: string;
    };
    return [
      csvField(row.order_number),
      csvField(addr.name),
      csvField(row.email),
      csvField(addr.phone ?? ''),
      csvField(addr.street),
      csvField(addr.city),
      csvField(addr.postal_code),
      csvField('ES'),
      csvField(row.items_summary ?? ''),
      (row.total_cents / 100).toFixed(2),
    ].join(',');
  });

  return new Response([header, ...rows].join('\r\n') + '\r\n', {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="envios-pendientes.csv"',
    },
  });
};
