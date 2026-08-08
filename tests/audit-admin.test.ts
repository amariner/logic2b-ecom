import { describe, expect, it } from 'vitest';
import { PATCH as patchProduct } from '../src/pages/api/admin/products/[id]';
import { PATCH as patchShippingRate } from '../src/pages/api/admin/shipping-rates/[id]';
import { SqliteD1 } from './sqlite-d1';

function productContext(db: SqliteD1, body: unknown, demoMode = 'false') {
  return {
    params: { id: '1' },
    request: new Request('http://localhost/api/admin/products/1', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }),
    locals: { runtime: { env: { DB: db.asD1(), DEMO_MODE: demoMode } } },
  } as unknown as Parameters<typeof patchProduct>[0];
}

function shippingContext(db: SqliteD1, body: unknown, demoMode = 'false') {
  return {
    params: { id: '1' },
    request: new Request('http://localhost/api/admin/shipping-rates/1', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }),
    locals: { runtime: { env: { DB: db.asD1(), DEMO_MODE: demoMode } } },
  } as unknown as Parameters<typeof patchShippingRate>[0];
}

function seedAdminRows(db: SqliteD1): void {
  db.sqlite.exec(`
    INSERT INTO products (id, slug, name, price_cents, stock, category, active)
    VALUES (1, 'aove', 'AOVE', 890, 10, 'aceites', 1);
    INSERT INTO product_variants (
      id, product_id, sku, title, price_cents, status, is_default, option_signature
    ) VALUES (1, 1, 'AOVE-DEFAULT', '', 890, 'active', 1, NULL);
    INSERT INTO shipping_rates (id, zone, label, price_cents, free_over_cents, active)
    VALUES (1, 'peninsula', 'Península', 490, 5000, 1);
  `);
}

describe('auditoría de mutaciones admin R1.8', () => {
  it('producto: mutación y diff se confirman juntos', async () => {
    const db = new SqliteD1();
    seedAdminRows(db);
    const response = await patchProduct(productContext(db, { name: 'AOVE premium', stock: 8 }));
    expect(response.status).toBe(200);
    expect(db.query<{ name: string; stock: number }>('SELECT name, stock FROM products WHERE id=1')[0])
      .toEqual({ name: 'AOVE premium', stock: 8 });
    const audit = db.query<{ actor_id: string; action: string; diff_json: string }>(
      'SELECT actor_id, action, diff_json FROM audit_log',
    )[0];
    expect(audit).toMatchObject({ actor_id: 'admin-panel', action: 'catalog.product_updated' });
    expect(JSON.parse(audit?.diff_json ?? '{}')).toEqual({
      name: { before: 'AOVE', after: 'AOVE premium' },
      stock: { before: 10, after: 8 },
    });
  });

  it('dos PATCH sobre el mismo snapshot: uno gana y solo deja una evidencia', async () => {
    const db = new SqliteD1();
    seedAdminRows(db);
    const responses = await Promise.all([
      patchProduct(productContext(db, { stock: 7 })),
      patchProduct(productContext(db, { stock: 7 })),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(db.value('SELECT stock AS value FROM products WHERE id=1')).toBe(7);
    expect(db.value('SELECT count(*) AS value FROM audit_log')).toBe(1);
  });

  it('precio, SKU y estado se escriben en variante default y espejos legacy juntos', async () => {
    const db = new SqliteD1();
    seedAdminRows(db);
    const response = await patchProduct(productContext(db, {
      price_cents: 990,
      sku: 'AOVE-PREMIUM',
      variant_status: 'archived',
    }));
    expect(response.status).toBe(200);
    expect(db.query<{ price_cents: number; active: number }>(
      'SELECT price_cents, active FROM products WHERE id = 1',
    )[0]).toEqual({ price_cents: 990, active: 0 });
    expect(db.query<{ sku: string; price_cents: number; status: string }>(
      'SELECT sku, price_cents, status FROM product_variants WHERE id = 1',
    )[0]).toEqual({ sku: 'AOVE-PREMIUM', price_cents: 990, status: 'archived' });
    const diff = JSON.parse(String(db.value('SELECT diff_json AS value FROM audit_log')));
    expect(diff).toMatchObject({
      price_cents: { before: 890, after: 990 },
      active: { before: 1, after: 0 },
      default_sku: { before: 'AOVE-DEFAULT', after: 'AOVE-PREMIUM' },
      default_variant_status: { before: 'active', after: 'archived' },
      default_variant_price_cents: { before: 890, after: 990 },
    });
  });

  it('rechaza un precio que invalida el precio anterior antes de escribir', async () => {
    const db = new SqliteD1();
    seedAdminRows(db);
    db.sqlite.exec(`
      UPDATE products SET compare_at_price_cents = 950 WHERE id = 1;
      UPDATE product_variants SET compare_at_price_cents = 950 WHERE id = 1;
    `);
    const response = await patchProduct(productContext(db, { price_cents: 990 }));
    expect(response.status).toBe(400);
    expect(db.value('SELECT price_cents AS value FROM products WHERE id = 1')).toBe(890);
    expect(db.value('SELECT price_cents AS value FROM product_variants WHERE id = 1')).toBe(890);
    expect(db.value('SELECT count(*) AS value FROM audit_log')).toBe(0);
  });

  it('tarifa: registra solo los campos operativos autorizados', async () => {
    const db = new SqliteD1();
    seedAdminRows(db);
    const response = await patchShippingRate(shippingContext(db, { price_cents: 590, active: false }));
    expect(response.status).toBe(200);
    const audit = db.query<{ action: string; entity_type: string; diff_json: string }>(
      'SELECT action, entity_type, diff_json FROM audit_log',
    )[0];
    expect(audit?.action).toBe('fulfillment.shipping_rate_updated');
    expect(audit?.entity_type).toBe('shipping_rate');
    expect(JSON.parse(audit?.diff_json ?? '{}')).toEqual({
      price_cents: { before: 490, after: 590 },
      active: { before: 1, after: 0 },
    });
  });

  it('la demo rechaza antes de leer o escribir el audit log', async () => {
    const db = new SqliteD1();
    seedAdminRows(db);
    const [product, shipping] = await Promise.all([
      patchProduct(productContext(db, { stock: 1 }, 'true')),
      patchShippingRate(shippingContext(db, { active: false }, 'true')),
    ]);
    expect([product.status, shipping.status]).toEqual([403, 403]);
    expect(db.value('SELECT count(*) AS value FROM audit_log')).toBe(0);
    expect(db.value('SELECT stock AS value FROM products WHERE id=1')).toBe(10);
  });
});
