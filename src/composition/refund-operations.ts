import {
  createOrderWriter,
  orderRefundedEvent,
  orderTimelineEntry,
  type OrderDomainEvent,
  type OrderItemForPayment,
} from '../modules/orders';
import {
  createD1PaymentLedger,
  planTotalRefund,
  type PaymentRefundGatewayResolver,
  type RefundRestockDecision,
} from '../modules/payments';
import {
  createD1InventoryLedger,
  type InventoryActorKind,
  type InventoryStockChange,
} from '../modules/inventory';
import { createD1EventOutboxWriter } from '../platform/events';
import { createD1AuditLogWriter } from '../platform/operations';
import { createAuditDiff } from '../shared-kernel/audit';
import type { EmitEvent } from '../shared-kernel/events';
import { emitPlatformEvent } from './event-context';
import { runtimePlatform } from './runtime-platform';
import { createD1FulfillmentLedger } from '../modules/fulfillment';

export type TotalRefundInput = Readonly<{
  orderId: number;
  reason: string;
  restock: boolean;
}>;

export type TotalRefundOutcome = Readonly<{
  outcome:
    | 'applied'
    | 'already_applied'
    | 'processing'
    | 'failed'
    | 'requires_review'
    | 'not_found'
    | 'invalid_state'
    | 'gateway_unavailable'
    | 'conflict';
  queuedMessages: number;
}>;

function consumersFor(eventType: string): readonly string[] {
  return runtimePlatform.modules
    .filter((module) => module.descriptor.subscriptions.includes(eventType))
    .map((module) => module.descriptor.id);
}

