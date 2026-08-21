#!/usr/bin/env node

/** Ensayo aislado de 0041 sobre un export D1 en 0040; nunca toca el origen. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function argsOf(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--') continue;
    if (argv[index] === '--baseline') args.baseline = argv[++index];
    else if (argv[index] === '--output-dir') args.output = argv[++index];
    else throw new Error(`Argumento desconocido: ${argv[index]}`);
  }
  if (!args.baseline || !args.output) {
    throw new Error('Uso: --baseline <export.sql> --output-dir <directorio>');
  }
  return args;
}

const scalar = (db, sql) => Number(db.prepare(sql).get()?.value ?? 0);
const exists = (db, type, name) => Boolean(db.prepare(
  'SELECT 1 FROM sqlite_master WHERE type=? AND name=?',
).get(type, name));
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function integrity(db, phase) {
  if (scalar(db, 'SELECT count(*) AS value FROM pragma_foreign_key_check') !== 0) {
    throw new Error(`${phase}: foreign keys`);
  }
  if (scalar(db, "SELECT count(*) AS value FROM pragma_integrity_check WHERE integrity_check <> 'ok'") !== 0) {
    throw new Error(`${phase}: integrity`);
  }
}

function legacySnapshot(db) {
  return {
    products: db.prepare('SELECT * FROM products ORDER BY id').all(),
    variants: db.prepare('SELECT * FROM product_variants ORDER BY id').all(),
    balances: db.prepare('SELECT * FROM inventory_balances ORDER BY variant_id').all(),
    orders: db.prepare('SELECT * FROM orders ORDER BY id').all(),
    items: db.prepare('SELECT * FROM order_items ORDER BY id').all(),
    payments: db.prepare('SELECT * FROM payments ORDER BY id').all(),
    profiles: db.prepare('SELECT * FROM customer_profiles ORDER BY id').all(),
    addresses: db.prepare(`SELECT * FROM customer_address_revisions
      ORDER BY address_id, revision`).all(),
    identities: db.prepare('SELECT * FROM customer_auth_identities ORDER BY id').all(),
    sessions: db.prepare('SELECT * FROM customer_sessions ORDER BY id').all(),
    challenges: db.prepare('SELECT * FROM customer_passwordless_challenges ORDER BY id').all(),
  };
}

function accessSnapshot(db) {
  return db.prepare(`SELECT order_id, public_ref, ownership_version
    FROM customer_order_access_refs ORDER BY order_id`).all();
}

function verify(db, phase, expectedOrders) {
  integrity(db, phase);
  if (!exists(db, 'table', 'customer_order_access_refs')) {
    throw new Error(`${phase}: falta customer_order_access_refs`);
  }
  if (scalar(db, 'SELECT count(*) AS value FROM customer_order_access_refs') !== expectedOrders) {
    throw new Error(`${phase}: no existe exactamente una referencia por pedido`);
  }
  if (scalar(db, `SELECT count(*) AS value FROM customer_order_access_refs
    WHERE length(public_ref) <> 36 OR substr(public_ref, 1, 4) <> 'ord_'
      OR substr(public_ref, 5) GLOB '*[^0-9a-f]*'
      OR ownership_version < 1`) !== 0) {
    throw new Error(`${phase}: referencia o versión inválida`);
  }
  if (scalar(db, `SELECT count(*) AS value FROM (
    SELECT public_ref FROM customer_order_access_refs
    GROUP BY public_ref HAVING count(*) > 1
  )`) !== 0) {
    throw new Error(`${phase}: colisión de referencias`);
  }
  if (scalar(db, `SELECT count(*) AS value FROM orders orders
    LEFT JOIN customer_order_access_refs access ON access.order_id=orders.id
    WHERE access.order_id IS NULL`) !== 0) {
    throw new Error(`${phase}: pedido sin referencia`);
  }
  for (const trigger of ['customer_order_access_after_order_insert',
    'customer_order_access_owner_precondition', 'customer_order_access_owner_version',
    'customer_order_access_ref_update_guard']) {
    if (!exists(db, 'trigger', trigger)) throw new Error(`${phase}: falta ${trigger}`);
  }
}

function probeRuntime(db) {
  db.exec('SAVEPOINT customer_order_access_probe');
  try {
    db.exec(`
      INSERT INTO customer_profiles (
        id, primary_email, email_identity_hash, status, version, created_at, updated_at
      ) VALUES ('customer_profile:rehearsal', 'rehearsal@example.test',
        '${'f'.repeat(64)}', 'active', 1,
        '2026-08-21T10:00:00.000Z', '2026-08-21T10:00:00.000Z');
      INSERT INTO orders (
        order_number, email, customer_name, address_json, subtotal_cents,
        shipping_cents, total_cents, status, stripe_session_id, currency
      ) VALUES ('ORDER-ACCESS-REHEARSAL', 'rehearsal@example.test', 'Rehearsal', '{}',
        100, 0, 100, 'pending', 'session-access-rehearsal', 'EUR');
    `);
    if (scalar(db, `SELECT count(*) AS value FROM customer_order_access_refs access
      JOIN orders ON orders.id=access.order_id
      WHERE orders.order_number='ORDER-ACCESS-REHEARSAL'
        AND access.ownership_version=1`) !== 1) {
      throw new Error('probe: el alta no generó referencia');
    }
    db.exec(`UPDATE orders SET customer_profile_id='customer_profile:rehearsal'
      WHERE order_number='ORDER-ACCESS-REHEARSAL'`);
    if (scalar(db, `SELECT access.ownership_version AS value
      FROM customer_order_access_refs access JOIN orders ON orders.id=access.order_id
      WHERE orders.order_number='ORDER-ACCESS-REHEARSAL'`) !== 2) {
      throw new Error('probe: el cambio de owner no incrementó versión');
    }
  } finally {
    db.exec('ROLLBACK TO customer_order_access_probe');
    db.exec('RELEASE customer_order_access_probe');
  }
}

const args = argsOf(process.argv.slice(2));
const baseline = resolve(args.baseline);
const directory = join(resolve(args.output), `r5-customer-order-access-${Date.now()}`);
mkdirSync(directory, { recursive: true });
const forwardPath = join(directory, 'forward.sqlite');
const dumpPath = join(directory, 'migrated.sql');
const restorePath = join(directory, 'restored.sqlite');
let db = new DatabaseSync(forwardPath);
db.exec('PRAGMA foreign_keys=OFF');
db.exec(readFileSync(baseline, 'utf8'));
// Los dumps SQLite restauran FTS mediante writable_schema; reabrir fuerza a
// recargar ese schema antes de probar triggers de `orders`.
db.close();
db = new DatabaseSync(forwardPath);
db.exec('PRAGMA foreign_keys=ON');
integrity(db, 'preflight');
if (!exists(db, 'table', 'customer_auth_throttle_events') ||
    exists(db, 'table', 'customer_order_access_refs')) {
  throw new Error('baseline debe estar exactamente en 0040');
}
const before = legacySnapshot(db);
const beforeHash = hash(before);
const orderCount = before.orders.length;
const guestOrders = scalar(db, 'SELECT count(*) AS value FROM orders WHERE customer_profile_id IS NULL');
db.exec(readFileSync(resolve('migrations/0041_customer_order_access.sql'), 'utf8'));
verify(db, 'forward', orderCount);
if (hash(legacySnapshot(db)) !== beforeHash) throw new Error('0041 alteró datos existentes');
if (scalar(db, 'SELECT count(*) AS value FROM orders WHERE customer_profile_id IS NULL') !== guestOrders) {
  throw new Error('0041 reclamó pedidos guest');
}
probeRuntime(db);
const accessHash = hash(accessSnapshot(db));
db.close();

const dump = execFileSync('/usr/bin/sqlite3', [forwardPath, '.dump'],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
writeFileSync(dumpPath, dump);
let restored = new DatabaseSync(restorePath);
restored.exec('PRAGMA foreign_keys=OFF');
restored.exec(dump);
restored.close();
restored = new DatabaseSync(restorePath);
restored.exec('PRAGMA foreign_keys=ON');
verify(restored, 'restore', orderCount);
if (hash(legacySnapshot(restored)) !== beforeHash) throw new Error('restore legacy divergente');
if (hash(accessSnapshot(restored)) !== accessHash) throw new Error('restore de referencias divergente');
restored.close();

process.stdout.write(`${JSON.stringify({
  products: before.products.length,
  variants: before.variants.length,
  balances: before.balances.length,
  orders: orderCount,
  guestOrders,
  payments: before.payments.length,
  profiles: before.profiles.length,
  beforeHash,
  accessHash,
  dumpBytes: statSync(dumpPath).size,
  artifactDirectory: directory,
}, null, 2)}\n`);
