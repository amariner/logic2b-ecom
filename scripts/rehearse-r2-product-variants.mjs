#!/usr/bin/env node

/**
 * Ensayo no destructivo de R2.2.
 *
 * Restaura un `wrangler d1 export` en SQLite aislada, ejecuta el preflight,
 * aplica 0007, demuestra que las tablas/columnas legacy no cambian y restaura
 * un dump posterior en una segunda SQLite. Solo imprime recuentos y hashes:
 * nunca vuelca PII de la copia remota a stdout.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const CHECKS = Object.freeze([
  {
    id: 'foreign_key_violations',
    sql: 'SELECT count(*) AS failures FROM pragma_foreign_key_check',
  },
  {
    id: 'integrity_errors',
    sql: "SELECT count(*) AS failures FROM pragma_integrity_check WHERE integrity_check <> 'ok'",
  },
  {
    id: 'invalid_products',
    sql: `
      SELECT count(*) AS failures
      FROM products
      WHERE trim(slug) = ''
        OR typeof(price_cents) <> 'integer' OR price_cents < 0
        OR typeof(stock) <> 'integer' OR stock < 0
        OR active NOT IN (0, 1)
        OR trim(collection) = ''
    `,
  },
  {
    id: 'invalid_order_items',
    sql: `
      SELECT count(*) AS failures
      FROM order_items oi
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE p.id IS NULL
        OR trim(oi.name_snapshot) = ''
        OR typeof(oi.unit_price_cents) <> 'integer' OR oi.unit_price_cents < 0
        OR typeof(oi.qty) <> 'integer' OR oi.qty <= 0
    `,
  },
  {
    id: 'order_total_mismatches',
    sql: `
      SELECT count(*) AS failures
      FROM orders
      WHERE typeof(subtotal_cents) <> 'integer'
        OR typeof(shipping_cents) <> 'integer'
        OR typeof(total_cents) <> 'integer'
        OR subtotal_cents < 0 OR shipping_cents < 0 OR total_cents < 0
        OR subtotal_cents + shipping_cents <> total_cents
    `,
  },
  {
    id: 'paid_without_evidence',
    sql: `
      SELECT count(*) AS failures
      FROM orders
      WHERE status IN ('paid', 'shipped', 'delivered')
        AND trim(coalesce(stripe_session_id, '')) = ''
    `,
  },
  {
    id: 'cancelled_after_paid',
    sql: `
      SELECT count(*) AS failures
      FROM orders o
      WHERE o.status = 'cancelled'
        AND EXISTS (
          SELECT 1 FROM order_events e
          WHERE e.order_id = o.id AND e.to_status = 'paid'
        )
    `,
  },
  {
    id: 'shipped_without_tracking_or_lines',
    sql: `
      SELECT count(*) AS failures
      FROM orders o
      WHERE o.status IN ('shipped', 'delivered')
        AND (
          trim(coalesce(o.tracking_number, '')) = ''
          OR NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id)
        )
    `,
  },
  {
    id: 'duplicate_payment_intents',
    sql: `
      SELECT coalesce(sum(c - 1), 0) AS failures
      FROM (
        SELECT count(*) AS c
        FROM orders
        WHERE stripe_payment_intent IS NOT NULL
        GROUP BY stripe_payment_intent
        HAVING count(*) > 1
      )
    `,
  },
  {
    id: 'duplicate_event_idempotency_keys',
    sql: `
      SELECT coalesce(sum(c - 1), 0) AS failures
      FROM (
        SELECT count(*) AS c
        FROM event_outbox_events
        GROUP BY idempotency_key
        HAVING count(*) > 1
      )
    `,
  },
  {
    id: 'planned_sku_duplicates',
    sql: `
      SELECT coalesce(sum(c - 1), 0) AS failures
      FROM (
        SELECT count(*) AS c
        FROM products
        GROUP BY lower('LEGACY-' || id)
        HAVING count(*) > 1
      )
    `,
  },
]);

const RECONCILIATIONS = Object.freeze([
  {
    id: 'product_variant_count',
    sql: `
      SELECT abs(
        (SELECT count(*) FROM products)
        - (SELECT count(*) FROM product_variants)
      ) AS failures
    `,
  },
  {
    id: 'missing_or_multiple_defaults',
    sql: `
      SELECT count(*) AS failures
      FROM (
        SELECT p.id
        FROM products p
        LEFT JOIN product_variants pv
          ON pv.product_id = p.id AND pv.is_default = 1
        GROUP BY p.id
        HAVING count(pv.id) <> 1
      )
    `,
  },
  {
    id: 'variant_mirror_mismatches',
    sql: `
      SELECT count(*) AS failures
      FROM products p
      JOIN product_variants pv
        ON pv.product_id = p.id AND pv.is_default = 1
      WHERE pv.sku <> 'LEGACY-' || p.id
        OR pv.price_cents <> p.price_cents
        OR NOT (pv.compare_at_price_cents IS p.compare_at_price_cents)
        OR pv.status <> CASE p.active WHEN 1 THEN 'active' ELSE 'archived' END
        OR pv.option_signature IS NOT NULL
    `,
  },
  {
    id: 'order_item_variant_mismatches',
    sql: `
      SELECT count(*) AS failures
      FROM order_items oi
      JOIN product_variants pv ON pv.id = oi.variant_id
      WHERE pv.product_id <> oi.product_id
        OR oi.sku_snapshot <> pv.sku
        OR oi.product_name_snapshot <> oi.name_snapshot
        OR oi.variant_name_snapshot IS NOT NULL
    `,
  },
  {
    id: 'order_items_without_variant',
    sql: `
      SELECT count(*) AS failures
      FROM order_items
      WHERE variant_id IS NULL
        OR sku_snapshot IS NULL
        OR product_name_snapshot IS NULL
    `,
  },
  {
    id: 'unexpected_option_rows',
    sql: `
      SELECT
        (SELECT count(*) FROM product_options)
        + (SELECT count(*) FROM product_option_values)
        + (SELECT count(*) FROM product_variant_option_values)
        AS failures
    `,
  },
  ...CHECKS.slice(0, 2),
]);

function parseArguments(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--baseline') result.baseline = argv[++index];
    else if (argument === '--output-dir') result.outputDir = argv[++index];
    else throw new Error(`Argumento desconocido: ${argument}`);
  }
  if (!result.baseline || !result.outputDir) {
    throw new Error(
      'Uso: node scripts/rehearse-r2-product-variants.mjs ' +
      '--baseline <wrangler-export.sql> --output-dir <directorio>',
    );
  }
  return result;
}

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function runChecks(database, checks, phase) {
  const failures = [];
  for (const check of checks) {
    const value = Number(database.prepare(check.sql).get()?.failures ?? 0);
    if (!Number.isInteger(value) || value !== 0) failures.push({ id: check.id, failures: value });
  }
  if (failures.length > 0) {
    throw new Error(`${phase} bloqueado: ${JSON.stringify(failures)}`);
  }
}

function snapshotLegacy(database) {
  const tables = database.prepare(`
    SELECT name
    FROM sqlite_schema
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all().map((row) => String(row.name));
  const snapshot = {};
  for (const table of tables) {
    const columns = database.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`)
      .all()
      .map((row) => String(row.name));
    const projection = columns.map(quoteIdentifier).join(', ');
    snapshot[table] = database.prepare(
      `SELECT ${projection} FROM ${quoteIdentifier(table)} ORDER BY rowid`,
    ).all();
  }
  return snapshot;
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function count(database, table) {
  return Number(database.prepare(`SELECT count(*) AS value FROM ${quoteIdentifier(table)}`).get()?.value ?? 0);
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const baselinePath = resolve(args.baseline);
  const artifactRoot = resolve(args.outputDir);
  const runDirectory = join(artifactRoot, `r2-product-variants-${Date.now()}`);
  mkdirSync(runDirectory, { recursive: true });

  const migrationPath = resolve('migrations/0007_product_variants.sql');
  const baselineSql = readFileSync(baselinePath, 'utf8');
  const migrationSql = readFileSync(migrationPath, 'utf8');
  const forwardPath = join(runDirectory, 'forward.sqlite');
  const dumpPath = join(runDirectory, 'migrated.sql');
  const restoredPath = join(runDirectory, 'restored.sqlite');

  const forward = new DatabaseSync(forwardPath);
  forward.exec('PRAGMA foreign_keys = ON;');
  forward.exec(baselineSql);
  forward.exec('PRAGMA foreign_keys = ON;');
  runChecks(forward, CHECKS, 'preflight');
  const legacySnapshot = snapshotLegacy(forward);
  const legacyHash = digest(legacySnapshot);

  forward.exec(migrationSql);
  runChecks(forward, RECONCILIATIONS, 'forward');
  const legacyAfter = {};
  for (const [table, rows] of Object.entries(legacySnapshot)) {
    const columns = Object.keys(rows[0] ?? {}).map(quoteIdentifier);
    legacyAfter[table] = columns.length === 0
      ? []
      : forward.prepare(
          `SELECT ${columns.join(', ')} FROM ${quoteIdentifier(table)} ORDER BY rowid`,
        ).all();
  }
  if (digest(legacyAfter) !== legacyHash) {
    throw new Error('forward bloqueado: alguna columna legacy cambio durante R2.2');
  }

  const summary = {
    baselineBytes: statSync(baselinePath).size,
    legacyTables: Object.keys(legacySnapshot).length,
    products: count(forward, 'products'),
    variants: count(forward, 'product_variants'),
    orders: count(forward, 'orders'),
    orderItems: count(forward, 'order_items'),
    legacyHash,
  };
  forward.close();

  const dump = execFileSync('/usr/bin/sqlite3', [forwardPath, '.dump'], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  writeFileSync(dumpPath, dump, 'utf8');

  const restored = new DatabaseSync(restoredPath);
  restored.exec('PRAGMA foreign_keys = ON;');
  restored.exec(dump);
  restored.exec('PRAGMA foreign_keys = ON;');
  runChecks(restored, RECONCILIATIONS, 'restore');
  const restoredSnapshot = {};
  for (const [table, rows] of Object.entries(legacySnapshot)) {
    const columns = Object.keys(rows[0] ?? {}).map(quoteIdentifier);
    restoredSnapshot[table] = columns.length === 0
      ? []
      : restored.prepare(
          `SELECT ${columns.join(', ')} FROM ${quoteIdentifier(table)} ORDER BY rowid`,
        ).all();
  }
  const restoredHash = digest(restoredSnapshot);
  restored.close();
  if (restoredHash !== legacyHash) {
    throw new Error('restore bloqueado: la copia restaurada no coincide con los datos legacy');
  }

  process.stdout.write(`${JSON.stringify({
    ...summary,
    restoredHash,
    dumpBytes: statSync(dumpPath).size,
    artifactDirectory: runDirectory,
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
