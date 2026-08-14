import type { APIRoute } from 'astro';
import { z } from 'zod';
import {
  createOrderBulkActionOperations,
  runOrderBulkActionJob,
} from '../../../../composition/order-bulk-action-operations';
import { runtimePlatform } from '../../../../composition/runtime-platform';
import type { OrderBulkPreview } from '../../../../modules/orders';
import { orderBulkActionSchema } from './preview';

export const prerender = false;

const rowSchema = z.object({
  orderId: z.number().int().positive(),
  observedVersion: z.number().int().positive().nullable(),
  status: z.enum(['pending', 'paid', 'shipped', 'delivered', 'cancelled']).nullable(),
  eligibility: z.enum(['ready', 'skipped']),
  reason: z.enum([
    'ready', 'order_not_found', 'already_applied', 'already_absent',
    'active_hold_same_reason', 'status_not_supported',
  ]),
}).strict();

const fingerprint = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const timestamp = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u);

const schema = z.object({
  preview: z.object({
    action: orderBulkActionSchema,
    observedAt: timestamp,
    expiresAt: timestamp,
    selectionFingerprint: fingerprint,
    previewFingerprint: fingerprint,
    rows: z.array(rowSchema).min(1).max(500),
    counts: z.object({
      total: z.number().int().min(1).max(500),
      ready: z.number().int().min(0).max(500),
      skipped: z.number().int().min(0).max(500),
    }).strict(),
  }).strict(),
}).strict();

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  if (env.DEMO_MODE === 'true') {
    return Response.json({ error: 'El panel público permite previsualizar, pero no ejecutar cambios.' }, { status: 403 });
  }
  if (!runtimePlatform.hasCapabilityFlag('ORD-011', 'sideEffects') ||
      !runtimePlatform.hasCapabilityFlag('ORD-011', 'jobs')) {
    return Response.json({ error: 'La ejecución masiva no está habilitada.' }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const operations = createOrderBulkActionOperations(env.DB);
    const confirmation = await operations.confirm(parsed.data.preview as OrderBulkPreview);
    const job = confirmation.view.progress.pending > 0
      ? await runOrderBulkActionJob(env.DB, confirmation.view.batch.id)
      : null;
    const view = await operations.get(confirmation.view.batch.id);
    return Response.json({ ok: true, created: confirmation.created, job, batch: view }, {
      status: confirmation.created ? 201 : 200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo confirmar el lote.';
    return Response.json({ error: message }, { status: /caducado|fingerprint|preview/iu.test(message) ? 409 : 422 });
  }
};
