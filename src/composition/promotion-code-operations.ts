import {
  assertPromotionCode,
  normalizePromotionCode,
  promotionCodeHash,
  promotionCodeHint,
  type PromotionCode,
  type PromotionCodeState,
} from '../modules/pricing';
import { createAuditDiff, createAuditEntry, serializeAuditDiff, type AuditEntry } from '../shared-kernel/audit';
import type { ReserveEventIdentity } from '../shared-kernel/events';
import { reservePlatformEventIdentity } from './event-context';

export type PromotionCodeSummary = PromotionCode & Readonly<{ codeHint: string }>;

export type CreatePromotionCodeInput = Readonly<{
  code: string;
  label: string;
  state: Extract<PromotionCodeState, 'active' | 'disabled'>;
  priority: number;
  currency: string;
  effect: PromotionCode['effect'];
  activeFrom: string | null;
  activeUntil: string | null;
  markets: readonly string[];
  channels: readonly string[];
  globalUsageLimit: number | null;
  perCustomerUsageLimit: number | null;
  minimumSubtotalCents: number;
  productIds: readonly number[];
}>;

type PromotionListRow = Readonly<{
  id: string;
  code_hint: string;
  label: string;
  state: PromotionCodeState;
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
  global_usage_limit: number | null;
  per_customer_usage_limit: number | null;
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

function promotionFrom(row: PromotionListRow, productIds: readonly number[]): PromotionCodeSummary {
  const effect = row.effect_type === 'percentage_off'
    ? { type: 'percentage_off' as const, basisPoints: row.basis_points! }
    : { type: 'amount_off' as const, amountCents: row.amount_cents! };
  return Object.freeze({
    id: row.id,
    codeHint: row.code_hint,
    label: row.label,
    state: row.state,
    version: row.version,
    priority: row.priority,
    currency: row.currency,
    effect: Object.freeze(effect),
    activeFrom: row.active_from,
    activeUntil: row.active_until,
    markets: Object.freeze(JSON.parse(row.markets_json) as string[]),
    channels: Object.freeze(JSON.parse(row.channels_json) as string[]),
    globalUsageLimit: row.global_usage_limit,
    perCustomerUsageLimit: row.per_customer_usage_limit,
    minimumSubtotalCents: row.minimum_subtotal_cents,
    productIds: Object.freeze([...productIds]),
  });
}

export function createPromotionCodeOperations(
  db: D1Database,
  reserveIdentity: ReserveEventIdentity = reservePlatformEventIdentity,
) {
  return Object.freeze({
    async list(): Promise<readonly PromotionCodeSummary[]> {
      const { results: rows } = await db.prepare(`
        SELECT id, code_hint, label, state, version, priority, currency,
          effect_type, basis_points, amount_cents, active_from, active_until,
          markets_json, channels_json, global_usage_limit,
          per_customer_usage_limit, minimum_subtotal_cents
        FROM promotion_codes ORDER BY created_at DESC, id
      `).all<PromotionListRow>();
      if (rows.length === 0) return [];
      const { results: scopes } = await db.prepare(`
        SELECT promotion_id, product_id FROM promotion_code_products
        ORDER BY promotion_id, product_id
      `).all<{ promotion_id: string; product_id: number }>();
      return Object.freeze(rows.map((row) => promotionFrom(
        row,
        scopes.filter((scope) => scope.promotion_id === row.id).map((scope) => scope.product_id),
      )));
    },

    async create(input: CreatePromotionCodeInput): Promise<Readonly<{
      outcome: 'applied' | 'conflict' | 'unknown-product';
      promotionId?: string;
      normalizedCode?: string;
    }>> {
      const normalizedCode = normalizePromotionCode(input.code);
      const id = `promo-${crypto.randomUUID()}`;
      const promotion: PromotionCode = Object.freeze({
        id,
        version: 1,
        label: input.label.trim(),
        state: input.state,
        priority: input.priority,
        currency: input.currency.trim().toUpperCase(),
        effect: Object.freeze({ ...input.effect }),
        activeFrom: input.activeFrom,
        activeUntil: input.activeUntil,
        markets: Object.freeze(input.markets.map((value) => value.trim().toUpperCase())),
        channels: Object.freeze(input.channels.map((value) => value.trim().toLowerCase())),
        globalUsageLimit: input.globalUsageLimit,
        perCustomerUsageLimit: input.perCustomerUsageLimit,
        minimumSubtotalCents: input.minimumSubtotalCents,
        productIds: Object.freeze([...input.productIds].sort((left, right) => left - right)),
      });
      assertPromotionCode(promotion);
      if (promotion.productIds.length > 0) {
        const placeholders = promotion.productIds.map(() => '?').join(',');
        const row = await db.prepare(`SELECT count(*) AS count FROM products WHERE id IN (${placeholders})`)
          .bind(...promotion.productIds).first<{ count: number }>();
        if (Number(row?.count ?? 0) !== promotion.productIds.length) return { outcome: 'unknown-product' };
      }
      const identity = reserveIdentity();
      const entry = createAuditEntry(identity, {
        actor: { kind: 'admin', id: 'admin:promotion-config' },
        action: 'pricing.promotion_created',
        entity: { type: 'promotion_code', id },
        diff: createAuditDiff(
          { state: null, version: null },
          { state: promotion.state, version: promotion.version },
          ['state', 'version'],
        ),
      });
      const effect = promotion.effect;
      const statements: D1PreparedStatement[] = [
        auditInsert(db, entry),
        db.prepare(`
          INSERT INTO promotion_codes (
            id, code_hash, code_hint, label, state, version, priority, currency,
            effect_type, basis_points, amount_cents, active_from, active_until,
            markets_json, channels_json, global_usage_limit,
            per_customer_usage_limit, minimum_subtotal_cents, created_at, updated_at
          )
          SELECT ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          WHERE EXISTS (SELECT 1 FROM audit_log WHERE audit_id=?)
        `).bind(
          id, await promotionCodeHash(normalizedCode), promotionCodeHint(normalizedCode),
          promotion.label, promotion.state, promotion.priority, promotion.currency,
          effect.type,
          effect.type === 'percentage_off' ? effect.basisPoints : null,
          effect.type === 'amount_off' ? effect.amountCents : null,
          promotion.activeFrom, promotion.activeUntil,
          JSON.stringify(promotion.markets), JSON.stringify(promotion.channels),
          promotion.globalUsageLimit, promotion.perCustomerUsageLimit,
          promotion.minimumSubtotalCents, identity.occurred_at, identity.occurred_at,
          identity.event_id,
        ),
        ...promotion.productIds.map((productId) => db.prepare(`
          INSERT INTO promotion_code_products (promotion_id, product_id)
          SELECT ?, ? WHERE EXISTS (SELECT 1 FROM audit_log WHERE audit_id=?)
        `).bind(id, productId, identity.event_id)),
      ];
      try {
        const results = await db.batch(statements);
        return results[0]?.meta.changes === 1 && results[1]?.meta.changes === 1
          ? { outcome: 'applied', promotionId: id, normalizedCode }
          : { outcome: 'conflict' };
      } catch (error) {
        if (error instanceof Error && /UNIQUE|promotion_codes\.code_hash/i.test(error.message)) {
          return { outcome: 'conflict' };
        }
        throw error;
      }
    },

    async changeState(
      id: string,
      expectedVersion: number,
      to: PromotionCodeState,
    ): Promise<'applied' | 'conflict' | 'not-found'> {
      const current = await db.prepare('SELECT state, version FROM promotion_codes WHERE id=?')
        .bind(id).first<{ state: PromotionCodeState; version: number }>();
      if (!current) return 'not-found';
      if (current.version !== expectedVersion || current.state === 'archived' || current.state === to) return 'conflict';
      const identity = reserveIdentity();
      const entry = createAuditEntry(identity, {
        actor: { kind: 'admin', id: 'admin:promotion-config' },
        action: 'pricing.promotion_state_changed',
        entity: { type: 'promotion_code', id },
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
        FROM promotion_codes WHERE id=? AND version=? AND state=?
      `).bind(...auditValues(entry), id, expectedVersion, current.state);
      const update = db.prepare(`
        UPDATE promotion_codes SET state=?, version=version+1, updated_at=?
        WHERE id=? AND version=? AND state=?
          AND EXISTS (SELECT 1 FROM audit_log WHERE audit_id=?)
      `).bind(to, identity.occurred_at, id, expectedVersion, current.state, identity.event_id);
      const results = await db.batch([audit, update]);
      return results[0]?.meta.changes === 1 && results[1]?.meta.changes === 1 ? 'applied' : 'conflict';
    },
  });
}
