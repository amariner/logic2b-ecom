export {
  APPLY_INVENTORY_DELTA_SQL,
  INVENTORY_MOVEMENT_REASONS,
  INVENTORY_POLICY,
  INVENTORY_RESERVATION_STATES,
  availableStock,
  canTransitionReservation,
  planInventoryMovement,
} from './domain/inventory-ledger';

export {
  INVENTORY_RESERVATION_POLICY,
  assertReservationCreation,
  assertReservationTransition,
  reservationExpiry,
} from './domain/inventory-reservation';

export type {
  InventoryActorKind,
  InventoryBalance,
  InventoryMovementDraft,
  InventoryMovementReason,
  InventoryReservationState,
} from './domain/inventory-ledger';
export type {
  InventoryReservation,
  InventoryReservationLine,
  InventoryReservationOwnerType,
} from './domain/inventory-reservation';

export { createD1InventoryLedger } from './infrastructure/d1-inventory-ledger';
export { createD1InventoryReservations } from './infrastructure/d1-inventory-reservations';
export { createD1InventoryLocations, type InventoryLocationRecord } from './infrastructure/d1-inventory-locations';
export {
  createD1InventoryTransfers,
  type D1InventoryTransfers,
  type InventoryTransferDetail,
  type InventoryTransferLineRecord,
  type InventoryTransferRecord,
  type InventoryTransferStockOption,
} from './infrastructure/d1-inventory-transfers';
export {
  INVENTORY_TRANSFER_POLICY,
  INVENTORY_TRANSFER_STATUSES,
  assertInventoryTransferDraft,
  assertInventoryTransferReceipt,
  transferStatusAfterReceipt,
  type InventoryTransferLineDraft,
  type InventoryTransferReceiptDraft,
  type InventoryTransferStatus,
} from './domain/inventory-transfer';
export {
  INVENTORY_LOCATION_KINDS,
  INVENTORY_LOCATION_STATUSES,
  assertInventoryLocationInput,
  normalizeInventoryLocationCode,
  type InventoryLocationKind,
  type InventoryLocationStatus,
} from './domain/inventory-location';
export type {
  D1InventoryLedger,
  InventoryStockChange,
  InventoryWriteGuard,
} from './infrastructure/d1-inventory-ledger';
export type {
  D1InventoryReservations,
  ReservationGuard,
  ReservationSourceLine,
  VariantReservationSourceLine,
} from './infrastructure/d1-inventory-reservations';
