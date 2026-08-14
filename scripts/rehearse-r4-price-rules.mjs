#!/usr/bin/env node

/** Ensayo aislado de 0025 sobre un export D1 en 0024; nunca toca el origen. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function argsOf(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--') continue;
    if (argv[i] === '--baseline') args.baseline = argv[++i];
    else if (argv[i] === '--output-dir') args.output = argv[++i];
    else throw new Error(`Argumento desconocido: ${argv[i]}`);
  }
  if (!args.baseline || !args.output) throw new Error('Uso: --baseline <export.sql> --output-dir <directorio>');
  return args;
}

const scalar = (db, sql) => Number(db.prepare(sql).get()?.value ?? 0);
const exists = (db, type, name) => Boolean(db.prepare(
  'SELECT 1 FROM sqlite_master WHERE type=? AND name=?',
).get(type, name));
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function integrity(db, phase) {
  if (scalar(db, 'SELECT count(*) AS value FROM pragma_foreign_key_check') !== 0) throw new Error(`${phase}: foreign keys`);
  if (scalar(db, "SELECT count(*) AS value FROM pragma_integrity_check WHERE integrity_check <> 'ok'") !== 0) throw new Error(`${phase}: integrity`);
}

function legacySnapshot(db) {
  return {
    orders: db.prepare('SELECT * FROM orders ORDER BY id').all(),
    orderItems: db.prepare(`
      SELECT id, order_id, product_id, variant_id, name_snapshot, sku_snapshot,
             product_name_snapshot, variant_name_snapshot, unit_price_cents,
             qty, current_qty
      FROM order_items ORDER BY id
    `).all(),
  };
}

function verify(db, phase, expectedLines) {
  integrity(db, phase);
  const columns = db.prepare("SELECT name FROM pragma_table_info('order_items')").all().map((row) => row.name);
  for (const column of ['base_unit_price_cents', 'pricing_snapshot_json']) {
    if (!columns.includes(column)) throw new Error(`${phase}: falta ${column}`);
  }
  if (!exists(db, 'trigger', 'order_item_pricing_snapshot_legacy_insert')) {
    throw new Error(`${phase}: falta compatibilidad con writer anterior`);
  }
  if (!exists(db, 'index', 'idx_order_items_pricing_rule')) throw new Error(`${phase}: falta índice de regla`);
  if (scalar(db, 'SELECT count(*) AS value FROM order_items') !== expectedLines) throw new Error(`${phase}: cambió el número de líneas`);
  if (scalar(db, 'SELECT count(*) AS value FROM order_items WHERE base_unit_price_cents <> unit_price_cents') !== 0) {
    throw new Error(`${phase}: el backfill alteró precio base`);
  }
  if (scalar(db, `
    SELECT count(*) AS value
    FROM order_items oi JOIN orders o ON o.id=oi.order_id
    WHERE json_valid(oi.pricing_snapshot_json)=0
       OR json_extract(oi.pricing_snapshot_json, '$.schema') <> 1
       OR json_extract(oi.pricing_snapshot_json, '$.currency') <> upper(o.currency)
       OR json_extract(oi.pricing_snapshot_json, '$.base_unit_price_cents') <> oi.unit_price_cents
       OR json_extract(oi.pricing_snapshot_json, '$.unit_price_cents') <> oi.unit_price_cents
       OR json_extract(oi.pricing_snapshot_json, '$.quantity') <> coalesce(oi.current_qty, oi.qty)
       OR json_extract(oi.pricing_snapshot_json, '$.discount_cents') <> 0
       OR json_extract(oi.pricing_snapshot_json, '$.subtotal_cents')
          <> oi.unit_price_cents * coalesce(oi.current_qty, oi.qty)
  `) !== 0) throw new Error(`${phase}: snapshot de backfill divergente`);
}

const args = argsOf(process.argv.slice(2));
const baseline = resolve(args.baseline);
const directory = join(resolve(args.output), `r4-price-rules-${Date.now()}`);
mkdirSync(directory, { recursive: true });
const forwardPath = join(directory, 'forward.sqlite');
const dumpPath = join(directory, 'migrated.sql');
const restorePath = join(directory, 'restored.sqlite');
const db = new DatabaseSync(forwardPath);
db.exec('PRAGMA foreign_keys=OFF');
db.exec(readFileSync(baseline, 'utf8'));
db.exec('PRAGMA foreign_keys=ON');
integrity(db, 'preflight');
if (!exists(db, 'table', 'order_documents') ||
    db.prepare("SELECT 1 FROM pragma_table_info('order_items') WHERE name='pricing_snapshot_json'").get()) {
  throw new Error('baseline debe estar en 0024');
}
const before = legacySnapshot(db);
const beforeHash = hash(before);
const expectedLines = before.orderItems.length;
db.exec(readFileSync(resolve('migrations/0025_price_rule_snapshots.sql'), 'utf8'));
verify(db, 'forward', expectedLines);
if (hash(legacySnapshot(db)) !== beforeHash) throw new Error('la migración alteró columnas de negocio existentes');
const summary = {
  orders: before.orders.length,
  orderItems: expectedLines,
  backfilledSnapshots: scalar(db, "SELECT count(*) AS value FROM order_items WHERE json_extract(pricing_snapshot_json, '$.source')='r4.1-backfill'"),
  beforeHash,
};
db.close();
const dump = execFileSync('/usr/bin/sqlite3', [forwardPath, '.dump'],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
writeFileSync(dumpPath, dump);
const restored = new DatabaseSync(restorePath);
restored.exec('PRAGMA foreign_keys=OFF');
restored.exec(dump);
restored.exec('PRAGMA foreign_keys=ON');
verify(restored, 'restore', expectedLines);
if (hash(legacySnapshot(restored)) !== beforeHash) throw new Error('restore divergente');
restored.close();
process.stdout.write(`${JSON.stringify({ ...summary, dumpBytes: statSync(dumpPath).size,
  artifactDirectory: directory }, null, 2)}\n`);
