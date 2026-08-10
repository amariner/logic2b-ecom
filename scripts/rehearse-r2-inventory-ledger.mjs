#!/usr/bin/env node

/**
 * Ensayo no destructivo de R2.7 sobre un export D1 migrado hasta 0008.
 * Restaura, valida precondiciones, aplica 0009 y prueba dump/restore. Solo
 * imprime recuentos y hashes; ninguna fila ni PII sale por stdout.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function argumentsFrom(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--baseline') result.baseline = argv[++index];
    else if (argv[index] === '--output-dir') result.outputDir = argv[++index];
    else throw new Error(`Argumento desconocido: ${argv[index]}`);
  }
  if (!result.baseline || !result.outputDir) {
    throw new Error(
      'Uso: node scripts/rehearse-r2-inventory-ledger.mjs ' +
      '--baseline <export.sql> --output-dir <directorio>',
    );
  }
  return result;
}

function scalar(db, sql) {
  return Number(db.prepare(sql).get()?.value ?? 0);
}

function assertZero(db, id, sql) {
  const failures = scalar(db, sql);
  if (!Number.isInteger(failures) || failures !== 0) {
    throw new Error(`${id} bloqueado: ${failures}`);
  }
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function legacySnapshot(db) {
  return {
    products: db.prepare('SELECT * FROM products ORDER BY id').all(),
    variants: db.prepare('SELECT * FROM product_variants ORDER BY id').all(),
    items: db.prepare('SELECT * FROM order_items ORDER BY id').all(),
  };
}

function inventorySnapshot(db) {
  return {
    balances: db.prepare('SELECT * FROM inventory_balances ORDER BY variant_id').all(),
    movements: db.prepare('SELECT * FROM inventory_movements ORDER BY id').all(),
  };
}

function preflight(db) {
  assertZero(db, 'preflight:foreign_keys', 'SELECT count(*) AS value FROM pragma_foreign_key_check');
  assertZero(db, 'preflight:integrity', "SELECT count(*) AS value FROM pragma_integrity_check WHERE integrity_check <> 'ok'");
  assertZero(db, 'preflight:invalid_stock', `
    SELECT count(*) AS value FROM products
    WHERE typeof(stock) <> 'integer' OR stock < 0
  `);
  assertZero(db, 'preflight:missing_or_multiple_default', `
    SELECT count(*) AS value FROM (
      SELECT p.id FROM products p
      LEFT JOIN product_variants pv ON pv.product_id = p.id AND pv.is_default = 1
      GROUP BY p.id HAVING count(pv.id) <> 1
    )
  `);
  assertZero(db, 'preflight:variantless_products', `
    SELECT count(*) AS value FROM products p
    WHERE NOT EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id)
  `);
}

function verify(db, phase) {
  assertZero(db, `${phase}:foreign_keys`, 'SELECT count(*) AS value FROM pragma_foreign_key_check');
  assertZero(db, `${phase}:integrity`, "SELECT count(*) AS value FROM pragma_integrity_check WHERE integrity_check <> 'ok'");
  assertZero(db, `${phase}:missing_balance`, `
    SELECT abs(
      (SELECT count(*) FROM product_variants)
      - (SELECT count(*) FROM inventory_balances)
    ) AS value
  `);
  assertZero(db, `${phase}:opening_count`, `
    SELECT abs(
      (SELECT count(*) FROM inventory_balances)
      - (SELECT count(*) FROM inventory_movements WHERE reason = 'legacy_opening_balance')
    ) AS value
  `);
  assertZero(db, `${phase}:backfill_mismatch`, `
    SELECT count(*) AS value
    FROM inventory_balances b
    JOIN product_variants pv ON pv.id = b.variant_id
    JOIN products p ON p.id = pv.product_id
    WHERE b.on_hand <> p.stock OR b.reserved <> 0 OR b.version <> 1
  `);
  assertZero(db, `${phase}:ledger_sum`, `
    SELECT count(*) AS value FROM (
      SELECT b.variant_id
      FROM inventory_balances b
      LEFT JOIN inventory_movements m ON m.variant_id = b.variant_id
      GROUP BY b.variant_id
      HAVING b.on_hand <> coalesce(sum(m.delta), 0)
        OR b.version <> coalesce(max(m.version_after), 0)
        OR b.on_hand <> coalesce(max(CASE WHEN m.version_after = b.version THEN m.balance_after END), -1)
    )
  `);
  assertZero(db, `${phase}:duplicate_idempotency`, `
    SELECT coalesce(sum(c - 1), 0) AS value FROM (
      SELECT count(*) AS c FROM inventory_movements
      GROUP BY idempotency_key HAVING count(*) > 1
    )
  `);
}

const args = argumentsFrom(process.argv.slice(2));
const baselinePath = resolve(args.baseline);
const runDirectory = join(resolve(args.outputDir), `r2-inventory-ledger-${Date.now()}`);
mkdirSync(runDirectory, { recursive: true });
const forwardPath = join(runDirectory, 'forward.sqlite');
const dumpPath = join(runDirectory, 'migrated.sql');
const restoredPath = join(runDirectory, 'restored.sqlite');

const db = new DatabaseSync(forwardPath);
db.exec('PRAGMA foreign_keys = OFF;');
db.exec(readFileSync(baselinePath, 'utf8'));
db.exec('PRAGMA foreign_keys = ON;');
preflight(db);
const legacyHash = digest(legacySnapshot(db));
db.exec(readFileSync(resolve('migrations/0009_inventory_ledger.sql'), 'utf8'));
verify(db, 'forward');
if (digest(legacySnapshot(db)) !== legacyHash) {
  throw new Error('forward bloqueado: cambió el contrato legacy');
}
const canonicalHash = digest(inventorySnapshot(db));
const summary = {
  baselineBytes: statSync(baselinePath).size,
  variants: scalar(db, 'SELECT count(*) AS value FROM product_variants'),
  balances: scalar(db, 'SELECT count(*) AS value FROM inventory_balances'),
  movements: scalar(db, 'SELECT count(*) AS value FROM inventory_movements'),
  legacyHash,
  canonicalHash,
};
db.close();

const dump = execFileSync('/usr/bin/sqlite3', [forwardPath, '.dump'], {
  encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
});
writeFileSync(dumpPath, dump, 'utf8');
const restored = new DatabaseSync(restoredPath);
restored.exec('PRAGMA foreign_keys = OFF;');
restored.exec(dump);
restored.exec('PRAGMA foreign_keys = ON;');
verify(restored, 'restore');
if (digest(legacySnapshot(restored)) !== legacyHash) throw new Error('restore bloqueado: hash legacy distinto');
if (digest(inventorySnapshot(restored)) !== canonicalHash) throw new Error('restore bloqueado: hash canónico distinto');
restored.close();

process.stdout.write(`${JSON.stringify({
  ...summary,
  dumpBytes: statSync(dumpPath).size,
  artifactDirectory: runDirectory,
}, null, 2)}\n`);
