import { describe, expect, it } from 'vitest';
import { createPreliminaryOrderOperations } from '../src/composition/preliminary-order-operations';
import { SqliteD1 } from './sqlite-d1';

const ISSUED_AT = '2026-08-18T09:00:00.000Z';
const APPROVED_AT = '2026-08-18T09:01:00.000Z';
const DEPOSIT_PAID_AT = '2026-08-18T09:03:00.000Z';
const CONVERTED_AT = '2026-08-18T09:04:00.000Z';
const BALANCE_PAID_AT = '2026-08-18T09:06:00.000Z';

function seedProduct(db: SqliteD1, stock = 4): void {
  db.sqlite.exec(`
    INSERT INTO products (id, slug, name, price_cents, stock, category, active)
    VALUES (1, 'producto-presupuesto', 'Producto presupuesto', 1500, ${stock}, 'test', 1);
    INSERT INTO product_variants (
      id, product_id, sku, title, price_cents, status, is_default, option_signature
    ) VALUES (1, 1, 'QUOTE-1', '', 1500, 'active', 1, NULL);
    INSERT INTO inventory_balances (
      variant_id, on_hand, reserved, version, reservation_version
    ) VALUES (1, ${stock}, 0, 1, 1);
    INSERT INTO inventory_movements (
      variant_id, delta, reason, balance_after, version_after, actor_kind,
      actor_id, reference_type, reference_id, idempotency_key, correlation_id, occurred_at
    ) VALUES (1, ${stock}, 'legacy_opening_balance', ${stock}, 1, 'system', 'test',
      'test', '1', 'preliminary:test:opening', 'inventory:variant:1', '${ISSUED_AT}');
  `);
}

function draftInput(idempotencyKey = 'preliminary:create:one') {
  return {
    email: 'cliente@example.com',
    customerName: 'Cliente de prueba',
    addressJson: JSON.stringify({ country: 'ES', city: 'Barcelona' }),
    currency: 'EUR',
    shippingCents: 0,
    depositCents: 1000,
    conversionGate: 'deposit' as const,
    expiresAt: '2026-09-01T00:00:00.000Z',
    lines: [{ variantId: 1, quantity: 2 }],
    idempotencyKey,
  };
}

async function approvedQuote(db: SqliteD1) {
  const operations = createPreliminaryOrderOperations(db.asD1());
  const created = await operations.create(draftInput());
  if (!('id' in created)) throw new Error('No se creó el presupuesto de prueba.');
  expect(await operations.transition({
    id: created.id, expectedVersion: 1, action: 'issue',
    idempotencyKey: 'preliminary:issue:one', at: ISSUED_AT,
  })).toBe('applied');
  expect(await operations.transition({
    id: created.id, expectedVersion: 2, action: 'approve',
    idempotencyKey: 'preliminary:approve:one', at: APPROVED_AT,
  })).toBe('applied');
  return { operations, id: created.id };
}

