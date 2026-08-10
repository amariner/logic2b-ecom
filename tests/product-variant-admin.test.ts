import { describe, expect, it } from 'vitest';
import { createAdminOperations } from '../src/composition/admin-operations';
import { createProductAdmin } from '../src/modules/catalog';
import { POST as createOption } from '../src/pages/api/admin/catalog-options/product/[id]';
import { POST as createVariant } from '../src/pages/api/admin/catalog-variants/product/[id]';
import { SqliteD1 } from './sqlite-d1';

function seedProduct(db: SqliteD1): void {
  db.sqlite.exec(`
    INSERT INTO products (
      id, slug, name, description, price_cents, stock, image, category, active,
      created_at, collection
    ) VALUES (
      1, 'chaqueta', 'Chaqueta', '', 990, 8, '', 'ropa', 1,
      '2026-08-08 10:00:00', 'demo'
    );
    INSERT INTO product_variants (
      id, product_id, sku, title, price_cents, status, is_default,
      option_signature, created_at, updated_at
    ) VALUES (
      1, 1, 'CHAQUETA-M', 'M', 990, 'active', 1,
      NULL, '2026-08-08 10:00:00', '2026-08-08 10:00:00'
    );
    INSERT INTO inventory_balances (variant_id, on_hand, reserved, version)
    VALUES (1, 8, 0, 1);
    INSERT INTO inventory_movements (
      variant_id, delta, reason, balance_after, version_after, actor_kind,
      actor_id, reference_type, reference_id, idempotency_key, correlation_id, occurred_at
    ) VALUES (1, 8, 'legacy_opening_balance', 8, 1, 'system', 'test',
      'test', '1', 'test:opening:1', 'inventory:variant:1', '2026-08-08T10:00:00.000Z');
  `);
}

