import { getRateForZone } from '../lib/db';
import { computeShippingCents } from '../lib/pricing';
import { resolveZone } from '../lib/shipping';
import {
  createD1InventoryLedger,
  createD1InventoryReservations,
  type InventoryActorKind,
  type InventoryStockChange,
} from '../modules/inventory';
import {
  createD1OrderAmendments,
  createOrderWriter,
  orderAmendmentAppliedEvent,
  orderAmendmentExpiredEvent,
  orderAmendmentRequestedEvent,
  orderTimelineEntry,
  planOrderAmendment,
  type OrderAmendmentLineRequest,
  type OrderAmendmentRecord,
  type PlannedOrderAmendment,
} from '../modules/orders';
import {
  createD1PaymentLedger,
  createD1StoredValue,
  paymentSettlementCents,
  planStoredValueRefund,
  planRefundCaptureAllocations,
  type PaymentRefundGatewayResolver,
  type RefundGatewayStatus,
} from '../modules/payments';
import { createD1EventOutboxWriter } from '../platform/events';
import { createD1AuditLogWriter } from '../platform/operations';
import { createAuditDiff } from '../shared-kernel/audit';
import type { EmitEvent } from '../shared-kernel/events';
import { emitPlatformEvent } from './event-context';

export type OrderAmendmentAddress = Readonly<{
  name: string;
  phone: string | null;
  street: string;
  city: string;
  postal_code: string;
  nif: string | null;
  company: string | null;
}>;

export type OrderAmendmentPreviewInput = Readonly<{
  orderId: number;
  expectedVersion: number;
  lines: readonly OrderAmendmentLineRequest[];
  address?: OrderAmendmentAddress;
}>;

export type BeginOrderAmendmentInput = OrderAmendmentPreviewInput & Readonly<{
  amendmentId: string;
  reason: string;
  stripeSessionId?: string | null;
  expiresAt?: string | null;
}>;

export type OrderAmendmentOutcome =
  | 'applied'
  | 'ready'
  | 'expired'
  | 'cancelled'
  | 'pending_payment'
  | 'pending_refund'
  | 'processing'
  | 'failed'
  | 'requires_review'
  | 'already_applied'
  | 'not_found'
  | 'invalid_state'
  | 'gateway_unavailable'
  | 'conflict';

type OperationResult = Readonly<{
  outcome: OrderAmendmentOutcome;
  amendment: OrderAmendmentRecord | null;
}>;

function eventInput(amendment: OrderAmendmentRecord, changedLineCount: number) {
  return {
    order_id: amendment.order_id,
    order_number: amendment.order_number,
    amendment_id: amendment.id,
    delta_cents: amendment.delta_cents,
    currency: amendment.currency,
    changed_line_count: changedLineCount,
    address_changed: amendment.address_before_json !== amendment.address_after_json,
  } as const;
}

function addressJson(address: OrderAmendmentAddress, zone: string): string {
  return JSON.stringify({
    name: address.name,
    phone: address.phone,
    street: address.street,
    city: address.city,
    postal_code: address.postal_code,
    zone,
    nif: address.nif,
    company: address.company,
  });
}

function postalCodeOf(value: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new RangeError('la dirección actual no contiene JSON válido.');
  }
  if (typeof parsed !== 'object' || parsed === null ||
      typeof (parsed as { postal_code?: unknown }).postal_code !== 'string') {
    throw new RangeError('la dirección actual no contiene código postal.');
  }
  return (parsed as { postal_code: string }).postal_code;
}

function amendmentAudit(action: string, amendment: OrderAmendmentRecord) {
  return {
    action,
    diff: createAuditDiff(
      {
        edit_version: amendment.expected_order_version,
        total_cents: amendment.total_before_cents,
        amendment_status: null,
      },
      {
        edit_version: action === 'orders.amendment_applied'
          ? amendment.expected_order_version + 1
          : amendment.expected_order_version,
        total_cents: action === 'orders.amendment_applied'
          ? amendment.total_after_cents
          : amendment.total_before_cents,
        amendment_status: action.slice('orders.amendment_'.length),
      },
      ['edit_version', 'total_cents', 'amendment_status'],
    ),
  } as const;
}

