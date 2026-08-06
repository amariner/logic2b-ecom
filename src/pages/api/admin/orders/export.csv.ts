import type { APIRoute } from 'astro';
import { csvField } from '../../../../lib/csv';
import { createFulfillmentAdmin } from '../../../../modules/fulfillment';

export const prerender = false;

/**
 * Export CSV con columnas compatibles con la importación de Packlink PRO /
 * SendCloud: un envío por fila, dirección desglosada, contenido y valor.
 * Exporta los pedidos en estado 'paid' (pendientes de enviar).
 */
export const GET: APIRoute = async ({ locals }) => {
  const results = await createFulfillmentAdmin(locals.runtime.env.DB).listPendingShipments();

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