function routeContext(
  db: SqliteD1,
  body: unknown,
  demoMode = 'false',
): Parameters<typeof createOption>[0] {
  return {
    params: { id: '1' },
    request: new Request('http://localhost/api/admin/catalog-options/product/1', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    locals: { runtime: { env: { DB: db.asD1(), DEMO_MODE: demoMode } } },
  } as unknown as Parameters<typeof createOption>[0];
}

describe('R2.4 admin de opciones y variantes', () => {
  it('crea opciones, combinaciones y cambia el default con espejo legacy atómico', async () => {
    const db = new SqliteD1();
    seedProduct(db);
    const operations = createAdminOperations(db.asD1());

    expect(await operations.createProductOption({ product_id: 1, name: 'Talla' })).toBe('applied');
    const optionId = Number(db.value('SELECT id AS value FROM product_options WHERE product_id = 1'));
    expect(await operations.createProductOptionValue({ option_id: optionId, value: 'M' })).toBe('applied');
    expect(await operations.createProductOptionValue({ option_id: optionId, value: 'L' })).toBe('applied');
    const [medium, large] = db.query<{ id: number }>(
      'SELECT id FROM product_option_values WHERE option_id = ? ORDER BY position',
      optionId,
    );

    expect(await operations.updateProductVariant(1, {
      sku: 'CHAQUETA-M',
      gtin: null,
      mpn: null,
      title: 'M',
      price_cents: 990,
      compare_at_price_cents: null,
      status: 'active',
      option_value_ids: [medium!.id],
    })).toBe('applied');
    expect(await operations.createProductVariant({
      product_id: 1,
      sku: 'CHAQUETA-L',
      gtin: '12345678',
      mpn: 'CHA-L',
      title: 'L',
      price_cents: 1090,
      compare_at_price_cents: 1290,
      status: 'active',
      option_value_ids: [large!.id],
    })).toBe('applied');

    const largeId = Number(db.value("SELECT id AS value FROM product_variants WHERE sku = 'CHAQUETA-L'"));
    expect(await operations.updateProductVariant(largeId, {
      sku: 'CHAQUETA-L',
      gtin: '12345678',
      mpn: 'CHA-L',
      title: 'L',
      price_cents: 1090,
      compare_at_price_cents: 1290,
      status: 'active',
      option_value_ids: [large!.id],
      make_default: true,
    })).toBe('applied');

    expect(db.query<{ price_cents: number; compare_at_price_cents: number; active: number }>(
      'SELECT price_cents, compare_at_price_cents, active FROM products WHERE id = 1',
    )[0]).toEqual({ price_cents: 1090, compare_at_price_cents: 1290, active: 1 });
    expect(db.query<{ sku: string; is_default: number }>(
      'SELECT sku, is_default FROM product_variants WHERE product_id = 1 ORDER BY sku',
    )).toEqual([
      { sku: 'CHAQUETA-L', is_default: 1 },
      { sku: 'CHAQUETA-M', is_default: 0 },
    ]);
    const details = await createProductAdmin(db.asD1()).details(1);
    expect(details?.options[0]?.values.map((value) => value.value)).toEqual(['M', 'L']);
    expect(details?.variants.map((variant) => variant.option_value_ids)).toEqual([
      [large!.id],
      [medium!.id],
    ]);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
    expect(Number(db.value('SELECT count(*) AS value FROM audit_log'))).toBe(6);
    const defaultDiff = JSON.parse(String(db.value(`
      SELECT diff_json AS value FROM audit_log
      WHERE action = 'catalog.variant_updated'
        AND json_extract(diff_json, '$.is_default.after') = 1
      LIMIT 1
    `)));
    expect(defaultDiff).toMatchObject({
      is_default: { before: false, after: true },
      product_price_cents: { before: 990, after: 1090 },
      product_compare_at_price_cents: { before: null, after: 1290 },
    });
  });

  it('serializa altas concurrentes de la misma combinación y deja una sola evidencia', async () => {
    const db = new SqliteD1();
    seedProduct(db);
    const operations = createAdminOperations(db.asD1());
    await operations.createProductOption({ product_id: 1, name: 'Talla' });
    const optionId = Number(db.value('SELECT id AS value FROM product_options WHERE product_id = 1'));
    await operations.createProductOptionValue({ option_id: optionId, value: 'M' });
    await operations.createProductOptionValue({ option_id: optionId, value: 'L' });
    const [medium, large] = db.query<{ id: number }>(
      'SELECT id FROM product_option_values WHERE option_id = ? ORDER BY position',
      optionId,
    );
    await operations.updateProductVariant(1, {
      sku: 'CHAQUETA-M', gtin: null, mpn: null, title: 'M', price_cents: 990,
      compare_at_price_cents: null, status: 'active', option_value_ids: [medium!.id],
    });
    const command = {
      product_id: 1,
      sku: 'CHAQUETA-L',
      gtin: null,
      mpn: null,
      title: 'L',
      price_cents: 1090,
      compare_at_price_cents: null,
      status: 'active' as const,
      option_value_ids: [large!.id],
    };
    const outcomes = await Promise.all([
      operations.createProductVariant(command),
      operations.createProductVariant(command),
    ]);
    expect(outcomes.toSorted()).toEqual(['applied', 'conflict']);
    expect(Number(db.value("SELECT count(*) AS value FROM product_variants WHERE sku = 'CHAQUETA-L'"))).toBe(1);
    expect(Number(db.value("SELECT count(*) AS value FROM audit_log WHERE action = 'catalog.variant_created'"))).toBe(1);
  });

  it('protege defaults, valores usados y variantes presentes en pedidos', async () => {
    const db = new SqliteD1();
    seedProduct(db);
    const operations = createAdminOperations(db.asD1());
    await expect(operations.deleteProductVariant(1)).rejects.toMatchObject({
      code: 'default-protected',
    });

    await operations.createProductOption({ product_id: 1, name: 'Talla' });
    const optionId = Number(db.value('SELECT id AS value FROM product_options WHERE product_id = 1'));
    await operations.createProductOptionValue({ option_id: optionId, value: 'M' });
    const valueId = Number(db.value('SELECT id AS value FROM product_option_values WHERE option_id = ?', optionId));
    await operations.updateProductVariant(1, {
      sku: 'CHAQUETA-M', gtin: null, mpn: null, title: 'M', price_cents: 990,
      compare_at_price_cents: null, status: 'active', option_value_ids: [valueId],
    });
    await expect(operations.deleteProductOptionValue(valueId)).rejects.toMatchObject({
      code: 'in-use',
    });
    await expect(operations.deleteProductOption(optionId)).rejects.toMatchObject({
      code: 'in-use',
    });
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('las rutas validan payload y cortan la demo antes de tocar D1', async () => {
    const db = new SqliteD1();
    seedProduct(db);
    const demoResponse = await createOption(routeContext(db, { name: 'Talla' }, 'true'));
    expect(demoResponse.status).toBe(403);
    expect(Number(db.value('SELECT count(*) AS value FROM product_options'))).toBe(0);

    const badVariantContext = {
      ...routeContext(db, { sku: '' }),
      request: new Request('http://localhost/api/admin/catalog-variants/product/1', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sku: '' }),
      }),
    } as unknown as Parameters<typeof createVariant>[0];
    const invalidResponse = await createVariant(badVariantContext);
    expect(invalidResponse.status).toBe(400);
    expect(Number(db.value('SELECT count(*) AS value FROM audit_log'))).toBe(0);
  });
});
