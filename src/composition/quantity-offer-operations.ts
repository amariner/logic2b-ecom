import {
  assertQuantityOffer,
  type PriceRuleCandidate,
  type QuantityOffer,
  type QuantityOfferState,
} from '../modules/pricing';
import { createAuditDiff, createAuditEntry, serializeAuditDiff, type AuditEntry } from '../shared-kernel/audit';
import type { ReserveEventIdentity } from '../shared-kernel/events';
import { reservePlatformEventIdentity } from './event-context';

export type CreateQuantityOfferInput =
  | Omit<Extract<QuantityOffer, { kind: 'quantity_tier' }>, 'id' | 'version'>
  | Omit<Extract<QuantityOffer, { kind: 'buy_x_get_y' }>, 'id' | 'version'>;

type OfferRow = Readonly<{
  id: string; label: string; public_reason: string; state: QuantityOfferState; version: number;
  priority: number; currency: string; kind: QuantityOffer['kind'];
  tier_basis: 'quantity' | 'subtotal' | null; buy_quantity: number | null;
  reward_quantity: number | null; reward_effect_type: 'percentage_off' | 'amount_off' | null;
  reward_basis_points: number | null; reward_amount_cents: number | null;
  max_applications: number | null; active_from: string | null; active_until: string | null;
  markets_json: string; channels_json: string;
}>;

type TierRow = Readonly<{
  offer_id: string; threshold: number; effect_type: 'percentage_off' | 'amount_off';
  basis_points: number | null; amount_cents: number | null;
}>;
type ScopeRow = Readonly<{ offer_id: string; role: 'eligible' | 'buy' | 'reward'; product_id: number }>;

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

function effectOf(row: Readonly<{
  effect_type: 'percentage_off' | 'amount_off'; basis_points: number | null; amount_cents: number | null;
}>): PriceRuleCandidate['effect'] {
  return row.effect_type === 'percentage_off'
    ? { type: 'percentage_off', basisPoints: row.basis_points! }
    : { type: 'amount_off', amountCents: row.amount_cents! };
}

function fromRow(row: OfferRow, tiers: readonly TierRow[], scopes: readonly ScopeRow[]): QuantityOffer {
  const common = {
    id: row.id, version: row.version, label: row.label, publicReason: row.public_reason,
    state: row.state, priority: row.priority, currency: row.currency,
    activeFrom: row.active_from, activeUntil: row.active_until,
    markets: Object.freeze(JSON.parse(row.markets_json) as string[]),
    channels: Object.freeze(JSON.parse(row.channels_json) as string[]),
  } as const;
  return row.kind === 'quantity_tier'
    ? Object.freeze({
      ...common, kind: 'quantity_tier' as const, tierBasis: row.tier_basis!,
      tiers: Object.freeze(tiers.map((tier) => Object.freeze({
        threshold: tier.threshold, effect: Object.freeze(effectOf(tier)),
      }))),
      productIds: Object.freeze(scopes.filter((scope) => scope.role === 'eligible').map((scope) => scope.product_id)),
    })
    : Object.freeze({
      ...common, kind: 'buy_x_get_y' as const, buyQuantity: row.buy_quantity!,
      rewardQuantity: row.reward_quantity!, maxApplications: row.max_applications,
      rewardEffect: Object.freeze(effectOf({ effect_type: row.reward_effect_type!,
        basis_points: row.reward_basis_points, amount_cents: row.reward_amount_cents })),
      buyProductIds: Object.freeze(scopes.filter((scope) => scope.role === 'buy').map((scope) => scope.product_id)),
      rewardProductIds: Object.freeze(scopes.filter((scope) => scope.role === 'reward').map((scope) => scope.product_id)),
    });
}

function allProductIds(offer: QuantityOffer): readonly number[] {
  return offer.kind === 'quantity_tier'
    ? offer.productIds
    : [...new Set([...offer.buyProductIds, ...offer.rewardProductIds])];
}

