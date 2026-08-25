#!/usr/bin/env node

/** Ensayo aislado de 0044 sobre una SQLite en 0043; nunca toca el origen. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function argsOf(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--') continue;
    if (argv[index] === '--baseline-sqlite') args.baseline = argv[++index];
    else if (argv[index] === '--output-dir') args.output = argv[++index];
    else throw new Error(`Argumento desconocido: ${argv[index]}`);
  }
  if (!args.baseline || !args.output) {
    throw new Error('Uso: --baseline-sqlite <db.sqlite> --output-dir <directorio>');
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
    orders: db.prepare('SELECT * FROM orders ORDER BY id').all(),
    payments: db.prepare('SELECT * FROM payments ORDER BY id').all(),
    returns: db.prepare(`SELECT id, return_number, order_id, receive_location_id,
      status, reason_code, requested_by_kind, requested_by_id, resolution, refund_id,
      version, create_idempotency_key, authorize_idempotency_key,
      transit_idempotency_key, receive_idempotency_key, inspect_idempotency_key,
      resolve_idempotency_key, note, requested_at, authorized_at, in_transit_at,
      received_at, inspected_at, resolved_at, created_at, updated_at
      FROM return_requests ORDER BY id`).all(),
  };
}

function verify(db, phase, expectedHash) {
  integrity(db, phase);
  for (const column of ['customer_payload_fingerprint', 'customer_ownership_version',
    'customer_contract_version']) {
    if (!db.prepare("PRAGMA table_info('return_requests')").all().some((entry) => entry.name === column)) {
      throw new Error(`${phase}: falta ${column}`);
    }
  }
  for (const artifact of ['customer_return_access_refs', 'customer_return_request_evidence_guard',
    'customer_return_request_evidence_immutable']) {
    const type = artifact === 'customer_return_access_refs' ? 'table' : 'trigger';
    if (!exists(db, type, artifact)) throw new Error(`${phase}: falta ${artifact}`);
  }
  if (hash(legacySnapshot(db)) !== expectedHash) throw new Error(`${phase}: datos legacy divergentes`);
  if (scalar(db, `SELECT count(*) AS value FROM return_requests r
    LEFT JOIN customer_return_access_refs access ON access.return_id=r.id
    WHERE access.return_id IS NULL`) !== 0) throw new Error(`${phase}: selector ausente`);
}

function probe(db) {
  db.exec('SAVEPOINT customer_return_probe');
  try {
    const orderId = db.prepare('SELECT id FROM orders ORDER BY id LIMIT 1').get()?.id;
    if (orderId === undefined) return;
    db.exec(`INSERT INTO customer_profiles (id, primary_email, email_identity_hash,
      status, version, created_at, updated_at)
      VALUES ('customer_profile:return-rehearsal', 'return-rehearsal@example.test',
      '${'c'.repeat(64)}', 'active', 1, '2026-08-24T10:00:00Z',
      '2026-08-24T10:00:00Z')`);
    db.prepare(`UPDATE orders SET status='delivered',
      customer_profile_id='customer_profile:return-rehearsal' WHERE id=?`).run(orderId);
    const ownershipVersion = db.prepare(`SELECT ownership_version
      FROM customer_order_access_refs WHERE order_id=?`).get(orderId)?.ownership_version;
    db.prepare(`INSERT INTO return_requests (
      id, return_number, order_id, status, reason_code, requested_by_kind,
      requested_by_id, create_idempotency_key, requested_at, created_at, updated_at,
      customer_payload_fingerprint, customer_ownership_version,
      customer_contract_version
    ) VALUES (?, ?, ?, 'requested', 'other', 'customer', ?, ?, ?, ?, ?, ?, ?, 1)`)
      .run('rma_customer_rehearsal', 'RMA-C-REHEARSAL', orderId,
        'customer_profile:return-rehearsal', 'customer-return:rehearsal',
        '2026-08-24T10:00:00Z', '2026-08-24T10:00:00Z', '2026-08-24T10:00:00Z',
        'a'.repeat(64), ownershipVersion);
    if (scalar(db, `SELECT count(*) AS value FROM customer_return_access_refs
      WHERE return_id='rma_customer_rehearsal' AND public_ref LIKE 'ret_%'`) !== 1) {
      throw new Error('probe: selector no generado');
    }
    let immutable = false;
    try { db.exec(`UPDATE return_requests SET customer_ownership_version=customer_ownership_version+1
      WHERE id='rma_customer_rehearsal'`); } catch { immutable = true; }
    if (!immutable) throw new Error('probe: evidencia mutable');
  } finally {
    db.exec('ROLLBACK TO customer_return_probe');
    db.exec('RELEASE customer_return_probe');
  }
}

const args = argsOf(process.argv.slice(2));
const directory = join(resolve(args.output), `r5-customer-return-requests-${Date.now()}`);
mkdirSync(directory, { recursive: true });
const forwardPath = join(directory, 'forward.sqlite');
const dumpPath = join(directory, 'migrated.sql');
const restorePath = join(directory, 'restored.sqlite');
execFileSync('/usr/bin/sqlite3', [resolve(args.baseline), `.backup '${forwardPath}'`]);
let db = new DatabaseSync(forwardPath);
db.exec('PRAGMA foreign_keys=ON');
integrity(db, 'preflight');
if (!exists(db, 'table', 'customer_address_access_refs') ||
    db.prepare("PRAGMA table_info('return_requests')").all()
      .some((entry) => entry.name === 'customer_payload_fingerprint')) {
  throw new Error('baseline debe estar exactamente en 0043');
}
const before = legacySnapshot(db);
const beforeHash = hash(before);
db.exec(readFileSync(resolve('migrations/0044_customer_return_requests.sql'), 'utf8'));
verify(db, 'forward', beforeHash);
probe(db);
db.close();

const dump = execFileSync('/usr/bin/sqlite3', [forwardPath, '.dump'],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
writeFileSync(dumpPath, dump);
execFileSync('/usr/bin/sqlite3', [restorePath], { input: dump, maxBuffer: 64 * 1024 * 1024 });
let restored = new DatabaseSync(restorePath);
restored.exec('PRAGMA foreign_keys=ON');
verify(restored, 'restore', beforeHash);
probe(restored);
restored.close();

process.stdout.write(`${JSON.stringify({
  products: before.products.length,
  variants: before.variants.length,
  orders: before.orders.length,
  payments: before.payments.length,
  returns: before.returns.length,
  beforeHash,
  dumpBytes: statSync(dumpPath).size,
  artifactDirectory: directory,
}, null, 2)}\n`);
