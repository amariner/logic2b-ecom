import type { APIRoute } from 'astro';
import { createOrderAmendmentOperations } from '../../../../composition/order-amendment-operations';
import { runtimePlatform } from '../../../../composition/runtime-platform';
import { createPaymentRefundGatewayResolver } from '../../../../integrations';

export const prerender = false;

export const POST: APIRoute = async ({ params, locals }) => {
  const env = locals.runtime.env;
  if (env.DEMO_MODE === 'true') {
    return Response.json({ error: 'El panel público es una muestra de solo lectura.' }, { status: 403 });
  }
  if (!runtimePlatform.hasCapabilityFlag('ORD-005', 'sideEffects')) {
    return Response.json({ error: 'La edición de pedidos no está habilitada.' }, { status: 403 });
  }
  const id = params.id?.trim();
  if (!id || !/^amd_[0-9a-f-]{36}$/i.test(id)) {
    return Response.json({ error: 'id inválido.' }, { status: 400 });
  }
  try {
    const result = await createOrderAmendmentOperations(
      env.DB,
      createPaymentRefundGatewayResolver(env.STRIPE_SECRET_KEY),
    ).reconcileRefund(id);
    const status = result.outcome === 'not_found' ? 404
      : result.outcome === 'conflict' ? 409
        : result.outcome === 'invalid_state' ? 422
          : result.outcome === 'gateway_unavailable' ? 503
            : result.outcome === 'failed' || result.outcome === 'requires_review' ? 502
              : result.outcome === 'processing' ? 202
                : 200;
    return Response.json({ ok: status < 400, status: result.outcome }, {
      status,
      headers: { 'cache-control': 'private, no-store', vary: 'Cookie' },
    });
  } catch {
    return Response.json(
      { error: 'No se pudo reconciliar el reembolso; la misma clave evita duplicarlo.' },
      { status: 502, headers: { 'cache-control': 'private, no-store', vary: 'Cookie' } },
    );
  }
};
