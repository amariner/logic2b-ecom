import { assertPriceList, type PriceList, type PriceListState } from '../modules/pricing';
import { createAuditDiff, createAuditEntry, serializeAuditDiff, type AuditEntry } from '../shared-kernel/audit';
import type { ReserveEventIdentity } from '../shared-kernel/events';
import { reservePlatformEventIdentity } from './event-context';

export type CreatePriceListInput = Omit<PriceList, 'id' | 'version' | 'state'> &
  Readonly<{ state: Extract<PriceListState, 'active' | 'disabled'> }>;

type ListRow = Readonly<{
  id: string; version: number; label: string; state: PriceListState; priority: number;
  currency: string; active_from: string | null; active_until: string | null;
  markets_json: string; channels_json: string;
}>;
type ProductRow = Readonly<{ price_list_id: string; product_id: number; price_cents: number }>;
type CompanyRow = Readonly<{ price_list_id: string; company_key_hash: string }>;

function auditValues(entry: AuditEntry): readonly unknown[] {
  return [entry.audit_id, entry.occurred_at, entry.actor.kind, entry.actor.id,
    entry.actor.label ?? null, entry.action, entry.entity.type, entry.entity.id,
    entry.entity.reference ?? null, entry.correlation_id, entry.source_event_id,
    serializeAuditDiff(entry.diff), entry.occurred_at];
}

