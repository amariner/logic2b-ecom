import {
  assertAutomaticDiscount,
  type AutomaticDiscount,
  type AutomaticDiscountState,
} from '../modules/pricing';
import { createAuditDiff, createAuditEntry, serializeAuditDiff, type AuditEntry } from '../shared-kernel/audit';
import type { ReserveEventIdentity } from '../shared-kernel/events';
import { reservePlatformEventIdentity } from './event-context';

export type CreateAutomaticDiscountInput = Readonly<{
  label: string;
  publicReason: string;
  state: Extract<AutomaticDiscountState, 'active' | 'disabled'>;
  priority: number;
  currency: string;
  effect: AutomaticDiscount['effect'];
  activeFrom: string | null;
  activeUntil: string | null;
  markets: readonly string[];
  channels: readonly string[];
  minimumSubtotalCents: number;
  productIds: readonly number[];
}>;

type DiscountRow = Readonly<{
  id: string;
  label: string;
  public_reason: string;
  state: AutomaticDiscountState;
  version: number;
  priority: number;
  currency: string;
  effect_type: 'percentage_off' | 'amount_off';
  basis_points: number | null;
  amount_cents: number | null;
  active_from: string | null;
  active_until: string | null;
  markets_json: string;
  channels_json: string;
  minimum_subtotal_cents: number;
}>;

function auditValues(entry: AuditEntry): readonly unknown[] {
  return [
    entry.audit_id, entry.occurred_at, entry.actor.kind, entry.actor.id,
    entry.actor.label ?? null, entry.action, entry.entity.type, entry.entity.id,
    entry.entity.reference ?? null, entry.correlation_id, entry.source_event_id,
    serializeAuditDiff(entry.diff), entry.occurred_at,
  ];
}

