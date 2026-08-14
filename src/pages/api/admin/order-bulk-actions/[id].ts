import type { APIRoute } from 'astro';
import { z } from 'zod';
import {
  createOrderBulkActionOperations,
  runOrderBulkActionJob,
} from '../../../../composition/order-bulk-action-operations';
import { runtimePlatform } from '../../../../composition/runtime-platform';

export const prerender = false;

function validId(value: string): boolean {
  return /^bulk_[0-9a-f]{32}$/u.test(value);
}

export const GET: APIRoute = async ({ params, locals }) => {
  if (!runtimePlatform.hasCapabilityFlag('ORD-011', 'routes')) {
    return Response.json({ error: 'Las acciones masivas no están habilitadas.' }, { status: 403 });
  }
  const id = params.id ?? '';
  if (!validId(id)) return Response.json({ error: 'id inválido' }, { status: 400 });
  const batch = await createOrderBulkActionOperations(locals.runtime.env.DB).get(id);
  return batch
    ? Response.json({ batch })
    : Response.json({ error: 'Lote no encontrado.' }, { status: 404 });
};

const replaySchema = z.object({ action: z.literal('replay') }).strict();

export const POST: APIRoute = async ({ params, request, locals }) => {
  const env = locals.runtime.env;
  if (env.DEMO_MODE === 'true') {
    return Response.json({ error: 'El panel público es una muestra de solo lectura.' }, { status: 403 });
  }
  if (!runtimePlatform.hasCapabilityFlag('ORD-011', 'sideEffects') ||
      !runtimePlatform.hasCapabilityFlag('ORD-011', 'jobs')) {
    return Response.json({ error: 'El replay masivo no está habilitado.' }, { status: 403 });
  }
  const id = params.id ?? '';
  if (!validId(id)) return Response.json({ error: 'id inválido' }, { status: 400 });
  if (!replaySchema.safeParse(await request.json().catch(() => null)).success) {
    return Response.json({ error: 'Datos inválidos' }, { status: 400 });
  }
  const operations = createOrderBulkActionOperations(env.DB);
  if (!await operations.prepareReplay(id)) {
    return Response.json({
      error: 'El lote no tiene filas reintentables ni una ejecución interrumpida recuperable.',
    }, { status: 409 });
  }
  const job = await runOrderBulkActionJob(env.DB, id);
  return Response.json({ ok: true, job, batch: await operations.get(id) });
};
