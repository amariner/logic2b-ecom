import {
  createOrderWriter,
  orderPartiallyRefundedEvent,
  orderRefundedEvent,
  orderTimelineEntry,
  type OrderDomainEvent,
  type OrderItemForPayment,
} from '../modules/orders';
import {
  createD1PaymentLedger,
  planPartialRefund,
  planTotalRefund,
  type PartialRefundRequestLine,
  type PartialRefundShippingPolicy,
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
import { shopConfig } from '../../shop.config';

export type TotalRefundInput = Readonly<{
  orderId: number;
  reason: string;
  restock: boolean;
}>;

export type PartialRefundInput = Readonly<{
  orderId: number;
  reason: string;
  restock: boolean;
  idempotencyKey: string;
  lines: readonly PartialRefundRequestLine[];
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

function normalizePartialRefundKey(orderId: number, value: string): string {
  const normalized = value.trim();
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(normalized)) {
    throw new RangeError('idempotency_key inválida.');
  }
  return `r2:refund:order:${orderId}:partial:${normalized}`;
}

function isPartialRefundWriteConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('refund_item_order_conflict') ||
    message.includes('refund_item_quantity_conflict') ||
    message.includes('UNIQUE constraint failed');
}

function consumersFor(eventType: string): readonly string[] {
  return runtimePlatform.modules
    .filter((module) => module.descriptor.subscriptions.includes(eventType))
    .map((module) => module.descriptor.id);
}