export function createOrderAmendmentOperations(
  db: D1Database,
  resolveRefundGateway: PaymentRefundGatewayResolver,
  emit: EmitEvent = emitPlatformEvent,
) {
  const amendments = createD1OrderAmendments(db);
  const orders = createOrderWriter(db);
  const payments = createD1PaymentLedger(db);
  const storedValue = createD1StoredValue(db);
  const reservations = createD1InventoryReservations(db);
  const inventory = createD1InventoryLedger(db);
  const outbox = createD1EventOutboxWriter(db);
  const audit = createD1AuditLogWriter(db);

  async function preview(input: OrderAmendmentPreviewInput): Promise<PlannedOrderAmendment> {
    const context = await amendments.context(input.orderId);
    if (!context) throw new RangeError('pedido no encontrado.');
    if (context.order.edit_version !== input.expectedVersion) {
      throw new RangeError('el pedido cambió; vuelve a cargarlo.');
    }
    const existingIds = input.lines.flatMap((line) => 'order_item_id' in line ? [line.order_item_id] : []);
    const newVariantIds = input.lines.flatMap((line) => 'variant_id' in line ? [line.variant_id] : []);
    const [existingBundle, newBundle, existingPreorder, newPreorder] = await Promise.all([
      existingIds.length === 0 ? null : db.prepare(`SELECT 1 AS present
        FROM order_bundle_components WHERE order_item_id IN (${existingIds.map(() => '?').join(',')})
        LIMIT 1`).bind(...existingIds).first<{ present: number }>(),
      newVariantIds.length === 0 ? null : db.prepare(`SELECT 1 AS present FROM bundles bundle
        JOIN product_variants variant ON variant.product_id=bundle.product_id
        WHERE variant.id IN (${newVariantIds.map(() => '?').join(',')}) LIMIT 1`)
        .bind(...newVariantIds).first<{ present: number }>(),
      existingIds.length === 0 ? null : db.prepare(`SELECT 1 AS present
        FROM preorder_commitments WHERE order_item_id IN (${existingIds.map(() => '?').join(',')})
        LIMIT 1`).bind(...existingIds).first<{ present: number }>(),
      newVariantIds.length === 0 ? null : db.prepare(`SELECT 1 AS present
        FROM preorder_policies WHERE variant_id IN (${newVariantIds.map(() => '?').join(',')})
          AND state='active' LIMIT 1`).bind(...newVariantIds).first<{ present: number }>(),
    ]);
    if (existingBundle || newBundle) {
      throw new RangeError('la composición y cantidad de un bundle quedan congeladas en el pedido.');
    }
    if (existingPreorder || newPreorder) {
      throw new RangeError('la cantidad y promesa de una línea de preventa quedan congeladas en el pedido.');
    }
    const initialAddressJson = input.address
      ? addressJson(input.address, resolveZone(input.address.postal_code) ?? 'invalid')
      : context.order.address_json;
    const firstPass = planOrderAmendment({
      order: context.order,
      lines: context.lines,
      variants: context.variants,
      requestedLines: input.lines,
      addressAfterJson: initialAddressJson,
      shippingAfterCents: context.order.shipping_cents,
      hasActiveFulfillment: context.hasActiveFulfillment,
      hasActiveAmendment: context.hasActiveAmendment,
    });
    const postalCode = input.address?.postal_code ?? postalCodeOf(context.order.address_json);
    const zone = resolveZone(postalCode);
    if (!zone) throw new RangeError('no hay cobertura de envío para el código postal.');
    const rate = await getRateForZone(db, zone);
    if (!rate) throw new RangeError('no hay una tarifa activa para la zona de envío.');
    const canonicalAddressJson = input.address
      ? addressJson(input.address, zone)
      : context.order.address_json;
    return planOrderAmendment({
      order: context.order,
      lines: context.lines,
      variants: context.variants,
      requestedLines: input.lines,
      addressAfterJson: canonicalAddressJson,
      shippingAfterCents: computeShippingCents(firstPass.subtotal_after_cents, rate),
      hasActiveFulfillment: context.hasActiveFulfillment,
      hasActiveAmendment: context.hasActiveAmendment,
    });
  }

  async function restockStatements(
    amendment: OrderAmendmentRecord,
    eventId: string,
    occurredAt: string,
  ): Promise<readonly D1PreparedStatement[]> {
    const lines = await amendments.lines(amendment.id);
    const restock = lines.filter((line) => line.quantity_delta < 0);
    if (restock.length === 0) return [];
    const ids = restock.map((line) => line.variant_id);
    const placeholders = ids.map(() => '?').join(',');
    const { results: variants } = await db.prepare(`
      SELECT id AS variant_id, product_id, is_default
      FROM product_variants WHERE id IN (${placeholders})
    `).bind(...ids).all<{ variant_id: number; product_id: number; is_default: number }>();
    const variantById = new Map(variants.map((variant) => [variant.variant_id, variant] as const));
    const changes: InventoryStockChange[] = restock.map((line) => {
      const variant = variantById.get(line.variant_id);
      if (!variant || variant.product_id !== line.product_id) {
        throw new Error(`Variante ${line.variant_id}: snapshot de inventario incoherente.`);
      }
      return {
        variant_id: line.variant_id,
        product_id: line.product_id,
        is_default: Boolean(variant.is_default),
        delta: -line.quantity_delta,
      };
    });
    const balances = await inventory.balances(changes.map((change) => change.variant_id));
    return changes.flatMap((change) => {
      const balance = balances.get(change.variant_id);
      if (!balance) throw new Error(`Balance ausente para variante ${change.variant_id}.`);
      return inventory.movementStatements(balance, change, {
        delta: change.delta,
        reason: 'cancellation_restock',
        actor_kind: 'admin' as InventoryActorKind,
        actor_id: 'admin-panel',
        reference_type: 'order',
        reference_id: String(amendment.order_id),
        idempotency_key: `order:amendment:${amendment.id}:restock:${change.variant_id}`,
        correlation_id: `order:${amendment.order_number}`,
      }, occurredAt, { kind: 'event', id: eventId });
    });
  }

  async function apply(
    amendment: OrderAmendmentRecord,
    causationId: string | null,
    additionalCaptureReference?: string,
  ): Promise<OperationResult> {
    if (amendment.status === 'applied') return { outcome: 'already_applied', amendment };
    const lines = await amendments.lines(amendment.id);
    const occurredAt = new Date().toISOString();
    const event = orderAmendmentAppliedEvent(
      emit,
      eventInput(amendment, lines.length),
      { causationId, idempotencySuffix: amendment.id },
    );
    const statements: D1PreparedStatement[] = [
      outbox.guardedAmendmentEventStatement(event, {
        orderId: amendment.order_id,
        expectedOrderVersion: amendment.expected_order_version,
        amendmentId: amendment.id,
        amendmentStatus: amendment.status,
        amendmentVersion: amendment.version,
      }),
      audit.eventStatement(event.event_id, amendmentAudit('orders.amendment_applied', amendment)),
      orders.guardedTimelineStatement(amendment.order_id, orderTimelineEntry(event), event.event_id),
    ];
    if (amendment.delta_cents > 0) {
      const payment = await payments.findByOrderId(amendment.order_id);
      if (!payment || !additionalCaptureReference?.trim()) {
        return { outcome: 'invalid_state', amendment };
      }
      const reservation = await reservations.findForOwner(`amendment:${amendment.id}`);
      if (!reservation || reservation.status !== 'active') {
        return { outcome: 'invalid_state', amendment };
      }
      statements.push(
        ...payments.additionalCaptureStatements(payment, {
          amount_cents: amendment.delta_cents,
          provider_reference: additionalCaptureReference,
          idempotency_key: `r3:amendment:${amendment.id}:capture`,
          occurred_at: occurredAt,
        }, { eventId: event.event_id }),
        ...reservations.transitionStatements(
          reservation,
          'consumed',
          occurredAt,
          `inventory:reservation:amendment:${amendment.id}:consume`,
        ),
      );
    } else if (amendment.delta_cents < 0) {
      statements.push(...await restockStatements(amendment, event.event_id, occurredAt));
    }
    statements.push(...amendments.applyStatements({ amendment, eventId: event.event_id, occurredAt }));
    try {
      const results = await orders.commitResults(statements);
      const applied = results[0]?.meta.changes === 1 && results.at(-1)?.meta.changes === 1;
      return {
        outcome: applied ? 'applied' : 'conflict',
        amendment: await amendments.findById(amendment.id),
      };
    } catch {
      return { outcome: 'conflict', amendment: await amendments.findById(amendment.id) };
    }
  }

  async function begin(input: BeginOrderAmendmentInput): Promise<OperationResult> {
    const existing = await amendments.findById(input.amendmentId);
    if (existing) {
      return {
        outcome: existing.status === 'applied' ? 'already_applied' : existing.status,
        amendment: existing,
      };
    }
    const plan = await preview(input);
    if (plan.status === 'pending_payment' && (!input.stripeSessionId || !input.expiresAt)) {
      throw new RangeError('el cobro adicional exige una sesión alojada y su caducidad.');
    }
    const createdAt = new Date().toISOString();
    const event = orderAmendmentRequestedEvent(emit, {
      order_id: plan.order_id,
      order_number: plan.order_number,
      amendment_id: input.amendmentId,
      delta_cents: plan.delta_cents,
      currency: plan.currency,
      changed_line_count: plan.lines.length,
      address_changed: plan.address_changed,
    }, { idempotencySuffix: input.amendmentId });
    const statements: D1PreparedStatement[] = [
      ...amendments.intentStatements({
        id: input.amendmentId,
        plan,
        reason: input.reason,
        createdAt,
        ...(input.stripeSessionId === undefined ? {} : { stripeSessionId: input.stripeSessionId }),
        ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt }),
      }),
      outbox.guardedAmendmentEventStatement(event, {
        orderId: plan.order_id,
        expectedOrderVersion: plan.expected_order_version,
        amendmentId: input.amendmentId,
        amendmentStatus: plan.status,
        amendmentVersion: 1,
      }),
      audit.eventStatement(event.event_id, {
        action: 'orders.amendment_requested',
        diff: createAuditDiff(
          { amendment_id: null, total_cents: plan.total_before_cents },
          { amendment_id: input.amendmentId, total_cents: plan.total_after_cents },
          ['amendment_id', 'total_cents'],
        ),
      }),
      orders.guardedTimelineStatement(plan.order_id, orderTimelineEntry(event), event.event_id),
    ];
    if (plan.status === 'pending_payment') {
      statements.push(...await reservations.createForVariantStatements(
        `amendment:${input.amendmentId}`,
        plan.stock_increments.map((line) => ({ variant_id: line.variant_id, qty: line.quantity })),
        createdAt,
        { kind: 'event', id: event.event_id },
        { expiresAt: input.expiresAt! },
      ));
    }
    if (plan.status === 'pending_refund') {
      const payment = await payments.findByOrderId(plan.order_id);
      if (!payment) return { outcome: 'invalid_state', amendment: null };
      const storedApplication = await storedValue.refundableApplication(plan.order_id);
      const tenderPlan = planStoredValueRefund(-plan.delta_cents,
        storedApplication?.refundable_cents ?? 0);
      const allocations = tenderPlan.externalCents === 0 ? [] : planRefundCaptureAllocations(
        await payments.refundableCaptures(plan.order_id), tenderPlan.externalCents,
      );
      const refundKey = `r3:amendment:${input.amendmentId}:refund`;
      statements.push(...payments.createAdjustmentRefundIntentStatements(payment, {
        amendment_id: input.amendmentId,
        order_id: plan.order_id,
        reason: input.reason,
        occurred_at: createdAt,
        idempotency_key: refundKey,
        total_cents: -plan.delta_cents,
        allocations,
      }));
      if (tenderPlan.storedValueCents > 0) statements.push(storedValue.refundAllocationStatement(
        refundKey, tenderPlan.storedValueCents, createdAt,
      ));
    }
    try {
      const results = await orders.commitResults(statements);
      if (results[0]?.meta.changes !== 1) {
        return { outcome: 'conflict', amendment: await amendments.findById(input.amendmentId) };
      }
    } catch {
      return { outcome: 'conflict', amendment: await amendments.findById(input.amendmentId) };
    }
    const amendment = await amendments.findById(input.amendmentId);
    if (!amendment) return { outcome: 'conflict', amendment: null };
    if (amendment.status === 'ready') return apply(amendment, event.event_id);
    return { outcome: amendment.status, amendment };
  }

  async function confirmAdditionalPayment(
    stripeSessionId: string,
    paymentReference: string | null,
    causationId: string,
  ): Promise<OperationResult> {
    const amendment = await amendments.findByStripeSession(stripeSessionId);
    if (!amendment) return { outcome: 'not_found', amendment: null };
    if (amendment.status === 'applied') return { outcome: 'already_applied', amendment };
    if (amendment.status !== 'pending_payment' || !paymentReference) {
      return { outcome: 'invalid_state', amendment };
    }
    return apply(amendment, causationId, paymentReference);
  }

  async function reconcileRefund(amendmentId: string): Promise<OperationResult> {
    let amendment = await amendments.findById(amendmentId);
    if (!amendment) return { outcome: 'not_found', amendment: null };
    if (amendment.status === 'applied') return { outcome: 'already_applied', amendment };
    if (!['pending_refund', 'requires_review'].includes(amendment.status)) {
      return { outcome: 'invalid_state', amendment };
    }
    let payment = await payments.findByOrderId(amendment.order_id);
    let refund = await payments.findRefundByAmendmentId(amendment.id);
    if (!payment || !refund) return { outcome: 'invalid_state', amendment };
    const [allocations, storedAllocations] = await Promise.all([
      payments.refundAllocations(refund.id), storedValue.refundAllocations(refund.id),
    ]);
    if (allocations.length === 0 && storedAllocations.length === 0) {
      return { outcome: 'invalid_state', amendment };
    }
    const gateway = allocations.length > 0 ? resolveRefundGateway(payment.provider) : null;
    if (allocations.length > 0 && (!gateway || gateway.provider !== payment.provider)) {
      return { outcome: 'gateway_unavailable', amendment };
    }
    const occurredAt = new Date().toISOString();
    const statuses: RefundGatewayStatus[] = [];
    const outcomeStatements: D1PreparedStatement[] = [];
    for (const allocation of allocations) {
      if (allocation.status === 'succeeded') {
        statuses.push('succeeded');
        continue;
      }
      const result = await gateway!.refund({
        paymentReference: allocation.payment_reference,
        amountCents: allocation.amount_cents,
        currency: payment.currency,
        idempotencyKey: allocation.idempotency_key,
        existingRefundReference: allocation.provider_reference,
      });
      statuses.push(result.status);
      outcomeStatements.push(payments.refundAllocationOutcomeStatement(allocation, result, occurredAt));
    }
    if (outcomeStatements.length > 0) await db.batch(outcomeStatements);
    refund = await payments.findRefundByAmendmentId(amendment.id);
    amendment = await amendments.findById(amendment.id);
    if (!refund || !amendment) return { outcome: 'conflict', amendment };
    const unresolved = statuses.find((status) => status !== 'succeeded');
    if (unresolved) {
      const refundStatus = statuses.includes('requires_review')
        ? 'requires_review'
        : statuses.includes('failed')
          ? 'failed'
          : 'processing';
      const updates = [payments.refundStatusStatement(refund, refundStatus, occurredAt)];
      if (refundStatus !== 'processing') updates.push(amendments.reviewStatement(amendment, occurredAt));
      await db.batch(updates);
      return {
        outcome: refundStatus,
        amendment: await amendments.findById(amendment.id),
      };
    }
    const [currentAllocations, currentStoredAllocations] = await Promise.all([
      payments.refundAllocations(refund.id), storedValue.refundAllocations(refund.id),
    ]);
    payment = await payments.findByOrderId(amendment.order_id);
    if (!payment || currentAllocations.some((allocation) =>
      allocation.status !== 'processing' && allocation.status !== 'succeeded') ||
      currentStoredAllocations.some((allocation) =>
        allocation.status !== 'pending' && allocation.status !== 'succeeded')) {
      return { outcome: 'conflict', amendment };
    }
    const lines = await amendments.lines(amendment.id);
    const event = orderAmendmentAppliedEvent(
      emit,
      eventInput(amendment, lines.length),
      { causationId: currentAllocations.map((allocation) => allocation.provider_reference)
        .filter(Boolean).join(',') || `stored-value:${refund.id}` },
    );
    const paymentStatusAfter = payment.refunded_cents + refund.total_cents === paymentSettlementCents(payment)
      ? 'refunded'
      : 'partially_refunded';
    const statements: D1PreparedStatement[] = [
      outbox.guardedAmendmentEventStatement(event, {
        orderId: amendment.order_id,
        expectedOrderVersion: amendment.expected_order_version,
        amendmentId: amendment.id,
        amendmentStatus: amendment.status,
        amendmentVersion: amendment.version,
      }),
      audit.eventStatement(event.event_id, amendmentAudit('orders.amendment_applied', amendment)),
      orders.guardedTimelineStatement(amendment.order_id, orderTimelineEntry(event), event.event_id),
    ];
    for (const allocation of currentAllocations) {
      if (allocation.status === 'processing') {
        statements.push(...payments.refundAllocationSuccessStatements(
          allocation,
          occurredAt,
          { eventId: event.event_id },
        ));
      }
    }
    for (const allocation of currentStoredAllocations) {
      if (allocation.status === 'pending') {
        const account = await storedValue.findById(allocation.account_id);
        if (!account) return { outcome: 'conflict', amendment };
        statements.push(...storedValue.refundSuccessStatements(
          allocation, account, amendment.order_id, occurredAt, { eventId: event.event_id },
        ));
      }
    }
    statements.push(
      ...payments.completeAllocatedRefundStatements(
        payment,
        refund,
        paymentStatusAfter,
        occurredAt,
        { eventId: event.event_id },
      ),
      ...await restockStatements(amendment, event.event_id, occurredAt),
      ...amendments.applyStatements({ amendment, eventId: event.event_id, occurredAt }),
    );
    try {
      const results = await orders.commitResults(statements);
      return {
        outcome: results[0]?.meta.changes === 1 && results.at(-1)?.meta.changes === 1
          ? 'applied'
          : 'conflict',
        amendment: await amendments.findById(amendment.id),
      };
    } catch {
      return { outcome: 'conflict', amendment: await amendments.findById(amendment.id) };
    }
  }

  async function expire(stripeSessionId: string, causationId: string): Promise<OperationResult> {
    const amendment = await amendments.findByStripeSession(stripeSessionId);
    if (!amendment) return { outcome: 'not_found', amendment: null };
    if (amendment.status === 'expired') return { outcome: 'already_applied', amendment };
    if (amendment.status !== 'pending_payment') return { outcome: 'invalid_state', amendment };
    const reservation = await reservations.findForOwner(`amendment:${amendment.id}`);
    if (!reservation || reservation.status !== 'active') return { outcome: 'conflict', amendment };
    const lines = await amendments.lines(amendment.id);
    const occurredAt = new Date().toISOString();
    const event = orderAmendmentExpiredEvent(
      emit,
      eventInput(amendment, lines.length),
      { causationId },
    );
    try {
      const results = await orders.commitResults([
        outbox.guardedAmendmentEventStatement(event, {
          orderId: amendment.order_id,
          expectedOrderVersion: amendment.expected_order_version,
          amendmentId: amendment.id,
          amendmentStatus: 'pending_payment',
          amendmentVersion: amendment.version,
        }),
        audit.eventStatement(event.event_id, amendmentAudit('orders.amendment_expired', amendment)),
        orders.guardedTimelineStatement(amendment.order_id, orderTimelineEntry(event), event.event_id),
        ...reservations.transitionStatements(
          reservation,
          'expired',
          occurredAt,
          `inventory:reservation:amendment:${amendment.id}:expire`,
        ),
        amendments.expireStatement(amendment, event.event_id, occurredAt),
      ]);
      return {
        outcome: results[0]?.meta.changes === 1 && results.at(-1)?.meta.changes === 1
          ? 'applied'
          : 'conflict',
        amendment: await amendments.findById(amendment.id),
      };
    } catch {
      return { outcome: 'conflict', amendment: await amendments.findById(amendment.id) };
    }
  }

  return Object.freeze({
    preview,
    begin,
    confirmAdditionalPayment,
    reconcileRefund,
    expire,
    findById: amendments.findById,
  });
}

export type OrderAmendmentOperations = ReturnType<typeof createOrderAmendmentOperations>;