function auditInsert(db: D1Database, entry: AuditEntry): D1PreparedStatement {
  return db.prepare(`
    INSERT INTO audit_log (
      audit_id, occurred_at, actor_kind, actor_id, actor_label, action,
      entity_type, entity_id, entity_reference, correlation_id,
      source_event_id, diff_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(...auditValues(entry));
}

function fromRow(row: DiscountRow, productIds: readonly number[]): AutomaticDiscount {
  const effect = row.effect_type === 'percentage_off'
    ? { type: 'percentage_off' as const, basisPoints: row.basis_points! }
    : { type: 'amount_off' as const, amountCents: row.amount_cents! };
  return Object.freeze({
    id: row.id,
    label: row.label,
    publicReason: row.public_reason,
    state: row.state,
    version: row.version,
    priority: row.priority,
    currency: row.currency,
    effect: Object.freeze(effect),
    activeFrom: row.active_from,
    activeUntil: row.active_until,
    markets: Object.freeze(JSON.parse(row.markets_json) as string[]),
    channels: Object.freeze(JSON.parse(row.channels_json) as string[]),
    minimumSubtotalCents: row.minimum_subtotal_cents,
    productIds: Object.freeze([...productIds]),
  });
}

export function createAutomaticDiscountOperations(
  db: D1Database,
  reserveIdentity: ReserveEventIdentity = reservePlatformEventIdentity,
) {
  return Object.freeze({
    async list(): Promise<readonly AutomaticDiscount[]> {
      const { results: rows } = await db.prepare(`
        SELECT id, label, public_reason, state, version, priority, currency,
          effect_type, basis_points, amount_cents, active_from, active_until,
          markets_json, channels_json, minimum_subtotal_cents
        FROM automatic_discounts ORDER BY created_at DESC, id
      `).all<DiscountRow>();
      if (rows.length === 0) return [];
      const { results: scopes } = await db.prepare(`
        SELECT discount_id, product_id FROM automatic_discount_products
        ORDER BY discount_id, product_id
      `).all<{ discount_id: string; product_id: number }>();
      return Object.freeze(rows.map((row) => fromRow(
        row,
        scopes.filter((scope) => scope.discount_id === row.id).map((scope) => scope.product_id),
      )));
    },

    async create(input: CreateAutomaticDiscountInput): Promise<Readonly<{
      outcome: 'applied' | 'conflict' | 'unknown-product';
      discountId?: string;
    }>> {
      const id = `auto-${crypto.randomUUID()}`;
      const discount: AutomaticDiscount = Object.freeze({
        id,
        version: 1,
        label: input.label.trim(),
        publicReason: input.publicReason.trim(),
        state: input.state,
        priority: input.priority,
        currency: input.currency.trim().toUpperCase(),
        effect: Object.freeze({ ...input.effect }),
        activeFrom: input.activeFrom,
        activeUntil: input.activeUntil,
        markets: Object.freeze(input.markets.map((value) => value.trim().toUpperCase())),
        channels: Object.freeze(input.channels.map((value) => value.trim().toLowerCase())),
        minimumSubtotalCents: input.minimumSubtotalCents,
        productIds: Object.freeze([...input.productIds].sort((left, right) => left - right)),
      });
      assertAutomaticDiscount(discount);
      if (discount.productIds.length > 0) {
        const placeholders = discount.productIds.map(() => '?').join(',');
        const row = await db.prepare(`SELECT count(*) AS count FROM products WHERE id IN (${placeholders})`)
          .bind(...discount.productIds).first<{ count: number }>();
        if (Number(row?.count ?? 0) !== discount.productIds.length) return { outcome: 'unknown-product' };
      }
      const identity = reserveIdentity();
      const entry = createAuditEntry(identity, {
        actor: { kind: 'admin', id: 'admin:automatic-discount-config' },
        action: 'pricing.automatic_discount_created',
        entity: { type: 'automatic_discount', id },
        diff: createAuditDiff(
          { state: null, version: null },
          { state: discount.state, version: discount.version },
          ['state', 'version'],
        ),
      });
      const effect = discount.effect;
      const statements: D1PreparedStatement[] = [
        auditInsert(db, entry),
        db.prepare(`
          INSERT INTO automatic_discounts (
            id, label, public_reason, state, version, priority, currency,
            effect_type, basis_points, amount_cents, active_from, active_until,
            markets_json, channels_json, minimum_subtotal_cents, created_at, updated_at
          )
          SELECT ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          WHERE EXISTS (SELECT 1 FROM audit_log WHERE audit_id=?)
        `).bind(
          id, discount.label, discount.publicReason, discount.state, discount.priority,
          discount.currency, effect.type,
          effect.type === 'percentage_off' ? effect.basisPoints : null,
          effect.type === 'amount_off' ? effect.amountCents : null,
          discount.activeFrom, discount.activeUntil,
          JSON.stringify(discount.markets), JSON.stringify(discount.channels),
          discount.minimumSubtotalCents, identity.occurred_at, identity.occurred_at,
          identity.event_id,
        ),
        ...discount.productIds.map((productId) => db.prepare(`
          INSERT INTO automatic_discount_products (discount_id, product_id)
          SELECT ?, ? WHERE EXISTS (SELECT 1 FROM audit_log WHERE audit_id=?)
        `).bind(id, productId, identity.event_id)),
      ];
      const results = await db.batch(statements);
      return results[0]?.meta.changes === 1 && results[1]?.meta.changes === 1
        ? { outcome: 'applied', discountId: id }
        : { outcome: 'conflict' };
    },

    async changeState(
      id: string,
      expectedVersion: number,
      to: AutomaticDiscountState,
    ): Promise<'applied' | 'conflict' | 'not-found'> {
      const current = await db.prepare('SELECT state, version FROM automatic_discounts WHERE id=?')
        .bind(id).first<{ state: AutomaticDiscountState; version: number }>();
      if (!current) return 'not-found';
      if (current.version !== expectedVersion || current.state === 'archived' || current.state === to) return 'conflict';
      const identity = reserveIdentity();
      const entry = createAuditEntry(identity, {
        actor: { kind: 'admin', id: 'admin:automatic-discount-config' },
        action: 'pricing.automatic_discount_state_changed',
        entity: { type: 'automatic_discount', id },
        diff: createAuditDiff(
          { state: current.state, version: current.version },
          { state: to, version: current.version + 1 },
          ['state', 'version'],
        ),
      });
      const audit = db.prepare(`
        INSERT INTO audit_log (
          audit_id, occurred_at, actor_kind, actor_id, actor_label, action,
          entity_type, entity_id, entity_reference, correlation_id,
          source_event_id, diff_json, created_at
        ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        FROM automatic_discounts WHERE id=? AND version=? AND state=?
      `).bind(...auditValues(entry), id, expectedVersion, current.state);
      const update = db.prepare(`
        UPDATE automatic_discounts SET state=?, version=version+1, updated_at=?
        WHERE id=? AND version=? AND state=?
          AND EXISTS (SELECT 1 FROM audit_log WHERE audit_id=?)
      `).bind(to, identity.occurred_at, id, expectedVersion, current.state, identity.event_id);
      const results = await db.batch([audit, update]);
      return results[0]?.meta.changes === 1 && results[1]?.meta.changes === 1 ? 'applied' : 'conflict';
    },
  });
}
