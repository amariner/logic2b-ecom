import { emitPlatformEvent, reservePlatformEventIdentity } from './event-context';
import {
  applySubscriptionProviderEvent,
  createSimulatedSubscriptionAdapter,
  subscriptionDomainEvent,
  type SubscriptionAggregate,
  type SubscriptionPlanSnapshot,
  type SubscriptionProviderAdapter,
  type SubscriptionProviderAdapterResolver,
  type VerifiedSubscriptionProviderEvent,
} from '../modules/subscriptions';
import type { EventEnvelope } from '../shared-kernel/events';
import { createAuditDiff, createAuditEntry, serializeAuditDiff } from '../shared-kernel/audit';

type PlanRow = Readonly<{
  id: string;
  variant_id: number;
  state: 'draft' | 'active' | 'paused' | 'archived';
  label: string;
  amount_cents: number;
  currency: string;
  interval_unit: SubscriptionPlanSnapshot['interval_unit'];
  interval_count: number;
  provider_adapter: string;
  provider_plan_reference: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}>;

type SubscriptionRow = Readonly<{
  id: string;
  plan_id: string;
  plan_version: number;
  variant_id: number;
  provider_adapter: string;
  provider_subscription_reference: string;
  provider_customer_reference: string;
  contact_email: string;
  quantity: number;
  status: SubscriptionAggregate['status'];
  plan_snapshot_json: string;
  current_period_starts_at: string | null;
  current_period_ends_at: string | null;
  cancel_at_period_end: number;
  failed_payment_count: number;
  version: number;
  cancelled_at: string | null;
}>;

function aggregateOf(row: SubscriptionRow): SubscriptionAggregate {
  return Object.freeze({
    id: row.id,
    planId: row.plan_id,
    planVersion: row.plan_version,
    variantId: row.variant_id,
    providerAdapter: row.provider_adapter,
    providerSubscriptionReference: row.provider_subscription_reference,
    providerCustomerReference: row.provider_customer_reference,
    contactEmail: row.contact_email,
    quantity: row.quantity,
    status: row.status,
    planSnapshot: JSON.parse(row.plan_snapshot_json) as SubscriptionPlanSnapshot,
    currentPeriodStartsAt: row.current_period_starts_at,
    currentPeriodEndsAt: row.current_period_ends_at,
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
    failedPaymentCount: row.failed_payment_count,
    version: row.version,
    cancelledAt: row.cancelled_at,
  });
}

function snapshotOf(plan: PlanRow): SubscriptionPlanSnapshot {
  return Object.freeze({
    schema: 1,
    plan_id: plan.id,
    plan_version: plan.version,
    variant_id: plan.variant_id,
    amount_cents: plan.amount_cents,
    currency: plan.currency,
    interval_unit: plan.interval_unit,
    interval_count: plan.interval_count,
  });
}

function adapterCommand(subscription: SubscriptionAggregate, idempotencyKey: string) {
  return {
    subscriptionReference: subscription.providerSubscriptionReference,
    customerReference: subscription.providerCustomerReference,
    planId: subscription.planId,
    planVersion: subscription.planVersion,
    idempotencyKey,
    periodStartsAt: subscription.currentPeriodStartsAt,
    periodEndsAt: subscription.currentPeriodEndsAt,
  } as const;
}

async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function outboxStatement(db: D1Database, envelope: EventEnvelope, guardSql: string,
  guardBindings: readonly unknown[]): D1PreparedStatement {
  return db.prepare(`INSERT INTO event_outbox_events (
    event_id, event_type, event_version, occurred_at, actor_kind, actor_id, actor_label,
    entity_type, entity_id, entity_reference, correlation_id, causation_id,
    idempotency_key, payload_json, created_at
  ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${guardSql}
    AND NOT EXISTS (SELECT 1 FROM event_outbox_events WHERE idempotency_key=?)`).bind(
    envelope.event_id, envelope.type, envelope.version, envelope.occurred_at,
    envelope.actor.kind, envelope.actor.id, envelope.actor.label ?? null,
    envelope.entity.type, envelope.entity.id, envelope.entity.reference ?? null,
    envelope.correlation_id, envelope.causation_id, envelope.idempotency_key,
    JSON.stringify(envelope.payload), envelope.occurred_at,
    ...guardBindings, envelope.idempotency_key,
  );
}

const ADMIN_ACTOR = Object.freeze({
  kind: 'admin', id: 'admin:subscriptions', label: 'Panel de suscripciones',
} as const);

