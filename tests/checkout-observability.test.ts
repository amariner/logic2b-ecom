import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../src/pages/api/checkout/session';
import { SqliteD1 } from './sqlite-d1';

const validCheckout = {
  lines: [{ slug: 'aove-seguro', qty: 1 }],
  customer: {
    name: 'Marta Datos Privados',
    email: 'clienta-privada@example.com',
    phone: '600123123',
    street: 'Calle Secreta 42',
    city: 'Castelló',
    postal_code: '12001',
  },
};

function checkoutContext(
  db: D1Database,
  body: unknown,
  waits: Promise<unknown>[],
  demoMode = 'false',
) {
  return {
    request: new Request('http://localhost/api/checkout/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    locals: {
      runtime: {
        env: { DB: db, DEMO_MODE: demoMode },
        ctx: { waitUntil: (promise: Promise<unknown>) => waits.push(promise) },
      },
    },
  } as unknown as Parameters<typeof POST>[0];
}

describe('observabilidad de POST /api/checkout/session', () => {
  afterEach(() => vi.restoreAllMocks());

  it('una compra válida produce IDs operativos y métricas sin PII', async () => {
    const db = new SqliteD1();
    db.sqlite.exec(`
      INSERT INTO products (id, slug, name, price_cents, stock, category)
      VALUES (1, 'aove-seguro', 'AOVE Seguro', 890, 10, 'aceites');
      INSERT INTO product_variants (
        product_id, sku, title, price_cents, status, is_default, option_signature
      ) VALUES (1, 'LEGACY-1', '', 890, 'active', 1, NULL);
      INSERT INTO shipping_rates (zone, label, price_cents, free_over_cents, active)
      VALUES ('peninsula', 'Estándar', 490, 5000, 1);
    `);
    const waits: Promise<unknown>[] = [];
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await POST(checkoutContext(db.asD1(), validCheckout, waits));
    await Promise.all(waits);

    expect(response.status).toBe(200);
    expect(response.headers.get('x-operation-id')).toMatch(/^op_[0-9a-f-]{36}$/);
    const records = info.mock.calls.map(([message]) => JSON.parse(String(message)) as Record<string, unknown>);
    expect(records).toContainEqual(expect.objectContaining({
      schema: 'logic2b.observability.v1',
      kind: 'metric',
      level: 'info',
      metric: 'checkout.completed',
      payment_mode: 'simulated',
      payment_outcome: 'confirmed',
    }));
    const serialized = JSON.stringify(records);
    for (const privateValue of [
      'Marta Datos Privados',
      'clienta-privada@example.com',
      '600123123',
      'Calle Secreta 42',
      'Castelló',
      'sim_pi_',
    ]) expect(serialized).not.toContain(privateValue);
  });

  it('demo y payloads inválidos terminan antes de D1 y antes del logger', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const hostileDb = {
      prepare: () => { throw new Error('D1 no debe tocarse'); },
    } as unknown as D1Database;

    const demoResponse = await POST(checkoutContext(hostileDb, validCheckout, [], 'true'));
    const invalidResponse = await POST(checkoutContext(hostileDb, { lines: [] }, []));

    expect(demoResponse.status).toBe(410);
    expect(invalidResponse.status).toBe(400);
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
