#!/usr/bin/env node

/**
 * Ensayo no destructivo de R2.11 sobre un export D1 en 0011. Materializa 0012
 * y su backfill solo dentro de una copia aislada; prueba replay, dump y restore
 * sin imprimir pedidos, tracking ni otros datos operativos.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fulfillmentBackfillSql } from '../src/modules/fulfillment/infrastructure/fulfillment-backfill.ts';

function argumentsFrom(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--baseline') result.baseline = argv[++index];
    else if (argv[index] === '--output-dir') result.outputDir = argv[++index];
    else throw new Error(`Argumento desconocido: ${argv[index]}`);
  }
  if (!result.baseline || !result.outputDir) {
    throw new Error(
      'Uso: node scripts/rehearse-r2-fulfillment-lines.mjs ' +
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
  if (!Number.isInteger(failures) || failures !== 0) throw new Error(`${id} bloqueado: ${failures}`);
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function tableExists(db, table) {
  return scalar(db, `SELECT count(*) AS value FROM sqlite_master WHERE type='table' AND name='${table}'`) === 1;
}

function legacySnapshot(db) {
  return {
    orders: db.prepare(`
      SELECT id, status, tracking_carrier, tracking_number, created_at, updated_at
      FROM orders ORDER BY id
    `).all(),
    items: db.prepare('SELECT id, order_id, qty FROM order_items ORDER BY id').all(),
    events: db.prepare(`
      SELECT id, order_id, from_status, to_status, note, created_at
      FROM order_events ORDER BY id
    `).all(),
  };
}

function fulfillmentSnapshot(db) {
  return {
    fulfillments: db.prepare('SELECT * FROM fulfillments ORDER BY id').all(),
    items: db.prepare(`
      SELECT * FROM fulfillment_items ORDER BY fulfillment_id, order_item_id
    `).all(),
  };
}

function preflight(db) {
  if (!tableExists(db, 'payments')) throw new Error('preflight bloqueado: falta R2.9/0011');
  if (tableExists(db, 'fulfillments')) throw new Error('preflight bloqueado: baseline ya contiene R2.11');
  assertZero(db, 'preflight:foreign_keys', 'SELECT count(*) AS value FROM pragma_foreign_key_check');
  assertZero(db, 'preflight:integrity', "SELECT count(*) AS value FROM pragma_integrity_check WHERE integrity_check <> 'ok'");
  assertZero(db, 'preflight:shipped_without_lines', `
    SELECT count(*) AS value FROM orders o
    WHERE o.status IN ('shipped', 'delivered')
      AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id)
  `);
  assertZero(db, 'preflight:invalid_line_quantity', `
    SELECT count(*) AS value FROM order_items
    WHERE typeof(qty) <> 'integer' OR qty <= 0
  `);
  assertZero(db, 'preflight:tracking', `
    SELECT count(*) AS value FROM orders
    WHERE status IN ('shipped', 'delivered') AND (
      tracking_carrier IS NULL OR trim(tracking_carrier) = '' OR
      tracking_number IS NULL OR trim(tracking_number) = ''
    )
  `);
  assertZero(db, 'preflight:shipped_event', `
    SELECT count(*) AS value FROM orders o
    WHERE o.status IN ('shipped', 'delivered') AND NOT EXISTS (
      SELECT 1 FROM order_events e WHERE e.order_id = o.id AND e.to_status = 'shipped'
    )
  `);
  assertZero(db, 'preflight:delivered_event', `
    SELECT count(*) AS value FROM orders o
    WHERE o.status = 'delivered' AND NOT EXISTS (
      SELECT 1 FROM order_events e WHERE e.order_id = o.id AND e.to_status = 'delivered'
    )
  `);
}

function verify(db, phase) {
  assertZero(db, `${phase}:foreign_keys`, 'SELECT count(*) AS value FROM pragma_foreign_key_check');
  assertZero(db, `${phase}:integrity`, "SELECT count(*) AS value FROM pragma_integrity_check WHERE integrity_check <> 'ok'");
  assertZero(db, `${phase}:group_count`, `
    SELECT abs(
      (SELECT count(*) FROM orders WHERE status IN ('shipped', 'delivered')) -
      (SELECT count(*) FROM fulfillments)
    ) AS value
  `);
  assertZero(db, `${phase}:missing_or_multiple_group`, `
    SELECT count(*) AS value FROM (
      SELECT o.id FROM orders o LEFT JOIN fulfillments f ON f.order_id = o.id
      WHERE o.status IN ('shipped', 'delivered')
      GROUP BY o.id HAVING count(f.id) <> 1
    )
  `);
  assertZero(db, `${phase}:projection`, `
    SELECT count(*) AS value
    FROM orders o JOIN fulfillments f ON f.order_id = o.id
    WHERE f.status <> o.status
       OR f.carrier <> o.tracking_carrier
       OR f.tracking_number <> o.tracking_number
       OR f.shipped_at <> (
         SELECT e.created_at FROM order_events e
         WHERE e.order_id = o.id AND e.to_status = 'shipped' ORDER BY e.id LIMIT 1
       )
       OR (o.status = 'delivered' AND f.delivered_at <> (
         SELECT e.created_at FROM order_events e
         WHERE e.order_id = o.id AND e.to_status = 'delivered' ORDER BY e.id LIMIT 1
       ))
  `);
  assertZero(db, `${phase}:line_projection`, `
    SELECT count(*) AS value FROM (
      SELECT oi.id, oi.qty, coalesce(sum(fi.quantity), 0) AS fulfilled
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id AND o.status IN ('shipped', 'delivered')
      LEFT JOIN fulfillment_items fi ON fi.order_item_id = oi.id
      GROUP BY oi.id HAVING fulfilled <> oi.qty
    )
  `);
  assertZero(db, `${phase}:unexpected_group`, `
    SELECT count(*) AS value FROM fulfillments f JOIN orders o ON o.id = f.order_id
    WHERE o.status NOT IN ('shipped', 'delivered')
  `);
  assertZero(db, `${phase}:sensitive_columns`, `
    SELECT count(*) AS value FROM (
      SELECT name FROM pragma_table_info('fulfillments')
      UNION ALL SELECT name FROM pragma_table_info('fulfillment_items')
    ) WHERE lower(name) LIKE '%email%' OR lower(name) LIKE '%address%'
       OR lower(name) LIKE '%customer%' OR lower(name) LIKE '%price%'
       OR lower(name) LIKE '%sku%' OR lower(name) LIKE '%response%'
  `);
}

const args = argumentsFrom(process.argv.slice(2));
const baselinePath = resolve(args.baseline);
const runDirectory = join(resolve(args.outputDir), `r2-fulfillment-lines-${Date.now()}`);
mkdirSync(runDirectory, { recursive: true });
const forwardPath = join(runDirectory, 'forward.sqlite');
const backfillPath = join(runDirectory, 'backfill.sql');
const dumpPath = join(runDirectory, 'migrated.sql');
const restoredPath = join(runDirectory, 'restored.sqlite');

const db = new DatabaseSync(forwardPath);
db.exec('PRAGMA foreign_keys = OFF;');
db.exec(readFileSync(baselinePath, 'utf8'));
db.exec('PRAGMA foreign_keys = ON;');
preflight(db);
const legacyHash = digest(legacySnapshot(db));
db.exec(readFileSync(resolve('migrations/0012_fulfillment_lines.sql'), 'utf8'));
const backfill = fulfillmentBackfillSql();
writeFileSync(backfillPath, backfill, 'utf8');
db.exec(backfill);
verify(db, 'forward');
if (digest(legacySnapshot(db)) !== legacyHash) throw new Error('forward bloqueado: cambio el contrato legacy');
const canonicalHash = digest(fulfillmentSnapshot(db));
db.exec(backfill);
verify(db, 'replay');
if (digest(fulfillmentSnapshot(db)) !== canonicalHash) {
  throw new Error('replay bloqueado: backfill no idempotente');
}
const summary = {
  baselineBytes: statSync(baselinePath).size,
  shippedOrders: scalar(db, "SELECT count(*) AS value FROM orders WHERE status IN ('shipped','delivered')"),
  fulfillments: scalar(db, 'SELECT count(*) AS value FROM fulfillments'),
  allocations: scalar(db, 'SELECT count(*) AS value FROM fulfillment_items'),
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
if (digest(fulfillmentSnapshot(restored)) !== canonicalHash) {
  throw new Error('restore bloqueado: hash canonico distinto');
}
restored.close();

process.stdout.write(`${JSON.stringify({
  ...summary,
  dumpBytes: statSync(dumpPath).size,
  artifactDirectory: runDirectory,
}, null, 2)}\n`);
