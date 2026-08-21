#!/usr/bin/env node

/** Ensayo aislado de 0042 sobre un export D1 en 0041; nunca toca el origen. */
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
    payments: db.prepare('SELECT * FROM payments ORDER BY id').all(),
    profiles: db.prepare('SELECT * FROM customer_profiles ORDER BY id').all(),
    addresses: db.prepare(`SELECT * FROM customer_address_revisions
      ORDER BY address_id, revision`).all(),
    orderAccess: db.prepare('SELECT * FROM customer_order_access_refs ORDER BY order_id').all(),
  };
}

function addressAccessSnapshot(db) {
  return db.prepare(`SELECT address_id, public_ref
    FROM customer_address_access_refs ORDER BY address_id`).all();
}

function verify(db, phase, expectedAddresses) {
  integrity(db, phase);
  if (!exists(db, 'table', 'customer_address_access_refs')) {
    throw new Error(`${phase}: falta customer_address_access_refs`);
  }
  if (scalar(db, 'SELECT count(*) AS value FROM customer_address_access_refs') !== expectedAddresses) {
    throw new Error(`${phase}: no existe exactamente una referencia por address_id`);
  }
  if (scalar(db, `SELECT count(*) AS value FROM customer_address_access_refs
    WHERE length(public_ref) <> 37 OR substr(public_ref, 1, 5) <> 'addr_'
      OR substr(public_ref, 6) GLOB '*[^0-9a-f]*'`) !== 0) {
    throw new Error(`${phase}: referencia inválida`);
  }
  if (scalar(db, `SELECT count(*) AS value FROM (
    SELECT public_ref FROM customer_address_access_refs
    GROUP BY public_ref HAVING count(*) > 1
  )`) !== 0) {
    throw new Error(`${phase}: colisión de referencias`);
  }
  if (scalar(db, `SELECT count(*) AS value FROM (
    SELECT DISTINCT revision.address_id FROM customer_address_revisions revision
    LEFT JOIN customer_address_access_refs access ON access.address_id=revision.address_id
    WHERE access.address_id IS NULL
  )`) !== 0) {
    throw new Error(`${phase}: dirección sin referencia`);
  }
  for (const trigger of ['customer_address_access_after_revision_insert',
    'customer_address_access_ref_update_guard', 'customer_address_access_ref_delete_guard',
    'customer_address_access_after_revision_delete']) {
    if (!exists(db, 'trigger', trigger)) throw new Error(`${phase}: falta ${trigger}`);
  }
}

function probeRuntime(db) {
  db.exec('SAVEPOINT customer_address_access_probe');
  try {
    db.exec(`
      INSERT INTO customer_profiles (
        id, primary_email, email_identity_hash, status, version, created_at, updated_at
      ) VALUES ('customer_profile:address-rehearsal', 'address-rehearsal@example.test',
        '${'e'.repeat(64)}', 'active', 1,
        '2026-08-22T10:00:00.000Z', '2026-08-22T10:00:00.000Z');
      INSERT INTO customer_address_revisions (
        address_id, customer_profile_id, revision, recipient_name, phone,
        street, city, region, postal_code, country_code, valid_from, valid_to
      ) VALUES ('address:rehearsal', 'customer_profile:address-rehearsal', 1,
        'Rehearsal Customer', NULL, 'Carrer Major 1', 'Castelló', NULL,
        '12001', 'ES', '2026-08-22T10:00:00.000Z', NULL);
    `);
    const original = db.prepare(`SELECT public_ref
      FROM customer_address_access_refs WHERE address_id='address:rehearsal'`).get()?.public_ref;
    if (typeof original !== 'string' || !/^addr_[0-9a-f]{32}$/u.test(original)) {
      throw new Error('probe: el alta no generó referencia');
    }
    db.exec(`INSERT INTO customer_address_revisions (
      address_id, customer_profile_id, revision, recipient_name, phone,
      street, city, region, postal_code, country_code, valid_from, valid_to
    ) VALUES ('address:rehearsal', 'customer_profile:address-rehearsal', 2,
      'Rehearsal Customer', NULL, 'Carrer Major 2', 'Castelló', NULL,
      '12001', 'ES', '2026-08-22T11:00:00.000Z', NULL)`);
    const current = db.prepare(`SELECT access.public_ref, revision.revision
      FROM customer_address_access_refs access
      JOIN customer_address_revisions revision ON revision.address_id=access.address_id
        AND revision.valid_to IS NULL
      WHERE access.address_id='address:rehearsal'`).get();
    if (current?.public_ref !== original || current?.revision !== 2) {
      throw new Error('probe: la revisión rotó selector o CAS');
    }
  } finally {
    db.exec('ROLLBACK TO customer_address_access_probe');
    db.exec('RELEASE customer_address_access_probe');
  }
}

