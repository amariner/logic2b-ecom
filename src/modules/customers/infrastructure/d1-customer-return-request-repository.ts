import type {
  CustomerReturnEligibilityLine,
  CustomerReturnEligibilityView,
  CustomerReturnReason,
  CustomerReturnRequestOutcome,
  CustomerReturnRequestRepository,
  CustomerReturnRequestView,
} from '../application/customer-return-request-repository';

type HeaderRow = Readonly<{
  id: string;
  public_ref: string;
  order_public_ref: string;
  requested_by_id: string;
  status: string;
  reason_code: CustomerReturnReason;
  version: number;
  requested_at: string;
  customer_payload_fingerprint: string | null;
}>;

type LineRow = Readonly<{ order_item_id: number; name: string; requested_quantity: number }>;
type EligibilityViewRow = Readonly<{
  order_public_ref: string;
  order_number: string;
  ownership_version: number;
  order_item_id: number;
  name: string;
  delivered_quantity: number;
  claimed_quantity: number;
  last_delivered_at: string;
}>;

function validEvidence(key: string, fingerprint: string): boolean {
  return key.trim() === key && key.length >= 8 && key.length <= 200 &&
    !/[\u0000-\u001f\u007f]/u.test(key) && /^[0-9a-f]{64}$/u.test(fingerprint);
}

function isExpectedWriteConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return [
    'customer_return_request_owner_conflict',
    'customer_return_line_eligibility_conflict',
    'return_line_quantity_conflict',
    'NOT NULL constraint failed: return_request_lines.order_id',
  ].some((token) => message.includes(token));
}

