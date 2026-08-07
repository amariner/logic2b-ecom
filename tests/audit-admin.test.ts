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
