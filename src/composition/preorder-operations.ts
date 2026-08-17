import {
  assertPreorderPolicy,
  createD1Preorders,
  planPreorderAllocations,
  type PreorderPolicy,
} from '../modules/pricing';
import { createD1InventoryLedger, planInventoryMovement } from '../modules/inventory';
import { createAuditDiff, createAuditEntry, serializeAuditDiff } from '../shared-kernel/audit';
import type { ReserveEventIdentity } from '../shared-kernel/events';
import { reservePlatformEventIdentity } from './event-context';
import { createOutboxWriter } from '../modules/notifications';
import { preorderAllocatedEmail } from '../lib/emails';

const ACTOR = Object.freeze({ kind: 'admin', id: 'admin:preorders', label: 'Panel de administración' } as const);

function auditValues(entry: ReturnType<typeof createAuditEntry>): readonly unknown[] {
  return [entry.audit_id, entry.occurred_at, entry.actor.kind, entry.actor.id,
    entry.actor.label ?? null, entry.action, entry.entity.type, entry.entity.id,
    entry.entity.reference ?? null, entry.correlation_id, entry.source_event_id,
    serializeAuditDiff(entry.diff), entry.occurred_at];
}

export type CreatePreorderPolicyInput = Omit<PreorderPolicy,
  'id' | 'version' | 'committedDeferredQuantity' | 'capacityVersion'>;

