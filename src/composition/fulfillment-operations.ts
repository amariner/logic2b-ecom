import {
  createD1FulfillmentLedger,
  fulfillmentDeliveredEvent,
  fulfillmentShippedEvent,
  normalizeFulfillmentIdempotencyKey,
  normalizeFulfillmentTracking,
  planOutstandingFulfillment,
  planRequestedFulfillment,
  type FulfillmentAllocation,
  type FulfillmentTracking,
} from '../modules/fulfillment';
import { createOrderWriter, orderTimelineNote } from '../modules/orders';
import { createD1EventOutboxWriter } from '../platform/events';
import { createD1AuditLogWriter, type AuditEventProjection } from '../platform/operations';
import { createAuditDiff } from '../shared-kernel/audit';
import type { EmitEvent } from '../shared-kernel/events';
import { emitPlatformEvent } from './event-context';
import { runtimePlatform } from './runtime-platform';

export type ShipFulfillmentInput = Readonly<{
  orderId: number;
  tracking: FulfillmentTracking;
  allocations?: readonly FulfillmentAllocation[] | undefined;
  idempotencyKey: string;
}>;

export type FulfillmentMutationOutcome = Readonly<{
  outcome: 'applied' | 'replayed' | 'conflict';
  fulfillmentId: number | null;
  orderStatus: 'paid' | 'shipped' | 'delivered';
  remainingQuantity: number;
  queuedMessages: number;
}>;

function consumersFor(eventType: string): readonly string[] {
  return runtimePlatform.modules
    .filter((module) => module.descriptor.subscriptions.includes(eventType))
    .map((module) => module.descriptor.id);
}

function totalRemaining(lines: readonly Readonly<{
  ordered_quantity: number;
  cancelled_quantity: number;
  fulfilled_quantity: number;
}>[]): number {
  return lines.reduce(
    (sum, line) => sum + line.ordered_quantity - line.cancelled_quantity - line.fulfilled_quantity,
    0,
  );
}

function fulfillmentOrderStatus(status: string): 'paid' | 'shipped' | 'delivered' {
  if (status === 'shipped' || status === 'delivered') return status;
  return 'paid';
}

function isFulfillmentWriteConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('CHECK constraint failed') &&
    (message.includes('quantity') || message.includes('fulfillment_items'));
}

