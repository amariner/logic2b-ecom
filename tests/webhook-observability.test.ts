import Stripe from 'stripe';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../src/pages/api/webhooks/stripe';
import { SqliteD1 } from './sqlite-d1';

const webhookSecret = 'whsec_observability_test';
const payload = JSON.stringify({
  id: 'evt_stripe_safe_1',
  object: 'event',
  api_version: '2025-06-30.basil',
  created: 1_786_090_000,
  data: {
    object: {
      id: 'cs_private_session_1',
      object: 'checkout.session',
      payment_status: 'paid',
      payment_intent: 'pi_private_intent_1',
    },
  },
  livemode: false,
  pending_webhooks: 1,
  request: null,
  type: 'checkout.session.completed',
});

function webhookContext(db: D1Database, signature: string, waits: Promise<unknown>[] = []) {
  return {
    request: new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': signature },
      body: payload,
    }),
    locals: {
      runtime: {
        env: {
          DB: db,
          DEMO_MODE: 'false',
          STRIPE_SECRET_KEY: 'sk_test_observability',
          STRIPE_WEBHOOK_SECRET: webhookSecret,
        },
        ctx: { waitUntil: (promise: Promise<unknown>) => waits.push(promise) },
      },
    },
  } as unknown as Parameters<typeof POST>[0];
}

describe('observabilidad de POST /api/webhooks/stripe', () => {
  afterEach(() => vi.restoreAllMocks());

  it('un evento firmado emite resultado y causación sin datos de pago ni cliente', async () => {
    const db = new SqliteD1();
    db.sqlite.exec(`
      INSERT INTO products (id, slug, name, price_cents, stock, category)
      VALUES (1, 'aove', 'AOVE', 890, 10, 'aceites');
      INSERT INTO orders (
        id, order_number, email, customer_name, address_json,
        subtotal_cents, shipping_cents, total_cents, status, stripe_session_id, currency
      ) VALUES (
        7, 'BM-260807-SAFE', 'clienta-privada@example.com', 'Marta Datos Privados',
        '{"street":"Calle Secreta 42"}', 890, 0, 890, 'pending', 'cs_private_session_1', 'EUR'
      );
      INSERT INTO payments (
        order_id, provider, provider_reference, currency, expected_amount_cents,
        status, idempotency_key, created_at, updated_at
      ) VALUES (7, 'stripe', 'cs_private_session_1', 'EUR', 890, 'pending',
        'r2:payment:order:7:primary', '2026-08-07T10:00:00.000Z', '2026-08-07T10:00:00.000Z');
      INSERT INTO order_items (order_id, product_id, name_snapshot, unit_price_cents, qty)
      VALUES (7, 1, 'AOVE', 890, 1);
    `);
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });
    const waits: Promise<unknown>[] = [];
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await POST(webhookContext(db.asD1(), signature, waits));
    await Promise.all(waits);

    expect(response.status).toBe(200);
    expect(response.headers.get('x-operation-id')).toMatch(/^op_[0-9a-f-]{36}$/);
    const records = info.mock.calls.map(([message]) => JSON.parse(String(message)) as Record<string, unknown>);
    expect(records).toContainEqual(expect.objectContaining({
      metric: 'webhook.processed',
      event_kind: 'checkout_completed',
      outcome: 'applied',
      causation_id: 'evt_stripe_safe_1',
    }));
    const serialized = JSON.stringify(records);
    for (const privateValue of [
      'clienta-privada@example.com',
      'Marta Datos Privados',
      'Calle Secreta 42',
      'cs_private_session_1',
      'pi_private_intent_1',
    ]) expect(serialized).not.toContain(privateValue);
  });

  it('una firma inválida no toca D1 ni genera logs explotables', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const hostileDb = {
      prepare: () => { throw new Error('D1 no debe tocarse'); },
    } as unknown as D1Database;

    const response = await POST(webhookContext(hostileDb, 't=1,v1=firma_invalida'));

    expect(response.status).toBe(400);
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
