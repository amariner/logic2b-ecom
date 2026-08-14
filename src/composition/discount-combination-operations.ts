import {
  assertDiscountCombinationPolicy,
  type DiscountCombinationPolicy,
  type DiscountCombinationPolicyState,
} from '../modules/pricing';
import { createAuditDiff, createAuditEntry, serializeAuditDiff, type AuditEntry } from '../shared-kernel/audit';
import type { ReserveEventIdentity } from '../shared-kernel/events';
import { reservePlatformEventIdentity } from './event-context';

export type CreateDiscountCombinationInput = Omit<DiscountCombinationPolicy, 'id' | 'version' | 'state'> &
  Readonly<{ state: Extract<DiscountCombinationPolicyState, 'active' | 'disabled'> }>;

type PolicyRow = Readonly<{
  id: string; version: number; label: string; state: DiscountCombinationPolicyState;
  priority: number; currency: string; active_from: string | null; active_until: string | null;
  markets_json: string; channels_json: string; maximum_discount_basis_points: number;
}>;
type SourcePairRow = Readonly<{
  policy_id: string; left_source: DiscountCombinationPolicy['sourcePairs'][number]['left'];
  right_source: DiscountCombinationPolicy['sourcePairs'][number]['right'];
}>;
type ClassPairRow = Readonly<{
  policy_id: string; left_class: DiscountCombinationPolicy['classPairs'][number]['left'];
  right_class: DiscountCombinationPolicy['classPairs'][number]['right'];
}>;

function pair<T extends string>(left: T, right: T): readonly [T, T] {
  return left < right ? [left, right] : [right, left];
}

function auditValues(entry: AuditEntry): readonly unknown[] {
  return [
    entry.audit_id, entry.occurred_at, entry.actor.kind, entry.actor.id,
    entry.actor.label ?? null, entry.action, entry.entity.type, entry.entity.id,
    entry.entity.reference ?? null, entry.correlation_id, entry.source_event_id,
    serializeAuditDiff(entry.diff), entry.occurred_at,
  ];
}

