#!/usr/bin/env node

/**
 * Ensayo no destructivo de R2.8 sobre un dump migrado hasta 0009.
 * Aplica 0010, comprueba que no altera saldo/ledger ni crea holds y valida un
 * dump/restore. Solo imprime recuentos y hashes, nunca filas ni PII.
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
      'Uso: node scripts/rehearse-r2-inventory-reservations.mjs ' +
      '--baseline <dump-r2.7.sql> --output-dir <directorio>',
    );
  }
  return result;
}

function scalar(db, sql) {
  return Number(db.prepare(sql).get()?.value ?? 0);
}

function assertZero(db, id, sql) {
  const failures = scalar(db, sql);
  if (!Number.isInteger(failures) || failures !== 0) throw new Error(`${id} bloqueado: ${failures}`);
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function inventorySnapshot(db) {
  return {
    balances: db.prepare(`
      SELECT variant_id, on_hand, reserved, version, updated_at
      FROM inventory_balances ORDER BY variant_id
    `).all(),
    movements: db.prepare('SELECT * FROM inventory_movements ORDER BY id').all(),
    products: db.prepare('SELECT id, stock FROM products ORDER BY id').all(),
  };
}

function preflight(db) {
  assertZero(db, 'preflight:foreign_keys', 'SELECT count(*) AS value FROM pragma_foreign_key_check');
  assertZero(db, 'preflight:integrity', "SELECT count(*) AS value FROM pragma_integrity_check WHERE integrity_check <> 'ok'");
  assertZero(db, 'preflight:reserved', 'SELECT count(*) AS value FROM inventory_balances WHERE reserved <> 0');
  assertZero(db, 'preflight:ledger_sum', `
    SELECT count(*) AS value FROM (
      SELECT b.variant_id
      FROM inventory_balances b
      LEFT JOIN inventory_movements m ON m.variant_id = b.variant_id
      GROUP BY b.variant_id
      HAVING b.on_hand <> coalesce(sum(m.delta), 0)
    )
  `);
}

function verify(db, phase) {
  assertZero(db, `${phase}:foreign_keys`, 'SELECT count(*) AS value FROM pragma_foreign_key_check');
  assertZero(db, `${phase}:integrity`, "SELECT count(*) AS value FROM pragma_integrity_check WHERE integrity_check <> 'ok'");
  assertZero(db, `${phase}:unexpected_reservation_version`, `
    SELECT count(*) AS value FROM inventory_balances WHERE reservation_version <> 1
  `);
  assertZero(db, `${phase}:reservations`, 'SELECT count(*) AS value FROM inventory_reservations');
  assertZero(db, `${phase}:reservation_lines`, 'SELECT count(*) AS value FROM inventory_reservation_lines');
  assertZero(db, `${phase}:reservation_events`, 'SELECT count(*) AS value FROM inventory_reservation_events');
  assertZero(db, `${phase}:reservation_balance_events`, 'SELECT count(*) AS value FROM inventory_reservation_balance_events');
  assertZero(db, `${phase}:reserved_reconciliation`, `
    SELECT count(*) AS value FROM inventory_balances WHERE reserved <> 0
  `);
}

const args = argumentsFrom(process.argv.slice(2));
const baselinePath = resolve(args.baseline);
const runDirectory = join(resolve(args.outputDir), `r2-inventory-reservations-${Date.now()}`);
mkdirSync(runDirectory, { recursive: true });
const forwardPath = join(runDirectory, 'forward.sqlite');
const dumpPath = join(runDirectory, 'migrated.sql');
const restoredPath = join(runDirectory, 'restored.sqlite');

const db = new DatabaseSync(forwardPath);
db.exec('PRAGMA foreign_keys = OFF;');
db.exec(readFileSync(baselinePath, 'utf8'));
db.exec('PRAGMA foreign_keys = ON;');
preflight(db);
const beforeHash = digest(inventorySnapshot(db));
db.exec(readFileSync(resolve('migrations/0010_inventory_reservations.sql'), 'utf8'));
verify(db, 'forward');
const afterHash = digest(inventorySnapshot(db));
if (afterHash !== beforeHash) throw new Error('forward bloqueado: cambió saldo, ledger o espejo');
const schemaHash = digest(db.prepare(`
  SELECT type, name, sql FROM sqlite_schema
  WHERE name LIKE 'inventory_reservation%' OR name = 'inventory_balances'
  ORDER BY type, name
`).all());
const summary = {
  baselineBytes: statSync(baselinePath).size,
  balances: scalar(db, 'SELECT count(*) AS value FROM inventory_balances'),
  reservations: scalar(db, 'SELECT count(*) AS value FROM inventory_reservations'),
  inventoryHash: afterHash,
  schemaHash,
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
if (digest(inventorySnapshot(restored)) !== afterHash) throw new Error('restore bloqueado: hash de inventario distinto');
if (digest(restored.prepare(`
  SELECT type, name, sql FROM sqlite_schema
  WHERE name LIKE 'inventory_reservation%' OR name = 'inventory_balances'
  ORDER BY type, name
`).all()) !== schemaHash) throw new Error('restore bloqueado: hash de esquema distinto');
restored.close();

process.stdout.write(`${JSON.stringify({
  ...summary,
  dumpBytes: statSync(dumpPath).size,
  artifactDirectory: runDirectory,
}, null, 2)}\n`);
