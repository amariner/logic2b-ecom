import { describe, expect, it } from 'vitest';
import { PATCH } from '../src/pages/api/admin/orders/[id]';
import { SqliteD1 } from './sqlite-d1';

function seedOrder(db: SqliteD1, status = 'paid'): void {
  db.sqlite.exec(`
    INSERT INTO products (id, slug, name, price_cents, stock, category)
    VALUES (1, 'aove', 'AOVE', 890, 8, 'aceites');
    INSERT INTO orders (
      id, order_number, email, customer_name, address_json,
      subtotal_cents, shipping_cents, total_cents, status, stripe_session_id
    ) VALUES (
      7, 'BM-260806-TEST', 'clienta@example.com', 'Marta Ferrer', '{}',
      1780, 490, 2270, '${status}', 'cs_test_1'
    );
    INSERT INTO order_items (order_id, product_id, name_snapshot, unit_price_cents, qty)
    VALUES (7, 1, 'AOVE', 890, 2);
  `);
}

function makeCtx(db: SqliteD1, body: unknown, waits: Promise<unknown>[]) {
  return {
    params: { id: '7' },
    request: new Request('http://localhost/api/admin/orders/7', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    locals: {
      runtime: {
        env: { DB: db.asD1(), DEMO_MODE: 'false' },
        ctx: { waitUntil: (promise: Promise<unknown>) => waits.push(promise) },
      },
    },
  } as unknown as Parameters<typeof PATCH>[0];
}

describe('PATCH /api/admin/orders/:id con outbox transaccional', () => {
  it('paid → cancelled aplica una vez y devuelve stock', async () => {
    const db = new SqliteD1();
    seedOrder(db);
    const waits: Promise<unknown>[] = [];
    const response = await PATCH(makeCtx(db, { status: 'cancelled' }, waits));
    await Promise.all(waits);
    expect(response.status).toBe(200);
    expect(db.value('SELECT stock AS value FROM products WHERE id=1')).toBe(10);
    expect(db.value("SELECT count(*) AS value FROM event_outbox_events WHERE event_type='orders.order_cancelled'")).toBe(1);
    expect(db.value('SELECT count(*) AS value FROM emails_outbox')).toBe(0);
  });

  it('dos PATCH solapados: uno gana, el otro recibe 409 y no duplica restock', async () => {
    const db = new SqliteD1();
    seedOrder(db);
    const waits: Promise<unknown>[] = [];
    const responses = await Promise.all([
      PATCH(makeCtx(db, { status: 'cancelled' }, waits)),
      PATCH(makeCtx(db, { status: 'cancelled' }, waits)),
    ]);
    await Promise.all(waits);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(db.value('SELECT stock AS value FROM products WHERE id=1')).toBe(10);
    expect(db.value('SELECT count(*) AS value FROM event_outbox_events')).toBe(1);
  });

  it('pedido ya cancelado → 422 sin tocar stock', async () => {
    const db = new SqliteD1();
    seedOrder(db, 'cancelled');
    const response = await PATCH(makeCtx(db, { status: 'cancelled' }, []));
    expect(response.status).toBe(422);
    expect(db.value('SELECT stock AS value FROM products WHERE id=1')).toBe(8);
  });

  it('paid → shipped despacha un aviso y conserva el stock', async () => {
    const db = new SqliteD1();
    seedOrder(db);
    const waits: Promise<unknown>[] = [];
    const response = await PATCH(makeCtx(db, {
      status: 'shipped',
      tracking_carrier: 'SEUR',
      tracking_number: 'ES123',
    }, waits));
    await Promise.all(waits);
    expect(response.status).toBe(200);
    expect(db.value('SELECT count(*) AS value FROM emails_outbox')).toBe(1);
    expect(db.value("SELECT count(*) AS value FROM event_outbox_deliveries WHERE status='delivered'")).toBe(1);
    expect(db.value('SELECT stock AS value FROM products WHERE id=1')).toBe(8);
  });
});
