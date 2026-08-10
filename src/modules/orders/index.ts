import { createOrderReaderService } from './application/order-reader';
import { createD1OrderReader } from './infrastructure/d1-order-reader';
import { createD1OrderWriter } from './infrastructure/d1-order-writer';

export type { OrderDetail, OrderEvent, OrderItem, OrderListQuery, OrderListRow, OrderStatusCount } from './application/order-reader';
export const createOrderReader = (db: D1Database) => createOrderReaderService(createD1OrderReader(db));

export {
  ORDER_ACTORS,
  ORDER_EVENT_TYPES,
  ORDER_EVENT_VERSION,
  orderCancelledEvent,
  orderCorrelationId,
  orderDeliveredEvent,
  orderPaidEvent,
  orderPlacedEvent,
  orderPlacedEventFromIdentity,
  orderShippedEvent,
  orderTimelineEntry,
  orderTimelineNote,
  type OrderCancellationReason,
  type OrderDomainEvent,
  type OrderEventType,
  type OrderPaidEvent,
  type OrderPaymentSource,
  type OrderPlacedEvent,
  type OrderTimelineEntry,
  type OrderTimelineFact,
  type OrderTracking,
} from './domain/order-events';

export {
  buildPaidMutation,
  stockAfterDecrement,
  type OrderForPayment,
  type OrderItemForPayment,
  type PaidMutation,
} from './domain/payment-transition';

export type { NewOrderInput, NewOrderLine, OrderForTransition } from './infrastructure/d1-order-writer';
export const createOrderWriter = (db: D1Database) => createD1OrderWriter(db);
