#!/usr/bin/env node

/** Ensayo aislado de 0040 sobre un export D1 en 0039; nunca toca el origen. */
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
const pendingIdentityCollisions = (db) => scalar(db, `SELECT count(*) AS value FROM (
  SELECT identity_id FROM customer_passwordless_challenges
  WHERE status = 'pending'
  GROUP BY identity_id HAVING count(*) > 1
)`);

function integrity(db, phase) {
  if (scalar(db, 'SELECT count(*) AS value FROM pragma_foreign_key_check') !== 0) {
    throw new Error(`${phase}: foreign keys`);
  }
  if (scalar(db, "SELECT count(*) AS value FROM pragma_integrity_check WHERE integrity_check <> 'ok'") !== 0) {
    throw new Error(`${phase}: integrity`);
  }
}

function snapshot(db) {
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
    merges: db.prepare('SELECT * FROM customer_profile_merges ORDER BY idempotency_key').all(),
    consents: db.prepare('SELECT * FROM customer_consent_evidence ORDER BY id').all(),
    rights: db.prepare(`SELECT * FROM customer_data_rights_evidence
      ORDER BY request_id, version`).all(),
    rightsDecisions: db.prepare(`SELECT * FROM customer_data_rights_plan_decisions
      ORDER BY evidence_id, position`).all(),
    rightsArtifacts: db.prepare(`SELECT * FROM customer_data_rights_artifact_references
      ORDER BY evidence_id, position`).all(),
    identities: db.prepare('SELECT * FROM customer_auth_identities ORDER BY id').all(),
    families: db.prepare('SELECT * FROM customer_session_families ORDER BY id').all(),
    sessions: db.prepare('SELECT * FROM customer_sessions ORDER BY id').all(),
    challenges: db.prepare('SELECT * FROM customer_passwordless_challenges ORDER BY id').all(),
    audit: db.prepare('SELECT * FROM audit_log ORDER BY audit_id').all(),
    revokeAllOperations: exists(db, 'table', 'customer_auth_revoke_all_operations')
      ? db.prepare(`SELECT * FROM customer_auth_revoke_all_operations
        ORDER BY idempotency_key`).all()
      : [],
    deliveries: exists(db, 'table', 'customer_passwordless_challenge_deliveries')
      ? db.prepare(`SELECT * FROM customer_passwordless_challenge_deliveries
        ORDER BY challenge_id`).all()
      : [],
    capabilityOperations: exists(db, 'table', 'customer_auth_capability_operations')
      ? db.prepare(`SELECT * FROM customer_auth_capability_operations
        ORDER BY resulting_version`).all()
      : [],
    capabilityState: exists(db, 'table', 'customer_auth_capability_state')
      ? db.prepare(`SELECT * FROM customer_auth_capability_state
        ORDER BY capability_id`).all()
      : [],
  };
}

function verify(db, phase) {
  integrity(db, phase);
  if (!exists(db, 'table', 'customer_auth_throttle_events')) {
    throw new Error(`${phase}: falta customer_auth_throttle_events`);
  }
  if (!exists(db, 'table', 'customer_auth_revoke_all_operations')) {
    throw new Error(`${phase}: falta customer_auth_revoke_all_operations`);
  }
  for (const table of ['customer_passwordless_challenge_deliveries',
    'customer_auth_capability_operations', 'customer_auth_capability_state']) {
    if (!exists(db, 'table', table)) throw new Error(`${phase}: falta ${table}`);
  }
  if (scalar(db, 'SELECT count(*) AS value FROM customer_auth_throttle_events') !== 0) {
    throw new Error(`${phase}: 0040 inventó decisiones de throttle`);
  }
  if (scalar(db, 'SELECT count(*) AS value FROM customer_auth_revoke_all_operations') !== 0) {
    throw new Error(`${phase}: 0040 inventó comandos revoke-all`);
  }
  if (scalar(db, 'SELECT count(*) AS value FROM customer_passwordless_challenge_deliveries') !== 0) {
    throw new Error(`${phase}: 0040 inventó confirmaciones de entrega`);
  }
  if (scalar(db, 'SELECT count(*) AS value FROM customer_auth_capability_operations') !== 0 ||
      scalar(db, 'SELECT count(*) AS value FROM customer_auth_capability_state') !== 0) {
    throw new Error(`${phase}: 0040 activó CUS-003`);
  }
  if (pendingIdentityCollisions(db) !== 0) {
    throw new Error(`${phase}: más de un challenge pending para una identidad`);
  }
  for (const trigger of ['customer_auth_throttle_update_guard',
    'customer_auth_revoke_all_operation_update_guard',
    'customer_passwordless_delivery_insert_guard',
    'customer_passwordless_delivery_update_guard',
    'customer_passwordless_delivery_delete_guard',
    'customer_passwordless_consumption_delivery_guard',
    'customer_auth_capability_operation_insert_guard',
    'customer_auth_capability_state_insert_guard',
    'customer_auth_capability_state_update_guard',
    'customer_auth_capability_state_delete_guard',
    'customer_auth_capability_operation_update_guard',
    'customer_auth_capability_operation_delete_guard',
    'customer_passwordless_challenge_supersede_pending']) {
    if (!exists(db, 'trigger', trigger)) throw new Error(`${phase}: falta ${trigger}`);
  }
  for (const index of ['idx_customer_auth_throttle_subject_window',
    'idx_customer_auth_throttle_expiry']) {
    if (!exists(db, 'index', index)) throw new Error(`${phase}: falta ${index}`);
  }
}

const args = argsOf(process.argv.slice(2));
const baseline = resolve(args.baseline);
const directory = join(resolve(args.output), `r5-passwordless-security-${Date.now()}`);
mkdirSync(directory, { recursive: true });
const forwardPath = join(directory, 'forward.sqlite');
const dumpPath = join(directory, 'migrated.sql');
const restorePath = join(directory, 'restored.sqlite');
const db = new DatabaseSync(forwardPath);
db.exec('PRAGMA foreign_keys=OFF');
db.exec(readFileSync(baseline, 'utf8'));
db.exec('PRAGMA foreign_keys=ON');
integrity(db, 'preflight');
if (!exists(db, 'table', 'customer_passwordless_challenges') ||
    exists(db, 'table', 'customer_auth_throttle_events')) {
  throw new Error('baseline debe estar exactamente en 0039');
}
if (pendingIdentityCollisions(db) !== 0) {
  throw new Error('preflight: 0039 contiene múltiples challenges pending para una identidad');
}
const before = snapshot(db);
const beforeHash = hash(before);
db.exec(readFileSync(resolve('migrations/0040_customer_passwordless_security.sql'), 'utf8'));
verify(db, 'forward');
if (hash(snapshot(db)) !== beforeHash) throw new Error('0040 alteró datos existentes');
db.close();
const dump = execFileSync('/usr/bin/sqlite3', [forwardPath, '.dump'],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
writeFileSync(dumpPath, dump);
const restored = new DatabaseSync(restorePath);
restored.exec('PRAGMA foreign_keys=OFF');
restored.exec(dump);
restored.exec('PRAGMA foreign_keys=ON');
verify(restored, 'restore');
if (hash(snapshot(restored)) !== beforeHash) throw new Error('restore divergente');
restored.close();
process.stdout.write(`${JSON.stringify({ beforeHash,
  dumpBytes: statSync(dumpPath).size, artifactDirectory: directory }, null, 2)}\n`);
