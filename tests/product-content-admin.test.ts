import { describe, expect, it } from 'vitest';
import { createAdminOperations } from '../src/composition/admin-operations';
import { attributeValueStorage, normalizeAttributeDefinition } from '../src/modules/catalog';
import { SqliteD1 } from './sqlite-d1';

function seedProduct(db: SqliteD1): void {
  db.sqlite.exec(`
    INSERT INTO products (
      id, slug, name, description, price_cents, stock, image, category,
      active, created_at, collection
    ) VALUES (
      1, 'shell', 'Shell 07', '', 139000, 8, '', 'outerwear',
      1, '2026-08-10 10:00:00', 'summit'
    );
    INSERT INTO product_variants (
      id, product_id, sku, title, price_cents, status, is_default,
      option_signature, created_at, updated_at
    ) VALUES
      (1, 1, 'SHELL-M', 'M', 139000, 'active', 1, NULL,
       '2026-08-10 10:00:00', '2026-08-10 10:00:00'),
      (2, 1, 'SHELL-L', 'L', 139000, 'active', 0, '[99]',
       '2026-08-10 10:00:00', '2026-08-10 10:00:00');
    INSERT INTO inventory_balances (variant_id, on_hand, reserved, version)
    VALUES (1, 8, 0, 1), (2, 8, 0, 1);
    INSERT INTO inventory_movements (
      variant_id, delta, reason, balance_after, version_after, actor_kind,
      actor_id, reference_type, reference_id, idempotency_key, correlation_id, occurred_at
    ) VALUES
      (1, 8, 'legacy_opening_balance', 8, 1, 'system', 'test', 'test', '1',
       'test:opening:1', 'inventory:variant:1', '2026-08-10T10:00:00.000Z'),
      (2, 8, 'legacy_opening_balance', 8, 1, 'system', 'test', 'test', '2',
       'test:opening:2', 'inventory:variant:2', '2026-08-10T10:00:00.000Z');
  `);
}

describe('R2.5 administración de media y atributos', () => {
  it('mantiene galería, asociaciones, orden y espejo legacy en batches auditadas', async () => {
    const db = new SqliteD1();
    seedProduct(db);
    const operations = createAdminOperations(db.asD1());

    expect(await operations.createProductMedia(1, {
      kind: 'image', source: '/shell-main.webp', alt_text: 'Shell frontal',
      focal_x_bps: 5000, focal_y_bps: 4200, variant_ids: [1],
    })).toBe('applied');
    expect(await operations.createProductMedia(1, {
      kind: 'image', source: '/shell-glacier.webp', alt_text: 'Shell en glaciar',
      focal_x_bps: 6200, focal_y_bps: 3600, variant_ids: [2],
    })).toBe('applied');
    expect(db.value('SELECT image AS value FROM products WHERE id = 1')).toBe('/shell-main.webp');

    const firstId = Number(db.value('SELECT id AS value FROM product_media WHERE product_id = 1 AND position = 0'));
    const secondId = Number(db.value('SELECT id AS value FROM product_media WHERE product_id = 1 AND position = 1'));
    expect(await operations.reorderProductMedia(1, [secondId, firstId])).toBe('applied');
    expect(db.query(`
      SELECT source, position FROM product_media WHERE product_id = 1 ORDER BY position
    `)).toEqual([
      { source: '/shell-glacier.webp', position: 0 },
      { source: '/shell-main.webp', position: 1 },
    ]);
    expect(db.query(`
      SELECT variant_id, position FROM product_variant_media ORDER BY variant_id
    `)).toEqual([
      { variant_id: 1, position: 1 },
      { variant_id: 2, position: 0 },
    ]);
    expect(db.value('SELECT image AS value FROM products WHERE id = 1')).toBe('/shell-glacier.webp');

    expect(await operations.deleteProductMedia(firstId)).toBe('applied');
    expect(db.query(`
      SELECT source, position FROM product_media WHERE product_id = 1 ORDER BY position
    `)).toEqual([{ source: '/shell-glacier.webp', position: 0 }]);
    expect(db.query(`
      SELECT variant_id, position FROM product_variant_media ORDER BY variant_id
    `)).toEqual([{ variant_id: 2, position: 0 }]);
    expect(db.value('SELECT image AS value FROM products WHERE id = 1')).toBe('/shell-glacier.webp');
    expect(Number(db.value("SELECT count(*) AS value FROM audit_log WHERE action LIKE 'catalog.media_%'"))).toBe(4);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('valida definiciones, valores por producto y override de variante', async () => {
    const db = new SqliteD1();
    seedProduct(db);
    const operations = createAdminOperations(db.asD1());
    const definition = {
      code: 'weight', label: 'Peso', value_type: 'number' as const, unit: 'g',
      constraints: { min: 0, max: 2000, step: 1 }, active: true,
    };
    expect(await operations.createAttributeDefinition(1, definition)).toBe('applied');
    const definitionId = Number(db.value("SELECT id AS value FROM attribute_definitions WHERE code = 'weight'"));
    expect(await operations.createProductAttributeValue(1, definitionId, null, { type: 'number', value: 420 })).toBe('applied');
    expect(await operations.createProductAttributeValue(1, definitionId, 2, { type: 'number', value: 435 })).toBe('applied');
    await expect(operations.createProductAttributeValue(1, definitionId, null, { type: 'number', value: 5000 }))
      .rejects.toMatchObject({ code: 'invalid-selection' });
    await expect(operations.updateAttributeDefinition(definitionId, {
      ...definition, constraints: { min: 0, max: 5000 },
    })).rejects.toMatchObject({ code: 'in-use' });

    expect(db.query(`
      SELECT variant_id, value_number FROM product_attribute_values
      WHERE attribute_definition_id = ? ORDER BY variant_id IS NOT NULL, variant_id
    `, definitionId)).toEqual([
      { variant_id: null, value_number: 420 },
      { variant_id: 2, value_number: 435 },
    ]);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('serializa dos altas iguales y deja una sola evidencia', async () => {
    const db = new SqliteD1();
    seedProduct(db);
    const operations = createAdminOperations(db.asD1());
    const command = {
      code: 'waterproof', label: 'Impermeable', value_type: 'boolean' as const,
      unit: null, constraints: {}, active: true,
    };
    const outcomes = await Promise.all([
      operations.createAttributeDefinition(1, command),
      operations.createAttributeDefinition(1, command),
    ]);
    expect(outcomes.toSorted()).toEqual(['applied', 'conflict']);
    expect(Number(db.value('SELECT count(*) AS value FROM attribute_definitions'))).toBe(1);
    expect(Number(db.value("SELECT count(*) AS value FROM audit_log WHERE action = 'catalog.attribute_definition_created'"))).toBe(1);
  });

  it('cubre los cinco tipos y rechaza contratos incoherentes', () => {
    expect(() => normalizeAttributeDefinition({
      code: 'bad', label: 'Mal', value_type: 'boolean', unit: 'kg', constraints: {}, active: true,
    })).toThrow(/unidad/i);
    const list = normalizeAttributeDefinition({
      code: 'materials', label: 'Materiales', value_type: 'list', unit: null,
      constraints: { choices: ['nylon', 'poliéster'], minItems: 1, maxItems: 2 }, active: true,
    });
    expect(attributeValueStorage({ ...list, active: 1 }, {
      type: 'list', value: ['nylon', 'poliéster'],
    }).value_list_json).toBe('["nylon","poliéster"]');
    expect(() => attributeValueStorage({ ...list, active: 1 }, {
      type: 'list', value: ['algodón'],
    })).toThrow(/opciones/i);
  });
});