export function createD1CustomerReturnRequestRepository(
  db: D1Database,
): CustomerReturnRequestRepository {
  const lines = async (returnId: string): Promise<readonly LineRow[]> => {
    const result = await db.prepare(`SELECT line.order_item_id,
      item.name_snapshot AS name, line.requested_quantity
      FROM return_request_lines line JOIN order_items item ON item.id=line.order_item_id
      WHERE line.return_id=? ORDER BY line.order_item_id`)
      .bind(returnId).all<LineRow>();
    return Object.freeze(result.results.map((line) => Object.freeze(line)));
  };
  const view = async (row: HeaderRow): Promise<CustomerReturnRequestView> => Object.freeze({
    publicRef: row.public_ref,
    orderPublicRef: row.order_public_ref,
    status: row.status,
    reason: row.reason_code,
    version: row.version,
    requestedAt: row.requested_at,
    lines: Object.freeze((await lines(row.id)).map((line) => Object.freeze({
      orderItemId: line.order_item_id,
      name: line.name,
      requestedQuantity: line.requested_quantity,
    }))),
  });
  const byKey = (key: string) => db.prepare(`SELECT r.id, access.public_ref,
      order_access.public_ref AS order_public_ref, r.requested_by_id, r.status,
      r.reason_code, r.version, r.requested_at, r.customer_payload_fingerprint
    FROM return_requests r
    JOIN customer_return_access_refs access ON access.return_id=r.id
    JOIN customer_order_access_refs order_access ON order_access.order_id=r.order_id
    WHERE r.create_idempotency_key=? AND r.requested_by_kind='customer'`)
    .bind(key).first<HeaderRow>();
  const replay = async (key: string, owner: string, fingerprint: string): Promise<CustomerReturnRequestOutcome> => {
    const row = await byKey(key);
    if (row === null || row.requested_by_id !== owner || row.customer_payload_fingerprint !== fingerprint) {
      return Object.freeze({ outcome: 'conflict', request: null });
    }
    return Object.freeze({ outcome: 'replayed', request: await view(row) });
  };

  return Object.freeze({
    async eligibilityOwned(input: Parameters<CustomerReturnRequestRepository['eligibilityOwned']>[0]) {
      const result = await db.prepare(`SELECT oi.id AS orderItemId,
          COALESCE(oi.variant_id, pv.id) AS variantId,
          oi.unit_price_cents AS unitAmountCents,
          sum(fi.quantity) AS deliveredQuantity,
          COALESCE((SELECT sum(rl.requested_quantity)
            FROM return_request_lines rl JOIN return_requests claimed ON claimed.id=rl.return_id
            WHERE rl.order_item_id=oi.id AND claimed.status NOT IN ('rejected','cancelled')), 0) AS claimedQuantity,
          max(f.delivered_at) AS lastDeliveredAt
        FROM customer_order_access_refs access
        JOIN orders o ON o.id=access.order_id
        JOIN customer_profiles profile ON profile.id=o.customer_profile_id
        JOIN order_items oi ON oi.order_id=o.id
        JOIN fulfillment_items fi ON fi.order_item_id=oi.id
        JOIN fulfillments f ON f.id=fi.fulfillment_id AND f.status='delivered'
        JOIN product_variants pv ON pv.product_id=oi.product_id AND pv.is_default=1
        WHERE access.public_ref=? AND access.ownership_version=?
          AND o.customer_profile_id=? AND o.status='delivered'
          AND profile.status='active' AND profile.merged_into_profile_id IS NULL
        GROUP BY oi.id, COALESCE(oi.variant_id, pv.id), oi.unit_price_cents
        HAVING deliveredQuantity > claimedQuantity ORDER BY oi.id`)
        .bind(input.orderPublicRef, input.expectedOwnershipVersion, input.ownerProfileId)
        .all<CustomerReturnEligibilityLine>();
      return Object.freeze(result.results.map((line) => Object.freeze(line)));
    },
    async listOwned(ownerProfileId: string) {
      const result = await db.prepare(`SELECT r.id, access.public_ref,
          order_access.public_ref AS order_public_ref, r.requested_by_id, r.status,
          r.reason_code, r.version, r.requested_at, r.customer_payload_fingerprint
        FROM return_requests r
        JOIN customer_return_access_refs access ON access.return_id=r.id
        JOIN orders o ON o.id=r.order_id
        JOIN customer_order_access_refs order_access ON order_access.order_id=o.id
        JOIN customer_profiles profile ON profile.id=o.customer_profile_id
        WHERE r.requested_by_kind='customer' AND r.requested_by_id=?
          AND o.customer_profile_id=? AND profile.status='active'
          AND profile.merged_into_profile_id IS NULL
        ORDER BY r.requested_at DESC, r.id DESC LIMIT 50`)
        .bind(ownerProfileId, ownerProfileId).all<HeaderRow>();
      return Object.freeze(await Promise.all(result.results.map(view)));
    },
    async readOwned(ownerProfileId: string, publicRef: string) {
      const row = await db.prepare(`SELECT r.id, access.public_ref,
          order_access.public_ref AS order_public_ref, r.requested_by_id, r.status,
          r.reason_code, r.version, r.requested_at, r.customer_payload_fingerprint
        FROM customer_return_access_refs access
        JOIN return_requests r ON r.id=access.return_id
        JOIN orders o ON o.id=r.order_id
        JOIN customer_order_access_refs order_access ON order_access.order_id=o.id
        JOIN customer_profiles profile ON profile.id=o.customer_profile_id
        WHERE access.public_ref=? AND r.requested_by_kind='customer'
          AND r.requested_by_id=? AND o.customer_profile_id=?
          AND profile.status='active' AND profile.merged_into_profile_id IS NULL`)
        .bind(publicRef, ownerProfileId, ownerProfileId).first<HeaderRow>();
      return row === null ? null : view(row);
    },
    async listEligibilityOwned(ownerProfileId: string, observedAt: string) {
      const result = await db.prepare(`SELECT access.public_ref AS order_public_ref,
          o.order_number, access.ownership_version, oi.id AS order_item_id,
          oi.name_snapshot AS name, sum(fi.quantity) AS delivered_quantity,
          COALESCE((SELECT sum(rl.requested_quantity)
            FROM return_request_lines rl JOIN return_requests claimed ON claimed.id=rl.return_id
            WHERE rl.order_item_id=oi.id AND claimed.status NOT IN ('rejected','cancelled')), 0)
            AS claimed_quantity,
          max(f.delivered_at) AS last_delivered_at
        FROM customer_order_access_refs access
        JOIN orders o ON o.id=access.order_id
        JOIN customer_profiles profile ON profile.id=o.customer_profile_id
        JOIN order_items oi ON oi.order_id=o.id
        JOIN fulfillment_items fi ON fi.order_item_id=oi.id
        JOIN fulfillments f ON f.id=fi.fulfillment_id AND f.status='delivered'
        WHERE o.customer_profile_id=? AND o.status='delivered'
          AND profile.status='active' AND profile.merged_into_profile_id IS NULL
        GROUP BY access.public_ref, o.order_number, access.ownership_version,
          oi.id, oi.name_snapshot
        HAVING delivered_quantity > claimed_quantity
          AND julianday(?) - julianday(last_delivered_at) BETWEEN 0 AND 30
        ORDER BY max(f.delivered_at) DESC, o.id DESC, oi.id`)
        .bind(ownerProfileId, observedAt).all<EligibilityViewRow>();
      const groups = new Map<string, CustomerReturnEligibilityView>();
      for (const row of result.results) {
        const line = Object.freeze({
          orderItemId: row.order_item_id,
          name: row.name,
          availableQuantity: row.delivered_quantity - row.claimed_quantity,
          lastDeliveredAt: row.last_delivered_at,
        });
        const existing = groups.get(row.order_public_ref);
        if (existing) {
          groups.set(row.order_public_ref, Object.freeze({ ...existing,
            lines: Object.freeze([...existing.lines, line]) }));
        } else {
          groups.set(row.order_public_ref, Object.freeze({
            orderPublicRef: row.order_public_ref,
            orderNumber: row.order_number,
            ownershipVersion: row.ownership_version,
            lines: Object.freeze([line]),
          }));
        }
      }
      return Object.freeze([...groups.values()]);
    },
    async createOwned(input: Parameters<CustomerReturnRequestRepository['createOwned']>[0]) {
      if (!validEvidence(input.idempotencyKey, input.payloadFingerprint) ||
          input.lineIds.length !== input.plannedLines.length) {
        throw new RangeError('Evidencia de solicitud invalida.');
      }
      if (await byKey(input.idempotencyKey) !== null) {
        return replay(input.idempotencyKey, input.ownerProfileId, input.payloadFingerprint);
      }
      const statements: D1PreparedStatement[] = [
        db.prepare(`INSERT INTO audit_log (
          audit_id, occurred_at, actor_kind, actor_id, actor_label, action,
          entity_type, entity_id, entity_reference, correlation_id,
          source_event_id, diff_json, created_at
        ) VALUES (?, ?, 'customer', ?, NULL, 'customer.return_requested',
          'return_request', ?, ?, ?, ?, json_object('status', json_array(NULL, 'requested'),
          'line_count', json_array(0, ?)), ?)`)
          .bind(`audit_${input.id}`, input.occurredAt, input.ownerProfileId, input.id,
            input.returnNumber, input.idempotencyKey, `event_${input.id}`,
            input.plannedLines.length, input.occurredAt),
        db.prepare(`INSERT INTO return_requests (
          id, return_number, order_id, receive_location_id, status, reason_code,
          requested_by_kind, requested_by_id, version, create_idempotency_key,
          note, requested_at, created_at, updated_at, customer_payload_fingerprint,
          customer_ownership_version, customer_contract_version
        ) SELECT ?, ?, o.id, NULL, 'requested', ?, 'customer', ?, 1, ?, NULL,
          ?, ?, ?, ?, access.ownership_version, 1
          FROM customer_order_access_refs access
          JOIN orders o ON o.id=access.order_id
          JOIN customer_profiles profile ON profile.id=o.customer_profile_id
          WHERE access.public_ref=? AND access.ownership_version=?
            AND o.customer_profile_id=? AND o.status='delivered'
            AND profile.status='active' AND profile.merged_into_profile_id IS NULL`)
          .bind(input.id, input.returnNumber, input.reason, input.ownerProfileId,
            input.idempotencyKey, input.occurredAt, input.occurredAt, input.occurredAt,
            input.payloadFingerprint, input.orderPublicRef, input.expectedOwnershipVersion,
            input.ownerProfileId),
      ];
      input.plannedLines.forEach((line, index) => statements.push(db.prepare(`INSERT INTO return_request_lines (
        id, return_id, order_id, order_item_id, variant_id, requested_quantity,
        eligible_quantity, unit_amount_cents, created_at, updated_at
      ) VALUES (?, ?, (SELECT order_id FROM return_requests WHERE id=?), ?, ?, ?, ?, ?, ?, ?)`)
        .bind(input.lineIds[index], input.id, input.id, line.orderItemId, line.variantId,
          line.requestedQuantity, line.deliveredQuantity - line.claimedQuantity,
          line.unitAmountCents, input.occurredAt, input.occurredAt)));
      statements.push(db.prepare(`INSERT INTO return_events (
        return_id, transition, from_status, to_status, version_after, actor_kind,
        actor_id, idempotency_key, detail_json, occurred_at
      ) VALUES (?, 'created', NULL, 'requested', 1, 'customer', ?, ?,
        json_object('line_count', ?), ?)`)
        .bind(input.id, input.ownerProfileId, input.idempotencyKey,
          input.plannedLines.length, input.occurredAt));
      try {
        await db.batch(statements);
      } catch (error) {
        const raced = await replay(input.idempotencyKey, input.ownerProfileId, input.payloadFingerprint);
        if (raced.outcome === 'replayed' || isExpectedWriteConflict(error)) return raced;
        throw error;
      }
      const row = await byKey(input.idempotencyKey);
      return row === null
        ? Object.freeze({ outcome: 'conflict', request: null })
        : Object.freeze({ outcome: 'applied', request: await view(row) });
    },
  });
}
