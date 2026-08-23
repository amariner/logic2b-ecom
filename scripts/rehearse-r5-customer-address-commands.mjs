#!/usr/bin/env node

/** Ensayo aislado de 0043 sobre una SQLite local en 0042; nunca toca el origen. */
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
    profiles: db.prepare('SELECT * FROM customer_profiles ORDER BY id').all(),
    addresses: db.prepare(`SELECT address_id, customer_profile_id, revision,
      recipient_name, phone, street, city, region, postal_code, country_code,
      valid_from, valid_to FROM customer_address_revisions
      ORDER BY address_id, revision`).all(),
    access: db.prepare('SELECT * FROM customer_address_access_refs ORDER BY address_id').all(),
  };
}

function verify(db, phase, expectedHash) {
  integrity(db, phase);
  const columns = db.prepare("PRAGMA table_info('customer_address_revisions')").all()
    .map((entry) => entry.name);
  for (const column of ['write_idempotency_key', 'write_payload_fingerprint']) {
    if (!columns.includes(column)) throw new Error(`${phase}: falta ${column}`);
  }
  for (const trigger of ['customer_address_write_evidence_guard',
    'customer_address_write_evidence_update_guard']) {
    if (!exists(db, 'trigger', trigger)) throw new Error(`${phase}: falta ${trigger}`);
  }
  if (!exists(db, 'index', 'idx_customer_address_revisions_write_idempotency')) {
    throw new Error(`${phase}: falta índice idempotente`);
  }
  if (hash(legacySnapshot(db)) !== expectedHash) throw new Error(`${phase}: datos legacy divergentes`);
  if (scalar(db, `SELECT count(*) AS value FROM customer_address_revisions
    WHERE (write_idempotency_key IS NULL) <> (write_payload_fingerprint IS NULL)`) !== 0) {
    throw new Error(`${phase}: evidencia parcial`);
  }
}

function probeCommands(db) {
  db.exec('SAVEPOINT customer_address_command_probe');
  try {
    const fingerprintOne = 'a'.repeat(64);
    const fingerprintTwo = 'b'.repeat(64);
    db.exec(`
      INSERT INTO customer_profiles (
        id, primary_email, email_identity_hash, status, version, created_at, updated_at
      ) VALUES ('customer_profile:address-command-rehearsal',
        'address-command-rehearsal@example.test', '${'e'.repeat(64)}', 'active', 1,
        '2026-08-23T10:00:00.000Z', '2026-08-23T10:00:00.000Z');
      INSERT INTO customer_address_revisions (
        address_id, customer_profile_id, revision, recipient_name, phone,
        street, city, region, postal_code, country_code, valid_from, valid_to,
        write_idempotency_key, write_payload_fingerprint
      ) VALUES ('address:command-rehearsal', 'customer_profile:address-command-rehearsal',
        1, 'Rehearsal Customer', NULL, 'Carrer Major 1', 'Castelló', NULL,
        '12001', 'ES', '2026-08-23T10:00:00.000Z', NULL,
        'address-command:create:one', '${fingerprintOne}');
      INSERT INTO customer_address_revisions (
        address_id, customer_profile_id, revision, recipient_name, phone,
        street, city, region, postal_code, country_code, valid_from, valid_to,
        write_idempotency_key, write_payload_fingerprint
      ) SELECT current.address_id, current.customer_profile_id, current.revision + 1,
        'Rehearsal Customer', NULL, 'Carrer Major 2', 'Castelló', NULL,
        '12001', 'ES', '2026-08-23T11:00:00.000Z', NULL,
        'address-command:revise:two', '${fingerprintTwo}'
      FROM customer_address_access_refs access
      JOIN customer_address_revisions current
        ON current.address_id=access.address_id AND current.valid_to IS NULL
      WHERE access.public_ref=(SELECT public_ref FROM customer_address_access_refs
        WHERE address_id='address:command-rehearsal')
        AND current.customer_profile_id='customer_profile:address-command-rehearsal'
        AND current.revision=1;
    `);
    const current = db.prepare(`SELECT revision, street, write_idempotency_key
      FROM customer_address_revisions WHERE address_id='address:command-rehearsal'
        AND valid_to IS NULL`).get();
    if (current?.revision !== 2 || current?.street !== 'Carrer Major 2' ||
        current?.write_idempotency_key !== 'address-command:revise:two') {
      throw new Error('probe: CAS no produjo la revisión esperada');
    }
    if (scalar(db, `SELECT count(*) AS value FROM customer_address_revisions
      WHERE address_id='address:command-rehearsal'`) !== 2) {
      throw new Error('probe: número de revisiones inesperado');
    }
    let duplicateRejected = false;
    try {
      db.exec(`INSERT INTO customer_address_revisions (
        address_id, customer_profile_id, revision, recipient_name, street, city,
        postal_code, country_code, valid_from, write_idempotency_key,
        write_payload_fingerprint
      ) VALUES ('address:duplicate-command', 'customer_profile:address-command-rehearsal',
        1, 'Duplicate Customer', 'Carrer Major 3', 'Castelló', '12001', 'ES',
        '2026-08-23T12:00:00.000Z', 'address-command:create:one', '${fingerprintOne}')`);
    } catch { duplicateRejected = true; }
    if (!duplicateRejected) throw new Error('probe: clave idempotente duplicada aceptada');
  } finally {
    db.exec('ROLLBACK TO customer_address_command_probe');
    db.exec('RELEASE customer_address_command_probe');
  }
}

const args = argsOf(process.argv.slice(2));
const directory = join(resolve(args.output), `r5-customer-address-commands-${Date.now()}`);
mkdirSync(directory, { recursive: true });
const forwardPath = join(directory, 'forward.sqlite');
const dumpPath = join(directory, 'migrated.sql');
const restorePath = join(directory, 'restored.sqlite');
execFileSync('/usr/bin/sqlite3', [resolve(args.baseline), `.backup '${forwardPath}'`]);
let db = new DatabaseSync(forwardPath);
db.exec('PRAGMA foreign_keys=ON');
integrity(db, 'preflight');
if (!exists(db, 'table', 'customer_address_access_refs') ||
    db.prepare("PRAGMA table_info('customer_address_revisions')").all()
      .some((entry) => entry.name === 'write_idempotency_key')) {
  throw new Error('baseline debe estar exactamente en 0042');
}
const before = legacySnapshot(db);
const beforeHash = hash(before);
db.exec(readFileSync(resolve('migrations/0043_customer_address_commands.sql'), 'utf8'));
verify(db, 'forward', beforeHash);
probeCommands(db);
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
verify(restored, 'restore', beforeHash);
probeCommands(restored);
restored.close();

process.stdout.write(`${JSON.stringify({
  products: before.products.length,
  variants: before.variants.length,
  orders: before.orders.length,
  payments: before.payments.length,
  profiles: before.profiles.length,
  addressRevisions: before.addresses.length,
  beforeHash,
  dumpBytes: statSync(dumpPath).size,
  artifactDirectory: directory,
}, null, 2)}\n`);