export function createRefundOperations(
  db: D1Database,
  resolveGateway: PaymentRefundGatewayResolver,
  emit: EmitEvent = emitPlatformEvent,
) {
  const orders = createOrderWriter(db);
  const payments = createD1PaymentLedger(db);
  const inventory = createD1InventoryLedger(db);
  const outbox = createD1EventOutboxWriter(db);
  const audit = createD1AuditLogWriter(db);
  const fulfillments = createD1FulfillmentLedger(db);

  async function restockStatements(
    event: OrderDomainEvent,
    items: readonly OrderItemForPayment[],
  ): Promise<readonly D1PreparedStatement[]> {
    const byVariant = new Map<number, InventoryStockChange>();
    for (const item of items) {
      const current = byVariant.get(item.variant_id);
      if (current && (current.product_id !== item.product_id || current.is_default !== Boolean(item.is_default))) {
        throw new Error(`Variante ${item.variant_id}: líneas de inventario incompatibles.`);
      }
      byVariant.set(item.variant_id, {
        variant_id: item.variant_id,
        product_id: item.product_id,
        is_default: Boolean(item.is_default),
        delta: (current?.delta ?? 0) + item.qty,
      });
    }
    const changes = [...byVariant.values()];
    const balances = await inventory.balances(changes.map((change) => change.variant_id));
    return changes.flatMap((change) => {
      const balance = balances.get(change.variant_id);
      if (!balance) throw new Error(`Balance de inventario ausente para variante ${change.variant_id}.`);
      return inventory.movementStatements(balance, change, {
        delta: change.delta,
        reason: 'cancellation_restock',
        actor_kind: event.actor.kind as InventoryActorKind,
        actor_id: event.actor.id,
        reference_type: 'order',
        reference_id: String(event.payload.order_id),
        idempotency_key: `${event.idempotency_key}:refund:variant:${change.variant_id}`,
        correlation_id: event.correlation_id,
      }, event.occurred_at, { kind: 'event', id: event.event_id });
    });
  }

  return Object.freeze({
    async refundTotal(input: TotalRefundInput): Promise<TotalRefundOutcome> {
      const order = await orders.findOrderForPaymentById(input.orderId);
      if (!order) return { outcome: 'not_found', queuedMessages: 0 };
      const payment = await payments.findByOrderId(order.id);
      if (!payment) throw new Error(`Pedido ${order.id}: intención de pago ausente.`);
      let refund = await payments.findRefundByOrderId(order.id);
      if (refund?.status === 'succeeded') {
        return order.status === 'cancelled'
          ? { outcome: 'already_applied', queuedMessages: 0 }
          : { outcome: 'conflict', queuedMessages: 0 };
      }
      if (order.status !== 'paid' || payment.status !== 'captured') {
        return { outcome: 'invalid_state', queuedMessages: 0 };
      }
      if ((await fulfillments.listForOrder(order.id)).some((group) => group.status !== 'cancelled')) {
        // R2.13 resolverá cancelación/reembolso por cantidades. R2.12 nunca
        // repone ni abona como "total" unidades que ya salieron físicamente.
        return { outcome: 'invalid_state', queuedMessages: 0 };
      }
      const gateway = resolveGateway(payment.provider);
      if (!gateway || gateway.provider !== payment.provider || !payment.provider_reference?.trim()) {
        return { outcome: 'gateway_unavailable', queuedMessages: 0 };
      }

      const items = await orders.items(order.id);
      const restockDecision: RefundRestockDecision = input.restock ? 'restock' : 'none';
      const planned = planTotalRefund(
        payment,
        order,
        items.map((item) => ({
          order_item_id: item.order_item_id,
          quantity: item.qty,
          amount_cents: item.unit_price_cents * item.qty,
        })),
        restockDecision,
      );
      const idempotencyKey = `r2:refund:order:${order.id}:total`;
      if (!refund) {
        await orders.commitResults(payments.createTotalRefundIntentStatements(payment, {
          order_id: order.id,
          reason: input.reason,
          occurred_at: new Date().toISOString(),
          idempotency_key: idempotencyKey,
          planned,
        }));
        refund = await payments.findRefundByOrderId(order.id);
      }
      if (!refund) return { outcome: 'conflict', queuedMessages: 0 };
      if (
        refund.idempotency_key !== idempotencyKey ||
        refund.total_cents !== planned.total_cents ||
        refund.restock_decision !== planned.restock_decision
      ) {
        return { outcome: 'conflict', queuedMessages: 0 };
      }

      const gatewayResult = await gateway.refundTotal({
        paymentReference: payment.provider_reference,
        amountCents: refund.total_cents,
        currency: payment.currency,
        idempotencyKey: refund.idempotency_key,
        existingRefundReference: refund.provider_reference,
      });
      const occurredAt = new Date().toISOString();
      if (gatewayResult.status !== 'succeeded') {
        const results = await db.batch([
          payments.refundGatewayOutcomeStatement(refund, gatewayResult, occurredAt),
        ]);
        if (results[0]?.meta.changes !== 1) return { outcome: 'conflict', queuedMessages: 0 };
        return { outcome: gatewayResult.status, queuedMessages: 0 };
      }

      const event = orderRefundedEvent(emit, {
        order_id: order.id,
        order_number: order.order_number,
        total_cents: refund.total_cents,
        currency: payment.currency,
        restock: refund.restock_decision === 'restock',
      }, { causationId: gatewayResult.providerReference });
      const consumerIds = consumersFor(event.type);
      const stockStatements = refund.restock_decision === 'restock'
        ? await restockStatements(event, items)
        : [];
      const results = await orders.commitResults([
        outbox.guardedEventStatement(event, { orderId: order.id, expectedStatus: 'paid' }),
        audit.eventStatement(event.event_id, {
          action: 'payments.refunded',
          diff: createAuditDiff(
            { status: 'paid', payment_status: 'captured', refunded_cents: 0, restock: null },
            {
              status: 'cancelled',
              payment_status: 'refunded',
              refunded_cents: refund.total_cents,
              restock: refund.restock_decision,
            },
            ['status', 'payment_status', 'refunded_cents', 'restock'],
          ),
        }),
        ...outbox.deliveryStatements(event.event_id, event.occurred_at, consumerIds),
        ...payments.refundSuccessStatements(
          payment,
          refund,
          gatewayResult.providerReference,
          event.occurred_at,
          { eventId: event.event_id },
        ),
        orders.guardedTransitionStatement({
          orderId: order.id,
          from: 'paid',
          to: 'cancelled',
          tracking: null,
          eventId: event.event_id,
        }),
        orders.guardedTimelineStatement(order.id, orderTimelineEntry(event), event.event_id),
        ...stockStatements,
      ]);
      if (results[0]?.meta.changes !== 1) {
        const current = await payments.findRefundByOrderId(order.id);
        return current?.status === 'succeeded'
          ? { outcome: 'already_applied', queuedMessages: 0 }
          : { outcome: 'conflict', queuedMessages: 0 };
      }
      return { outcome: 'applied', queuedMessages: consumerIds.length };
    },
  });
}

export type RefundOperations = ReturnType<typeof createRefundOperations>;
