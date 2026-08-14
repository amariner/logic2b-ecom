import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createOrderDocumentOperations } from '../../../../../composition/order-document-operations';
import { runtimePlatform } from '../../../../../composition/runtime-platform';

export const prerender = false;

const schema = z.object({
  expected_version: z.number().int().positive(),
  idempotency_key: z.string().min(8).max(200),
  reason: z.string().trim().min(3).max(240),
}).strict();

export const POST: APIRoute = async ({ params, request, locals }) => {
  const env = locals.runtime.env;
  if (env.DEMO_MODE === 'true') {
    return Response.json({ error: 'El panel público es una muestra de solo lectura.' }, { status: 403 });
  }
  if (!runtimePlatform.hasCapabilityFlag('ORD-012', 'sideEffects')) {
    return Response.json({ error: 'Documentos operativos no habilitados.' }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!params.id || !parsed.success) return Response.json({ error: 'Datos inválidos.' }, { status: 400 });
  const result = await createOrderDocumentOperations(env.DB).voidDocument(
    params.id, parsed.data.expected_version, parsed.data.idempotency_key, parsed.data.reason,
  );
  if (result.outcome === 'applied' || result.outcome === 'idempotent') {
    return Response.json({ ok: true, outcome: result.outcome, document: result.detail });
  }
  if (result.outcome === 'not-found') return Response.json({ error: 'Documento no encontrado.' }, { status: 404 });
  if (result.outcome === 'invalid-state') return Response.json({ error: 'El documento no puede anularse.', document: result.detail }, { status: 422 });
  return Response.json({ error: 'El documento cambió; recarga la página.', document: result.detail }, { status: 409 });
};
