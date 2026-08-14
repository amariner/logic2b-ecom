import {
  createD1InventoryAllocation,
  createD1InventoryLedger,
  planInventoryMovement,
  planInventoryRouting,
  type InventoryRoutingDemand,
} from '../modules/inventory';
import type { FulfillmentAllocation } from '../modules/fulfillment';
import { createAuditDiff, createAuditEntry, serializeAuditDiff } from '../shared-kernel/audit';

const ACTOR = Object.freeze({ kind: 'admin', id: 'admin-panel', label: 'Panel de administración' } as const);

type OrderRoutingRow = Readonly<{ market: string }>;
type LineRow = Readonly<{
  order_item_id: number;
  variant_id: number;
  product_id: number;
  is_default: number;
  quantity: number;
}>;
type LocationBalance = Readonly<{
  variant_id: number;
  on_hand: number;
  reserved: number;
  movement_version: number;
}>;

function allocationId(): string {
  return `aln_${crypto.randomUUID()}`;
}

function normalizeRules(values: readonly string[], kind: 'market' | 'channel'): readonly string[] {
  if (values.length < 1 || values.length > 20) throw new RangeError('Cada regla exige entre 1 y 20 valores.');
  const normalized = values.map((value) => {
    const clean = value.trim();
    if (clean === '*') return clean;
    const result = kind === 'market' ? clean.toUpperCase() : clean.toLowerCase();
    const expression = kind === 'market' ? /^[A-Z0-9-]{2,20}$/ : /^[a-z0-9-]{2,40}$/;
    if (!expression.test(result)) throw new RangeError(`Valor de ${kind === 'market' ? 'mercado' : 'canal'} inválido.`);
    return result;
  });
  return Object.freeze([...new Set(normalized)].sort());
}