export function createQuantityOfferOperations(
  db: D1Database,
  reserveIdentity: ReserveEventIdentity = reservePlatformEventIdentity,
) {
  return Object.freeze({
    findKind(id: string): Promise<QuantityOffer['kind'] | null> {
      return db.prepare('SELECT kind FROM quantity_offers WHERE id=?')
        .bind(id).first<QuantityOffer['kind']>('kind');
    },

    async list(): Promise<readonly QuantityOffer[]> {
      const { results: rows } = await db.prepare(`SELECT id, label, public_reason, state, version,
        priority, currency, kind, tier_basis, buy_quantity, reward_quantity, reward_effect_type,
        reward_basis_points, reward_amount_cents, max_applications, active_from, active_until,
        markets_json, channels_json FROM quantity_offers ORDER BY created_at DESC, id`).all<OfferRow>();
      if (rows.length === 0) return [];
      const [tierResult, scopeResult] = await Promise.all([
        db.prepare(`SELECT offer_id, threshold, effect_type, basis_points, amount_cents
          FROM quantity_offer_tiers ORDER BY offer_id, threshold`).all<TierRow>(),
        db.prepare(`SELECT offer_id, role, product_id FROM quantity_offer_products
          ORDER BY offer_id, role, product_id`).all<ScopeRow>(),
      ]);
      return Object.freeze(rows.map((row) => fromRow(
        row,
        tierResult.results.filter((tier) => tier.offer_id === row.id),
        scopeResult.results.filter((scope) => scope.offer_id === row.id),
      )));
    },

    async create(input: CreateQuantityOfferInput): Promise<Readonly<{
      outcome: 'applied' | 'conflict' | 'unknown-product'; offerId?: string;
    }>> {
      const id = `qty-${crypto.randomUUID()}`;
      const common = {
        id, version: 1, label: input.label.trim(), publicReason: input.publicReason.trim(),
        state: input.state, priority: input.priority, currency: input.currency.trim().toUpperCase(),
        activeFrom: input.activeFrom, activeUntil: input.activeUntil,
        markets: Object.freeze(input.markets.map((value) => value.trim().toUpperCase())),
        channels: Object.freeze(input.channels.map((value) => value.trim().toLowerCase())),
      } as const;
      const offer: QuantityOffer = input.kind === 'quantity_tier'
        ? Object.freeze({
          ...common, kind: 'quantity_tier', tierBasis: input.tierBasis,
          tiers: Object.freeze(input.tiers.map((tier) => Object.freeze({
            threshold: tier.threshold, effect: Object.freeze({ ...tier.effect }),
          }))),
          productIds: Object.freeze([...input.productIds].sort((left, right) => left - right)),
        })
        : Object.freeze({
          ...common, kind: 'buy_x_get_y', buyQuantity: input.buyQuantity,
          rewardQuantity: input.rewardQuantity, rewardEffect: Object.freeze({ ...input.rewardEffect }),
          maxApplications: input.maxApplications,
          buyProductIds: Object.freeze([...input.buyProductIds].sort((left, right) => left - right)),
          rewardProductIds: Object.freeze([...input.rewardProductIds].sort((left, right) => left - right)),
        });
      assertQuantityOffer(offer);
      const productIds = allProductIds(offer);
      if (productIds.length > 0) {
        const placeholders = productIds.map(() => '?').join(',');
        const found = await db.prepare(`SELECT count(*) AS count FROM products WHERE id IN (${placeholders})`)
          .bind(...productIds).first<{ count: number }>();
        if (Number(found?.count ?? 0) !== productIds.length) return { outcome: 'unknown-product' };
      }
      const identity = reserveIdentity();
      const entry = createAuditEntry(identity, {
        actor: { kind: 'admin', id: 'admin:quantity-offer-config' },
        action: 'pricing.quantity_offer_created', entity: { type: 'quantity_offer', id },
        diff: createAuditDiff({ state: null, version: null }, { state: offer.state, version: 1 }, ['state', 'version']),
      });
      const isTier = offer.kind === 'quantity_tier';
      const rewardEffect = isTier ? null : offer.rewardEffect;
      const statements: D1PreparedStatement[] = [
        auditInsert(db, entry),
        db.prepare(`INSERT INTO quantity_offers (
          id, label, public_reason, state, version, priority, currency, kind, tier_basis,
          buy_quantity, reward_quantity, reward_effect_type, reward_basis_points,
          reward_amount_cents, max_applications, active_from, active_until,
          markets_json, channels_json, created_at, updated_at
        ) SELECT ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM audit_log WHERE audit_id=?)`).bind(
          id, offer.label.trim(), offer.publicReason.trim(), offer.state, offer.priority,
          offer.currency.toUpperCase(), offer.kind, isTier ? offer.tierBasis : null,
          isTier ? null : offer.buyQuantity, isTier ? null : offer.rewardQuantity,
          rewardEffect?.type ?? null,
          rewardEffect?.type === 'percentage_off' ? rewardEffect.basisPoints : null,
          rewardEffect?.type === 'amount_off' ? rewardEffect.amountCents : null,
          isTier ? null : offer.maxApplications, offer.activeFrom, offer.activeUntil,
          JSON.stringify(offer.markets), JSON.stringify(offer.channels),
          identity.occurred_at, identity.occurred_at, identity.event_id,
        ),
      ];
      if (offer.kind === 'quantity_tier') {
        statements.push(...offer.tiers.map((tier) => db.prepare(`INSERT INTO quantity_offer_tiers (
          offer_id, threshold, effect_type, basis_points, amount_cents
        ) SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM audit_log WHERE audit_id=?)`).bind(
          id, tier.threshold, tier.effect.type,
          tier.effect.type === 'percentage_off' ? tier.effect.basisPoints : null,
          tier.effect.type === 'amount_off' ? tier.effect.amountCents : null,
          identity.event_id,
        )));
        statements.push(...offer.productIds.map((productId) => db.prepare(`INSERT INTO quantity_offer_products
          (offer_id, role, product_id) SELECT ?, 'eligible', ?
          WHERE EXISTS (SELECT 1 FROM audit_log WHERE audit_id=?)`).bind(id, productId, identity.event_id)));
      } else {
        statements.push(...offer.buyProductIds.map((productId) => db.prepare(`INSERT INTO quantity_offer_products
          (offer_id, role, product_id) SELECT ?, 'buy', ?
          WHERE EXISTS (SELECT 1 FROM audit_log WHERE audit_id=?)`).bind(id, productId, identity.event_id)));
        statements.push(...offer.rewardProductIds.map((productId) => db.prepare(`INSERT INTO quantity_offer_products
          (offer_id, role, product_id) SELECT ?, 'reward', ?
          WHERE EXISTS (SELECT 1 FROM audit_log WHERE audit_id=?)`).bind(id, productId, identity.event_id)));
      }
      const results = await db.batch(statements);
      return results[0]?.meta.changes === 1 && results[1]?.meta.changes === 1
        ? { outcome: 'applied', offerId: id }
        : { outcome: 'conflict' };
    },

    async changeState(id: string, expectedVersion: number, to: QuantityOfferState): Promise<'applied' | 'conflict' | 'not-found'> {
      const current = await db.prepare('SELECT state, version FROM quantity_offers WHERE id=?')
        .bind(id).first<{ state: QuantityOfferState; version: number }>();
      if (!current) return 'not-found';
      if (current.version !== expectedVersion || current.state === 'archived' || current.state === to) return 'conflict';
      const identity = reserveIdentity();
      const entry = createAuditEntry(identity, {
        actor: { kind: 'admin', id: 'admin:quantity-offer-config' },
        action: 'pricing.quantity_offer_state_changed', entity: { type: 'quantity_offer', id },
        diff: createAuditDiff({ state: current.state, version: current.version },
          { state: to, version: current.version + 1 }, ['state', 'version']),
      });
      const audit = db.prepare(`INSERT INTO audit_log (
        audit_id, occurred_at, actor_kind, actor_id, actor_label, action,
        entity_type, entity_id, entity_reference, correlation_id,
        source_event_id, diff_json, created_at
      ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM quantity_offers
        WHERE id=? AND version=? AND state=?`).bind(...auditValues(entry), id, expectedVersion, current.state);
      const update = db.prepare(`UPDATE quantity_offers SET state=?, version=version+1, updated_at=?
        WHERE id=? AND version=? AND state=?
          AND EXISTS (SELECT 1 FROM audit_log WHERE audit_id=?)`)
        .bind(to, identity.occurred_at, id, expectedVersion, current.state, identity.event_id);
      const results = await db.batch([audit, update]);
      return results[0]?.meta.changes === 1 && results[1]?.meta.changes === 1 ? 'applied' : 'conflict';
    },
  });
}
