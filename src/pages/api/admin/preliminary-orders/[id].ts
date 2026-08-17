import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createPreliminaryOrderOperations } from '../../../../composition/preliminary-order-operations';
import { runtimePlatform } from '../../../../composition/runtime-platform';

export const prerender = false;

const instant = z.string().datetime({ offset: false });
const idempotencyKey = z.string().trim().min(8).max(200).regex(/^[A-Za-z0-9:_-]+$/);
const transitionSchema = z.object({
  action: z.enum(['issue', 'approve', 'expire', 'cancel']),
  expected_version: z.number().int().positive(),
  idempotency_key: idempotencyKey,
  at: instant.optional(),
}).strict();
const conversionSchema = z.object({
  action: z.literal('convert'),
  expected_version: z.number().int().positive(),
  idempotency_key: idempotencyKey,
  reservation_expires_at: instant,
  at: instant.optional(),
}).strict();
const schema = z.discriminatedUnion('action', [transitionSchema, conversionSchema]);

export const GET: APIRoute = async ({ params, locals }) => {
  if (!runtimePlatform.hasCapabilityFlag('ORD-008', 'routes')) {
    return Response.json({ error: 'Presupuestos no habilitados.' }, { status: 403 });
  }
  const id = params.id?.trim();
  if (!id) return Response.json({ error: 'Presupuesto inválido.' }, { status: 400 });
  const detail = await createPreliminaryOrderOperations(locals.runtime.env.DB).detail(id);
  return detail === null
    ? Response.json({ error: 'Presupuesto no encontrado.' }, { status: 404 })
    : Response.json(detail, { headers: { 'cache-control': 'no-store' } });
};

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  if (locals.runtime.env.DEMO_MODE === 'true') {
    return Response.json({ error: 'El panel público es una muestra de solo lectura.' }, { status: 403 });
  }
  if (!runtimePlatform.hasCapabilityFlag('ORD-008', 'sideEffects')) {
    return Response.json({ error: 'Presupuestos no habilitados.' }, { status: 403 });
  }
  const id = params.id?.trim();
  if (!id) return Response.json({ error: 'Presupuesto inválido.' }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const operations = createPreliminaryOrderOperations(locals.runtime.env.DB);
    const result = parsed.data.action === 'convert'
      ? await operations.convert({
        id, expectedVersion: parsed.data.expected_version,
        idempotencyKey: parsed.data.idempotency_key,
        reservationExpiresAt: parsed.data.reservation_expires_at,
        ...(parsed.data.at === undefined ? {} : { convertedAt: parsed.data.at }),
      })
      : await operations.transition({
        id, expectedVersion: parsed.data.expected_version, action: parsed.data.action,
        idempotencyKey: parsed.data.idempotency_key,
        ...(parsed.data.at === undefined ? {} : { at: parsed.data.at }),
      });
    if (result === 'not-found') return Response.json({ error: 'Presupuesto no encontrado.' }, { status: 404 });
    if (result === 'not-sellable') {
      return Response.json({ error: 'Alguna variante del presupuesto ya no está disponible para la venta.' }, { status: 422 });
    }
    if (result === 'conflict') {
      return Response.json({ error: 'El presupuesto cambió concurrentemente; recarga la página.' }, { status: 409 });
    }
    return Response.json({ ok: true, replayed: result === 'duplicate' });
  } catch (error) {
    if (error instanceof RangeError) return Response.json({ error: error.message }, { status: 422 });
    throw error;
  }
};
