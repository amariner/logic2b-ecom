import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createReturnOperations, type ReturnMutation } from '../../../../composition/return-operations';
import { runtimePlatform } from '../../../../composition/runtime-platform';
import { createPaymentRefundGatewayResolver } from '../../../../integrations';

export const prerender = false;

const base = { expected_version: z.number().int().positive(), idempotency_key: z.string().min(8).max(160) };
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('authorize'), ...base }).strict(),
  z.object({ action: z.literal('in_transit'), ...base }).strict(),
  z.object({ action: z.literal('receive'), ...base, lines: z.array(z.object({
    return_line_id: z.string().min(8).max(100), received_quantity: z.number().int().positive(),
  }).strict()).min(1).max(100) }).strict(),
  z.object({ action: z.literal('inspect'), ...base, lines: z.array(z.object({
    return_line_id: z.string().min(8).max(100),
    inspection: z.enum(['restock', 'damaged', 'reject']),
    resolution: z.enum(['refund', 'exchange', 'reject']),
    exchange_variant_id: z.number().int().positive().optional(),
  }).strict()).min(1).max(100) }).strict(),
  z.object({ action: z.literal('resolve'), ...base }).strict(),
]);

function responseFor(result: ReturnMutation): Response {
  switch (result.outcome) {
    case 'applied': case 'idempotent':
      return Response.json({ ok: true, outcome: result.outcome, return: result.detail });
    case 'processing':
      return Response.json({ ok: true, outcome: result.outcome, return: result.detail }, { status: 202 });
    case 'not-found': return Response.json({ error: 'RMA no encontrado.' }, { status: 404 });
    case 'invalid-state': return Response.json({ error: 'La transición o los datos ya no son válidos.', return: result.detail }, { status: 422 });
    case 'gateway-unavailable': return Response.json({ error: 'La pasarela no permite cerrar el reembolso.' }, { status: 503 });
    case 'failed': case 'requires_review':
      return Response.json({ error: 'El reembolso requiere revisión.', outcome: result.outcome, return: result.detail }, { status: 409 });
    case 'conflict': default:
      return Response.json({ error: 'El RMA cambió; recarga la página.', return: result.detail }, { status: 409 });
  }
}

export const GET: APIRoute = async ({ params, locals }) => {
  if (!runtimePlatform.hasCapabilityFlag('FUL-011', 'routes')) {
    return Response.json({ error: 'Devoluciones no habilitadas.' }, { status: 403 });
  }
  if (!params.id) return Response.json({ error: 'id inválido' }, { status: 400 });
  const detail = await createReturnOperations(locals.runtime.env.DB).find(params.id);
  return detail ? Response.json({ return: detail }) : Response.json({ error: 'RMA no encontrado.' }, { status: 404 });
};

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const env = locals.runtime.env;
  if (env.DEMO_MODE === 'true') return Response.json({ error: 'El panel público es una muestra de solo lectura.' }, { status: 403 });
  if (!runtimePlatform.hasCapabilityFlag('FUL-011', 'sideEffects')) {
    return Response.json({ error: 'Devoluciones no habilitadas.' }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !params.id) return Response.json({ error: 'Datos inválidos' }, { status: 400 });
  const operations = createReturnOperations(env.DB,
    createPaymentRefundGatewayResolver(env.STRIPE_SECRET_KEY));
  try {
    const data = parsed.data;
    if (data.action === 'authorize') return responseFor(await operations.authorize(params.id, data.expected_version, data.idempotency_key));
    if (data.action === 'in_transit') return responseFor(await operations.markInTransit(params.id, data.expected_version, data.idempotency_key));
    if (data.action === 'receive') return responseFor(await operations.receive(params.id, data.expected_version,
      data.idempotency_key, data.lines.map((line) => ({ returnLineId: line.return_line_id, receivedQuantity: line.received_quantity }))));
    if (data.action === 'inspect') return responseFor(await operations.inspect(params.id, data.expected_version,
      data.idempotency_key, data.lines.map((line) => ({ returnLineId: line.return_line_id,
        inspection: line.inspection, resolution: line.resolution,
        ...(line.exchange_variant_id === undefined ? {} : { exchangeVariantId: line.exchange_variant_id }) }))));
    return responseFor(await operations.resolve(params.id, data.expected_version, data.idempotency_key));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'No se pudo mutar el RMA.' }, { status: 409 });
  }
};
