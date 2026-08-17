import { DatabaseSync } from 'node:sqlite';
import migration1 from '../migrations/0001_init.sql?raw';
import migration2 from '../migrations/0002_collections_and_product_capabilities.sql?raw';
import migration3 from '../migrations/0003_contact_requests.sql?raw';
import migration4 from '../migrations/0004_event_outbox.sql?raw';
import migration5 from '../migrations/0005_audit_log.sql?raw';
import migration6 from '../migrations/0006_platform_job_runs.sql?raw';
import migration7 from '../migrations/0007_product_variants.sql?raw';
import migration8 from '../migrations/0008_product_media_attributes.sql?raw';
import migration9 from '../migrations/0009_inventory_ledger.sql?raw';
import migration10 from '../migrations/0010_inventory_reservations.sql?raw';
import migration11 from '../migrations/0011_payment_ledger.sql?raw';
import migration12 from '../migrations/0012_fulfillment_lines.sql?raw';
import migration13 from '../migrations/0013_partial_refund_guards.sql?raw';
import migration14 from '../migrations/0014_order_list_indexes.sql?raw';
import migration15 from '../migrations/0015_order_collaboration.sql?raw';
import migration16 from '../migrations/0016_order_amendments.sql?raw';
import migration17 from '../migrations/0017_order_holds.sql?raw';
import migration18 from '../migrations/0018_order_bulk_actions.sql?raw';
import migration19 from '../migrations/0019_inventory_locations.sql?raw';
import migration20 from '../migrations/0020_inventory_transfers.sql?raw';
import migration21 from '../migrations/0021_inventory_counts.sql?raw';
import migration22 from '../migrations/0022_inventory_allocation.sql?raw';
import migration23 from '../migrations/0023_returns_rma.sql?raw';
import migration24 from '../migrations/0024_order_documents.sql?raw';
import migration25 from '../migrations/0025_price_rule_snapshots.sql?raw';
import migration26 from '../migrations/0026_promotion_codes.sql?raw';
import migration27 from '../migrations/0027_automatic_discounts.sql?raw';
import migration28 from '../migrations/0028_quantity_offers.sql?raw';
import migration29 from '../migrations/0029_discount_combinations.sql?raw';
import migration30 from '../migrations/0030_contextual_price_lists.sql?raw';
import migration31 from '../migrations/0031_bundles.sql?raw';
import migration32 from '../migrations/0032_stored_value.sql?raw';
import migration33 from '../migrations/0033_preorders_backorders.sql?raw';
import migration34 from '../migrations/0034_provider_subscriptions.sql?raw';
import migration35 from '../migrations/0035_preliminary_orders_deposits.sql?raw';
import migration36 from '../migrations/0036_customer_profiles.sql?raw';
import migration37 from '../migrations/0037_consent_evidence.sql?raw';

type SqlValue = string | number | bigint | null | Uint8Array;

class SqliteStatement {
  constructor(
    private readonly database: DatabaseSync,
    private readonly sql: string,
    private readonly params: readonly SqlValue[] = [],
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    return new SqliteStatement(this.database, this.sql, values as SqlValue[]) as unknown as D1PreparedStatement;
  }

  async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const statement = this.database.prepare(this.sql);
    if (/^\s*(?:SELECT|PRAGMA|WITH)\b/i.test(this.sql)) {
      const results = statement.all(...this.params) as T[];
      return {
        success: true,
        results,
        meta: {
          changes: 0,
          duration: 0,
          size_after: 0,
          rows_read: results.length,
          rows_written: 0,
          changed_db: false,
        },
      } as unknown as D1Result<T>;
    }
    const result = statement.run(...this.params);
    return {
      success: true,
      results: [],
      meta: {
        changes: result.changes,
        last_row_id: Number(result.lastInsertRowid),
        duration: 0,
        size_after: 0,
        rows_read: 0,
        rows_written: result.changes,
        changed_db: result.changes > 0,
      },
    } as unknown as D1Result<T>;
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const results = this.database.prepare(this.sql).all(...this.params) as T[];
    return { success: true, results, meta: { changes: 0 } } as D1Result<T>;
  }

  async first<T = Record<string, unknown>>(column?: string): Promise<T | null> {
    const row = this.database.prepare(this.sql).get(...this.params) as T | undefined;
    if (!row) return null;
    return column ? ((row as Record<string, unknown>)[column] as T) : row;
  }

  async raw<T = unknown[]>(): Promise<T[]> {
    return (this.database.prepare(this.sql).all(...this.params) as T[]);
  }
}

export class SqliteD1 {
  readonly sqlite = new DatabaseSync(':memory:');
  private batchTail: Promise<unknown> = Promise.resolve();

  constructor(
    includePartialRefundGuards = true,
    includePriceRuleSnapshots = true,
    includePromotionCodes = true,
    includeAutomaticDiscounts = true,
    includeQuantityOffers = true,
    includeDiscountCombinations = true,
    includePriceLists = true,
    includeBundles = true,
    includeStoredValue = true,
    includePreorders = true,
    includeSubscriptions = true,
    includePreliminaryOrders = true,
    includeCustomerProfiles = true,
    includeConsentEvidence = true,
  ) {
    this.sqlite.exec('PRAGMA foreign_keys = ON;');
    for (const migration of [
      migration1, migration2, migration3, migration4, migration5,
      migration6, migration7, migration8, migration9, migration10,
      migration11, migration12,
      ...(includePartialRefundGuards ? [
        migration13, migration14, migration15, migration16, migration17, migration18,
        migration19, migration20, migration21, migration22, migration23, migration24,
        ...(includePriceRuleSnapshots ? [
          migration25,
          ...(includePromotionCodes ? [
            migration26,
            ...(includeAutomaticDiscounts ? [
              migration27,
              ...(includeQuantityOffers ? [migration28, ...(includeDiscountCombinations
                ? [migration29, ...(includePriceLists
                  ? [migration30, ...(includeBundles
                    ? [migration31, ...(includeStoredValue
                      ? [migration32, ...(includePreorders
                        ? [migration33, ...(includeSubscriptions
                          ? [migration34, ...(includePreliminaryOrders
                            ? [migration35, ...(includeCustomerProfiles
                              ? [migration36, ...(includeConsentEvidence ? [migration37] : [])]
                              : [])]
                            : [])]
                          : [])]
                        : [])]
                      : [])]
                    : [])]
                  : [])]
                : [])] : []),
            ] : []),
          ] : []),
        ] : []),
      ] : []),
    ]) {
      this.sqlite.exec(migration);
    }
  }

  prepare(sql: string): D1PreparedStatement {
    return new SqliteStatement(this.sqlite, sql) as unknown as D1PreparedStatement;
  }

  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    const execute = async (): Promise<D1Result<T>[]> => {
      this.sqlite.exec('BEGIN IMMEDIATE;');
      try {
        const results: D1Result<T>[] = [];
        for (const statement of statements) results.push(await statement.run<T>());
        this.sqlite.exec('COMMIT;');
        return results;
      } catch (error) {
        this.sqlite.exec('ROLLBACK;');
        throw error;
      }
    };
    const result = this.batchTail.then(execute, execute);
    this.batchTail = result.then(() => undefined, () => undefined);
    return result;
  }

  query<T extends Record<string, unknown>>(sql: string, ...params: SqlValue[]): T[] {
    return this.sqlite.prepare(sql).all(...params) as T[];
  }

  value(sql: string, ...params: SqlValue[]): unknown {
    return this.sqlite.prepare(sql).get(...params)?.value;
  }

  asD1(): D1Database {
    return this as unknown as D1Database;
  }
}