export function createRefundOperations(
  db: D1Database,
  resolveGateway: PaymentRefundGatewayResolver,
  emit: EmitEvent = emitPlatformEvent,
  partialShippingPolicy: PartialRefundShippingPolicy = shopConfig.refunds.partialShippingPolicy,
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
    quantities: ReadonlyMap<number, number>,
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
        delta: (current?.delta ?? 0) + (quantities.get(item.order_item_id) ?? 0),
      });
    }
    const changes = [...byVariant.values()].filter((change) => change.delta > 0);
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
      let refund = await payments.findTotalRefundByOrderId(order.id);
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
        refund = await payments.findTotalRefundByOrderId(order.id);
      }
      if (!refund) return { outcome: 'conflict', queuedMessages: 0 };
      if (
        refund.idempotency_key !== idempotencyKey ||
        refund.total_cents !== planned.total_cents ||
        refund.restock_decision !== planned.restock_decision
      ) {
        return { outcome: 'conflict', queuedMessages: 0 };
      }

      const gatewayResult = await gateway.refund({
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
        ? await restockStatements(
            event,
            items,
            new Map(planned.lines.map((line) => [line.order_item_id, line.quantity] as const)),
          )
        : [];
      const results = await orders.commitResults([
        outbox.guardedEventStatement(event, {
          orderId: order.id,
          expectedStatus: 'paid',
          payment: { id: payment.id, status: payment.status, version: payment.version },
          refund: { id: refund.id, status: refund.status, version: refund.version },
        }),
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
          'refunded',
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
        const current = await payments.findTotalRefundByOrderId(order.id);
        return current?.status === 'succeeded'
          ? { outcome: 'already_applied', queuedMessages: 0 }
          : { outcome: 'conflict', queuedMessages: 0 };
      }
      return { outcome: 'applied', queuedMessages: consumerIds.length };
    },

    async refundPartial(input: PartialRefundInput): Promise<TotalRefundOutcome> {
      const order = await orders.findOrderForPaymentById(input.orderId);
      if (!order) return { outcome: 'not_found', queuedMessages: 0 };
      let payment = await payments.findByOrderId(order.id);
      if (!payment) throw new Error(`Pedido ${order.id}: intención de pago ausente.`);
      if (order.status !== 'paid' ||
          (payment.status !== 'captured' && payment.status !== 'partially_refunded')) {
        return { outcome: 'invalid_state', queuedMessages: 0 };
      }
      const idempotencyKey = normalizePartialRefundKey(order.id, input.idempotencyKey);
      let refund = await payments.findRefundByIdempotencyKey(idempotencyKey);
      if (refund?.status === 'succeeded') {
        return { outcome: 'already_applied', queuedMessages: 0 };
      }
      if (refund && refund.operation_type !== 'partial_cancellation') {
        return { outcome: 'conflict', queuedMessages: 0 };
      }
      const gateway = resolveGateway(payment.provider);
      if (!gateway || gateway.provider !== payment.provider || !payment.provider_reference?.trim()) {
        return { outcome: 'gateway_unavailable', queuedMessages: 0 };
      }

      const [items, balances] = await Promise.all([
        orders.items(order.id),
        fulfillments.lineBalances(order.id),
      ]);
      const balanceByItem = new Map(balances.map((line) => [line.order_item_id, line] as const));
      const restockDecision: RefundRestockDecision = input.restock ? 'restock' : 'none';
      let planned;
      try {
        planned = planPartialRefund(
          payment,
          order,
          items.map((item) => {
            const balance = balanceByItem.get(item.order_item_id);
            if (!balance) throw new RangeError('saldo de fulfillment ausente.');
            return {
              order_item_id: item.order_item_id,
              unit_price_cents: item.unit_price_cents,
              ordered_quantity: balance.ordered_quantity,
              fulfilled_quantity: balance.fulfilled_quantity,
              cancelled_quantity: balance.cancelled_quantity,
            };
          }),
          input.lines,
          restockDecision,
          partialShippingPolicy,
        );
      } catch (error) {
        if (error instanceof RangeError) return { outcome: 'invalid_state', queuedMessages: 0 };
        throw error;
      }

      if (!refund) {
        try {
          await orders.commitResults(payments.createPartialRefundIntentStatements(payment, {
            order_id: order.id,
            reason: input.reason,
            occurred_at: new Date().toISOString(),
            idempotency_key: idempotencyKey,
            planned,
          }));
        } catch (error) {
          const raced = await payments.findRefundByIdempotencyKey(idempotencyKey);
          if (!raced && isPartialRefundWriteConflict(error)) {
            return { outcome: 'conflict', queuedMessages: 0 };
          }
          if (!raced) throw error;
        }
        refund = await payments.findRefundByIdempotencyKey(idempotencyKey);
      }
      if (!refund) return { outcome: 'conflict', queuedMessages: 0 };
      const refundItems = await payments.refundItems(refund.id);
      const expectedLines = [...planned.lines].sort((a, b) => a.order_item_id - b.order_item_id);
      if (
        refund.operation_type !== 'partial_cancellation' ||
        refund.subtotal_cents !== planned.subtotal_cents ||
        refund.shipping_cents !== planned.shipping_cents ||
        refund.total_cents !== planned.total_cents ||
        refund.restock_decision !== planned.restock_decision ||
        refundItems.length !== expectedLines.length ||
        refundItems.some((line, index) => {
          const expected = expectedLines[index];
          return !expected || line.order_item_id !== expected.order_item_id ||
            line.quantity !== expected.quantity || line.amount_cents !== expected.amount_cents ||
            line.restock_decision !== planned.restock_decision;
        })
      ) {
        return { outcome: 'conflict', queuedMessages: 0 };
      }

      const gatewayResult = await gateway.refund({
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

      // Otra intención disjunta puede haber cerrado mientras el PSP respondía.
      // Se relee versión/saldo; la guarda atómica del evento decide el ganador.
      payment = await payments.findByOrderId(order.id) ?? payment;
      if (payment.status !== 'captured' && payment.status !== 'partially_refunded') {
        return { outcome: 'conflict', queuedMessages: 0 };
      }
      const paymentStatusAfter = payment.refunded_cents + refund.total_cents ===
        payment.expected_amount_cents ? 'refunded' : 'partially_refunded';
      if (payment.refunded_cents + refund.total_cents > payment.expected_amount_cents) {
        return { outcome: 'requires_review', queuedMessages: 0 };
      }
      const [currentBalances, groups] = await Promise.all([
        fulfillments.lineBalances(order.id),
        fulfillments.listForOrder(order.id),
      ]);
      const selectedQuantity = refundItems.reduce((sum, line) => sum + line.quantity, 0);
      const remainingQuantity = currentBalances.reduce(
        (sum, line) => sum + line.ordered_quantity - line.cancelled_quantity - line.fulfilled_quantity,
        0,
      ) - selectedQuantity;
      if (remainingQuantity < 0) return { outcome: 'conflict', queuedMessages: 0 };
      const activeGroups = groups.filter((group) => group.status !== 'cancelled');
      const orderStatusAfter = remainingQuantity > 0
        ? 'paid'
        : activeGroups.length === 0
          ? 'cancelled'
          : activeGroups.every((group) => group.status === 'delivered')
            ? 'delivered'
            : 'shipped';
      const tracking = activeGroups.length === 1 && activeGroups[0]?.carrier &&
        activeGroups[0]?.tracking_number
        ? { carrier: activeGroups[0].carrier, number: activeGroups[0].tracking_number }
        : null;
      const event = orderPartiallyRefundedEvent(emit, {
        order_id: order.id,
        order_number: order.order_number,
        to_status: orderStatusAfter,
        refund_id: refund.id,
        subtotal_cents: refund.subtotal_cents,
        shipping_cents: refund.shipping_cents,
        total_cents: refund.total_cents,
        currency: payment.currency,
        restock: refund.restock_decision === 'restock',
        allocations: refundItems.map((line) => ({
          order_item_id: line.order_item_id,
          quantity: line.quantity,
        })),
        remaining_quantity: remainingQuantity,
      }, { causationId: gatewayResult.providerReference });
      const consumerIds = consumersFor(event.type);
      const stockStatements = refund.restock_decision === 'restock'
        ? await restockStatements(
            event,
            items,
            new Map(refundItems.map((line) => [line.order_item_id, line.quantity] as const)),
          )
        : [];
      const results = await orders.commitResults([
        outbox.guardedEventStatement(event, {
          orderId: order.id,
          expectedStatus: 'paid',
          payment: { id: payment.id, status: payment.status, version: payment.version },
          refund: { id: refund.id, status: refund.status, version: refund.version },
        }),
        audit.eventStatement(event.event_id, {
          action: 'payments.partially_refunded',
          diff: createAuditDiff(
            {
              status: 'paid', payment_status: payment.status,
              refunded_cents: payment.refunded_cents, restock: null,
            },
            {
              status: orderStatusAfter, payment_status: paymentStatusAfter,
              refunded_cents: payment.refunded_cents + refund.total_cents,
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
          paymentStatusAfter,
        ),
        orders.guardedTransitionStatement({
          orderId: order.id,
          from: 'paid',
          to: orderStatusAfter,
          tracking,
          eventId: event.event_id,
        }),
        orders.guardedTimelineStatement(order.id, orderTimelineEntry(event), event.event_id),
        ...stockStatements,
      ]);
      if (results[0]?.meta.changes !== 1) {
        const current = await payments.findRefundByIdempotencyKey(idempotencyKey);
        return current?.status === 'succeeded'
          ? { outcome: 'already_applied', queuedMessages: 0 }
          : { outcome: 'conflict', queuedMessages: 0 };
      }
      return { outcome: 'applied', queuedMessages: consumerIds.length };
    },
  });
}

export type RefundOperations = ReturnType<typeof createRefundOperations>;