function auditInsert(db: D1Database, entry: AuditEntry): D1PreparedStatement {
  return db.prepare(`INSERT INTO audit_log (
    audit_id, occurred_at, actor_kind, actor_id, actor_label, action,
    entity_type, entity_id, entity_reference, correlation_id,
    source_event_id, diff_json, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(...auditValues(entry));
}

function fromRow(row: PolicyRow, sources: readonly SourcePairRow[], classes: readonly ClassPairRow[]) {
  return Object.freeze({
    id: row.id, version: row.version, label: row.label, state: row.state,
    priority: row.priority, currency: row.currency, activeFrom: row.active_from,
    activeUntil: row.active_until,
    markets: Object.freeze(JSON.parse(row.markets_json) as string[]),
    channels: Object.freeze(JSON.parse(row.channels_json) as string[]),
    maximumDiscountBasisPoints: row.maximum_discount_basis_points,
    sourcePairs: Object.freeze(sources.filter((item) => item.policy_id === row.id)
      .map((item) => Object.freeze({ left: item.left_source, right: item.right_source }))),
    classPairs: Object.freeze(classes.filter((item) => item.policy_id === row.id)
      .map((item) => Object.freeze({ left: item.left_class, right: item.right_class }))),
  }) satisfies DiscountCombinationPolicy;
}

export function createDiscountCombinationOperations(
  db: D1Database,
  reserveIdentity: ReserveEventIdentity = reservePlatformEventIdentity,
) {
  return Object.freeze({
    async list(): Promise<readonly DiscountCombinationPolicy[]> {
      const { results: rows } = await db.prepare(`SELECT id, version, label, state, priority,
        currency, active_from, active_until, markets_json, channels_json,
        maximum_discount_basis_points FROM discount_combination_policies
        ORDER BY created_at DESC, id`).all<PolicyRow>();
      if (rows.length === 0) return [];
      const [sourceResult, classResult] = await Promise.all([
        db.prepare(`SELECT policy_id, left_source, right_source FROM discount_combination_source_pairs
          ORDER BY policy_id, left_source, right_source`).all<SourcePairRow>(),
        db.prepare(`SELECT policy_id, left_class, right_class FROM discount_combination_class_pairs
          ORDER BY policy_id, left_class, right_class`).all<ClassPairRow>(),
      ]);
      return Object.freeze(rows.map((row) => fromRow(row, sourceResult.results, classResult.results)));
    },

    async create(input: CreateDiscountCombinationInput): Promise<Readonly<{
      outcome: 'applied' | 'conflict'; policyId?: string;
    }>> {
      const id = `combo-${crypto.randomUUID()}`;
      const policy: DiscountCombinationPolicy = Object.freeze({
        id, version: 1, label: input.label.trim(), state: input.state,
        priority: input.priority, currency: input.currency.trim().toUpperCase(),
        activeFrom: input.activeFrom, activeUntil: input.activeUntil,
        markets: Object.freeze(input.markets.map((value) => value.trim().toUpperCase())),
        channels: Object.freeze(input.channels.map((value) => value.trim().toLowerCase())),
        maximumDiscountBasisPoints: input.maximumDiscountBasisPoints,
        sourcePairs: Object.freeze(input.sourcePairs.map((item) => {
          const [left, right] = pair(item.left, item.right);
          return Object.freeze({ left, right });
        })),
        classPairs: Object.freeze(input.classPairs.map((item) => {
          const [left, right] = pair(item.left, item.right);
          return Object.freeze({ left, right });
        })),
      });
      assertDiscountCombinationPolicy(policy);
      const identity = reserveIdentity();
      const entry = createAuditEntry(identity, {
        actor: { kind: 'admin', id: 'admin:discount-combination-config' },
        action: 'pricing.discount_combination_created',
        entity: { type: 'discount_combination_policy', id },
        diff: createAuditDiff({ state: null, version: null },
          { state: policy.state, version: 1 }, ['state', 'version']),
      });
      const statements: D1PreparedStatement[] = [
        auditInsert(db, entry),
        db.prepare(`INSERT INTO discount_combination_policies (
          id, label, state, version, priority, currency, active_from, active_until,
          markets_json, channels_json, maximum_discount_basis_points, created_at, updated_at
        ) SELECT ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM audit_log WHERE audit_id=?)`).bind(
          id, policy.label, policy.state, policy.priority, policy.currency,
          policy.activeFrom, policy.activeUntil, JSON.stringify(policy.markets),
          JSON.stringify(policy.channels), policy.maximumDiscountBasisPoints,
          identity.occurred_at, identity.occurred_at, identity.event_id,
        ),
        ...policy.sourcePairs.map((item) => db.prepare(`INSERT INTO discount_combination_source_pairs
          (policy_id, left_source, right_source) SELECT ?, ?, ?
          WHERE EXISTS (SELECT 1 FROM audit_log WHERE audit_id=?)`)
          .bind(id, item.left, item.right, identity.event_id)),
        ...policy.classPairs.map((item) => db.prepare(`INSERT INTO discount_combination_class_pairs
          (policy_id, left_class, right_class) SELECT ?, ?, ?
          WHERE EXISTS (SELECT 1 FROM audit_log WHERE audit_id=?)`)
          .bind(id, item.left, item.right, identity.event_id)),
      ];
      const results = await db.batch(statements);
      return results[0]?.meta.changes === 1 && results[1]?.meta.changes === 1
        ? { outcome: 'applied', policyId: id }
        : { outcome: 'conflict' };
    },

    async changeState(id: string, expectedVersion: number, to: DiscountCombinationPolicyState):
      Promise<'applied' | 'conflict' | 'not-found'> {
      const current = await db.prepare('SELECT state, version FROM discount_combination_policies WHERE id=?')
        .bind(id).first<{ state: DiscountCombinationPolicyState; version: number }>();
      if (!current) return 'not-found';
      if (current.version !== expectedVersion || current.state === 'archived' || current.state === to) return 'conflict';
      const identity = reserveIdentity();
      const entry = createAuditEntry(identity, {
        actor: { kind: 'admin', id: 'admin:discount-combination-config' },
        action: 'pricing.discount_combination_state_changed',
        entity: { type: 'discount_combination_policy', id },
        diff: createAuditDiff({ state: current.state, version: current.version },
          { state: to, version: current.version + 1 }, ['state', 'version']),
      });
      const audit = db.prepare(`INSERT INTO audit_log (
        audit_id, occurred_at, actor_kind, actor_id, actor_label, action,
        entity_type, entity_id, entity_reference, correlation_id,
        source_event_id, diff_json, created_at
      ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM discount_combination_policies
        WHERE id=? AND version=? AND state=?`).bind(...auditValues(entry), id, expectedVersion, current.state);
      const update = db.prepare(`UPDATE discount_combination_policies
        SET state=?, version=version+1, updated_at=? WHERE id=? AND version=? AND state=?
          AND EXISTS (SELECT 1 FROM audit_log WHERE audit_id=?)`)
        .bind(to, identity.occurred_at, id, expectedVersion, current.state, identity.event_id);
      const results = await db.batch([audit, update]);
      return results[0]?.meta.changes === 1 && results[1]?.meta.changes === 1 ? 'applied' : 'conflict';
    },
  });
}
