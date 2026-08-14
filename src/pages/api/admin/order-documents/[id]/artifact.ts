import type { APIRoute } from 'astro';
import { createOrderDocumentOperations } from '../../../../../composition/order-document-operations';
import { runtimePlatform } from '../../../../../composition/runtime-platform';

export const prerender = false;

export const GET: APIRoute = async ({ params, locals }) => {
  if (!runtimePlatform.hasCapabilityFlag('ORD-012', 'routes')) {
    return Response.json({ error: 'Documentos operativos no habilitados.' }, { status: 403 });
  }
  if (!params.id) return Response.json({ error: 'id inválido.' }, { status: 400 });
  const operations = createOrderDocumentOperations(locals.runtime.env.DB);
  const detail = await operations.find(params.id);
  if (!detail) return Response.json({ error: 'Documento no encontrado.' }, { status: 404 });
  if (detail.document.source === 'external') {
    return Response.json({
      error: 'El artefacto fiscal vive en el proveedor externo.',
      external_url: detail.document.external_url,
      external_reference: detail.document.external_reference,
    }, { status: 409, headers: { 'cache-control': 'private, no-store', vary: 'Cookie' } });
  }
  if (detail.document.status !== 'active') {
    return Response.json({ error: 'Esta versión ya no está activa.' }, { status: 410 });
  }
  const artifact = await operations.artifact(params.id);
  if (!artifact) return Response.json({ error: 'Artefacto no encontrado.' }, { status: 404 });
  const filename = `${detail.document.document_number.replaceAll(/[^A-Za-z0-9._-]/g, '-')}.html`;
  return new Response(artifact.content_text, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'content-disposition': `inline; filename="${filename}"`,
      'cache-control': 'private, no-store',
      vary: 'Cookie',
      etag: `"${artifact.content_sha256}"`,
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
      'x-content-type-options': 'nosniff',
    },
  });
};