function ensureLegacyAddressFixture(db) {
  if (scalar(db, 'SELECT count(DISTINCT address_id) AS value FROM customer_address_revisions') > 0) {
    return false;
  }
  db.exec(`
    INSERT INTO customer_profiles (
      id, primary_email, email_identity_hash, status, version, created_at, updated_at
    ) VALUES ('customer_profile:address-backfill', 'address-backfill@example.test',
      '${'d'.repeat(64)}', 'active', 1,
      '2026-08-22T09:00:00.000Z', '2026-08-22T09:00:00.000Z');
    INSERT INTO customer_address_revisions (
      address_id, customer_profile_id, revision, recipient_name, phone,
      street, city, region, postal_code, country_code, valid_from, valid_to
    ) VALUES ('address:backfill', 'customer_profile:address-backfill', 1,
      'Backfill Customer', NULL, 'Carrer Major 1', 'Castelló', NULL,
      '12001', 'ES', '2026-08-22T09:00:00.000Z', NULL);
  `);
  return true;
}

const args = argsOf(process.argv.slice(2));
const baseline = resolve(args.baseline);
const directory = join(resolve(args.output), `r5-customer-address-access-${Date.now()}`);
mkdirSync(directory, { recursive: true });
const forwardPath = join(directory, 'forward.sqlite');
const dumpPath = join(directory, 'migrated.sql');
const restorePath = join(directory, 'restored.sqlite');
let db = new DatabaseSync(forwardPath);
db.exec('PRAGMA foreign_keys=OFF');
db.exec(readFileSync(baseline, 'utf8'));
db.close();
db = new DatabaseSync(forwardPath);
db.exec('PRAGMA foreign_keys=ON');
integrity(db, 'preflight');
if (!exists(db, 'table', 'customer_order_access_refs') ||
    exists(db, 'table', 'customer_address_access_refs')) {
  throw new Error('baseline debe estar exactamente en 0041');
}
const injectedLegacyAddress = ensureLegacyAddressFixture(db);
const before = legacySnapshot(db);
const beforeHash = hash(before);
const addressCount = scalar(db, `SELECT count(DISTINCT address_id) AS value
  FROM customer_address_revisions`);
db.exec(readFileSync(resolve('migrations/0042_customer_address_access.sql'), 'utf8'));
verify(db, 'forward', addressCount);
if (hash(legacySnapshot(db)) !== beforeHash) throw new Error('0042 alteró datos existentes');
probeRuntime(db);
const accessHash = hash(addressAccessSnapshot(db));
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
verify(restored, 'restore', addressCount);
if (hash(legacySnapshot(restored)) !== beforeHash) throw new Error('restore legacy divergente');
if (hash(addressAccessSnapshot(restored)) !== accessHash) {
  throw new Error('restore de referencias divergente');
}
restored.close();

process.stdout.write(`${JSON.stringify({
  products: before.products.length,
  variants: before.variants.length,
  balances: before.balances.length,
  orders: before.orders.length,
  payments: before.payments.length,
  profiles: before.profiles.length,
  addressResources: addressCount,
  injectedLegacyAddress,
  beforeHash,
  accessHash,
  dumpBytes: statSync(dumpPath).size,
  artifactDirectory: directory,
}, null, 2)}\n`);
