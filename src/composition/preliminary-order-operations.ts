import {
  applyConfirmedPreliminaryOrderPayment,
  approvePreliminaryOrder,
  cancelPreliminaryOrder,
  convertPreliminaryOrder,
  createOrderWriter,
  createPreliminaryOrderDraft,
  expirePreliminaryOrder,
  issuePreliminaryOrder,
  orderPaidEvent,
  orderTimelineEntry,
  type PreliminaryOrder,
  type PreliminaryOrderConversionGate,
} from '../modules/orders';
import {
  createSimulatedHostedPaymentAdapter,
  planHostedPaymentLink,
  type HostedPaymentLinkPlan,
  type HostedPaymentLinkSession,
} from '../modules/checkout';
import { createD1InventoryReservations } from '../modules/inventory';
import { createD1EventOutboxWriter } from '../platform/events';
import { createD1AuditLogWriter } from '../platform/operations';
import { createAuditDiff, createAuditEntry, serializeAuditDiff } from '../shared-kernel/audit';
import { generateOrderNumber } from '../lib/orders';
import { emitPlatformEvent, reservePlatformEventIdentity } from './event-context';
import { runtimePlatform } from './runtime-platform';

type PreliminaryOrderRow = Readonly<{
  id: string;
  reference: string;
  email: string;
  customer_name: string;
  address_json: string;
  status: PreliminaryOrder['status'];
  payment_status: PreliminaryOrder['paymentStatus'];
  currency: string;
  subtotal_cents: number;
  shipping_cents: number;
  total_cents: number;
  deposit_cents: number;
  paid_cents: number;
  conversion_gate: PreliminaryOrderConversionGate;
  expires_at: string;
  version: number;
  issued_at: string | null;
  approved_at: string | null;
  converted_order_id: number | null;
  converted_at: string | null;
  created_at: string;
  updated_at: string;
}>;

type PreliminaryOrderLineRow = Readonly<{
  id: number;
  preliminary_order_id: string;
  product_id: number;
  variant_id: number;
  name_snapshot: string;
  sku_snapshot: string;
  unit_price_cents: number;
  quantity: number;
  line_subtotal_cents: number;
  discount_cents: number;
  line_total_cents: number;
  pricing_snapshot_json: string;
  created_at: string;
}>;

type PaymentLinkRow = Readonly<{
  id: string;
  preliminary_order_id: string;
  stage: HostedPaymentLinkPlan['stage'];
  amount_cents: number;
  currency: string;
  provider_adapter: string;
  provider_reference: string;
  status: 'active' | 'completed' | 'expired' | 'cancelled';
  expected_order_version: number;
  idempotency_key: string;
  expires_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}>;

type PaymentRow = Readonly<{
  id: string;
  preliminary_order_id: string;
  payment_link_id: string;
  stage: HostedPaymentLinkPlan['stage'];
  amount_cents: number;
  currency: string;
  provider_adapter: string;
  provider_event_reference: string;
  provider_payment_reference: string;
  payload_sha256: string;
  idempotency_key: string;
  occurred_at: string;
  created_at: string;
}>;

type VariantRow = Readonly<{
  variant_id: number;
  product_id: number;
  sku: string;
  title: string;
  price_cents: number;
  product_name: string;
}>;

export type CreatePreliminaryOrderInput = Readonly<{
  email: string;
  customerName: string;
  addressJson: string;
  currency: string;
  shippingCents: number;
  depositCents: number;
  conversionGate: PreliminaryOrderConversionGate;
  expiresAt: string;
  lines: readonly Readonly<{ variantId: number; quantity: number }>[];
  idempotencyKey: string;
}>;

const ADMIN_ACTOR = Object.freeze({
  kind: 'admin', id: 'admin:preliminary-orders', label: 'Panel de presupuestos',
} as const);

function aggregateOf(row: PreliminaryOrderRow): PreliminaryOrder {
  return Object.freeze({
    id: row.id,
    status: row.status,
    paymentStatus: row.payment_status,
    currency: row.currency,
    totalCents: row.total_cents,
    depositCents: row.deposit_cents,
    paidCents: row.paid_cents,
    conversionGate: row.conversion_gate,
    expiresAt: row.expires_at,
    version: row.version,
    issuedAt: row.issued_at,
    approvedAt: row.approved_at,
    convertedOrderId: row.converted_order_id,
    convertedAt: row.converted_at,
  });
}

