import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as LIST, POST as CREATE } from '../src/pages/api/admin/returns/index';
import { GET as DETAIL, PATCH } from '../src/pages/api/admin/returns/[id]';
import { SqliteD1 } from './sqlite-d1';

const capability = vi.hoisted(() => ({ enabled: true }));
vi.mock('../src/composition/runtime-platform', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/composition/runtime-platform')>();
  return { runtimePlatform: { ...actual.runtimePlatform,
    hasCapabilityFlag: () => capability.enabled, modules: actual.runtimePlatform.modules } };
});

function seedDelivered(db: SqliteD1): void {
  db.sqlite.exec(`
    INSERT INTO products (id, slug, name, price_cents, stock, category)
    VALUES (1, 'api-return', 'API Return', 900, 2, 'test');
    INSERT INTO product_variants (id, product_id, sku, title, price_cents, status, is_default, option_signature)
    VALUES (1, 1, 'API-RETURN', '', 900, 'active', 1, NULL);
    INSERT INTO inventory_balances (variant_id, on_hand, reserved, version) VALUES (1, 2, 0, 1);
    INSERT INTO orders (id, order_number, email, customer_name, address_json,
      subtotal_cents, shipping_cents, total_cents, status, currency)
    VALUES (31, 'R310-API', 'api@example.com', 'API', '{}', 900, 0, 900, 'delivered', 'EUR');
    INSERT INTO order_items (id, order_id, product_id, variant_id, name_snapshot, unit_price_cents, qty)
    VALUES (311, 31, 1, 1, 'API Return', 900, 1);
    INSERT INTO fulfillments (id, order_id, status, carrier, tracking_number, idempotency_key,
      shipped_at, delivered_at, created_at, updated_at)
    VALUES (31, 31, 'delivered', 'SEUR', 'R310-API', 'r310:api:fulfillment',
      '2026-08-14T08:00:00.000Z', '2026-08-14T09:00:00.000Z',
      '2026-08-14T08:00:00.000Z', '2026-08-14T09:00:00.000Z');
    INSERT INTO fulfillment_items (fulfillment_id, order_id, order_item_id, quantity, created_at)
    VALUES (31, 31, 311, 1, '2026-08-14T08:00:00.000Z');
  `);
}

function context(db: SqliteD1, method: string, path: string, body?: unknown,
  demo = 'false', params: Record<string, string> = {}) {
  return { params, request: new Request(`http://localhost${path}`, {
    method, ...(body === undefined ? {} : {
      headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }),
  }), locals: { runtime: { env: { DB: db.asD1(), DEMO_MODE: demo }, ctx: { waitUntil() {} } } } } as never;
}

describe('API admin RMA R3.10', () => {
  beforeEach(() => { capability.enabled = true; });

  it('crea, lista, lee y autoriza con control de versión', async () => {
    const db = new SqliteD1(); seedDelivered(db);
    const locationId = Number(db.value("SELECT id AS value FROM inventory_locations WHERE code='principal'"));
    const created = await CREATE(context(db, 'POST', '/api/admin/returns', {
      order_id: 31, receive_location_id: locationId, reason: 'defective',
      requested_by_kind: 'admin', requested_by_id: 'admin-panel',
      idempotency_key: 'r310:api:return:create', lines: [{ order_item_id: 311, quantity: 1 }],
    }));
    expect(created.status).toBe(201);
    const id = String(db.value('SELECT id AS value FROM return_requests'));
    expect((await LIST(context(db, 'GET', '/api/admin/returns'))).status).toBe(200);
    expect((await DETAIL(context(db, 'GET', `/api/admin/returns/${id}`, undefined, 'false', { id }))).status).toBe(200);
    expect((await PATCH(context(db, 'PATCH', `/api/admin/returns/${id}`, {
      action: 'authorize', expected_version: 1, idempotency_key: 'r310:api:return:authorize',
    }, 'false', { id }))).status).toBe(200);
    const conflict = await PATCH(context(db, 'PATCH', `/api/admin/returns/${id}`, {
      action: 'in_transit', expected_version: 1, idempotency_key: 'r310:api:return:stale',
    }, 'false', { id }));
    expect(conflict.status).toBe(409);
  });

  it('corta demo y capacidad antes de escribir', async () => {
    const db = new SqliteD1();
    expect((await CREATE(context(db, 'POST', '/api/admin/returns', {}, 'true'))).status).toBe(403);
    expect((await PATCH(context(db, 'PATCH', '/api/admin/returns/x', {}, 'true', { id: 'x' }))).status).toBe(403);
    capability.enabled = false;
    expect((await LIST(context(db, 'GET', '/api/admin/returns'))).status).toBe(403);
    expect((await DETAIL(context(db, 'GET', '/api/admin/returns/x', undefined, 'false', { id: 'x' }))).status).toBe(403);
  });
});