export function createFulfillmentOperations(
  db: D1Database,
  emit: EmitEvent = emitPlatformEvent,
) {
  const fulfillments = createD1FulfillmentLedger(db);
  const orders = createOrderWriter(db);
  const outbox = createD1EventOutboxWriter(db);
  const audit = createD1AuditLogWriter(db);

  return Object.freeze({
    async ship(input: ShipFulfillmentInput): Promise<FulfillmentMutationOutcome> {
      const order = await orders.findOrderForTransition(input.orderId);
      if (!order) {
        return Object.freeze({
          outcome: 'conflict', fulfillmentId: null, orderStatus: 'paid',
          remainingQuantity: 0, queuedMessages: 0,
        });
      }
      const tracking = normalizeFulfillmentTracking(input.tracking);
      const fulfillmentKey = normalizeFulfillmentIdempotencyKey(
        `r2:fulfillment:order:${order.id}:${input.idempotencyKey}`,
      );
      const replay = await fulfillments.findByIdempotencyKey(fulfillmentKey);
      if (replay) {
        const balances = await fulfillments.lineBalances(order.id);
        return Object.freeze({
          outcome: 'replayed',
          fulfillmentId: replay.id,
          orderStatus: fulfillmentOrderStatus(order.status),
          remainingQuantity: totalRemaining(balances),
          queuedMessages: 0,
        });
      }
      if (order.status !== 'paid') {
        return Object.freeze({
          outcome: 'conflict', fulfillmentId: null,
          orderStatus: fulfillmentOrderStatus(order.status),
          remainingQuantity: 0, queuedMessages: 0,
        });
      }

      const balances = await fulfillments.lineBalances(order.id);
      const expectedCommittedQuantity = balances.reduce(
        (sum, balance) => sum + balance.fulfilled_quantity + balance.cancelled_quantity,
        0,
      );
      const allocations = input.allocations === undefined
        ? planOutstandingFulfillment(balances)
        : planRequestedFulfillment(balances, input.allocations);
      const remainingQuantity = totalRemaining(balances) -
        allocations.reduce((sum, allocation) => sum + allocation.quantity, 0);
      const completesOrder = remainingQuantity === 0;
      const event = fulfillmentShippedEvent(emit, {
        order_id: order.id,
        order_number: order.order_number,
        tracking,
        allocations,
        remaining_quantity: remainingQuantity,
        idempotencyKey: fulfillmentKey,
      });
      const consumerIds = consumersFor(event.type);
      const statements: D1PreparedStatement[] = [
        outbox.guardedEventStatement(event, {
          orderId: order.id,
          expectedStatus: 'paid',
          requireNoActiveRefund: true,
          ignoreExistingIdempotencyKey: true,
        }),
        audit.eventStatement(event.event_id, shippedAuditProjection(allocations)),
        ...outbox.deliveryStatements(event.event_id, event.occurred_at, consumerIds),
        ...fulfillments.shipmentStatements({
          orderId: order.id,
          expectedOrderStatus: 'paid',
          expectedCommittedQuantity,
          eventId: event.event_id,
          idempotencyKey: fulfillmentKey,
          tracking,
          occurredAt: event.occurred_at,
          allocations,
        }),
        fulfillments.guardedShipmentProjectionStatement({
          orderId: order.id,
          expectedOrderStatus: 'paid',
          eventId: event.event_id,
          idempotencyKey: fulfillmentKey,
          tracking,
          completesOrder,
        }),
      ];
      if (completesOrder) {
        statements.push(orders.guardedTimelineStatement(order.id, {
          from_status: 'paid',
          to_status: 'shipped',
          note: orderTimelineNote({ to_status: 'shipped', tracking }),
        }, event.event_id));
      }
      let results: readonly D1Result[];
      try {
        results = await orders.commitResults(statements);
      } catch (error) {
        const storedAfterConflict = await fulfillments.findByIdempotencyKey(fulfillmentKey);
        if (storedAfterConflict) {
          const currentBalances = await fulfillments.lineBalances(order.id);
          return Object.freeze({
            outcome: 'replayed', fulfillmentId: storedAfterConflict.id,
            orderStatus: fulfillmentOrderStatus(
              (await orders.findOrderForTransition(order.id))?.status ?? order.status,
            ),
            remainingQuantity: totalRemaining(currentBalances), queuedMessages: 0,
          });
        }
        if (input.allocations !== undefined) {
          const currentBalances = await fulfillments.lineBalances(order.id);
          try {
            planRequestedFulfillment(currentBalances, input.allocations);
          } catch (conflict) {
            if (conflict instanceof RangeError) {
              return Object.freeze({
                outcome: 'conflict', fulfillmentId: null,
                orderStatus: fulfillmentOrderStatus(
                  (await orders.findOrderForTransition(order.id))?.status ?? order.status,
                ),
                remainingQuantity: totalRemaining(currentBalances), queuedMessages: 0,
              });
            }
          }
        }
        if (isFulfillmentWriteConflict(error)) {
          const currentBalances = await fulfillments.lineBalances(order.id);
          return Object.freeze({
            outcome: 'conflict', fulfillmentId: null,
            orderStatus: fulfillmentOrderStatus(
              (await orders.findOrderForTransition(order.id))?.status ?? order.status,
            ),
            remainingQuantity: totalRemaining(currentBalances), queuedMessages: 0,
          });
        }
        throw error;
      }
      const stored = await fulfillments.findByIdempotencyKey(fulfillmentKey);
      if (results[0]?.meta.changes !== 1) {
        return Object.freeze({
          outcome: stored ? 'replayed' : 'conflict',
          fulfillmentId: stored?.id ?? null,
          orderStatus: completesOrder ? 'shipped' : 'paid',
          remainingQuantity,
          queuedMessages: 0,
        });
      }
      if (!stored) throw new Error('el evento se confirmó sin materializar su fulfillment.');
      return Object.freeze({
        outcome: 'applied',
        fulfillmentId: stored.id,
        orderStatus: completesOrder ? 'shipped' : 'paid',
        remainingQuantity,
        queuedMessages: consumerIds.length,
      });
    },

    async deliver(fulfillmentId: number): Promise<FulfillmentMutationOutcome> {
      const fulfillment = await fulfillments.findById(fulfillmentId);
      if (!fulfillment) {
        return Object.freeze({
          outcome: 'conflict', fulfillmentId: null,
          orderStatus: 'paid', remainingQuantity: 0, queuedMessages: 0,
        });
      }
      const order = await orders.findOrderForTransition(fulfillment.order_id);
      if (fulfillment.status === 'delivered' && order) {
        const balances = await fulfillments.lineBalances(order.id);
        return Object.freeze({
          outcome: 'replayed', fulfillmentId: fulfillment.id,
          orderStatus: fulfillmentOrderStatus(order.status),
          remainingQuantity: totalRemaining(balances), queuedMessages: 0,
        });
      }
      if (fulfillment.status !== 'shipped') {
        return Object.freeze({
          outcome: 'conflict', fulfillmentId: fulfillment.id,
          orderStatus: order ? fulfillmentOrderStatus(order.status) : 'paid',
          remainingQuantity: 0, queuedMessages: 0,
        });
      }
      if (!order || (order.status !== 'paid' && order.status !== 'shipped')) {
        return Object.freeze({
          outcome: 'conflict', fulfillmentId: fulfillment.id,
          orderStatus: 'paid', remainingQuantity: 0, queuedMessages: 0,
        });
      }
      const balances = await fulfillments.lineBalances(order.id);
      const remainingQuantity = totalRemaining(balances);
      const event = fulfillmentDeliveredEvent(emit, {
        order_id: order.id,
        order_number: order.order_number,
        fulfillment_id: fulfillment.id,
      });
      const statements: D1PreparedStatement[] = [
        outbox.guardedEventStatement(event, {
          orderId: order.id,
          expectedStatus: order.status,
          ignoreExistingIdempotencyKey: true,
        }),
        audit.eventStatement(event.event_id, deliveredAuditProjection()),
        fulfillments.guardedDeliveryStatement({
          fulfillment,
          eventId: event.event_id,
          occurredAt: event.occurred_at,
        }),
        fulfillments.guardedDeliveryProjectionStatement({
          orderId: order.id,
          expectedOrderStatus: order.status,
          eventId: event.event_id,
          fulfillmentId: fulfillment.id,
        }),
        orders.guardedProjectedTimelineStatement(order.id, {
          from_status: 'shipped',
          to_status: 'delivered',
          note: orderTimelineNote({ to_status: 'delivered' }),
        }, event.event_id),
      ];
      const results = await orders.commitResults(statements);
      const stored = await fulfillments.findById(fulfillment.id);
      const projectedOrder = await orders.findOrderForTransition(order.id);
      const replayed = results[0]?.meta.changes !== 1 && stored?.status === 'delivered';
      return Object.freeze({
        outcome: results[0]?.meta.changes === 1 ? 'applied' : replayed ? 'replayed' : 'conflict',
        fulfillmentId: fulfillment.id,
        orderStatus: fulfillmentOrderStatus(projectedOrder?.status ?? order.status),
        remainingQuantity,
        queuedMessages: 0,
      });
    },
  });
}

function shippedAuditProjection(
  allocations: readonly FulfillmentAllocation[],
): AuditEventProjection {
  const quantity = allocations.reduce((sum, allocation) => sum + allocation.quantity, 0);
  return {
    action: 'fulfillments.shipped',
    diff: createAuditDiff(
      { status: null, line_count: 0, quantity: 0 },
      { status: 'shipped', line_count: allocations.length, quantity },
      ['status', 'line_count', 'quantity'],
    ),
  };
}

function deliveredAuditProjection(): AuditEventProjection {
  return {
    action: 'fulfillments.delivered',
    diff: createAuditDiff(
      { status: 'shipped' },
      { status: 'delivered' },
      ['status'],
    ),
  };
}

export type FulfillmentOperations = ReturnType<typeof createFulfillmentOperations>;
