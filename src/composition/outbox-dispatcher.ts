/** Composition root del dispatcher transaccional (R1.7). */

import { deliverPendingEmails } from '../lib/send-email';
import { createOrderReader } from '../modules/orders';
import { createOutboxWriter, orderNotificationsFor, type OrderEmailData } from '../modules/notifications';
import {
  createD1EventOutboxRepository,
  OUTBOX_POLICY,
  type ClaimedOutboxDelivery,
} from '../platform/events';

type DeliveryEnv = Readonly<{ DEMO_MODE: string; RESEND_API_KEY?: string }>;

export type OutboxDispatchResult = Readonly<{
  claimed: number;
  delivered: number;
  failed: number;
  emailsSent: number;
}>;

function safeFailure(error: unknown): Readonly<{ code: string; message: string }> {
  const rawCode = error instanceof Error ? error.name : 'consumer-error';
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
    throw new Error('invalid-order-entity');
  }
  const detail = await createOrderReader(db).detail(Number(delivery.event.entity.id));
  if (!detail) throw new Error('order-not-found');
  return {
    order_number: detail.order.order_number,
    customer_name: detail.order.customer_name,
    email: detail.order.email,
    subtotal_cents: detail.order.subtotal_cents,
    shipping_cents: detail.order.shipping_cents,
    total_cents: detail.order.total_cents,
    items: detail.items.map((item) => ({
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
  if (delivery.consumerId !== 'notifications') throw new Error('unknown-consumer');
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
  options: Readonly<{ now?: string; workerId?: string }> = {},
): Promise<Omit<OutboxDispatchResult, 'emailsSent'>> {
  const now = options.now ?? new Date().toISOString();
  const workerId = options.workerId ?? `outbox-${crypto.randomUUID()}`;
  const outbox = createD1EventOutboxRepository(db);
  const deliveries = await outbox.claim(now, workerId);
  let delivered = 0;
  let failed = 0;

  for (const delivery of deliveries) {
    try {
      if (await consume(db, delivery, workerId, now)) delivered += 1;
    } catch (error) {
      failed += 1;
      await outbox.fail(delivery, workerId, now, safeFailure(error));
    }
  }
  await outbox.purge(now);
  return Object.freeze({ claimed: deliveries.length, delivered, failed });
}

/** Disparador de runtime: demo no produce efectos; cliente despacha y envía. */
export async function flushEventOutbox(db: D1Database, env: DeliveryEnv): Promise<OutboxDispatchResult> {
  if (env.DEMO_MODE === 'true') {
    return Object.freeze({ claimed: 0, delivered: 0, failed: 0, emailsSent: 0 });
  }
  const result = await dispatchEventOutbox(db);
  const emailsSent = await deliverPendingEmails(db, env);
  return Object.freeze({ ...result, emailsSent });
}
