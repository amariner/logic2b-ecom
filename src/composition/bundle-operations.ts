import { assertBundle, createD1Bundles, type BundleDefinition, type BundleState } from '../modules/pricing';
import { createAuditDiff, createAuditEntry, serializeAuditDiff, type AuditEntry } from '../shared-kernel/audit';
import type { ReserveEventIdentity } from '../shared-kernel/events';
import { reservePlatformEventIdentity } from './event-context';

export type CreateBundleInput = Omit<BundleDefinition, 'id' | 'version' | 'state'> &
  Readonly<{ state: Extract<BundleState, 'active' | 'disabled'> }>;

function auditValues(entry: AuditEntry): readonly unknown[] {
  return [entry.audit_id, entry.occurred_at, entry.actor.kind, entry.actor.id,
    entry.actor.label ?? null, entry.action, entry.entity.type, entry.entity.id,
    entry.entity.reference ?? null, entry.correlation_id, entry.source_event_id,
    serializeAuditDiff(entry.diff), entry.occurred_at];
}
export function createBundleOperations(
  db: D1Database,
  reserveIdentity: ReserveEventIdentity = reservePlatformEventIdentity,
) {
  return Object.freeze({
    list: () => createD1Bundles(db).list(),

    async create(input: CreateBundleInput): Promise<Readonly<{
      outcome: 'applied' | 'conflict' | 'product-not-found'; bundleId?: string;
    }>> {
      const id = `bundle-${crypto.randomUUID()}`;
      const bundle: BundleDefinition = Object.freeze({
        id, version: 1, label: input.label.trim(), state: input.state, kind: input.kind,
        productId: input.productId,
        components: Object.freeze(input.components.map((item) => Object.freeze({ ...item }))),
        groups: Object.freeze(input.groups.map((group) => Object.freeze({
          ...group, label: group.label.trim(),
          options: Object.freeze(group.options.map((option) => Object.freeze({ ...option }))),
        }))),
      });
      assertBundle(bundle);
      const productIds = [bundle.productId, ...(bundle.kind === 'fixed'
        ? bundle.components.map((item) => item.productId)
        : bundle.groups.flatMap((group) => group.options.map((item) => item.productId)))];
      const existing = await db.prepare(`SELECT count(*) AS total FROM products
        WHERE active=1 AND id IN (${productIds.map(() => '?').join(',')})`).bind(...productIds)
        .first<{ total: number }>();
      if (existing?.total !== productIds.length) return { outcome: 'product-not-found' };
      const identity = reserveIdentity();
      const entry = createAuditEntry(identity, {
        actor: { kind: 'admin', id: 'admin:bundle-config' }, action: 'pricing.bundle_created',
        entity: { type: 'bundle', id },
        diff: createAuditDiff({ state: null, version: null }, { state: bundle.state, version: 1 },
          ['state', 'version']),
      });
      const groups = bundle.kind === 'configurable' ? bundle.groups : [];
      const components = bundle.kind === 'fixed'
        ? bundle.components.map((item, index) => ({ ...item, groupId: null, isDefault: true, sort: index }))
        : bundle.groups.flatMap((group) => group.options.map((item, index) => ({
          ...item, groupId: group.id, sort: index,
        })));
      const statements: D1PreparedStatement[] = [
        db.prepare(`INSERT INTO audit_log (audit_id, occurred_at, actor_kind, actor_id,
          actor_label, action, entity_type, entity_id, entity_reference, correlation_id,
          source_event_id, diff_json, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          WHERE NOT EXISTS (SELECT 1 FROM bundles WHERE product_id=?)`)
          .bind(...auditValues(entry), bundle.productId),
        db.prepare(`INSERT INTO bundles (id, product_id, label, kind, state, version, created_at, updated_at)
          SELECT ?, ?, ?, ?, 'disabled', 1, ?, ?
          WHERE EXISTS (SELECT 1 FROM audit_log WHERE audit_id=?)
            AND NOT EXISTS (SELECT 1 FROM bundles WHERE product_id=?)`)
          .bind(id, bundle.productId, bundle.label, bundle.kind, identity.occurred_at,
            identity.occurred_at, identity.event_id, bundle.productId),
        ...groups.map((group, index) => db.prepare(`INSERT INTO bundle_groups (bundle_id, id, label,
          minimum_selections, maximum_selections, sort_order) SELECT ?, ?, ?, ?, ?, ?
          WHERE EXISTS (SELECT 1 FROM audit_log WHERE audit_id=?)`).bind(
          id, group.id, group.label, group.minimumSelections, group.maximumSelections, index, identity.event_id,
        )),
        ...components.map((component) => db.prepare(`INSERT INTO bundle_components (bundle_id,
          group_id, product_id, quantity, is_default, sort_order) SELECT ?, ?, ?, ?, ?, ?
          WHERE EXISTS (SELECT 1 FROM audit_log WHERE audit_id=?)`).bind(
          id, component.groupId, component.productId, component.quantity,
          component.isDefault ? 1 : 0, component.sort, identity.event_id,
        )),
        ...(bundle.state === 'active' ? [db.prepare(`UPDATE bundles SET state='active'
          WHERE id=? AND state='disabled' AND EXISTS (SELECT 1 FROM audit_log WHERE audit_id=?)`)
          .bind(id, identity.event_id)] : []),
      ];
      const results = await db.batch(statements);
      return results[0]?.meta.changes === 1 && results[1]?.meta.changes === 1 &&
          (bundle.state !== 'active' || results.at(-1)?.meta.changes === 1)
        ? { outcome: 'applied', bundleId: id }
        : { outcome: 'conflict' };
    },

    async changeState(id: string, expectedVersion: number, to: BundleState):
      Promise<'applied' | 'conflict' | 'not-found'> {
      const current = await db.prepare('SELECT state, version FROM bundles WHERE id=?')
        .bind(id).first<{ state: BundleState; version: number }>();
      if (!current) return 'not-found';
      if (current.version !== expectedVersion || current.state === 'archived' || current.state === to) return 'conflict';
      const identity = reserveIdentity();
      const entry = createAuditEntry(identity, {
        actor: { kind: 'admin', id: 'admin:bundle-config' }, action: 'pricing.bundle_state_changed',
        entity: { type: 'bundle', id },
        diff: createAuditDiff({ state: current.state, version: current.version },
          { state: to, version: current.version + 1 }, ['state', 'version']),
      });
      const audit = db.prepare(`INSERT INTO audit_log (audit_id, occurred_at, actor_kind, actor_id,
        actor_label, action, entity_type, entity_id, entity_reference, correlation_id,
        source_event_id, diff_json, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        FROM bundles WHERE id=? AND state=? AND version=?`)
        .bind(...auditValues(entry), id, current.state, expectedVersion);
      const update = db.prepare(`UPDATE bundles SET state=?, version=version+1, updated_at=?
        WHERE id=? AND state=? AND version=? AND EXISTS (SELECT 1 FROM audit_log WHERE audit_id=?)`)
        .bind(to, identity.occurred_at, id, current.state, expectedVersion, identity.event_id);
      const results = await db.batch([audit, update]);
      return results[0]?.meta.changes === 1 && results[1]?.meta.changes === 1 ? 'applied' : 'conflict';
    },
  });
}