export function createPreorderOperations(
  db: D1Database,
  reserveIdentity: ReserveEventIdentity = reservePlatformEventIdentity,
) {
  const repository = createD1Preorders(db);
  const ledger = createD1InventoryLedger(db);
  const messages = createOutboxWriter(db);

  return Object.freeze({
    policies: repository.policies,

    async commitments(orderId?: number) {
      if (orderId !== undefined) return repository.commitmentsForOrder(orderId);
      const { results } = await db.prepare(`SELECT DISTINCT variant_id FROM preorder_commitments
        ORDER BY variant_id`).all<{ variant_id: number }>();
      return Object.freeze((await Promise.all(results.map((row) =>
        repository.commitmentsForVariant(row.variant_id)))).flat());
    },

    async createPolicy(input: CreatePreorderPolicyInput): Promise<Readonly<{
      outcome: 'applied' | 'conflict' | 'variant-not-found'; policyId?: string;
    }>> {
      const identity = reserveIdentity();
      const id = `preorder-${crypto.randomUUID()}`;
      const policy: PreorderPolicy = Object.freeze({
        ...input,
        id,
        version: 1,
        committedDeferredQuantity: 0,
        capacityVersion: 1,
      });
      assertPreorderPolicy(policy);
      const variant = await db.prepare(`SELECT id FROM product_variants
        WHERE id=? AND status=? AND is_default=1`)
        .bind(policy.variantId, 'active').first<{ id: number }>();
      if (!variant) return { outcome: 'variant-not-found' };
      const audit = createAuditEntry(identity, {
        actor: ACTOR,
        action: 'pricing.preorder_policy_created',
        entity: { type: 'preorder_policy', id },
        diff: createAuditDiff({ state: null, version: null },
          { state: policy.state, version: 1 }, ['state', 'version']),
      });
      const statements = [
        db.prepare(`INSERT INTO audit_log (audit_id, occurred_at, actor_kind, actor_id,
          actor_label, action, entity_type, entity_id, entity_reference, correlation_id,
          source_event_id, diff_json, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          WHERE NOT EXISTS (SELECT 1 FROM preorder_policies WHERE variant_id=?)`)
          .bind(...auditValues(audit), policy.variantId),
        db.prepare(`INSERT INTO preorder_policies (
          id, variant_id, kind, state, label, public_message, sale_starts_at, sale_ends_at,
          availability_starts_at, availability_ends_at, max_deferred_quantity,
          committed_deferred_quantity, payment_policy, version, capacity_version,
          created_at, updated_at
        ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 1, 1, ?, ?
          WHERE EXISTS (SELECT 1 FROM audit_log WHERE audit_id=?)`).bind(
          policy.id, policy.variantId, policy.kind, policy.state, policy.label.trim(),
          policy.publicMessage.trim(), policy.saleStartsAt, policy.saleEndsAt,
          policy.availabilityStartsAt, policy.availabilityEndsAt,
          policy.maxDeferredQuantity, policy.paymentPolicy,
          identity.occurred_at, identity.occurred_at, identity.event_id,
        ),
      ];
      const results = await db.batch(statements);
      return results[0]?.meta.changes === 1 && results[1]?.meta.changes === 1
        ? { outcome: 'applied', policyId: id }
        : { outcome: 'conflict' };
    },

    async changePolicyState(
      id: string,
      expectedVersion: number,
      state: PreorderPolicy['state'],
    ): Promise<'applied' | 'conflict' | 'not-found'> {
      const current = (await repository.policies()).find((policy) => policy.id === id);
      if (!current) return 'not-found';
      if (current.version !== expectedVersion || current.state === state || current.state === 'archived') {
        return 'conflict';
      }
      const identity = reserveIdentity();
      const audit = createAuditEntry(identity, {
        actor: ACTOR,
        action: 'pricing.preorder_policy_state_changed',
        entity: { type: 'preorder_policy', id },
        diff: createAuditDiff({ state: current.state, version: current.version },
          { state, version: current.version + 1 }, ['state', 'version']),
      });
      const results = await db.batch([
        db.prepare(`INSERT INTO audit_log (audit_id, occurred_at, actor_kind, actor_id,
          actor_label, action, entity_type, entity_id, entity_reference, correlation_id,
          source_event_id, diff_json, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          FROM preorder_policies WHERE id=? AND state=? AND version=?`)
          .bind(...auditValues(audit), id, current.state, expectedVersion),
        db.prepare(`UPDATE preorder_policies SET state=?, version=version+1, updated_at=?
          WHERE id=? AND state=? AND version=? AND EXISTS (
            SELECT 1 FROM audit_log WHERE audit_id=?)`).bind(
          state, identity.occurred_at, id, current.state, expectedVersion, identity.event_id,
        ),
      ]);
      return results.every((result) => result.meta.changes === 1) ? 'applied' : 'conflict';
    },

    async allocate(input: Readonly<{
      variantId: number;
      quantity: number;
      idempotencyKey: string;
    }>): Promise<Readonly<{
      outcome: 'applied' | 'duplicate' | 'insufficient-stock' | 'nothing-pending';
      allocatedQuantity: number;
      commitmentCount: number;
    }>> {
      if (!Number.isSafeInteger(input.variantId) || input.variantId < 1 ||
          !Number.isSafeInteger(input.quantity) || input.quantity < 1 || input.quantity > 10_000 ||
          input.idempotencyKey.trim().length < 8 || input.idempotencyKey.trim().length > 120) {
        throw new RangeError('Asignación diferida inválida.');
      }
      if (await db.prepare(`SELECT 1 FROM preorder_allocations WHERE idempotency_key LIKE ? LIMIT 1`)
        .bind(`${input.idempotencyKey}:allocation:%`).first()) {
        return { outcome: 'duplicate', allocatedQuantity: 0, commitmentCount: 0 };
      }
      const [commitments, balances] = await Promise.all([
        repository.commitmentsForVariant(input.variantId),
        ledger.balances([input.variantId]),
      ]);
      if (commitments.length === 0) {
        return { outcome: 'nothing-pending', allocatedQuantity: 0, commitmentCount: 0 };
      }
      const balance = balances.get(input.variantId);
      if (!balance) throw new RangeError('Balance de variante ausente.');
      const available = balance.on_hand - balance.reserved;
      if (available < input.quantity) {
        return { outcome: 'insufficient-stock', allocatedQuantity: 0, commitmentCount: 0 };
      }
      const plan = planPreorderAllocations({
        variantId: input.variantId,
        availableQuantity: input.quantity,
        commitments,
      });
      if (plan.allocatedQuantity === 0) {
        return { outcome: 'nothing-pending', allocatedQuantity: 0, commitmentCount: 0 };
      }
      const identity = reserveIdentity();
      const audit = createAuditEntry(identity, {
        actor: ACTOR,
        action: 'inventory.preorder_allocated',
        entity: { type: 'product_variant', id: String(input.variantId) },
        diff: createAuditDiff({ allocated_quantity: 0 },
          { allocated_quantity: plan.allocatedQuantity }, ['allocated_quantity']),
      });
      const statements: D1PreparedStatement[] = [db.prepare(`INSERT INTO audit_log (
        audit_id, occurred_at, actor_kind, actor_id, actor_label, action, entity_type,
        entity_id, entity_reference, correlation_id, source_event_id, diff_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(...auditValues(audit))];
      const variant = await db.prepare(`SELECT product_id, is_default FROM product_variants
        WHERE id=?`).bind(input.variantId).first<{ product_id: number; is_default: number }>();
      if (!variant) throw new RangeError('Variante ausente.');
      let currentBalance = balance;
      for (const allocation of plan.allocations) {
        const commitment = commitments.find((item) => item.id === allocation.commitmentId)!;
        const movementKey = `${input.idempotencyKey}:inventory:${commitment.id}`;
        statements.push(...ledger.movementStatements(currentBalance, {
          variant_id: input.variantId,
          product_id: variant.product_id,
          is_default: Boolean(variant.is_default),
          delta: -allocation.quantity,
        }, {
          delta: -allocation.quantity,
          reason: 'sale',
          actor_kind: 'admin',
          actor_id: ACTOR.id,
          reference_type: 'preorder_commitment',
          reference_id: commitment.id,
          idempotency_key: movementKey,
          correlation_id: identity.event_id,
        }, identity.occurred_at, { kind: 'audit', id: identity.event_id }));
        currentBalance = planInventoryMovement(currentBalance, {
          delta: -allocation.quantity,
          reason: 'sale',
          actor_kind: 'admin',
          actor_id: ACTOR.id,
          reference_type: 'preorder_commitment',
          reference_id: commitment.id,
          idempotency_key: movementKey,
          correlation_id: identity.event_id,
        });
        statements.push(...repository.allocationStatements(
          commitment, allocation.quantity, identity.occurred_at,
          identity.event_id, input.idempotencyKey,
        ));
        const completesCommitment = commitment.allocatedQuantity + allocation.quantity +
          commitment.cancelledQuantity === commitment.deferredQuantity;
        if (completesCommitment) {
          const recipient = await db.prepare(`SELECT purchase.order_number, purchase.customer_name,
            purchase.email, item.name_snapshot
            FROM orders purchase JOIN order_items item ON item.order_id=purchase.id
            WHERE purchase.id=? AND item.id=?`).bind(
            commitment.orderId, commitment.orderItemId,
          ).first<{ order_number: string; customer_name: string; email: string; name_snapshot: string }>();
          if (!recipient) throw new Error('Pedido de compromiso ausente.');
          statements.push(...messages.statementsFor([preorderAllocatedEmail({
            order_number: recipient.order_number,
            customer_name: recipient.customer_name,
            email: recipient.email,
            item_name: recipient.name_snapshot,
            quantity: commitment.deferredQuantity - commitment.cancelledQuantity,
          })]));
        }
      }
      await db.batch(statements);
      return { outcome: 'applied', allocatedQuantity: plan.allocatedQuantity,
        commitmentCount: plan.allocations.length };
    },
  });
}

export type PreorderOperations = ReturnType<typeof createPreorderOperations>;
