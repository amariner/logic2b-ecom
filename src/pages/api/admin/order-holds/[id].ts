import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createOrderHoldOperations } from '../../../../composition/order-hold-operations';
import { runtimePlatform } from '../../../../composition/runtime-platform';

export const prerender = false;

const schema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('assign'),
    expected_version: z.number().int().positive(),
    owner_id: z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9:_-]+$/),
    owner_label: z.string().trim().min(1).max(120),
  }).strict(),
  z.object({
    action: z.literal('resolve'),
    expected_version: z.number().int().positive(),
    resolution_code: z.enum(['cleared', 'order_cancelled', 'duplicate', 'superseded']),
  }).strict(),
]);

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const env = locals.runtime.env;
  if (env.DEMO_MODE === 'true') {
    return Response.json({ error: 'El panel público es una muestra de solo lectura.' }, { status: 403 });
  }
  if (!runtimePlatform.hasCapabilityFlag('ORD-010', 'sideEffects')) {
    return Response.json({ error: 'Las incidencias de pedido no están habilitadas.' }, { status: 403 });
  }
  const holdId = params.id ?? '';
  if (!holdId || holdId.length > 120) return Response.json({ error: 'id inválido' }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  }
  const operations = createOrderHoldOperations(env.DB);
  const result = parsed.data.action === 'assign'
    ? await operations.assign({
      holdId,
      expectedVersion: parsed.data.expected_version,
      owner: { kind: 'admin', id: parsed.data.owner_id, label: parsed.data.owner_label },
    })
    : await operations.resolve({
      holdId,
      expectedVersion: parsed.data.expected_version,
      resolutionCode: parsed.data.resolution_code,
    });
  if (result.outcome === 'not-found') return Response.json({ error: 'Incidencia no encontrada.' }, { status: 404 });
  if (result.outcome === 'conflict') {
    return Response.json({ error: 'La incidencia cambió; recarga la página.' }, { status: 409 });
  }
  return Response.json({ ok: true, hold: result.hold });
};