function auditInsert(db: D1Database, entry: AuditEntry): D1PreparedStatement {
  return db.prepare(`INSERT INTO audit_log (
    audit_id, occurred_at, actor_kind, actor_id, actor_label, action,
    entity_type, entity_id, entity_reference, correlation_id,
    source_event_id, diff_json, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(...auditValues(entry));
}

function fromRow(row: ListRow, products: readonly ProductRow[], companies: readonly CompanyRow[]): PriceList {
  return Object.freeze({
    id: row.id, version: row.version, label: row.label, state: row.state, priority: row.priority,
    currency: row.currency, activeFrom: row.active_from, activeUntil: row.active_until,
    markets: Object.freeze(JSON.parse(row.markets_json) as string[]),
    channels: Object.freeze(JSON.parse(row.channels_json) as string[]),
    companyKeyHashes: Object.freeze(companies.filter((item) => item.price_list_id === row.id)
      .map((item) => item.company_key_hash)),
    prices: Object.freeze(products.filter((item) => item.price_list_id === row.id)
      .map((item) => Object.freeze({ productId: item.product_id, priceCents: item.price_cents }))),
  });
}

export function createPriceListOperations(
  db: D1Database,
  reserveIdentity: ReserveEventIdentity = reservePlatformEventIdentity,
) {
  return Object.freeze({
    async list(): Promise<readonly PriceList[]> {
      const { results: rows } = await db.prepare(`SELECT id, version, label, state, priority,
        currency, active_from, active_until, markets_json, channels_json
        FROM price_lists ORDER BY created_at DESC, id`).all<ListRow>();
      if (rows.length === 0) return [];
      const [productResult, companyResult] = await Promise.all([
        db.prepare(`SELECT price_list_id, product_id, price_cents FROM price_list_products
          ORDER BY price_list_id, product_id`).all<ProductRow>(),
        db.prepare(`SELECT price_list_id, company_key_hash FROM price_list_companies
          ORDER BY price_list_id, company_key_hash`).all<CompanyRow>(),
      ]);
      return Object.freeze(rows.map((row) => fromRow(row, productResult.results, companyResult.results)));
    },

    async create(input: CreatePriceListInput): Promise<Readonly<{
      outcome: 'applied' | 'conflict' | 'product-not-found'; priceListId?: string;
    }>> {
      const id = `price-list-${crypto.randomUUID()}`;
      const list: PriceList = Object.freeze({
        id, version: 1, label: input.label.trim(), state: input.state, priority: input.priority,
        currency: input.currency.trim().toUpperCase(), activeFrom: input.activeFrom,
        activeUntil: input.activeUntil,
        markets: Object.freeze(input.markets.map((value) => value.trim().toUpperCase())),
        channels: Object.freeze(input.channels.map((value) => value.trim().toLowerCase())),
        companyKeyHashes: Object.freeze(input.companyKeyHashes.map((value) => value.trim().toLowerCase())),
        prices: Object.freeze(input.prices.map((item) => Object.freeze({
          productId: item.productId, priceCents: item.priceCents,
        }))),
      });
      assertPriceList(list);
      const placeholders = list.prices.map(() => '?').join(',');
      const existing = await db.prepare(`SELECT count(*) AS total FROM products WHERE id IN (${placeholders})`)
        .bind(...list.prices.map((item) => item.productId)).first<{ total: number }>();
      if (existing?.total !== list.prices.length) return { outcome: 'product-not-found' };
      const identity = reserveIdentity();
      const entry = createAuditEntry(identity, {
        actor: { kind: 'admin', id: 'admin:price-list-config' },
        action: 'pricing.price_list_created', entity: { type: 'price_list', id },
        diff: createAuditDiff({ state: null, version: null }, { state: list.state, version: 1 }, ['state', 'version']),
      });
      const statements: D1PreparedStatement[] = [
        auditInsert(db, entry),
        db.prepare(`INSERT INTO price_lists (
          id, label, state, version, priority, currency, active_from, active_until,
          markets_json, channels_json, created_at, updated_at
        ) SELECT ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM audit_log WHERE audit_id=?)`).bind(
          id, list.label, list.state, list.priority, list.currency, list.activeFrom, list.activeUntil,
          JSON.stringify(list.markets), JSON.stringify(list.channels), identity.occurred_at,
          identity.occurred_at, identity.event_id,
        ),
        ...list.prices.map((item) => db.prepare(`INSERT INTO price_list_products
          (price_list_id, product_id, price_cents) SELECT ?, ?, ?
          WHERE EXISTS (SELECT 1 FROM audit_log WHERE audit_id=?)`)
          .bind(id, item.productId, item.priceCents, identity.event_id)),
        ...list.companyKeyHashes.map((hash) => db.prepare(`INSERT INTO price_list_companies
          (price_list_id, company_key_hash) SELECT ?, ?
          WHERE EXISTS (SELECT 1 FROM audit_log WHERE audit_id=?)`).bind(id, hash, identity.event_id)),
      ];
      const results = await db.batch(statements);
      return results[0]?.meta.changes === 1 && results[1]?.meta.changes === 1
        ? { outcome: 'applied', priceListId: id }
        : { outcome: 'conflict' };
    },

    async changeState(id: string, expectedVersion: number, to: PriceListState):
      Promise<'applied' | 'conflict' | 'not-found'> {
      const current = await db.prepare('SELECT state, version FROM price_lists WHERE id=?')
        .bind(id).first<{ state: PriceListState; version: number }>();
      if (!current) return 'not-found';
      if (current.version !== expectedVersion || current.state === 'archived' || current.state === to) return 'conflict';
      const identity = reserveIdentity();
      const entry = createAuditEntry(identity, {
        actor: { kind: 'admin', id: 'admin:price-list-config' },
        action: 'pricing.price_list_state_changed', entity: { type: 'price_list', id },
        diff: createAuditDiff({ state: current.state, version: current.version },
          { state: to, version: current.version + 1 }, ['state', 'version']),
      });
      const audit = db.prepare(`INSERT INTO audit_log (
        audit_id, occurred_at, actor_kind, actor_id, actor_label, action,
        entity_type, entity_id, entity_reference, correlation_id,
        source_event_id, diff_json, created_at
      ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM price_lists
        WHERE id=? AND version=? AND state=?`).bind(...auditValues(entry), id, expectedVersion, current.state);
      const update = db.prepare(`UPDATE price_lists SET state=?, version=version+1, updated_at=?
        WHERE id=? AND version=? AND state=? AND EXISTS (SELECT 1 FROM audit_log WHERE audit_id=?)`)
        .bind(to, identity.occurred_at, id, expectedVersion, current.state, identity.event_id);
      const results = await db.batch([audit, update]);
      return results[0]?.meta.changes === 1 && results[1]?.meta.changes === 1 ? 'applied' : 'conflict';
    },
  });
}
