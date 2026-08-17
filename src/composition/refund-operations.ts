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
  createD1StoredValue,
  paymentSettlementCents,
  planPartialRefund,
  planRefundCaptureAllocations,
  planTotalRefund,
  planStoredValueRefund,
  type PaymentLedgerEntry,
  type PaymentRefundGateway,
  type PartialRefundRequestLine,
  type PartialRefundShippingPolicy,
  type PaymentRefundGatewayResolver,
  type RefundRestockDecision,
  type RefundLedgerEntry,
  type RefundPaymentAllocationRecord,
  type StoredValueRefundAllocationRecord,
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
import { createD1Bundles, createD1Preorders } from '../modules/pricing';

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
  const storedValue = createD1StoredValue(db);
  const inventory = createD1InventoryLedger(db);
  const outbox = createD1EventOutboxWriter(db);
  const audit = createD1AuditLogWriter(db);
  const fulfillments = createD1FulfillmentLedger(db);
  const bundles = createD1Bundles(db);
  const preorders = createD1Preorders(db);

  async function preorderRefundAdjustments(
    event: OrderDomainEvent,
    orderId: number,
    quantities: ReadonlyMap<number, number>,
  ): Promise<Readonly<{
    physicalQuantities: ReadonlyMap<number, number>;
    statements: readonly D1PreparedStatement[];
  }>> {
    const commitments = await preorders.commitmentsForOrder(orderId);
    if (commitments.length === 0) return { physicalQuantities: quantities, statements: [] };
    const physicalQuantities = new Map(quantities);
    const statements: D1PreparedStatement[] = [];
    for (const commitment of commitments) {
      const requested = quantities.get(commitment.orderItemId) ?? 0;
      if (requested === 0) continue;
      const pendingDeferred = commitment.deferredQuantity - commitment.allocatedQuantity -
        commitment.cancelledQuantity;
      const activeDeferred = commitment.deferredQuantity - commitment.cancelledQuantity -
        commitment.restoredQuantity;
      const deferredCancellation = Math.min(requested, activeDeferred);
      const physicalCancellation = requested - Math.min(requested, pendingDeferred);
      physicalQuantities.set(commitment.orderItemId, physicalCancellation);
      if (deferredCancellation > 0) {
        statements.push(...preorders.cancellationStatements(
          commitment,
          deferredCancellation,
          event.occurred_at,
          event.event_id,
          event.idempotency_key,
        ));
      }
    }
    return Object.freeze({ physicalQuantities, statements: Object.freeze(statements) });
  }

  async function reconcileAllocations(
    payment: PaymentLedgerEntry,
    refund: RefundLedgerEntry,
    gateway: PaymentRefundGateway | null,
  ): Promise<
    | Readonly<{
        outcome: 'succeeded';
        refund: RefundLedgerEntry;
        allocations: readonly RefundPaymentAllocationRecord[];
        storedAllocations: readonly StoredValueRefundAllocationRecord[];
        causationId: string;
      }>
    | Readonly<{ outcome: 'processing' | 'failed' | 'requires_review' | 'conflict' }>
  > {
    const [allocations, storedAllocations] = await Promise.all([
      payments.refundAllocations(refund.id),
      storedValue.refundAllocations(refund.id),
    ]);
    if (allocations.length === 0 && storedAllocations.length === 0) return { outcome: 'conflict' };
    if (allocations.length > 0 && gateway === null) return { outcome: 'conflict' };
    const occurredAt = new Date().toISOString();
    const gatewayStatuses: Array<'succeeded' | 'processing' | 'failed' | 'requires_review'> = [];
    const outcomeStatements: D1PreparedStatement[] = [];
    for (const allocation of allocations) {
      if (allocation.status === 'succeeded') {
        gatewayStatuses.push('succeeded');
        continue;
      }
      const result = await gateway!.refund({
        paymentReference: allocation.payment_reference,
        amountCents: allocation.amount_cents,
        currency: payment.currency,
        idempotencyKey: allocation.idempotency_key,
        existingRefundReference: allocation.provider_reference,
      });
      gatewayStatuses.push(result.status);
      outcomeStatements.push(payments.refundAllocationOutcomeStatement(allocation, result, occurredAt));
    }
    if (outcomeStatements.length > 0) await db.batch(outcomeStatements);
    const unresolved = gatewayStatuses.find((status) => status !== 'succeeded');
    if (unresolved) {
      const status = gatewayStatuses.includes('requires_review')
        ? 'requires_review'
        : gatewayStatuses.includes('failed')
          ? 'failed'
          : 'processing';
      const current = await payments.findRefundByIdempotencyKey(refund.idempotency_key);
      if (!current) return { outcome: 'conflict' };
      const results = await db.batch([payments.refundStatusStatement(current, status, occurredAt)]);
      return results[0]?.meta.changes === 1 ? { outcome: status } : { outcome: 'conflict' };
    }
    const [currentRefund, currentAllocations, currentStoredAllocations] = await Promise.all([
      payments.findRefundByIdempotencyKey(refund.idempotency_key),
      payments.refundAllocations(refund.id),
      storedValue.refundAllocations(refund.id),
    ]);
    if (!currentRefund || currentAllocations.some((allocation) =>
      allocation.status !== 'processing' && allocation.status !== 'succeeded')) {
      return { outcome: 'conflict' };
    }
    return {
      outcome: 'succeeded',
      refund: currentRefund,
      allocations: currentAllocations,
      storedAllocations: currentStoredAllocations,
      causationId: currentAllocations
        .map((allocation) => allocation.provider_reference)
        .filter((reference): reference is string => Boolean(reference))
        .join(',') || `stored-value:${refund.id}`,
    };
  }

  async function restockStatements(
    event: OrderDomainEvent,
    items: readonly OrderItemForPayment[],
    quantities: ReadonlyMap<number, number>,
  ): Promise<readonly D1PreparedStatement[]> {
    const expanded = await bundles.expandRestockItems(
      Number(event.payload.order_id), items, quantities,
    );
    const byVariant = new Map<number, InventoryStockChange>();
    for (const { item, quantity } of expanded) {
      const current = byVariant.get(item.variant_id);
      if (current && (current.product_id !== item.product_id || current.is_default !== Boolean(item.is_default))) {
        throw new Error(`Variante ${item.variant_id}: líneas de inventario incompatibles.`);
      }
      byVariant.set(item.variant_id, {
        variant_id: item.variant_id,
        product_id: item.product_id,
        is_default: Boolean(item.is_default),
        delta: (current?.delta ?? 0) + quantity,
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
      if (order.status !== 'paid' ||
          (payment.status !== 'captured' && payment.status !== 'partially_refunded')) {
        return { outcome: 'invalid_state', queuedMessages: 0 };
      }
      if ((await fulfillments.listForOrder(order.id)).some((group) => group.status !== 'cancelled')) {
        // R2.13 resolverá cancelación/reembolso por cantidades. R2.12 nunca
        // repone ni abona como "total" unidades que ya salieron físicamente.
        return { outcome: 'invalid_state', queuedMessages: 0 };
      }
      const items = await orders.items(order.id);
      const preorderCommitments = await preorders.commitmentsForOrder(order.id);
      if (preorderCommitments.length > 0 && !input.restock) {
        return { outcome: 'invalid_state', queuedMessages: 0 };
      }
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
      const storedApplication = await storedValue.refundableApplication(order.id);
      const tenderPlan = planStoredValueRefund(
        planned.total_cents,
        storedApplication?.refundable_cents ?? 0,
      );
      const gateway = tenderPlan.externalCents > 0 ? resolveGateway(payment.provider) : null;
      if (tenderPlan.externalCents > 0 &&
          (!gateway || gateway.provider !== payment.provider || !payment.provider_reference?.trim())) {
        return { outcome: 'gateway_unavailable', queuedMessages: 0 };
      }
      const idempotencyKey = `r2:refund:order:${order.id}:total`;
      if (!refund) {
        const allocations = tenderPlan.externalCents === 0 ? [] : planRefundCaptureAllocations(
          await payments.refundableCaptures(order.id), tenderPlan.externalCents,
        );
        await orders.commitResults([
          ...payments.createTotalRefundIntentStatements(payment, {
          order_id: order.id,
          reason: input.reason,
          occurred_at: new Date().toISOString(),
          idempotency_key: idempotencyKey,
          planned,
          allocations,
          }),
          ...(tenderPlan.storedValueCents === 0 ? [] : [storedValue.refundAllocationStatement(
            idempotencyKey, tenderPlan.storedValueCents, new Date().toISOString(),
          )]),
        ]);
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

      const reconciled = await reconcileAllocations(payment, refund, gateway);
      if (reconciled.outcome !== 'succeeded') {
        return { outcome: reconciled.outcome, queuedMessages: 0 };
      }
      refund = reconciled.refund;

      const event = orderRefundedEvent(emit, {
        order_id: order.id,
        order_number: order.order_number,
        total_cents: refund.total_cents,
        currency: payment.currency,
        restock: refund.restock_decision === 'restock',
      }, { causationId: reconciled.causationId });
      const consumerIds = consumersFor(event.type);
      const requestedQuantities = new Map(
        planned.lines.map((line) => [line.order_item_id, line.quantity] as const),
      );
      const preorderAdjustments = await preorderRefundAdjustments(
        event, order.id, requestedQuantities,
      );
      const stockStatements = refund.restock_decision === 'restock'
        ? await restockStatements(
            event,
            items,
            preorderAdjustments.physicalQuantities,
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
        ...reconciled.allocations.flatMap((allocation) => allocation.status === 'processing'
          ? payments.refundAllocationSuccessStatements(
              allocation,
              event.occurred_at,
              { eventId: event.event_id },
            )
          : []),
        ...(await Promise.all(reconciled.storedAllocations
          .filter((allocation) => allocation.status === 'pending')
          .map(async (allocation) => {
            const account = await storedValue.findById(allocation.account_id);
            if (!account) throw new Error(`Saldo ${allocation.account_id} ausente.`);
            return storedValue.refundSuccessStatements(
              allocation, account, order.id, event.occurred_at, { eventId: event.event_id },
            );
          }))).flat(),
        ...payments.completeAllocatedRefundStatements(
          payment,
          refund,
          'refunded',
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
        ...preorderAdjustments.statements,
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
      const [items, balances] = await Promise.all([
        orders.items(order.id),
        fulfillments.lineBalances(order.id),
      ]);
      const preorderCommitments = await preorders.commitmentsForOrder(order.id);
      if (preorderCommitments.length > 0 && !input.restock) {
        return { outcome: 'invalid_state', queuedMessages: 0 };
      }
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

      const storedApplication = await storedValue.refundableApplication(order.id);
      const tenderPlan = planStoredValueRefund(
        planned.total_cents,
        storedApplication?.refundable_cents ?? 0,
      );
      const gateway = tenderPlan.externalCents > 0 ? resolveGateway(payment.provider) : null;
      if (tenderPlan.externalCents > 0 &&
          (!gateway || gateway.provider !== payment.provider || !payment.provider_reference?.trim())) {
        return { outcome: 'gateway_unavailable', queuedMessages: 0 };
      }

      if (!refund) {
        try {
          const allocations = tenderPlan.externalCents === 0 ? [] : planRefundCaptureAllocations(
            await payments.refundableCaptures(order.id), tenderPlan.externalCents,
          );
          const occurredAt = new Date().toISOString();
          await orders.commitResults([
            ...payments.createPartialRefundIntentStatements(payment, {
            order_id: order.id,
            reason: input.reason,
            occurred_at: occurredAt,
            idempotency_key: idempotencyKey,
            planned,
            allocations,
            }),
            ...(tenderPlan.storedValueCents === 0 ? [] : [storedValue.refundAllocationStatement(
              idempotencyKey, tenderPlan.storedValueCents, occurredAt,
            )]),
          ]);
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

      const reconciled = await reconcileAllocations(payment, refund, gateway);
      if (reconciled.outcome !== 'succeeded') {
        return { outcome: reconciled.outcome, queuedMessages: 0 };
      }
      refund = reconciled.refund;

      // Otra intención disjunta puede haber cerrado mientras el PSP respondía.
      // Se relee versión/saldo; la guarda atómica del evento decide el ganador.
      payment = await payments.findByOrderId(order.id) ?? payment;
      if (payment.status !== 'captured' && payment.status !== 'partially_refunded') {
        return { outcome: 'conflict', queuedMessages: 0 };
      }
      const paymentStatusAfter = payment.refunded_cents + refund.total_cents ===
        paymentSettlementCents(payment) ? 'refunded' : 'partially_refunded';
      if (payment.refunded_cents + refund.total_cents > paymentSettlementCents(payment)) {
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
      }, { causationId: reconciled.causationId });
      const consumerIds = consumersFor(event.type);
      const requestedQuantities = new Map(
        refundItems.map((line) => [line.order_item_id, line.quantity] as const),
      );
      const preorderAdjustments = await preorderRefundAdjustments(
        event, order.id, requestedQuantities,
      );
      const stockStatements = refund.restock_decision === 'restock'
        ? await restockStatements(
            event,
            items,
            preorderAdjustments.physicalQuantities,
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
        ...reconciled.allocations.flatMap((allocation) => allocation.status === 'processing'
          ? payments.refundAllocationSuccessStatements(
              allocation,
              event.occurred_at,
              { eventId: event.event_id },
            )
          : []),
        ...(await Promise.all(reconciled.storedAllocations
          .filter((allocation) => allocation.status === 'pending')
          .map(async (allocation) => {
            const account = await storedValue.findById(allocation.account_id);
            if (!account) throw new Error(`Saldo ${allocation.account_id} ausente.`);
            return storedValue.refundSuccessStatements(
              allocation, account, order.id, event.occurred_at, { eventId: event.event_id },
            );
          }))).flat(),
        ...payments.completeAllocatedRefundStatements(
          payment,
          refund,
          paymentStatusAfter,
          event.occurred_at,
          { eventId: event.event_id },
        ),
        orders.guardedTransitionStatement({
          orderId: order.id,
          from: 'paid',
          to: orderStatusAfter,
          tracking,
          eventId: event.event_id,
        }),
        orders.guardedTimelineStatement(order.id, orderTimelineEntry(event), event.event_id),
        ...preorderAdjustments.statements,
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