export function createInventoryAllocationOperations(db: D1Database) {
  const repository = createD1InventoryAllocation(db);
  const ledger = createD1InventoryLedger(db);

  async function routingLines(orderId: number, allocations: readonly FulfillmentAllocation[]): Promise<readonly LineRow[]> {
    if (allocations.length === 0) throw new RangeError('La asignación exige al menos una línea.');
    const ids = allocations.map((allocation) => allocation.order_item_id);
    const { results } = await db.prepare(`SELECT oi.id AS order_item_id, oi.variant_id,
      pv.product_id, pv.is_default, 0 AS quantity
      FROM order_items oi JOIN product_variants pv ON pv.id = oi.variant_id
      WHERE oi.order_id = ? AND oi.id IN (${ids.map(() => '?').join(',')})`)
      .bind(orderId, ...ids).all<LineRow>();
    const quantities = new Map(allocations.map((allocation) => [allocation.order_item_id, allocation.quantity]));
    return results.map((row) => Object.freeze({ ...row, quantity: quantities.get(row.order_item_id)! }));
  }

  async function locationBalances(locationId: number, variantIds: readonly number[]): Promise<ReadonlyMap<number, LocationBalance>> {
    if (variantIds.length === 0) return new Map();
    const { results } = await db.prepare(`SELECT variant_id, on_hand, reserved, movement_version
      FROM inventory_location_balances WHERE location_id = ?
        AND variant_id IN (${variantIds.map(() => '?').join(',')})`)
      .bind(locationId, ...variantIds).all<LocationBalance>();
    return new Map(results.map((row) => [row.variant_id, row]));
  }

  return Object.freeze({
    policies: repository.policies,
    decisions: repository.decisions,

    async updatePolicy(input: Readonly<{
      locationId: number;
      expectedVersion: number;
      priority: number;
      handlingCostCents: number;
      markets: readonly string[];
      channels: readonly string[];
      enabled: boolean;
    }>): Promise<'applied' | 'conflict' | 'not-found'> {
      if (!Number.isSafeInteger(input.locationId) || input.locationId < 1 ||
          !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1 ||
          !Number.isSafeInteger(input.priority) || input.priority < 0 || input.priority > 100000 ||
          !Number.isSafeInteger(input.handlingCostCents) || input.handlingCostCents < 0 ||
          input.handlingCostCents > 10000000) {
        throw new RangeError('Configuración de asignación inválida.');
      }
      const current = (await repository.policies()).find((policy) => policy.location_id === input.locationId);
      if (!current) return 'not-found';
      const markets = normalizeRules(input.markets, 'market');
      const channels = normalizeRules(input.channels, 'channel');
      const next = {
        priority: input.priority,
        handling_cost_cents: input.handlingCostCents,
        markets_json: JSON.stringify(markets),
        channels_json: JSON.stringify(channels),
        enabled: input.enabled ? 1 : 0,
      };
      const occurredAt = new Date().toISOString();
      const auditId = `inventory-routing:${input.locationId}:v${input.expectedVersion + 1}:${crypto.randomUUID()}`;
      const audit = createAuditEntry({ event_id: auditId, occurred_at: occurredAt }, {
        actor: ACTOR,
        action: 'inventory.routing_policy_updated',
        entity: { type: 'inventory_routing_policy', id: String(input.locationId), reference: current.location_code },
        diff: createAuditDiff(current, next, [
          'priority', 'handling_cost_cents', 'markets_json', 'channels_json', 'enabled',
        ]),
      });
      const values = [audit.audit_id, audit.occurred_at, audit.actor.kind, audit.actor.id,
        audit.actor.label ?? null, audit.action, audit.entity.type, audit.entity.id,
        audit.entity.reference ?? null, audit.correlation_id, audit.source_event_id,
        serializeAuditDiff(audit.diff), audit.occurred_at];
      const auditInsert = db.prepare(`INSERT INTO audit_log (
        audit_id, occurred_at, actor_kind, actor_id, actor_label, action,
        entity_type, entity_id, entity_reference, correlation_id,
        source_event_id, diff_json, created_at
      ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        FROM inventory_routing_policies WHERE location_id = ? AND version = ?`)
        .bind(...values, input.locationId, input.expectedVersion);
      const mutation = db.prepare(`UPDATE inventory_routing_policies SET
        priority = ?, handling_cost_cents = ?, markets_json = ?, channels_json = ?,
        enabled = ?, version = version + 1, updated_at = ?
        WHERE location_id = ? AND version = ?
          AND EXISTS (SELECT 1 FROM audit_log WHERE audit_id = ?)`)
        .bind(next.priority, next.handling_cost_cents, next.markets_json,
          next.channels_json, next.enabled, occurredAt, input.locationId,
          input.expectedVersion, auditId);
      const results = await db.batch([auditInsert, mutation]);
      const changes = results.map((result) => result.meta.changes ?? 0);
      if (changes.every((change) => change === 1)) return 'applied';
      if (changes.every((change) => change === 0)) return 'conflict';
      throw new Error('Unidad de configuración de asignación inconsistente.');
    },

    async statements(input: Readonly<{
      orderId: number;
      fulfillmentIdempotencyKey: string;
      allocations: readonly FulfillmentAllocation[];
      eventId: string;
      occurredAt: string;
      channel?: string;
    }>): Promise<readonly D1PreparedStatement[]> {
      const order = await db.prepare(`SELECT upper(COALESCE(
        json_extract(address_json, '$.country'), 'ES')) AS market FROM orders WHERE id = ?`)
        .bind(input.orderId).first<OrderRoutingRow>();
      if (!order) throw new RangeError('Pedido de asignación no encontrado.');
      const lines = await routingLines(input.orderId, input.allocations);
      if (lines.length !== input.allocations.length || lines.some((line) => !line.variant_id)) {
        throw new RangeError('Una línea de fulfillment no tiene variante asignable.');
      }
      const committedByVariant = new Map<number, number>();
      for (const line of lines) committedByVariant.set(line.variant_id, (committedByVariant.get(line.variant_id) ?? 0) + line.quantity);
      const demands: InventoryRoutingDemand[] = [...committedByVariant].map(([variantId, quantity]) => ({
        orderItemId: lines.find((line) => line.variant_id === variantId)!.order_item_id,
        variantId, quantity,
      }));
      const candidates = await repository.candidates(demands.map((demand) => demand.variantId), committedByVariant);
      const channel = input.channel ?? 'storefront';
      const plan = planInventoryRouting({ market: order.market, channel, demands, candidates });
      const decisionId = allocationId();
      const explanation = JSON.stringify({
        contract: 'logic2b.inventory-routing.v1', market: order.market, channel,
        demands: demands.map(({ variantId, quantity }) => ({ variant_id: variantId, quantity })),
        selected_location_id: plan.selected.locationId,
        candidates: plan.candidates.map((candidate) => ({
          location_id: candidate.locationId, code: candidate.code, eligible: candidate.eligible,
          reason: candidate.reason, priority: candidate.priority,
          handling_cost_cents: candidate.handlingCostCents,
        })),
      });
      const statements: D1PreparedStatement[] = [db.prepare(`INSERT INTO inventory_allocation_decisions (
        id, fulfillment_id, order_id, location_id, market, channel, policy_version,
        idempotency_key, explanation_json, created_at
      ) SELECT ?, f.id, ?, ?, ?, ?, ?, ?, ?, ? FROM fulfillments f
        WHERE f.idempotency_key = ? AND f.order_id = ?
          AND EXISTS (SELECT 1 FROM event_outbox_events WHERE event_id = ?)`)
        .bind(decisionId, input.orderId, plan.selected.locationId, order.market, channel,
          plan.selected.policyVersion, input.fulfillmentIdempotencyKey, explanation,
          input.occurredAt, input.fulfillmentIdempotencyKey, input.orderId, input.eventId)];
      for (const line of lines) {
        statements.push(db.prepare(`INSERT INTO inventory_allocation_lines (
          decision_id, fulfillment_id, order_id, order_item_id, variant_id,
          quantity, available_before, created_at
        ) SELECT d.id, d.fulfillment_id, d.order_id, ?, ?, ?, ?, ?
          FROM inventory_allocation_decisions d WHERE d.id = ?`)
          .bind(line.order_item_id, line.variant_id, line.quantity,
            plan.selected.availableByVariant[line.variant_id] ?? 0, input.occurredAt, decisionId));
      }
      if (plan.selected.isPrimary) return Object.freeze(statements);

      const variantIds = demands.map((demand) => demand.variantId);
      const [globalBalances, secondaryBalances] = await Promise.all([
        ledger.balances(variantIds), locationBalances(plan.selected.locationId, variantIds),
      ]);
      for (const demand of demands) {
        const line = lines.find((candidate) => candidate.variant_id === demand.variantId)!;
        const global = globalBalances.get(demand.variantId);
        const secondary = secondaryBalances.get(demand.variantId);
        if (!global || !secondary) throw new RangeError('El balance seleccionado dejó de estar disponible.');
        const releaseKey = `allocation:${decisionId}:release:${demand.variantId}`;
        statements.push(...ledger.movementStatements(global, {
          variant_id: demand.variantId, product_id: line.product_id,
          is_default: line.is_default === 1, delta: demand.quantity,
        }, {
          delta: demand.quantity, reason: 'reconciliation_correction', actor_kind: 'system',
          actor_id: 'inventory-routing', reference_type: 'inventory_allocation',
          reference_id: decisionId, idempotency_key: releaseKey, correlation_id: decisionId,
        }, input.occurredAt, { kind: 'event', id: input.eventId }));
        statements.push(db.prepare(`INSERT INTO inventory_allocation_movements (
          decision_id, variant_id, movement_kind, location_movement_id, quantity, created_at
        ) SELECT ?, ?, 'primary_release', id, ?, ? FROM inventory_location_movements
          WHERE idempotency_key = ? AND EXISTS (
            SELECT 1 FROM inventory_allocation_decisions WHERE id = ?)`)
          .bind(decisionId, demand.variantId, demand.quantity, input.occurredAt,
            `location:principal:${releaseKey}`, decisionId));

        const consumeKey = `allocation:${decisionId}:consume:${demand.variantId}`;
        const planned = planInventoryMovement({
          variant_id: secondary.variant_id, on_hand: secondary.on_hand,
          reserved: secondary.reserved, version: secondary.movement_version,
        }, {
          delta: -demand.quantity, reason: 'sale', actor_kind: 'system',
          actor_id: 'inventory-routing', reference_type: 'inventory_allocation',
          reference_id: decisionId, idempotency_key: consumeKey, correlation_id: decisionId,
        });
        statements.push(
          db.prepare(`UPDATE inventory_location_balances SET on_hand = ?,
            movement_version = ?, updated_at = ? WHERE location_id = ? AND variant_id = ?
            AND movement_version = ? AND on_hand - ? >= reserved
            AND EXISTS (SELECT 1 FROM inventory_allocation_decisions WHERE id = ?)`)
            .bind(planned.on_hand, planned.version_after, input.occurredAt,
              plan.selected.locationId, demand.variantId, secondary.movement_version,
              demand.quantity, decisionId),
          db.prepare(`INSERT INTO inventory_location_movements (
            location_id, variant_id, source_movement_id, delta, reason, balance_after,
            version_after, actor_kind, actor_id, reference_type, reference_id,
            idempotency_key, correlation_id, occurred_at, created_at
          ) SELECT ?, ?, NULL, ?, 'sale', ?, ?, 'system', 'inventory-routing',
            'inventory_allocation', ?, ?, ?, ?, ?
            WHERE EXISTS (SELECT 1 FROM inventory_allocation_decisions WHERE id = ?)`)
            .bind(plan.selected.locationId, demand.variantId, -demand.quantity,
              planned.balance_after, planned.version_after, decisionId, consumeKey,
              decisionId, input.occurredAt, input.occurredAt, decisionId),
          db.prepare(`INSERT INTO inventory_allocation_movements (
            decision_id, variant_id, movement_kind, location_movement_id, quantity, created_at
          ) SELECT ?, ?, 'secondary_consume', id, ?, ? FROM inventory_location_movements
            WHERE idempotency_key = ? AND EXISTS (
              SELECT 1 FROM inventory_allocation_decisions WHERE id = ?)`)
            .bind(decisionId, demand.variantId, demand.quantity,
              input.occurredAt, consumeKey, decisionId),
        );
      }
      return Object.freeze(statements);
    },
  });
}

export type InventoryAllocationOperations = ReturnType<typeof createInventoryAllocationOperations>;