async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function auditStatement(
  db: D1Database,
  entry: ReturnType<typeof createAuditEntry>,
  guardSql: string,
  guardBindings: readonly unknown[],
): D1PreparedStatement {
  return db.prepare(`INSERT INTO audit_log (
    audit_id, occurred_at, actor_kind, actor_id, actor_label, action,
    entity_type, entity_id, entity_reference, correlation_id, source_event_id,
    diff_json, created_at
  ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ? WHERE ${guardSql}`)
    .bind(
      entry.audit_id, entry.occurred_at, entry.actor.kind, entry.actor.id,
      entry.actor.label ?? null, entry.action, entry.entity.type, entry.entity.id,
      entry.entity.reference ?? null, entry.correlation_id,
      serializeAuditDiff(entry.diff), entry.occurred_at, ...guardBindings,
    );
}

function eventStatement(db: D1Database, input: Readonly<{
  id: string;
  eventType: 'created' | 'issued' | 'approved' | 'expired' | 'cancelled' | 'payment_confirmed' | 'converted';
  fromStatus: PreliminaryOrder['status'] | null;
  toStatus: PreliminaryOrder['status'];
  fromPaymentStatus: PreliminaryOrder['paymentStatus'] | null;
  toPaymentStatus: PreliminaryOrder['paymentStatus'];
  paymentId?: string | null;
  convertedOrderNumber?: string | null;
  amountCents?: number;
  versionAfter: number;
  idempotencyKey: string;
  occurredAt: string;
}>): D1PreparedStatement {
  return db.prepare(`INSERT INTO preliminary_order_events (
    preliminary_order_id, event_type, from_status, to_status,
    from_payment_status, to_payment_status, payment_id, converted_order_id,
    amount_cents, version_after, idempotency_key, occurred_at, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?,
    (SELECT id FROM orders WHERE order_number=?), ?, ?, ?, ?, ?)`)
    .bind(
      input.id, input.eventType, input.fromStatus, input.toStatus,
      input.fromPaymentStatus, input.toPaymentStatus, input.paymentId ?? null,
      input.convertedOrderNumber ?? null, input.amountCents ?? 0,
      input.versionAfter, input.idempotencyKey, input.occurredAt, input.occurredAt,
    );
}

function updateStatement(
  db: D1Database,
  current: PreliminaryOrderRow,
  next: PreliminaryOrder,
  eventKey: string,
  at: string,
  convertedOrderNumber: string | null = null,
): D1PreparedStatement {
  return db.prepare(`UPDATE preliminary_orders SET
    status=?, payment_status=?, paid_cents=?, version=?, issued_at=?, approved_at=?,
    converted_order_id=CASE WHEN ? IS NULL THEN converted_order_id
      ELSE (SELECT id FROM orders WHERE order_number=?) END,
    converted_at=?, updated_at=?
    WHERE id=? AND status=? AND payment_status=? AND version=?
      AND EXISTS (SELECT 1 FROM preliminary_order_events WHERE idempotency_key=?)`)
    .bind(
      next.status, next.paymentStatus, next.paidCents, next.version,
      next.issuedAt, next.approvedAt,
      convertedOrderNumber, convertedOrderNumber, next.convertedAt, at,
      current.id, current.status, current.payment_status, current.version, eventKey,
    );
}

function consumersFor(eventType: string): readonly string[] {
  return runtimePlatform.modules
    .filter((module) => module.descriptor.subscriptions.includes(eventType))
    .map((module) => module.descriptor.id);
}

function pricingSnapshot(variant: VariantRow, quantity: number): string {
  return JSON.stringify({
    schema: 1,
    source: 'preliminary-order',
    base_unit_price_cents: variant.price_cents,
    unit_price_cents: variant.price_cents,
    quantity,
    base_subtotal_cents: variant.price_cents * quantity,
    discount_cents: 0,
    subtotal_cents: variant.price_cents * quantity,
    applied_rule: null,
    evaluations: [],
  });
}

