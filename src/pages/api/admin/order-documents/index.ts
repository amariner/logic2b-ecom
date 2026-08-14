import type { APIRoute } from 'astro';
import { z } from 'zod';
import {
  createOrderDocumentOperations,
  type OrderDocumentMutation,
} from '../../../../composition/order-document-operations';
import { runtimePlatform } from '../../../../composition/runtime-platform';

export const prerender = false;

const key = z.string().min(8).max(200);
const schema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('generated'),
    document_type: z.enum(['packing_slip', 'internal_label']),
    order_id: z.number().int().positive(),
    fulfillment_id: z.number().int().positive(),
    template_id: z.string().min(8).max(80),
    idempotency_key: key,
  }).strict(),
  z.object({
    kind: z.literal('external'),
    document_type: z.enum(['external_invoice', 'external_credit_note']),
    order_id: z.number().int().positive(),
    refund_id: z.number().int().positive().optional(),
    provider: z.string().trim().min(2).max(80),
    external_reference: z.string().trim().min(2).max(120),
    document_number: z.string().trim().min(3).max(120),
    external_url: z.string().url().refine((value) => value.startsWith('https://'), 'HTTPS obligatorio').optional(),
    idempotency_key: key,
  }).strict(),
]).superRefine((value, context) => {
  if (value.kind !== 'external') return;
    if (value.document_type === 'external_credit_note' && value.refund_id === undefined) {
      context.addIssue({ code: 'custom', path: ['refund_id'], message: 'La rectificativa exige un reembolso.' });
    }
    if (value.document_type === 'external_invoice' && value.refund_id !== undefined) {
      context.addIssue({ code: 'custom', path: ['refund_id'], message: 'La factura no apunta a un reembolso.' });
    }
});

function responseFor(result: OrderDocumentMutation): Response {
  if (result.outcome === 'applied' || result.outcome === 'idempotent') {
    return Response.json({ ok: true, outcome: result.outcome, document: result.detail },
      { status: result.outcome === 'applied' ? 201 : 200 });
  }
  if (result.outcome === 'not-found') return Response.json({ error: 'Pedido no encontrado.' }, { status: 404 });
  if (result.outcome === 'invalid-state') {
    return Response.json({ error: 'El pedido, envío, reembolso o plantilla no admite el documento.', document: result.detail }, { status: 422 });
  }
  return Response.json({ error: 'El alcance documental cambió; recarga la página.', document: result.detail }, { status: 409 });
}

export const GET: APIRoute = async ({ request, locals }) => {
  if (!runtimePlatform.hasCapabilityFlag('ORD-012', 'routes')) {
    return Response.json({ error: 'Documentos operativos no habilitados.' }, { status: 403 });
  }
  const orderIdValue = new URL(request.url).searchParams.get('order_id');
  const orderId = orderIdValue === null ? undefined : Number(orderIdValue);
  if (orderId !== undefined && (!Number.isInteger(orderId) || orderId < 1)) {
    return Response.json({ error: 'order_id inválido.' }, { status: 400 });
  }
  return Response.json({ documents: await createOrderDocumentOperations(locals.runtime.env.DB).list(orderId) }, {
    headers: { 'cache-control': 'private, no-store', vary: 'Cookie' },
  });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  if (env.DEMO_MODE === 'true') {
    return Response.json({ error: 'El panel público es una muestra de solo lectura.' }, { status: 403 });
  }
  if (!runtimePlatform.hasCapabilityFlag('ORD-012', 'sideEffects')) {
    return Response.json({ error: 'Documentos operativos no habilitados.' }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  const operations = createOrderDocumentOperations(env.DB);
  if (parsed.data.kind === 'generated') {
    return responseFor(await operations.issueGenerated({
      orderId: parsed.data.order_id,
      fulfillmentId: parsed.data.fulfillment_id,
      documentType: parsed.data.document_type,
      templateId: parsed.data.template_id,
      idempotencyKey: parsed.data.idempotency_key,
    }));
  }
  return responseFor(await operations.registerExternal({
    orderId: parsed.data.order_id,
    documentType: parsed.data.document_type,
    provider: parsed.data.provider,
    externalReference: parsed.data.external_reference,
    documentNumber: parsed.data.document_number,
    idempotencyKey: parsed.data.idempotency_key,
    ...(parsed.data.refund_id === undefined ? {} : { refundId: parsed.data.refund_id }),
    ...(parsed.data.external_url === undefined ? {} : { externalUrl: parsed.data.external_url }),
  }));
};
