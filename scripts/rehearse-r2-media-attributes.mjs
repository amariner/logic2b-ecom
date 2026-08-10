#!/usr/bin/env node

/**
 * Ensayo no destructivo de R2.5 sobre un export D1 ya migrado hasta 0007.
 * Solo imprime recuentos y hashes; nunca vuelca filas ni PII a stdout.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function argumentsFrom(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--baseline') result.baseline = argv[++index];
    else if (argv[index] === '--output-dir') result.outputDir = argv[++index];
    else throw new Error(`Argumento desconocido: ${argv[index]}`);
  }
  if (!result.baseline || !result.outputDir) {
    throw new Error('Uso: node scripts/rehearse-r2-media-attributes.mjs --baseline <export.sql> --output-dir <directorio>');
  }
  return result;
}

function scalar(db, sql) {
  return Number(db.prepare(sql).get()?.value ?? 0);
}

function assertZero(db, id, sql) {
  const failures = scalar(db, sql);
  if (failures !== 0) throw new Error(`${id} bloqueado: ${failures}`);
}

function digest(rows) {
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

function legacySnapshot(db) {
  return {
    products: db.prepare('SELECT * FROM products ORDER BY id').all(),
    variants: db.prepare('SELECT * FROM product_variants ORDER BY id').all(),
    items: db.prepare('SELECT * FROM order_items ORDER BY id').all(),
  };
}

function canonicalSnapshot(db) {
  return {
    media: db.prepare('SELECT * FROM product_media ORDER BY id').all(),
    variantMedia: db.prepare('SELECT * FROM product_variant_media ORDER BY variant_id, media_id').all(),
    definitions: db.prepare('SELECT * FROM attribute_definitions ORDER BY id').all(),
    values: db.prepare('SELECT * FROM product_attribute_values ORDER BY id').all(),
  };
}

function verify(db, phase) {
  assertZero(db, `${phase}:foreign_keys`, 'SELECT count(*) AS value FROM pragma_foreign_key_check');
  assertZero(db, `${phase}:integrity`, "SELECT count(*) AS value FROM pragma_integrity_check WHERE integrity_check <> 'ok'");
  assertZero(db, `${phase}:media_count`, `
    SELECT abs(
      (SELECT count(*) FROM products WHERE length(trim(image)) > 0)
      - (SELECT count(*) FROM product_media)
    ) AS value
  `);
  assertZero(db, `${phase}:media_mirror`, `
    SELECT count(*) AS value
    FROM products p
    JOIN product_media pm ON pm.product_id = p.id AND pm.position = 0
    WHERE pm.kind <> 'image' OR pm.source <> p.image OR pm.alt_text <> p.name
      OR pm.focal_x_bps <> 5000 OR pm.focal_y_bps <> 5000
  `);
  assertZero(db, `${phase}:unexpected_rows`, `
    SELECT
      (SELECT count(*) FROM product_variant_media)
      + (SELECT count(*) FROM attribute_definitions)
      + (SELECT count(*) FROM product_attribute_values) AS value
  `);
}

const args = argumentsFrom(process.argv.slice(2));
const baselinePath = resolve(args.baseline);
const runDirectory = join(resolve(args.outputDir), `r2-media-attributes-${Date.now()}`);
mkdirSync(runDirectory, { recursive: true });
const forwardPath = join(runDirectory, 'forward.sqlite');
const dumpPath = join(runDirectory, 'migrated.sql');
const restoredPath = join(runDirectory, 'restored.sqlite');

const db = new DatabaseSync(forwardPath);
// Los exports D1 ordenan por nombre de tabla y pueden insertar un padre antes
// de crear una tabla hija referenciada por CASCADE. Se restauran como un dump
// SQLite estándar: FKs apagadas durante la carga y comprobadas inmediatamente.
db.exec('PRAGMA foreign_keys = OFF;');
db.exec(readFileSync(baselinePath, 'utf8'));
db.exec('PRAGMA foreign_keys = ON;');
assertZero(db, 'preflight:foreign_keys', 'SELECT count(*) AS value FROM pragma_foreign_key_check');
assertZero(db, 'preflight:empty_alt', `
  SELECT count(*) AS value FROM products
  WHERE length(trim(image)) > 0 AND length(trim(name)) = 0
`);
const beforeHash = digest(legacySnapshot(db));
db.exec(readFileSync(resolve('migrations/0008_product_media_attributes.sql'), 'utf8'));
verify(db, 'forward');
const afterHash = digest(legacySnapshot(db));
if (afterHash !== beforeHash) throw new Error('forward bloqueado: cambió el contrato legacy');
const canonicalHash = digest(canonicalSnapshot(db));
const summary = {
  baselineBytes: statSync(baselinePath).size,
  products: scalar(db, 'SELECT count(*) AS value FROM products'),
  media: scalar(db, 'SELECT count(*) AS value FROM product_media'),
  legacyHash: beforeHash,
  canonicalHash,
};
db.close();

const dump = execFileSync('/usr/bin/sqlite3', [forwardPath, '.dump'], {
  encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
});
writeFileSync(dumpPath, dump, 'utf8');
const restored = new DatabaseSync(restoredPath);
restored.exec('PRAGMA foreign_keys = OFF;');
restored.exec(dump);
restored.exec('PRAGMA foreign_keys = ON;');
verify(restored, 'restore');
if (digest(legacySnapshot(restored)) !== beforeHash) throw new Error('restore bloqueado: hash legacy distinto');
if (digest(canonicalSnapshot(restored)) !== canonicalHash) throw new Error('restore bloqueado: hash canónico distinto');
restored.close();

process.stdout.write(`${JSON.stringify({
  ...summary,
  dumpBytes: statSync(dumpPath).size,
  artifactDirectory: runDirectory,
}, null, 2)}\n`);
