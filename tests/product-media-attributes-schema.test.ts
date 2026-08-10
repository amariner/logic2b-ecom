import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import migration1 from '../migrations/0001_init.sql?raw';
import migration2 from '../migrations/0002_collections_and_product_capabilities.sql?raw';
import migration3 from '../migrations/0003_contact_requests.sql?raw';
import migration4 from '../migrations/0004_event_outbox.sql?raw';
import migration5 from '../migrations/0005_audit_log.sql?raw';
import migration6 from '../migrations/0006_platform_job_runs.sql?raw';
import migration7 from '../migrations/0007_product_variants.sql?raw';
import migration8 from '../migrations/0008_product_media_attributes.sql?raw';

const beforeVariants = [migration1, migration2, migration3, migration4, migration5, migration6];

function baseline(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  for (const migration of beforeVariants) db.exec(migration);
  db.exec(`
    INSERT INTO products (
      id, slug, name, description, price_cents, stock, image, category,
      active, created_at, collection, specs_json
    ) VALUES
      (1, 'shell', 'Shell 07', '', 139000, 8, '/shell.webp', 'outerwear', 1,
       '2026-08-01 10:00:00', 'summit', '[{"label":"Peso","value":"420 g"}]'),
      (2, 'flask', 'Flask 750', '', 14000, 18, '', 'accessories', 1,
       '2026-08-02 10:00:00', 'summit', NULL);
  `);
  db.exec(migration7);
  return db;
}

describe('R2.5 media y atributos tipados', () => {
  it('backfillea la imagen legacy sin alterar sus espejos', () => {
    const db = baseline();
    const before = JSON.stringify(db.prepare('SELECT * FROM products ORDER BY id').all());

    db.exec(migration8);

    expect(db.prepare(`
      SELECT product_id, kind, source, alt_text, focal_x_bps, focal_y_bps, position
      FROM product_media ORDER BY product_id
    `).all()).toEqual([{
      product_id: 1,
      kind: 'image',
      source: '/shell.webp',
      alt_text: 'Shell 07',
      focal_x_bps: 5000,
      focal_y_bps: 5000,
      position: 0,
    }]);
    expect(JSON.stringify(db.prepare('SELECT * FROM products ORDER BY id').all())).toBe(before);
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  it('protege foco, orden y asociaciones dentro del mismo producto', () => {
    const db = baseline();
    db.exec(migration8);
    db.exec(`
      INSERT INTO product_media (id, product_id, kind, source, alt_text, position)
      VALUES (20, 2, 'image', '/flask.webp', 'Botella Flask 750', 0);
    `);
    expect(() => db.prepare(`
      INSERT INTO product_media (
        product_id, kind, source, alt_text, focal_x_bps, focal_y_bps, position
      ) VALUES (1, 'image', '/bad.webp', 'Fuera de foco', 10001, 5000, 1)
    `).run()).toThrow(/CHECK/);
    expect(() => db.prepare(`
      INSERT INTO product_media (product_id, kind, source, alt_text, position)
      VALUES (1, 'image', '/duplicate-position.webp', 'Duplicada', 0)
    `).run()).toThrow(/UNIQUE/);
    expect(() => db.prepare(`
      INSERT INTO product_variant_media (variant_id, product_id, media_id, position)
      VALUES (
        (SELECT id FROM product_variants WHERE product_id = 1),
        1,
        20,
        0
      )
    `).run()).toThrow(/FOREIGN KEY/);
  });

  it('admite exactamente una columna de valor y unicidad por scope', () => {
    const db = baseline();
    db.exec(migration8);
    db.exec(`
      INSERT INTO attribute_definitions (
        id, collection, category, code, label, value_type, unit, constraints_json, position
      ) VALUES
        (10, 'summit', 'outerwear', 'weight', 'Peso', 'number', 'g', '{"min":0}', 0),
        (11, 'summit', '', 'features', 'Características', 'list', NULL,
         '{"choices":["waterproof","recycled"]}', 0);
      INSERT INTO product_attribute_values (
        product_id, attribute_definition_id, value_number
      ) VALUES (1, 10, 420);
    `);
    expect(() => db.prepare(`
      INSERT INTO product_attribute_values (
        product_id, attribute_definition_id, value_number
      ) VALUES (1, 10, 430)
    `).run()).toThrow(/UNIQUE/);
    expect(() => db.prepare(`
      INSERT INTO product_attribute_values (
        product_id, attribute_definition_id, value_text, value_number
      ) VALUES (1, 11, 'dos columnas', 2)
    `).run()).toThrow(/CHECK/);

    db.prepare(`
      INSERT INTO product_attribute_values (
        product_id, variant_id, attribute_definition_id, value_number
      ) VALUES (1, (SELECT id FROM product_variants WHERE product_id = 1), 10, 430)
    `).run();
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });
});
