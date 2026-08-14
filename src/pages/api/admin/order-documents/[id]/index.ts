import type { APIRoute } from 'astro';
import { createOrderDocumentOperations } from '../../../../../composition/order-document-operations';
import { runtimePlatform } from '../../../../../composition/runtime-platform';

export const prerender = false;

export const GET: APIRoute = async ({ params, locals }) => {
  if (!runtimePlatform.hasCapabilityFlag('ORD-012', 'routes')) {
    return Response.json({ error: 'Documentos operativos no habilitados.' }, { status: 403 });
  }
  if (!params.id) return Response.json({ error: 'id inválido.' }, { status: 400 });
  const detail = await createOrderDocumentOperations(locals.runtime.env.DB).find(params.id);
  return detail
    ? Response.json({ document: detail }, { headers: { 'cache-control': 'private, no-store', vary: 'Cookie' } })
    : Response.json({ error: 'Documento no encontrado.' }, { status: 404 });
};
