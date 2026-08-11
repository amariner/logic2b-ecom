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

  constructor() {
    this.sqlite.exec('PRAGMA foreign_keys = ON;');
    for (const migration of [
      migration1, migration2, migration3, migration4, migration5,
      migration6, migration7, migration8, migration9, migration10,
      migration11, migration12,
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