describe('presupuestos y depósitos R4.11 en runtime D1', () => {
  it('crea el borrador de forma idempotente con precios congelados por servidor', async () => {
    const db = new SqliteD1();
    seedProduct(db);
    const operations = createPreliminaryOrderOperations(db.asD1());

    const first = await operations.create(draftInput());
    const replay = await operations.create(draftInput());
    expect(first.outcome).toBe('created');
    expect(replay).toEqual({ outcome: 'duplicate', id: 'id' in first ? first.id : '' });
    expect(db.query(`SELECT subtotal_cents,total_cents,deposit_cents,status,version
      FROM preliminary_orders`)).toEqual([{
      subtotal_cents: 3000, total_cents: 3000, deposit_cents: 1000,
      status: 'draft', version: 1,
    }]);
    expect(db.query(`SELECT unit_price_cents,quantity,line_total_cents
      FROM preliminary_order_lines`)).toEqual([{
      unit_price_cents: 1500, quantity: 2, line_total_cents: 3000,
    }]);
    expect(db.value('SELECT count(*) AS value FROM audit_log')).toBe(1);
  });

  it('cobra depósito, convierte con reserva y cobra saldo consumiendo stock una sola vez', async () => {
    const db = new SqliteD1();
    seedProduct(db);
    const { operations, id } = await approvedQuote(db);

    const depositLink = await operations.createPaymentLink({
      id, idempotencyKey: 'preliminary:link:deposit',
      createdAt: '2026-08-18T09:02:00.000Z', expiresAt: '2026-08-18T10:00:00.000Z',
    });
    if (!('link' in depositLink)) throw new Error('No se creó el enlace de depósito.');
    expect(depositLink.link).toMatchObject({ stage: 'deposit', amount_cents: 1000 });
    expect(depositLink.session?.url).toMatch(/^https:\/\/payments\.example\.test\//);
    expect(await operations.confirmSimulatedPayment({
      linkId: depositLink.link.id, occurredAt: DEPOSIT_PAID_AT,
    })).toBe('applied');

    expect(await operations.convert({
      id, expectedVersion: 4, idempotencyKey: 'preliminary:convert:one',
      convertedAt: CONVERTED_AT, reservationExpiresAt: '2026-08-19T09:04:00.000Z',
    })).toBe('applied');
    expect(db.query('SELECT on_hand,reserved FROM inventory_balances')).toEqual([
      { on_hand: 4, reserved: 2 },
    ]);
    expect(db.value('SELECT status AS value FROM orders')).toBe('pending');

    const balanceLink = await operations.createPaymentLink({
      id, idempotencyKey: 'preliminary:link:balance',
      createdAt: '2026-08-18T09:05:00.000Z', expiresAt: '2026-08-18T10:00:00.000Z',
    });
    if (!('link' in balanceLink)) throw new Error('No se creó el enlace de saldo.');
    expect(balanceLink.link).toMatchObject({ stage: 'balance', amount_cents: 2000 });
    expect(await operations.confirmSimulatedPayment({
      linkId: balanceLink.link.id, occurredAt: BALANCE_PAID_AT,
    })).toBe('applied');
    expect(await operations.confirmSimulatedPayment({
      linkId: balanceLink.link.id, occurredAt: BALANCE_PAID_AT,
    })).toBe('duplicate');

    expect(db.query('SELECT status,payment_status,paid_cents,version FROM preliminary_orders'))
      .toEqual([{ status: 'converted', payment_status: 'paid', paid_cents: 3000, version: 6 }]);
    expect(db.query('SELECT status FROM orders')).toEqual([{ status: 'paid' }]);
    expect(db.query('SELECT status,version FROM payments')).toEqual([{ status: 'captured', version: 2 }]);
    expect(db.value('SELECT count(*) AS value FROM payment_transactions')).toBe(2);
    expect(db.query('SELECT on_hand,reserved FROM inventory_balances')).toEqual([
      { on_hand: 2, reserved: 0 },
    ]);
    expect(db.value("SELECT count(*) AS value FROM inventory_movements WHERE reason='sale'"))
      .toBe(1);
  });

  it('solo una conversión gana la carrera y no duplica pedido ni reserva', async () => {
    const db = new SqliteD1();
    seedProduct(db, 2);
    const { operations, id } = await approvedQuote(db);
    const link = await operations.createPaymentLink({
      id, idempotencyKey: 'preliminary:link:race',
      createdAt: '2026-08-18T09:02:00.000Z', expiresAt: '2026-08-18T10:00:00.000Z',
    });
    if (!('link' in link)) throw new Error('No se creó el enlace de carrera.');
    await operations.confirmSimulatedPayment({ linkId: link.link.id, occurredAt: DEPOSIT_PAID_AT });

    const results = await Promise.all([
      operations.convert({ id, expectedVersion: 4, idempotencyKey: 'preliminary:convert:race:a',
        convertedAt: CONVERTED_AT, reservationExpiresAt: '2026-08-19T09:04:00.000Z' }),
      operations.convert({ id, expectedVersion: 4, idempotencyKey: 'preliminary:convert:race:b',
        convertedAt: CONVERTED_AT, reservationExpiresAt: '2026-08-19T09:04:00.000Z' }),
    ]);
    expect(results.sort()).toEqual(['applied', 'duplicate']);
    expect(db.value('SELECT count(*) AS value FROM orders')).toBe(1);
    expect(db.value('SELECT count(*) AS value FROM inventory_reservations')).toBe(1);
    expect(db.value('SELECT reserved AS value FROM inventory_balances')).toBe(2);
  });

  it('aborta la conversión completa si una variante dejó de ser vendible', async () => {
    const db = new SqliteD1();
    seedProduct(db, 2);
    const { operations, id } = await approvedQuote(db);
    const link = await operations.createPaymentLink({
      id, idempotencyKey: 'preliminary:link:not-sellable',
      createdAt: '2026-08-18T09:02:00.000Z', expiresAt: '2026-08-18T10:00:00.000Z',
    });
    if (!('link' in link)) throw new Error('No se creó el enlace previo al guard.');
    await operations.confirmSimulatedPayment({ linkId: link.link.id, occurredAt: DEPOSIT_PAID_AT });
    db.sqlite.exec("UPDATE product_variants SET status='archived' WHERE id=1");

    expect(await operations.convert({
      id, expectedVersion: 4, idempotencyKey: 'preliminary:convert:not-sellable',
      convertedAt: CONVERTED_AT, reservationExpiresAt: '2026-08-19T09:04:00.000Z',
    })).toBe('not-sellable');
    expect(db.value('SELECT count(*) AS value FROM orders')).toBe(0);
    expect(db.value('SELECT count(*) AS value FROM inventory_reservations')).toBe(0);
    expect(db.value('SELECT reserved AS value FROM inventory_balances')).toBe(0);
    expect(db.query('SELECT status,version FROM preliminary_orders'))
      .toEqual([{ status: 'approved', version: 4 }]);
  });
});
