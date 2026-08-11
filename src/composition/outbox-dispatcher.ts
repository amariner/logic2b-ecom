/** Composition root del dispatcher transaccional (R1.7). */

import { deliverPendingEmailBatch } from '../lib/send-email';
import { createOrderReader } from '../modules/orders';
import { createOutboxWriter, orderNotificationsFor, type OrderEmailData } from '../modules/notifications';
import {
  createD1EventOutboxRepository,
  OUTBOX_POLICY,
  type ClaimedOutboxDelivery,
} from '../platform/events';
import {
  OperationalError,
  asOperationalError,
  createConsoleObservability,
  createOperationId,
  silentObservability,
  type PlatformObservability,
} from '../platform/operations';

type DeliveryEnv = Readonly<{ DEMO_MODE: string; RESEND_API_KEY?: string }>;

export type OutboxDispatchResult = Readonly<{
  claimed: number;
  delivered: number;
  failed: number;
  emailsSent: number;
}>;

function safeFailure(error: unknown): Readonly<{ code: string; message: string }> {
  const rawCode = error instanceof OperationalError
    ? error.code
    : error instanceof Error
      ? error.name
      : 'consumer-error';
  const code = rawCode.toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, OUTBOX_POLICY.maxErrorCodeLength) || 'consumer-error';
  // No se persiste `error.message`: puede contener email, dirección, payload o
  // respuesta del proveedor. El detalle llegará a logs redacted en R1.9.
  return Object.freeze({
    code,
    message: 'El consumidor no pudo procesar el evento; revisa el código y la correlación.',
  });
}

async function notificationData(db: D1Database, delivery: ClaimedOutboxDelivery): Promise<OrderEmailData> {
  if (delivery.event.entity.type !== 'order' || !/^\d+$/.test(delivery.event.entity.id)) {
    throw new OperationalError('outbox.invalid_entity', false);
  }
  const detail = await createOrderReader(db).detail(Number(delivery.event.entity.id));
  if (!detail) throw new OperationalError('outbox.order_not_found', false);
  return {
    order_number: detail.order.order_number,
    customer_name: detail.order.customer_name,
    email: detail.order.email,
    subtotal_cents: detail.order.subtotal_cents,
    shipping_cents: detail.order.shipping_cents,
    total_cents: detail.order.total_cents,
    items: detail.items.map((item) => ({
      order_item_id: item.order_item_id,
      name_snapshot: item.name_snapshot,
      unit_price_cents: item.unit_price_cents,
      qty: item.qty,
    })),
  };
}

async function consume(
  db: D1Database,
  delivery: ClaimedOutboxDelivery,
  workerId: string,
  now: string,
): Promise<boolean> {
  if (delivery.consumerId !== 'notifications') throw new OperationalError('outbox.unknown_consumer', false);
  const data = await notificationData(db, delivery);
  const messages = orderNotificationsFor(delivery.event, data);
  const messageOutbox = createOutboxWriter(db);
  const eventOutbox = createD1EventOutboxRepository(db);
  const results = await db.batch([
    ...messageOutbox.guardedStatementsFor(messages, delivery.deliveryId, workerId),
    eventOutbox.deliveredStatement(delivery.deliveryId, workerId, now),
  ]);
  return results.at(-1)?.meta.changes === 1;
}

/** Núcleo testeable: reclama y consume una tanda; no hace fetch externo. */
export async function dispatchEventOutbox(
  db: D1Database,
  options: Readonly<{
    now?: string;
    workerId?: string;
    operationId?: string;
    observability?: PlatformObservability;
  }> = {},
): Promise<Omit<OutboxDispatchResult, 'emailsSent'>> {
  const now = options.now ?? new Date().toISOString();
  const workerId = options.workerId ?? `outbox-${crypto.randomUUID()}`;
  const outbox = createD1EventOutboxRepository(db);
  const observability = options.observability ?? silentObservability;
  const operationId = options.operationId ?? workerId;
  const deliveries = await outbox.claim(now, workerId);
  let delivered = 0;
  let failed = 0;

  for (const delivery of deliveries) {
    try {
      if (await consume(db, delivery, workerId, now)) delivered += 1;
    } catch (error) {
      failed += 1;
      const operationalError = asOperationalError(error, 'outbox.consumer_failed');
      await outbox.fail(delivery, workerId, now, safeFailure(operationalError));
      observability.failure(operationalError, {
        operation: 'outbox',
        operationId,
        correlationId: delivery.event.correlation_id,
        causationId: delivery.event.event_id,
      });
    }
  }
  await outbox.purge(now);
  return Object.freeze({ claimed: deliveries.length, delivered, failed });
}

/** Disparador de runtime: demo no produce efectos; cliente despacha y envía. */
export async function flushEventOutbox(
  db: D1Database,
  env: DeliveryEnv,
  injectedObservability?: PlatformObservability,
): Promise<OutboxDispatchResult> {
  if (env.DEMO_MODE === 'true') {
    return Object.freeze({ claimed: 0, delivered: 0, failed: 0, emailsSent: 0 });
  }
  const observability = injectedObservability ?? createConsoleObservability();
  const operationId = createOperationId();
  const dispatchStarted = performance.now();
  let result: Omit<OutboxDispatchResult, 'emailsSent'>;
  try {
    result = await dispatchEventOutbox(db, { operationId, observability });
  } catch (error) {
    const operationalError = asOperationalError(error, 'outbox.consumer_failed');
    observability.failure(operationalError, {
      operation: 'outbox', operationId, durationMs: performance.now() - dispatchStarted,
    });
    throw operationalError;
  }
  if (result.claimed > 0 || result.failed > 0) {
    observability.metric({
      name: 'outbox.dispatch',
      operationId,
      ...result,
      durationMs: performance.now() - dispatchStarted,
    });
  }

  const emailStarted = performance.now();
  try {
    const email = await deliverPendingEmailBatch(db, env);
    if (email.claimed > 0) {
      observability.metric({
        name: 'email.delivery',
        operationId,
        ...email,
        durationMs: performance.now() - emailStarted,
      });
    }
    return Object.freeze({ ...result, emailsSent: email.delivered });
  } catch (error) {
    const operationalError = asOperationalError(error, 'email.delivery_failed');
    observability.failure(operationalError, {
      operation: 'email', operationId, durationMs: performance.now() - emailStarted,
    });
    throw operationalError;
  }
}
