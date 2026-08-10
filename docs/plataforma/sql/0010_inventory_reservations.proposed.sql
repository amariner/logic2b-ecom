-- PROPUESTA HISTORICA R2.6 PARA LA PUERTA R2.8. NO ES UNA MIGRACION APLICABLE.
-- La implementación reforzada vive en migrations/0010_inventory_reservations.sql.
-- Decisión completa: ../adr/0014-ledger-inventario-global.md

CREATE TABLE inventory_reservations (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(trim(id)) BETWEEN 1 AND 120),
  owner_type TEXT NOT NULL CHECK (owner_type IN ('cart', 'checkout', 'order')),
  owner_id TEXT NOT NULL CHECK (length(trim(owner_id)) BETWEEN 1 AND 160),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'released', 'consumed', 'expired')),
  idempotency_key TEXT NOT NULL UNIQUE
    CHECK (length(trim(idempotency_key)) BETWEEN 1 AND 200),
  expires_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
    CHECK (typeof(version) = 'integer' AND version >= 1),
  released_at TEXT,
  consumed_at TEXT,
  expired_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (
    (status = 'active' AND released_at IS NULL AND consumed_at IS NULL AND expired_at IS NULL)
    OR (status = 'released' AND released_at IS NOT NULL AND consumed_at IS NULL AND expired_at IS NULL)
    OR (status = 'consumed' AND released_at IS NULL AND consumed_at IS NOT NULL AND expired_at IS NULL)
    OR (status = 'expired' AND released_at IS NULL AND consumed_at IS NULL AND expired_at IS NOT NULL)
  )
);

CREATE TABLE inventory_reservation_lines (
  reservation_id TEXT NOT NULL
    REFERENCES inventory_reservations(id) ON DELETE CASCADE,
  variant_id INTEGER NOT NULL
    REFERENCES product_variants(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL
    CHECK (typeof(quantity) = 'integer' AND quantity > 0),
  PRIMARY KEY (reservation_id, variant_id)
);

CREATE INDEX idx_inventory_reservations_expiry
  ON inventory_reservations(expires_at, id)
  WHERE status = 'active';

CREATE INDEX idx_inventory_reservation_lines_variant
  ON inventory_reservation_lines(variant_id, reservation_id);
