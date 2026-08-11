/**
 * Backfill R2.11 idempotente. El rehearsal valida la historia legacy antes de
 * ejecutar este SQL: una ausencia de lineas, tracking o eventos bloquea el
 * corte en vez de fabricar evidencia logistica.
 */
export function fulfillmentBackfillSql(): string {
  return `
INSERT INTO fulfillments (
  order_id, status, carrier, tracking_number, idempotency_key, version,
  shipped_at, delivered_at, created_at, updated_at
)
SELECT
  o.id,
  o.status,
  o.tracking_carrier,
  o.tracking_number,
  'r2:fulfillment:legacy:order:' || o.id,
  1,
  (SELECT e.created_at FROM order_events e
   WHERE e.order_id = o.id AND e.to_status = 'shipped'
   ORDER BY e.id LIMIT 1),
  CASE WHEN o.status = 'delivered' THEN (
    SELECT e.created_at FROM order_events e
    WHERE e.order_id = o.id AND e.to_status = 'delivered'
    ORDER BY e.id LIMIT 1
  ) ELSE NULL END,
  (SELECT e.created_at FROM order_events e
   WHERE e.order_id = o.id AND e.to_status = 'shipped'
   ORDER BY e.id LIMIT 1),
  CASE WHEN o.status = 'delivered' THEN (
    SELECT e.created_at FROM order_events e
    WHERE e.order_id = o.id AND e.to_status = 'delivered'
    ORDER BY e.id LIMIT 1
  ) ELSE (
    SELECT e.created_at FROM order_events e
    WHERE e.order_id = o.id AND e.to_status = 'shipped'
    ORDER BY e.id LIMIT 1
  ) END
FROM orders o
WHERE o.status IN ('shipped', 'delivered')
  AND NOT EXISTS (
    SELECT 1 FROM fulfillments f
    WHERE f.idempotency_key = 'r2:fulfillment:legacy:order:' || o.id
  )
ORDER BY o.id;

INSERT INTO fulfillment_items (
  fulfillment_id, order_id, order_item_id, quantity, created_at
)
SELECT f.id, o.id, oi.id, oi.qty, f.created_at
FROM orders o
JOIN fulfillments f
  ON f.idempotency_key = 'r2:fulfillment:legacy:order:' || o.id
JOIN order_items oi ON oi.order_id = o.id
WHERE o.status IN ('shipped', 'delivered')
  AND NOT EXISTS (
    SELECT 1 FROM fulfillment_items fi
    WHERE fi.fulfillment_id = f.id AND fi.order_item_id = oi.id
  )
ORDER BY o.id, oi.id;
`.trim() + '\n';
}
