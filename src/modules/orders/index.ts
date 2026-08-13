import { createOrderReaderService } from './application/order-reader';
import { createD1OrderReader } from './infrastructure/d1-order-reader';
import { createD1OrderWriter } from './infrastructure/d1-order-writer';

export {
  ORDER_LIST_DEFAULT_SORT,
  ORDER_LIST_MAX_LIMIT,
  ORDER_LIST_SORTS,
  decodeOrderListCursor,
  encodeOrderListCursor,
  type OrderDetail,
  type OrderEvent,
  type OrderHoldRead,
  type OrderItem,
  type OrderListCursor,
  type OrderListFilters,
  type OrderListPage,
  type OrderListQuery,
  type OrderListRow,
  type OrderListSort,
  type OrderNote,
  type OrderStatusCount,
  type OrderTag,
  type OrderTimelineItem,
} from './application/order-reader';
export const createOrderReader = (db: D1Database) => createOrderReaderService(createD1OrderReader(db));

export {
  ORDER_ACTORS,
  ORDER_EVENT_TYPES,
  ORDER_EVENT_VERSION,
  orderCancelledEvent,
  orderAmendmentAppliedEvent,
  orderAmendmentExpiredEvent,
  orderAmendmentRequestedEvent,
  orderCorrelationId,
  orderDeliveredEvent,
  orderHoldAssignedEvent,
  orderHoldCreatedEvent,
  orderHoldResolvedEvent,
  orderPaidEvent,
  orderPartiallyRefundedEvent,
  orderPlacedEvent,
  orderPlacedEventFromIdentity,
  orderRefundedEvent,
  orderShippedEvent,
  orderTimelineEntry,
  orderTimelineNote,
  type OrderCancellationReason,
  type OrderAmendmentAppliedEvent,
  type OrderAmendmentExpiredEvent,
  type OrderAmendmentPayload,
  type OrderAmendmentRequestedEvent,
  type OrderDomainEvent,
  type OrderEventType,
  type OrderHoldAssignedEvent,
  type OrderHoldAssignedPayload,
  type OrderHoldCreatedEvent,
  type OrderHoldCreatedPayload,
  type OrderHoldEvent,
  type OrderHoldResolvedEvent,
  type OrderHoldResolvedPayload,
  type OrderPaidEvent,
  type OrderPartiallyRefundedEvent,
  type OrderPartiallyRefundedPayload,
  type OrderPaymentSource,
  type OrderPlacedEvent,
  type OrderRefundedEvent,
  type OrderTimelineEntry,
  type OrderTimelineFact,
  type OrderTracking,
} from './domain/order-events';

export {
  planOrderAmendment,
  type EditableOrderLineSnapshot,
  type EditableOrderSnapshot,
  type OrderAmendmentLineRequest,
  type OrderAmendmentStatus,
  type OrderAmendmentVariant,
  type PlannedOrderAmendment,
  type PlannedOrderAmendmentLine,
} from './domain/order-amendment';

export {
  ORDER_HOLD_REASON_CODES,
  ORDER_HOLD_RESOLUTION_CODES,
  ORDER_HOLD_SOURCES,
  activeOrderHoldIds,
  assertOrderPreparationAllowed,
  orderHoldSlaState,
  planOrderHold,
  planOrderHoldAssignment,
  planOrderHoldResolution,
  type OrderHoldOwner,
  type OrderHoldReasonCode,
  type OrderHoldResolutionCode,
  type OrderHoldSlaState,
  type OrderHoldSnapshot,
  type OrderHoldSource,
  type PlannedOrderHold,
  type PlannedOrderHoldAssignment,
  type PlannedOrderHoldResolution,
} from './domain/order-hold';

export {
  ORDER_BULK_ACTION_TYPES,
  ORDER_BULK_EXECUTION_OUTCOMES,
  ORDER_BULK_LIMITS,
  ORDER_BULK_PREVIEW_REASONS,
  assertOrderBulkPreviewCurrent,
  createOrderBulkPreview,
  orderBulkRowIdempotencyKey,
  summarizeOrderBulkExecution,
  type OrderBulkAction,
  type OrderBulkActionType,
  type OrderBulkCandidate,
  type OrderBulkExecutionOutcome,
  type OrderBulkExecutionRow,
  type OrderBulkOrderStatus,
  type OrderBulkPreview,
  type OrderBulkPreviewReason,
  type OrderBulkPreviewRow,
} from './domain/order-bulk-action';

export {
  buildPaidMutation,
  stockAfterDecrement,
  type OrderForPayment,
  type OrderItemForPayment,
  type PaidMutation,
} from './domain/payment-transition';

export type { NewOrderInput, NewOrderLine, OrderForTransition } from './infrastructure/d1-order-writer';
export const createOrderWriter = (db: D1Database) => createD1OrderWriter(db);

export {
  createD1OrderAmendments,
  type D1OrderAmendments,
  type OrderAmendmentContext,
  type OrderAmendmentRecord,
} from './infrastructure/d1-order-amendments';

export {
  createD1OrderCollaboration,
  normalizeOrderTagSlug,
  type OrderCollaborationOutcome,
  type OrderNoteUpdate,
  type OrderNoteVisibility,
  type OrderNoteWrite,
  type OrderTagAction,
} from './infrastructure/d1-order-collaboration';

export {
  createD1OrderHolds,
  orderHoldSnapshot,
  type D1OrderHolds,
  type OrderHoldRecord,
} from './infrastructure/d1-order-holds';
