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