function auditStatement(db: D1Database, entry: ReturnType<typeof createAuditEntry>): D1PreparedStatement {
  return db.prepare(`INSERT INTO audit_log (
    audit_id, occurred_at, actor_kind, actor_id, actor_label, action,
    entity_type, entity_id, entity_reference, correlation_id, source_event_id,
    diff_json, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    entry.audit_id, entry.occurred_at, entry.actor.kind, entry.actor.id,
    entry.actor.label ?? null, entry.action, entry.entity.type, entry.entity.id,
    entry.entity.reference ?? null, entry.correlation_id, entry.source_event_id,
    serializeAuditDiff(entry.diff), entry.occurred_at,
  );
}

const defaultResolver: SubscriptionProviderAdapterResolver = (id) =>
  id === 'simulated-subscriptions' ? createSimulatedSubscriptionAdapter() : null;

export type CreateSubscriptionPlanInput = Readonly<{
  variantId: number;
  state: PlanRow['state'];
  label: string;
  amountCents: number;
  currency: string;
  intervalUnit: SubscriptionPlanSnapshot['interval_unit'];
  intervalCount: number;
  providerAdapter: string;
  providerPlanReference: string | null;
}>;

export function createSubscriptionOperations(
  db: D1Database,
  resolveAdapter: SubscriptionProviderAdapterResolver = defaultResolver,
) {
  async function plan(id: string): Promise<PlanRow | null> {
    return db.prepare('SELECT * FROM subscription_plans WHERE id=?').bind(id).first<PlanRow>();
  }

  async function subscription(id: string): Promise<SubscriptionAggregate | null> {
    const row = await db.prepare('SELECT * FROM subscriptions WHERE id=?')
      .bind(id).first<SubscriptionRow>();
    return row ? aggregateOf(row) : null;
  }

  function adapterFor(id: string): SubscriptionProviderAdapter {
    const adapter = resolveAdapter(id);
    if (!adapter || adapter.id !== id) throw new RangeError('Adaptador de suscripciones no configurado.');
    return adapter;
  }

  async function persistTransition(
    current: SubscriptionAggregate,
    providerEvent: VerifiedSubscriptionProviderEvent,
    nextSnapshot: SubscriptionPlanSnapshot = current.planSnapshot,
  ): Promise<'applied' | 'duplicate' | 'conflict'> {
    if (await db.prepare(`SELECT 1 FROM subscription_provider_events
      WHERE provider_adapter=? AND provider_event_reference=?`)
      .bind(providerEvent.adapter, providerEvent.eventReference).first()) return 'duplicate';
    const transition = applySubscriptionProviderEvent(current, providerEvent);
    const next = Object.freeze({ ...transition.subscription, planSnapshot: nextSnapshot });
    const hash = await sha256(providerEvent);
    const envelope = subscriptionDomainEvent(emitPlatformEvent, next, providerEvent, transition.transition);
    const audit = createAuditEntry(reservePlatformEventIdentity(), {
      actor: ADMIN_ACTOR,
      action: `subscriptions.${transition.transition}`,
      entity: { type: 'subscription', id: current.id },
      correlation_id: envelope.correlation_id,
      source_event_id: envelope.event_id,
      diff: createAuditDiff(
        { status: current.status, plan_id: current.planId, version: current.version },
        { status: next.status, plan_id: next.planId, version: next.version },
        ['status', 'plan_id', 'version'],
      ),
    });
    const cycle = providerEvent.cycle;
    const statements: D1PreparedStatement[] = [
      db.prepare(`INSERT INTO subscription_provider_events (
        provider_adapter, provider_event_reference, provider_subscription_reference,
        event_type, payload_sha256, occurred_at, processed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(
        providerEvent.adapter, providerEvent.eventReference, providerEvent.subscriptionReference,
        providerEvent.type, hash, providerEvent.occurredAt, envelope.occurred_at,
      ),
      db.prepare(`INSERT INTO subscription_events (
        subscription_id, provider_event_id, transition, from_status, to_status,
        plan_id_after, plan_version_after, failed_payment_count_after,
        current_period_starts_at_after, current_period_ends_at_after, version_after, occurred_at
      ) SELECT ?, provider.id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        FROM subscription_provider_events provider
        WHERE provider.provider_adapter=? AND provider.provider_event_reference=?`).bind(
        current.id, transition.transition, current.status, next.status, next.planId,
        next.planVersion, next.failedPaymentCount, next.currentPeriodStartsAt,
        next.currentPeriodEndsAt, next.version, providerEvent.occurredAt,
        providerEvent.adapter, providerEvent.eventReference,
      ),
    ];
    if (cycle) {
      statements.push(db.prepare(`INSERT INTO subscription_cycles (
        id, subscription_id, provider_cycle_reference, status, amount_cents, currency,
        attempt_count, failure_code, period_starts_at, period_ends_at,
        provider_event_id, created_at, updated_at
      ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, provider.id, ?, ?
        FROM subscription_provider_events provider
        WHERE provider.provider_adapter=? AND provider.provider_event_reference=?
        ON CONFLICT(subscription_id, provider_cycle_reference) DO UPDATE SET
          status=excluded.status, attempt_count=excluded.attempt_count,
          failure_code=excluded.failure_code, provider_event_id=excluded.provider_event_id,
          updated_at=excluded.updated_at
        WHERE excluded.attempt_count > subscription_cycles.attempt_count`).bind(
        `cycle_${providerEvent.adapter}_${cycle.reference}`, current.id, cycle.reference,
        providerEvent.type === 'payment_succeeded' ? 'paid' : 'failed',
        cycle.amountCents, cycle.currency, cycle.attemptCount, cycle.failureCode,
        providerEvent.periodStartsAt, providerEvent.periodEndsAt,
        providerEvent.occurredAt, providerEvent.occurredAt,
        providerEvent.adapter, providerEvent.eventReference,
      ));
    }
    const updateIndex = statements.length;
    statements.push(
      db.prepare(`UPDATE subscriptions SET plan_id=?, plan_version=?, plan_snapshot_json=?,
        status=?, current_period_starts_at=?, current_period_ends_at=?,
        cancel_at_period_end=?, failed_payment_count=?, version=?, cancelled_at=?, updated_at=?
        WHERE id=? AND status=? AND version=? AND EXISTS (
          SELECT 1 FROM subscription_events WHERE provider_event_id=(
            SELECT id FROM subscription_provider_events
            WHERE provider_adapter=? AND provider_event_reference=?))`).bind(
        next.planId, next.planVersion, JSON.stringify(nextSnapshot), next.status,
        next.currentPeriodStartsAt, next.currentPeriodEndsAt,
        next.cancelAtPeriodEnd ? 1 : 0, next.failedPaymentCount, next.version,
        next.cancelledAt, providerEvent.occurredAt,
        current.id, current.status, current.version,
        providerEvent.adapter, providerEvent.eventReference,
      ),
      outboxStatement(db, envelope, `EXISTS (SELECT 1 FROM subscription_events
        WHERE subscription_id=? AND version_after=?)`, [current.id, next.version]),
      auditStatement(db, audit),
    );
    try {
      const results = await db.batch(statements);
      return results[1]?.meta.changes === 1 && results[updateIndex]?.meta.changes === 1
        ? 'applied' : 'conflict';
    } catch (error) {
      if (error instanceof Error && /UNIQUE|subscription_event_conflict/.test(error.message)) return 'conflict';
      throw error;
    }
  }

  return Object.freeze({
    async list() {
      const [plansResult, subscriptionsResult] = await Promise.all([
        db.prepare('SELECT * FROM subscription_plans ORDER BY created_at, id').all<PlanRow>(),
        db.prepare('SELECT * FROM subscriptions ORDER BY created_at, id').all<SubscriptionRow>(),
      ]);
      return Object.freeze({
        plans: Object.freeze(plansResult.results),
        subscriptions: Object.freeze(subscriptionsResult.results.map(aggregateOf)),
      });
    },

    async createPlan(input: CreateSubscriptionPlanInput) {
      const currency = input.currency.trim().toUpperCase();
      if (!Number.isSafeInteger(input.variantId) || input.variantId < 1 ||
          !Number.isSafeInteger(input.amountCents) || input.amountCents < 1 ||
          !Number.isSafeInteger(input.intervalCount) || input.intervalCount < 1 || input.intervalCount > 365 ||
          input.label.trim().length < 2 || currency.length !== 3 ||
          input.providerAdapter.trim().length < 2) throw new RangeError('Plan de suscripción inválido.');
      const variant = await db.prepare(`SELECT id FROM product_variants
        WHERE id=? AND status='active'`).bind(input.variantId).first();
      if (!variant) return Object.freeze({ outcome: 'variant-not-found' as const });
      const id = `subplan_${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      const identity = reservePlatformEventIdentity();
      const audit = createAuditEntry(identity, {
        actor: ADMIN_ACTOR,
        action: 'subscriptions.plan_created',
        entity: { type: 'subscription_plan', id },
        diff: createAuditDiff(
          { state: null, version: null }, { state: input.state, version: 1 },
          ['state', 'version'],
        ),
      });
      await db.batch([auditStatement(db, audit), db.prepare(`INSERT INTO subscription_plans (
        id, variant_id, state, label, amount_cents, currency, interval_unit,
        interval_count, provider_adapter, provider_plan_reference, version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`).bind(
        id, input.variantId, input.state, input.label.trim(), input.amountCents,
        currency, input.intervalUnit, input.intervalCount, input.providerAdapter.trim(),
        input.providerPlanReference, now, now,
      )]);
      return Object.freeze({ outcome: 'applied' as const, planId: id });
    },

    async create(input: Readonly<{
      planId: string;
      contactEmail: string;
      quantity: number;
      idempotencyKey: string;
    }>) {
      const configured = await plan(input.planId);
      if (!configured) return Object.freeze({ outcome: 'plan-not-found' as const });
      if (configured.state !== 'active') return Object.freeze({ outcome: 'plan-inactive' as const });
      if (!Number.isSafeInteger(input.quantity) || input.quantity < 1 || input.quantity > 10_000 ||
          !input.contactEmail.includes('@') || input.idempotencyKey.trim().length < 8) {
        throw new RangeError('Alta de suscripción inválida.');
      }
      const providerEvent = await adapterFor(configured.provider_adapter).create({
        planId: configured.id,
        planVersion: configured.version,
        contactEmail: input.contactEmail.trim().toLowerCase(),
        quantity: input.quantity,
        idempotencyKey: input.idempotencyKey,
      });
      const existing = await db.prepare(`SELECT id FROM subscriptions
        WHERE provider_adapter=? AND provider_subscription_reference=?`)
        .bind(providerEvent.adapter, providerEvent.subscriptionReference).first<{ id: string }>();
      if (existing) return Object.freeze({ outcome: 'duplicate' as const, subscriptionId: existing.id });
      const id = `subscription_${crypto.randomUUID()}`;
      const snapshot = snapshotOf(configured);
      const aggregate: SubscriptionAggregate = Object.freeze({
        id, planId: configured.id, planVersion: configured.version,
        variantId: configured.variant_id, providerAdapter: providerEvent.adapter,
        providerSubscriptionReference: providerEvent.subscriptionReference,
        providerCustomerReference: providerEvent.customerReference,
        contactEmail: input.contactEmail.trim().toLowerCase(), quantity: input.quantity,
        status: 'pending', planSnapshot: snapshot,
        currentPeriodStartsAt: providerEvent.periodStartsAt,
        currentPeriodEndsAt: providerEvent.periodEndsAt,
        cancelAtPeriodEnd: false, failedPaymentCount: 0, version: 1, cancelledAt: null,
      });
      const hash = await sha256(providerEvent);
      const envelope = subscriptionDomainEvent(emitPlatformEvent, aggregate, providerEvent);
      const audit = createAuditEntry(reservePlatformEventIdentity(), {
        actor: ADMIN_ACTOR,
        action: 'subscriptions.subscription_created',
        entity: { type: 'subscription', id },
        correlation_id: envelope.correlation_id,
        source_event_id: envelope.event_id,
        diff: createAuditDiff(
          { status: null, plan_id: null, version: null },
          { status: aggregate.status, plan_id: aggregate.planId, version: 1 },
          ['status', 'plan_id', 'version'],
        ),
      });
      try {
        const results = await db.batch([
          db.prepare(`INSERT INTO subscription_provider_events (
            provider_adapter, provider_event_reference, provider_subscription_reference,
            event_type, payload_sha256, occurred_at, processed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(
            providerEvent.adapter, providerEvent.eventReference, providerEvent.subscriptionReference,
            providerEvent.type, hash, providerEvent.occurredAt, envelope.occurred_at,
          ),
          db.prepare(`INSERT INTO subscriptions (
            id, plan_id, plan_version, variant_id, provider_adapter,
            provider_subscription_reference, provider_customer_reference, contact_email,
            quantity, status, plan_snapshot_json, current_period_starts_at,
            current_period_ends_at, version, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, 1, ?, ?)`).bind(
            id, configured.id, configured.version, configured.variant_id, providerEvent.adapter,
            providerEvent.subscriptionReference, providerEvent.customerReference,
            aggregate.contactEmail, input.quantity, JSON.stringify(snapshot),
            providerEvent.periodStartsAt, providerEvent.periodEndsAt,
            providerEvent.occurredAt, providerEvent.occurredAt,
          ),
          outboxStatement(db, envelope, 'EXISTS (SELECT 1 FROM subscriptions WHERE id=?)', [id]),
          auditStatement(db, audit),
        ]);
        return results[1]?.meta.changes === 1
          ? Object.freeze({ outcome: 'applied' as const, subscriptionId: id })
          : Object.freeze({ outcome: 'conflict' as const });
      } catch (error) {
        if (error instanceof Error && /UNIQUE|subscription_insert_conflict/.test(error.message)) {
          return Object.freeze({ outcome: 'conflict' as const });
        }
        throw error;
      }
    },

    async command(input: Readonly<{
      subscriptionId: string;
      expectedVersion: number;
      action: 'activate' | 'pause' | 'resume' | 'change_plan' |
        'cancel_at_period_end' | 'cancel_now' | 'payment_succeeded' | 'payment_failed';
      idempotencyKey: string;
      nextPlanId?: string;
      cycleReference?: string;
      attemptCount?: number;
      failureCode?: string;
      periodStartsAt?: string;
      periodEndsAt?: string;
    }>) {
      const current = await subscription(input.subscriptionId);
      if (!current) return 'not-found' as const;
      const adapter = adapterFor(current.providerAdapter);
      const base = {
        ...adapterCommand(current, input.idempotencyKey),
        periodStartsAt: input.periodStartsAt ?? current.currentPeriodStartsAt,
        periodEndsAt: input.periodEndsAt ?? current.currentPeriodEndsAt,
      };
      let providerEvent: VerifiedSubscriptionProviderEvent;
      let nextSnapshot = current.planSnapshot;
      switch (input.action) {
        case 'activate': providerEvent = await adapter.activate(base); break;
        case 'pause': providerEvent = await adapter.pause(base); break;
        case 'resume': providerEvent = await adapter.resume(base); break;
        case 'cancel_at_period_end': providerEvent = await adapter.cancel({ ...base, atPeriodEnd: true }); break;
        case 'cancel_now': providerEvent = await adapter.cancel({ ...base, atPeriodEnd: false }); break;
        case 'change_plan': {
          if (!input.nextPlanId) throw new RangeError('Falta el plan de destino.');
          const target = await plan(input.nextPlanId);
          if (!target || target.state !== 'active' || target.provider_adapter !== current.providerAdapter ||
              target.variant_id !== current.variantId) throw new RangeError('Plan de destino incompatible.');
          providerEvent = await adapter.changePlan({ ...base,
            nextPlanId: target.id, nextPlanVersion: target.version });
          nextSnapshot = snapshotOf(target);
          break;
        }
        case 'payment_succeeded':
        case 'payment_failed': {
          if (adapter.id !== 'simulated-subscriptions' || !('payment' in adapter) ||
              typeof adapter.payment !== 'function') throw new RangeError('La simulación de cobro no está disponible.');
          if (!input.cycleReference || !input.periodStartsAt || !input.periodEndsAt ||
              !Number.isSafeInteger(input.attemptCount) || input.attemptCount! < 1) {
            throw new RangeError('Ciclo de suscripción inválido.');
          }
          providerEvent = await (adapter as ReturnType<typeof createSimulatedSubscriptionAdapter>).payment({
            ...base,
            periodStartsAt: input.periodStartsAt,
            periodEndsAt: input.periodEndsAt,
            outcome: input.action === 'payment_succeeded' ? 'succeeded' : 'failed',
            cycleReference: input.cycleReference,
            amountCents: current.planSnapshot.amount_cents * current.quantity,
            currency: current.planSnapshot.currency,
            attemptCount: input.attemptCount!,
            ...(input.failureCode === undefined ? {} : { failureCode: input.failureCode }),
          });
          break;
        }
      }
      if (await db.prepare(`SELECT 1 FROM subscription_provider_events
        WHERE provider_adapter=? AND provider_event_reference=?`)
        .bind(providerEvent.adapter, providerEvent.eventReference).first()) return 'duplicate' as const;
      if (current.version !== input.expectedVersion) return 'conflict' as const;
      return persistTransition(current, providerEvent, nextSnapshot);
    },

    async portal(input: Readonly<{ subscriptionId: string; returnUrl: string }>) {
      const current = await subscription(input.subscriptionId);
      if (!current) return Object.freeze({ outcome: 'not-found' as const });
      if (current.status === 'cancelled') return Object.freeze({ outcome: 'cancelled' as const });
      const session = await adapterFor(current.providerAdapter).createPortalSession({
        subscriptionReference: current.providerSubscriptionReference,
        customerReference: current.providerCustomerReference,
        returnUrl: input.returnUrl,
      });
      return Object.freeze({ outcome: 'created' as const, ...session });
    },
  });
}