export function createPreliminaryOrderOperations(db: D1Database) {
  const adapter = createSimulatedHostedPaymentAdapter();
  const orderWriter = createOrderWriter(db);
  const outbox = createD1EventOutboxWriter(db);
  const audit = createD1AuditLogWriter(db);
  const reservations = createD1InventoryReservations(db);

  async function row(id: string): Promise<PreliminaryOrderRow | null> {
    return db.prepare('SELECT * FROM preliminary_orders WHERE id=?')
      .bind(id).first<PreliminaryOrderRow>();
  }

  async function lines(id: string): Promise<readonly PreliminaryOrderLineRow[]> {
    const result = await db.prepare(`SELECT * FROM preliminary_order_lines
      WHERE preliminary_order_id=? ORDER BY id`).bind(id).all<PreliminaryOrderLineRow>();
    return Object.freeze(result.results);
  }

  async function paymentLink(id: string): Promise<PaymentLinkRow | null> {
    return db.prepare('SELECT * FROM preliminary_order_payment_links WHERE id=?')
      .bind(id).first<PaymentLinkRow>();
  }

  async function settleConvertedOrder(quoteId: string): Promise<'applied' | 'duplicate' | 'not-ready'> {
    const quote = await row(quoteId);
    if (!quote?.converted_order_id || quote.payment_status !== 'paid') return 'not-ready';
    const order = await db.prepare(`SELECT id,order_number,status FROM orders WHERE id=?`)
      .bind(quote.converted_order_id)
      .first<{ id: number; order_number: string; status: string }>();
    if (!order) throw new Error('El pedido convertido no existe.');
    if (order.status === 'paid') return 'duplicate';
    if (order.status !== 'pending') return 'not-ready';
    const payment = await db.prepare(`SELECT id,status,version FROM payments WHERE order_id=?`)
      .bind(order.id).first<{ id: number; status: string; version: number }>();
    if (!payment || payment.status !== 'captured') return 'not-ready';
    const reservation = await reservations.findForOrder(order.order_number);
    if (!reservation || reservation.status !== 'active') return 'not-ready';
    const event = orderPaidEvent(emitPlatformEvent, {
      order_id: order.id,
      order_number: order.order_number,
      payment_intent: `preliminary:${quote.id}`,
      source: 'simulated',
    });
    const stockStatements = reservations.transitionStatements(
      reservation, 'consumed', event.occurred_at, `${event.idempotency_key}:reservation`,
    );
    const results = await db.batch([
      outbox.guardedEventStatement(event, { orderId: order.id, expectedStatus: 'pending' }),
      audit.eventStatement(event.event_id, {
        action: 'payments.confirmed',
        diff: createAuditDiff(
          { status: 'pending', payment_source: null },
          { status: 'paid', payment_source: 'simulated' },
          ['status', 'payment_source'],
        ),
      }),
      ...outbox.deliveryStatements(event.event_id, event.occurred_at, consumersFor(event.type)),
      orderWriter.guardedPaidStatement(order.id, `preliminary:${quote.id}`, event.event_id),
      ...stockStatements,
      orderWriter.guardedTimelineStatement(order.id, orderTimelineEntry(event), event.event_id),
    ]);
    return results[0]?.meta.changes === 1 ? 'applied' : 'duplicate';
  }

  return Object.freeze({
    async list() {
      const result = await db.prepare(`SELECT * FROM preliminary_orders
        ORDER BY created_at DESC, id DESC LIMIT 200`).all<PreliminaryOrderRow>();
      return Object.freeze(result.results.map((item) => Object.freeze({
        ...item,
        address_json: undefined,
      })));
    },

    async detail(id: string) {
      const current = await row(id);
      if (!current) return null;
      const [lineRows, linkResult, paymentResult, eventResult] = await Promise.all([
        lines(id),
        db.prepare(`SELECT * FROM preliminary_order_payment_links
          WHERE preliminary_order_id=? ORDER BY created_at,id`).bind(id).all<PaymentLinkRow>(),
        db.prepare(`SELECT * FROM preliminary_order_payments
          WHERE preliminary_order_id=? ORDER BY occurred_at,id`).bind(id).all<PaymentRow>(),
        db.prepare(`SELECT * FROM preliminary_order_events
          WHERE preliminary_order_id=? ORDER BY version_after,id`).bind(id).all(),
      ]);
      return Object.freeze({
        order: current,
        lines: lineRows,
        paymentLinks: Object.freeze(linkResult.results),
        payments: Object.freeze(paymentResult.results),
        events: Object.freeze(eventResult.results),
      });
    },

    async create(input: CreatePreliminaryOrderInput) {
      const duplicate = await db.prepare(`SELECT preliminary_order_id FROM preliminary_order_events
        WHERE idempotency_key=?`).bind(input.idempotencyKey)
        .first<{ preliminary_order_id: string }>();
      if (duplicate) return { outcome: 'duplicate' as const, id: duplicate.preliminary_order_id };
      if (input.lines.length < 1 || input.lines.length > 100) throw new RangeError('Líneas inválidas.');
      const quantities = new Map<number, number>();
      for (const item of input.lines) {
        if (!Number.isSafeInteger(item.variantId) || item.variantId < 1 ||
            !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 10_000) {
          throw new RangeError('Variante o cantidad inválida.');
        }
        quantities.set(item.variantId, (quantities.get(item.variantId) ?? 0) + item.quantity);
      }
      const variantIds = [...quantities.keys()];
      const variantsResult = await db.prepare(`SELECT variant.id AS variant_id,
        variant.product_id,variant.sku,variant.title,variant.price_cents,product.name AS product_name
        FROM product_variants variant JOIN products product ON product.id=variant.product_id
        WHERE variant.id IN (${variantIds.map(() => '?').join(',')})
          AND variant.status='active' AND product.active=1 ORDER BY variant.id`)
        .bind(...variantIds).all<VariantRow>();
      if (variantsResult.results.length !== variantIds.length) return { outcome: 'variant-not-found' as const };
      const subtotalCents = variantsResult.results.reduce(
        (sum, variant) => sum + variant.price_cents * quantities.get(variant.variant_id)!, 0,
      );
      if (!Number.isSafeInteger(input.shippingCents) || input.shippingCents < 0) {
        throw new RangeError('shippingCents inválido.');
      }
      const totalCents = subtotalCents + input.shippingCents;
      const hash = await sha256(input.idempotencyKey);
      const id = `quote_${hash.slice(0, 32)}`;
      const reference = `PRES-${hash.slice(0, 10).toUpperCase()}`;
      const draft = createPreliminaryOrderDraft({
        id, currency: input.currency, totalCents, depositCents: input.depositCents,
        conversionGate: input.conversionGate, expiresAt: input.expiresAt,
      });
      const at = new Date().toISOString();
      const identity = reservePlatformEventIdentity();
      const entry = createAuditEntry(identity, {
        actor: ADMIN_ACTOR,
        action: 'preliminary_orders.created',
        entity: { type: 'preliminary_order', id, reference },
        correlation_id: `preliminary-order:${id}`,
        diff: createAuditDiff(
          { status: null, total_cents: null, deposit_cents: null },
          { status: 'draft', total_cents: totalCents, deposit_cents: input.depositCents },
          ['status', 'total_cents', 'deposit_cents'],
        ),
      });
      const statements: D1PreparedStatement[] = [
        db.prepare(`INSERT INTO preliminary_orders (
          id,reference,email,customer_name,address_json,status,payment_status,currency,
          subtotal_cents,shipping_cents,total_cents,deposit_cents,paid_cents,
          conversion_gate,expires_at,version,created_at,updated_at
        ) VALUES (?,?,?,?,?,'draft','unpaid',?,?,?,?,?,0,?,?,1,?,?)`).bind(
          id, reference, input.email, input.customerName, input.addressJson,
          input.currency, subtotalCents, input.shippingCents, totalCents,
          input.depositCents, input.conversionGate, input.expiresAt, at, at,
        ),
        ...variantsResult.results.map((variant) => {
          const quantity = quantities.get(variant.variant_id)!;
          const lineSubtotal = variant.price_cents * quantity;
          return db.prepare(`INSERT INTO preliminary_order_lines (
            preliminary_order_id,product_id,variant_id,name_snapshot,sku_snapshot,
            unit_price_cents,quantity,line_subtotal_cents,discount_cents,
            line_total_cents,pricing_snapshot_json,created_at
          ) VALUES (?,?,?,?,?,?,?,?,0,?,?,?)`).bind(
            id, variant.product_id, variant.variant_id,
            variant.title.trim() ? `${variant.product_name} · ${variant.title}` : variant.product_name,
            variant.sku, variant.price_cents, quantity, lineSubtotal,
            lineSubtotal, pricingSnapshot(variant, quantity), at,
          );
        }),
        eventStatement(db, {
          id, eventType: 'created', fromStatus: null, toStatus: 'draft',
          fromPaymentStatus: null, toPaymentStatus: 'unpaid', versionAfter: 1,
          idempotencyKey: input.idempotencyKey, occurredAt: at,
        }),
        auditStatement(db, entry,
          'EXISTS (SELECT 1 FROM preliminary_order_events WHERE idempotency_key=?)',
          [input.idempotencyKey]),
      ];
      try {
        await db.batch(statements);
        return { outcome: 'created' as const, id: draft.id };
      } catch (error) {
        const replay = await db.prepare(`SELECT preliminary_order_id FROM preliminary_order_events
          WHERE idempotency_key=?`).bind(input.idempotencyKey)
          .first<{ preliminary_order_id: string }>();
        if (replay) return { outcome: 'duplicate' as const, id: replay.preliminary_order_id };
        throw error;
      }
    },

    async transition(input: Readonly<{
      id: string;
      expectedVersion: number;
      action: 'issue' | 'approve' | 'expire' | 'cancel';
      idempotencyKey: string;
      at?: string;
    }>) {
      const duplicate = await db.prepare(`SELECT preliminary_order_id FROM preliminary_order_events
        WHERE idempotency_key=?`).bind(input.idempotencyKey).first<{ preliminary_order_id: string }>();
      if (duplicate) return duplicate.preliminary_order_id === input.id ? 'duplicate' as const : 'conflict' as const;
      const current = await row(input.id);
      if (!current) return 'not-found' as const;
      if (current.version !== input.expectedVersion) return 'conflict' as const;
      const at = input.at ?? new Date().toISOString();
      const aggregate = aggregateOf(current);
      const next = input.action === 'issue' ? issuePreliminaryOrder(aggregate, at)
        : input.action === 'approve' ? approvePreliminaryOrder(aggregate, at)
          : input.action === 'expire' ? expirePreliminaryOrder(aggregate, at)
            : cancelPreliminaryOrder(aggregate);
      const eventType = input.action === 'cancel' ? 'cancelled' : `${input.action}d` as
        'issued' | 'approved' | 'expired';
      const identity = reservePlatformEventIdentity();
      const entry = createAuditEntry(identity, {
        actor: ADMIN_ACTOR,
        action: `preliminary_orders.${eventType}`,
        entity: { type: 'preliminary_order', id: current.id, reference: current.reference },
        correlation_id: `preliminary-order:${current.id}`,
        diff: createAuditDiff(
          { status: current.status, version: current.version },
          { status: next.status, version: next.version },
          ['status', 'version'],
        ),
      });
      const results = await db.batch([
        eventStatement(db, {
          id: current.id, eventType, fromStatus: current.status, toStatus: next.status,
          fromPaymentStatus: current.payment_status, toPaymentStatus: next.paymentStatus,
          versionAfter: next.version, idempotencyKey: input.idempotencyKey, occurredAt: at,
        }),
        updateStatement(db, current, next, input.idempotencyKey, at),
        auditStatement(db, entry,
          'EXISTS (SELECT 1 FROM preliminary_order_events WHERE idempotency_key=?)',
          [input.idempotencyKey]),
      ]);
      return results[0]?.meta.changes === 1 && results[1]?.meta.changes === 1
        ? 'applied' as const : 'conflict' as const;
    },

    async createPaymentLink(input: Readonly<{
      id: string;
      idempotencyKey: string;
      expiresAt: string;
      createdAt?: string;
    }>) {
      const existing = await db.prepare(`SELECT * FROM preliminary_order_payment_links
        WHERE idempotency_key=?`).bind(input.idempotencyKey).first<PaymentLinkRow>();
      if (existing) return { outcome: 'duplicate' as const, link: existing, session: null };
      const current = await row(input.id);
      if (!current) return { outcome: 'not-found' as const };
      const createdAt = input.createdAt ?? new Date().toISOString();
      const plan = planHostedPaymentLink({
        order: aggregateOf(current), providerAdapter: adapter.id,
        idempotencyKey: input.idempotencyKey, createdAt, expiresAt: input.expiresAt,
      });
      const session = await adapter.createSession(plan);
      const hash = await sha256(input.idempotencyKey);
      const linkId = `quote_link_${hash.slice(0, 32)}`;
      const identity = reservePlatformEventIdentity();
      const entry = createAuditEntry(identity, {
        actor: ADMIN_ACTOR,
        action: 'preliminary_orders.payment_link_created',
        entity: { type: 'preliminary_order', id: current.id, reference: current.reference },
        correlation_id: `preliminary-order:${current.id}`,
        diff: createAuditDiff(
          { payment_stage: null, amount_cents: null },
          { payment_stage: plan.stage, amount_cents: plan.amountCents },
          ['payment_stage', 'amount_cents'],
        ),
      });
      const results = await db.batch([
        db.prepare(`INSERT INTO preliminary_order_payment_links (
          id,preliminary_order_id,stage,amount_cents,currency,provider_adapter,
          provider_reference,status,expected_order_version,idempotency_key,
          expires_at,created_at,updated_at
        ) VALUES (?,?,?,?,?,?,?,'active',?,?,?,?,?)`).bind(
          linkId, current.id, plan.stage, plan.amountCents, plan.currency,
          adapter.id, session.providerReference, plan.preliminaryOrderVersion,
          plan.idempotencyKey, plan.expiresAt, createdAt, createdAt,
        ),
        auditStatement(db, entry,
          'EXISTS (SELECT 1 FROM preliminary_order_payment_links WHERE id=?)', [linkId]),
      ]);
      if (results[0]?.meta.changes !== 1) return { outcome: 'conflict' as const };
      const link = await paymentLink(linkId);
      if (!link) throw new Error('El enlace creado no se puede leer.');
      return { outcome: 'created' as const, link, session };
    },

    async confirmSimulatedPayment(input: Readonly<{ linkId: string; occurredAt?: string }>) {
      const link = await paymentLink(input.linkId);
      if (!link) return 'not-found' as const;
      const current = await row(link.preliminary_order_id);
      if (!current) return 'not-found' as const;
      const plan: HostedPaymentLinkPlan = Object.freeze({
        stage: link.stage, amountCents: link.amount_cents, currency: link.currency,
        preliminaryOrderVersion: link.expected_order_version,
        providerAdapter: link.provider_adapter, idempotencyKey: link.idempotency_key,
        expiresAt: link.expires_at,
      });
      const session: HostedPaymentLinkSession = Object.freeze({
        providerAdapter: link.provider_adapter, providerReference: link.provider_reference,
        url: '', expiresAt: link.expires_at,
      });
      const verified = await adapter.confirmInternally({
        plan, session, occurredAt: input.occurredAt ?? new Date().toISOString(),
      });
      const duplicate = await db.prepare(`SELECT preliminary_order_id FROM preliminary_order_payments
        WHERE provider_adapter=? AND provider_event_reference=?`)
        .bind(verified.providerAdapter, verified.providerEventReference)
        .first<{ preliminary_order_id: string }>();
      if (duplicate) {
        await settleConvertedOrder(duplicate.preliminary_order_id);
        return 'duplicate' as const;
      }
      if (link.status !== 'active' || current.version !== link.expected_order_version) return 'conflict' as const;
      const next = applyConfirmedPreliminaryOrderPayment(aggregateOf(current), verified.payment);
      const paymentHash = await sha256(verified);
      const paymentId = `quote_payment_${paymentHash.slice(0, 32)}`;
      const identity = reservePlatformEventIdentity();
      const entry = createAuditEntry(identity, {
        actor: { kind: 'provider', id: adapter.id, label: 'Pago alojado verificado' },
        action: 'preliminary_orders.payment_confirmed',
        entity: { type: 'preliminary_order', id: current.id, reference: current.reference },
        correlation_id: `preliminary-order:${current.id}`,
        diff: createAuditDiff(
          { payment_status: current.payment_status, paid_cents: current.paid_cents },
          { payment_status: next.paymentStatus, paid_cents: next.paidCents },
          ['payment_status', 'paid_cents'],
        ),
      });
      const statements: D1PreparedStatement[] = [
        db.prepare(`INSERT INTO preliminary_order_payments (
          id,preliminary_order_id,payment_link_id,stage,amount_cents,currency,
          provider_adapter,provider_event_reference,provider_payment_reference,
          payload_sha256,idempotency_key,occurred_at,created_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
          paymentId, current.id, link.id, verified.payment.stage,
          verified.payment.amountCents, verified.payment.currency,
          verified.providerAdapter, verified.providerEventReference,
          verified.providerPaymentReference, paymentHash, verified.idempotencyKey,
          verified.payment.paidAt, verified.payment.paidAt,
        ),
        eventStatement(db, {
          id: current.id, eventType: 'payment_confirmed', fromStatus: current.status,
          toStatus: next.status, fromPaymentStatus: current.payment_status,
          toPaymentStatus: next.paymentStatus, paymentId,
          amountCents: verified.payment.amountCents, versionAfter: next.version,
          idempotencyKey: verified.idempotencyKey, occurredAt: verified.payment.paidAt,
        }),
        updateStatement(db, current, next, verified.idempotencyKey, verified.payment.paidAt),
        db.prepare(`UPDATE preliminary_order_payment_links SET status='completed',completed_at=?,updated_at=?
          WHERE id=? AND status='active' AND EXISTS (
            SELECT 1 FROM preliminary_order_payments WHERE id=?
          )`).bind(verified.payment.paidAt, verified.payment.paidAt, link.id, paymentId),
      ];
      if (current.converted_order_id !== null) {
        statements.push(
          db.prepare(`INSERT INTO payment_transactions (
            payment_id,type,amount_cents,currency,status,provider_reference,
            idempotency_key,occurred_at,created_at
          ) SELECT payment.id,'capture',?,?,'succeeded',?,?,?,?
            FROM payments payment WHERE payment.order_id=?
              AND NOT EXISTS (SELECT 1 FROM payment_transactions WHERE idempotency_key=?)`).bind(
            verified.payment.amountCents, verified.payment.currency,
            verified.providerPaymentReference, `preliminary:${paymentId}`,
            verified.payment.paidAt, verified.payment.paidAt,
            current.converted_order_id, `preliminary:${paymentId}`,
          ),
        );
        if (next.paymentStatus === 'paid') {
          statements.push(db.prepare(`UPDATE payments SET status='captured',version=version+1,updated_at=?
            WHERE order_id=? AND status='pending' AND EXISTS (
              SELECT 1 FROM payment_transactions transaction_entry
              WHERE transaction_entry.payment_id=payments.id
              GROUP BY transaction_entry.payment_id
              HAVING sum(CASE WHEN transaction_entry.type='capture' AND transaction_entry.status='succeeded'
                THEN transaction_entry.amount_cents ELSE 0 END)=payments.expected_amount_cents
            )`).bind(verified.payment.paidAt, current.converted_order_id));
        }
      }
      statements.push(auditStatement(db, entry,
        'EXISTS (SELECT 1 FROM preliminary_order_events WHERE idempotency_key=?)',
        [verified.idempotencyKey]));
      try {
        const results = await db.batch(statements);
        if (results[0]?.meta.changes !== 1 || results[1]?.meta.changes !== 1 ||
            results[2]?.meta.changes !== 1) return 'conflict' as const;
      } catch (error) {
        const replay = await db.prepare(`SELECT 1 FROM preliminary_order_payments
          WHERE provider_adapter=? AND provider_event_reference=?`)
          .bind(verified.providerAdapter, verified.providerEventReference).first();
        if (!replay) throw error;
        return 'duplicate' as const;
      }
      await settleConvertedOrder(current.id);
      return 'applied' as const;
    },

    async convert(input: Readonly<{
      id: string;
      expectedVersion: number;
      idempotencyKey: string;
      reservationExpiresAt: string;
      convertedAt?: string;
    }>) {
      const existing = await row(input.id);
      if (!existing) return 'not-found' as const;
      if (existing.status === 'converted') {
        await settleConvertedOrder(existing.id);
        return 'duplicate' as const;
      }
      if (existing.version !== input.expectedVersion) return 'conflict' as const;
      const convertedAt = input.convertedAt ?? new Date().toISOString();
      const validated = convertPreliminaryOrder(aggregateOf(existing), { orderId: 1, convertedAt });
      const lineRows = await lines(existing.id);
      if (lineRows.length === 0) throw new Error('El presupuesto no tiene líneas.');
      const sellable = await db.prepare(`SELECT count(*) AS total
        FROM preliminary_order_lines line
        JOIN product_variants variant ON variant.id=line.variant_id
        JOIN products product ON product.id=variant.product_id
        WHERE line.preliminary_order_id=? AND variant.status='active' AND product.active=1`)
        .bind(existing.id).first<{ total: number }>();
      if (sellable?.total !== lineRows.length) return 'not-sellable' as const;
      const orderNumber = generateOrderNumber(new Date(convertedAt));
      const orderIdentity = reservePlatformEventIdentity();
      const quoteIdentity = reservePlatformEventIdentity();
      const reservationStatements = await reservations.createForVariantStatements(
        orderNumber,
        lineRows.map((line) => ({ variant_id: line.variant_id, qty: line.quantity })),
        convertedAt,
        { kind: 'event', id: orderIdentity.event_id },
        { expiresAt: input.reservationExpiresAt },
      );
      const quoteAudit = createAuditEntry(quoteIdentity, {
        actor: ADMIN_ACTOR,
        action: 'preliminary_orders.converted',
        entity: { type: 'preliminary_order', id: existing.id, reference: existing.reference },
        correlation_id: `preliminary-order:${existing.id}`,
        diff: createAuditDiff(
          { status: existing.status, converted_order_id: null },
          { status: 'converted', converted_order_id: orderNumber },
          ['status', 'converted_order_id'],
        ),
      });
      const orderStatements: D1PreparedStatement[] = [
        orderWriter.insertPendingOrderStatement({
          order_number: orderNumber,
          email: existing.email,
          customer_name: existing.customer_name,
          address_json: existing.address_json,
          subtotal_cents: existing.subtotal_cents,
          shipping_cents: existing.shipping_cents,
          total_cents: existing.total_cents,
          stripe_session_id: `preliminary_${existing.id}`,
          currency: existing.currency,
        }),
        outbox.placedEventStatement(orderIdentity, orderNumber),
        audit.eventStatement(orderIdentity.event_id, {
          action: 'orders.created',
          diff: createAuditDiff({ status: null }, { status: 'pending' }, ['status']),
        }),
        ...outbox.deliveryStatements(
          orderIdentity.event_id, orderIdentity.occurred_at, consumersFor('orders.order_placed'),
        ),
        ...lineRows.map((line) => db.prepare(`INSERT INTO order_items (
          order_id,product_id,variant_id,name_snapshot,sku_snapshot,product_name_snapshot,
          variant_name_snapshot,unit_price_cents,base_unit_price_cents,
          pricing_snapshot_json,qty,current_qty
        ) SELECT id,?,?,?,?,?,?,?,?,?,?,? FROM orders WHERE order_number=?`).bind(
          line.product_id, line.variant_id, line.name_snapshot, line.sku_snapshot,
          line.name_snapshot, null, line.unit_price_cents, line.unit_price_cents,
          line.pricing_snapshot_json, line.quantity, line.quantity, orderNumber,
        )),
        db.prepare(`INSERT INTO payments (
          order_id,provider,provider_reference,currency,expected_amount_cents,
          stored_value_expected_cents,status,version,idempotency_key,created_at,updated_at
        ) SELECT id,'simulated',?,?,total_cents,0,'pending',1,
          'r2:payment:order:'||id||':primary',?,? FROM orders WHERE order_number=?`).bind(
          `preliminary:${existing.id}`, existing.currency, convertedAt, convertedAt, orderNumber,
        ),
      ];
      const priorPayments = await db.prepare(`SELECT * FROM preliminary_order_payments
        WHERE preliminary_order_id=? ORDER BY occurred_at,id`).bind(existing.id).all<PaymentRow>();
      const captures = priorPayments.results.map((payment) => db.prepare(`INSERT INTO payment_transactions (
        payment_id,type,amount_cents,currency,status,provider_reference,idempotency_key,
        occurred_at,created_at
      ) SELECT payment.id,'capture',?,?,'succeeded',?,?,?,?
        FROM payments payment JOIN orders purchase ON purchase.id=payment.order_id
        WHERE purchase.order_number=?`).bind(
        payment.amount_cents, payment.currency, payment.provider_payment_reference,
        `preliminary:${payment.id}`, payment.occurred_at, payment.created_at, orderNumber,
      ));
      const paymentStatusStatements: D1PreparedStatement[] = [];
      if (existing.payment_status === 'paid') {
        paymentStatusStatements.push(
          db.prepare(`UPDATE payments SET status='captured',version=version+1,updated_at=?
            WHERE order_id=(SELECT id FROM orders WHERE order_number=?) AND status='pending'
              AND EXISTS (
                SELECT 1 FROM payment_transactions transaction_entry
                WHERE transaction_entry.payment_id=payments.id
                GROUP BY transaction_entry.payment_id
                HAVING sum(transaction_entry.amount_cents)=payments.expected_amount_cents
              )`).bind(convertedAt, orderNumber));
      }
      const statements: D1PreparedStatement[] = [
        ...orderStatements,
        ...captures,
        ...paymentStatusStatements,
        ...reservationStatements,
        orderWriter.timelineStatementForOrderNumber(orderNumber, {
          from_status: null, to_status: 'pending', note: 'Pedido creado desde presupuesto aprobado',
        }),
        eventStatement(db, {
          id: existing.id, eventType: 'converted', fromStatus: existing.status,
          toStatus: validated.status, fromPaymentStatus: existing.payment_status,
          toPaymentStatus: validated.paymentStatus, convertedOrderNumber: orderNumber,
          versionAfter: validated.version, idempotencyKey: input.idempotencyKey,
          occurredAt: convertedAt,
        }),
        updateStatement(db, existing, validated, input.idempotencyKey, convertedAt, orderNumber),
        auditStatement(db, quoteAudit,
          'EXISTS (SELECT 1 FROM preliminary_order_events WHERE idempotency_key=?)',
          [input.idempotencyKey]),
      ];
      try {
        await db.batch(statements);
      } catch (error) {
        const replay = await row(input.id);
        if (replay?.status === 'converted') return 'duplicate' as const;
        throw error;
      }
      await settleConvertedOrder(existing.id);
      return 'applied' as const;
    },
  });
}

export type PreliminaryOrderOperations = ReturnType<typeof createPreliminaryOrderOperations>;
