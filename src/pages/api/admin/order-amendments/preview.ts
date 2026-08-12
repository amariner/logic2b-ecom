import type { APIRoute } from 'astro';
import { createOrderAmendmentOperations } from '../../../../composition/order-amendment-operations';
import { runtimePlatform } from '../../../../composition/runtime-platform';
import { createPaymentRefundGatewayResolver } from '../../../../integrations';
import { orderAmendmentPreviewSchema } from '../../../../modules/orders/application/order-amendment-request';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  if (env.DEMO_MODE === 'true') {
    return Response.json({ error: 'El panel público es una muestra de solo lectura.' }, { status: 403 });
  }
  if (!runtimePlatform.hasCapabilityFlag('ORD-005', 'routes')) {
    return Response.json({ error: 'La edición de pedidos no está habilitada.' }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'JSON inválido.' }, { status: 400 });
  }
  const parsed = orderAmendmentPreviewSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Datos inválidos.', details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const operations = createOrderAmendmentOperations(
      env.DB,
      createPaymentRefundGatewayResolver(env.STRIPE_SECRET_KEY),
    );
    const plan = await operations.preview({
      orderId: parsed.data.order_id,
      expectedVersion: parsed.data.expected_version,
      lines: parsed.data.lines,
      ...(parsed.data.address === undefined ? {} : { address: parsed.data.address }),
    });
    return Response.json({ ok: true, preview: plan }, {
      headers: { 'cache-control': 'private, no-store', vary: 'Cookie' },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'No se pudo calcular la edición.' },
      { status: 422, headers: { 'cache-control': 'private, no-store', vary: 'Cookie' } },
    );
  }
};
