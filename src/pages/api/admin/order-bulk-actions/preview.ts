import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createOrderBulkActionOperations } from '../../../../composition/order-bulk-action-operations';
import { runtimePlatform } from '../../../../composition/runtime-platform';

export const prerender = false;

export const orderBulkActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('add_tag'), tagId: z.number().int().positive() }).strict(),
  z.object({ type: z.literal('remove_tag'), tagId: z.number().int().positive() }).strict(),
  z.object({
    type: z.literal('create_hold'),
    reasonCode: z.enum([
      'payment_review', 'inventory_issue', 'address_issue', 'customer_request',
      'fulfillment_issue', 'risk_review', 'other',
    ]),
    owner: z.object({
      kind: z.enum(['admin', 'system']),
      id: z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9:_-]+$/u),
    }).strict(),
    dueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u),
  }).strict(),
]);

const schema = z.object({
  order_ids: z.array(z.number().int().positive()).min(1).max(500),
  action: orderBulkActionSchema,
}).strict();

export const POST: APIRoute = async ({ request, locals }) => {
  if (!runtimePlatform.hasCapabilityFlag('ORD-011', 'routes') ||
      !runtimePlatform.hasCapabilityFlag('AUT-011', 'routes')) {
    return Response.json({ error: 'Las acciones masivas no están habilitadas.' }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const preview = await createOrderBulkActionOperations(locals.runtime.env.DB).preview({
      orderIds: parsed.data.order_ids,
      action: parsed.data.action,
    });
    return Response.json({ preview });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'No se pudo crear el preview.' }, { status: 422 });
  }
};
