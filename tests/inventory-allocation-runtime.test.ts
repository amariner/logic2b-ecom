import { describe, expect, it } from 'vitest';
import { createFulfillmentOperations } from '../src/composition/fulfillment-operations';
import { createEventFactory } from '../src/shared-kernel/events';
import { SqliteD1 } from './sqlite-d1';

function runtime(prefix = 'r39') {
  let tick = 0;
  return createEventFactory({
    clock: { now: () => new Date(Date.parse('2026-08-14T08:00:00.000Z') + tick * 1000) },
    ids: { next: () => `evt_${prefix}_${++tick}` },
  });
}

function seedPaidOrder(db: SqliteD1, secondary = false): void {
  db.sqlite.exec(`
    INSERT INTO products (id, slug, name, price_cents, stock, category)
    VALUES (1, 'aove-r39', 'AOVE R3.9', 890, 6, 'aceites');
    INSERT INTO product_variants (
      id, product_id, sku, title, price_cents, status, is_default, option_signature
    ) VALUES (1, 1, 'AOVE-R39', '', 890, 'active', 1, NULL);
    INSERT INTO inventory_balances (variant_id, on_hand, reserved, version)
    VALUES (1, 6, 0, 2);
    INSERT INTO orders (
      id, order_number, email, customer_name, address_json,
      subtotal_cents, shipping_cents, total_cents, status,
      stripe_session_id, stripe_payment_intent, currency
    ) VALUES (39, 'BM-R39-TEST', 'cliente@example.com', 'Cliente', '{"country":"ES"}',
      1780, 0, 1780, 'paid', 'cs_r39', 'pi_r39', 'EUR');
    INSERT INTO order_items (
      id, order_id, product_id, variant_id, name_snapshot, unit_price_cents, qty
    ) VALUES (391, 39, 1, 1, 'AOVE R3.9', 890, 2);
    INSERT INTO payments (
      order_id, provider, provider_reference, currency, expected_amount_cents,
      status, idempotency_key, created_at, updated_at
    ) VALUES (39, 'stripe', 'pi_r39', 'EUR', 1780, 'captured',
      'r3:payment:order:39', '2026-08-14T07:00:00.000Z', '2026-08-14T07:00:00.000Z');
  `);
  if (secondary) db.sqlite.exec(`
    INSERT INTO inventory_locations (
      code, name, kind, status, is_primary, timezone, created_at, updated_at
    ) VALUES ('norte', 'Almacén norte', 'warehouse', 'active', 0,
      'Europe/Madrid', '2026-08-14T07:00:00.000Z', '2026-08-14T07:00:00.000Z');
    INSERT INTO inventory_location_balances (
      location_id, variant_id, on_hand, reserved, movement_version, reservation_version, updated_at
    ) SELECT id, 1, 5, 0, 1, 1, '2026-08-14T07:00:00.000Z'
      FROM inventory_locations WHERE code = 'norte';
    UPDATE inventory_routing_policies SET priority = 10, handling_cost_cents = 90
      WHERE location_id = (SELECT id FROM inventory_locations WHERE code = 'norte');
  `);
}

function seedCompetingOrder(db: SqliteD1): void {
  db.sqlite.exec(`
    INSERT INTO orders (
      id, order_number, email, customer_name, address_json,
      subtotal_cents, shipping_cents, total_cents, status,
      stripe_session_id, stripe_payment_intent, currency
    ) VALUES (40, 'BM-R39-RACE', 'otra@example.com', 'Otra clienta', '{"country":"ES"}',
      1780, 0, 1780, 'paid', 'cs_r39_race', 'pi_r39_race', 'EUR');
    INSERT INTO order_items (
      id, order_id, product_id, variant_id, name_snapshot, unit_price_cents, qty
    ) VALUES (401, 40, 1, 1, 'AOVE R3.9', 890, 2);
    INSERT INTO payments (
      order_id, provider, provider_reference, currency, expected_amount_cents,
      status, idempotency_key, created_at, updated_at
    ) VALUES (40, 'stripe', 'pi_r39_race', 'EUR', 1780, 'captured',
      'r3:payment:order:40', '2026-08-14T07:00:00.000Z', '2026-08-14T07:00:00.000Z');
    UPDATE inventory_location_balances SET on_hand = 2
      WHERE location_id = (SELECT id FROM inventory_locations WHERE code='norte') AND variant_id=1;
  `);
}

describe('R3.9 asignación vinculante de fulfillment', () => {
  it('persiste la explicación y no vuelve a consumir cuando elige principal', async () => {
    const db = new SqliteD1();
    seedPaidOrder(db);
    const result = await createFulfillmentOperations(db.asD1(), runtime(), { routingEnabled: true }).ship({
      orderId: 39,
      tracking: { carrier: 'SEUR', number: 'R39-PRIMARY' },
      idempotencyKey: 'allocation-primary',
    });
    expect(result.outcome).toBe('applied');
    expect(db.value('SELECT on_hand AS value FROM inventory_balances WHERE variant_id = 1')).toBe(6);
    expect(db.value('SELECT count(*) AS value FROM inventory_allocation_movements')).toBe(0);
    const decision = db.query<{ location_code: string; explanation_json: string }>(`
      SELECT l.code AS location_code, d.explanation_json
      FROM inventory_allocation_decisions d JOIN inventory_locations l ON l.id=d.location_id
    `)[0]!;
    expect(decision.location_code).toBe('principal');
    expect(JSON.parse(decision.explanation_json)).toMatchObject({
      contract: 'logic2b.inventory-routing.v1', market: 'ES', channel: 'storefront',
      selected_location_id: 1,
    });
  });

  it('traslada el consumo a secundaria sin alterar el stock total de la red', async () => {
    const db = new SqliteD1();
    seedPaidOrder(db, true);
    const before = Number(db.value('SELECT sum(on_hand) AS value FROM inventory_location_balances'));
    const result = await createFulfillmentOperations(db.asD1(), runtime(), { routingEnabled: true }).ship({
      orderId: 39,
      tracking: { carrier: 'GLS', number: 'R39-NORTH' },
      idempotencyKey: 'allocation-secondary',
    });
    expect(result.outcome).toBe('applied');
    expect(db.query(`SELECT l.code, b.on_hand FROM inventory_location_balances b
      JOIN inventory_locations l ON l.id=b.location_id ORDER BY l.id`))
      .toEqual([{ code: 'principal', on_hand: 8 }, { code: 'norte', on_hand: 3 }]);
    expect(Number(db.value('SELECT sum(on_hand) AS value FROM inventory_location_balances'))).toBe(before);
    expect(db.value('SELECT on_hand AS value FROM inventory_balances WHERE variant_id = 1')).toBe(8);
    expect(db.query(`SELECT movement_kind, quantity FROM inventory_allocation_movements
      ORDER BY movement_kind`)).toEqual([
      { movement_kind: 'primary_release', quantity: 2 },
      { movement_kind: 'secondary_consume', quantity: 2 },
    ]);
    expect(db.value(`SELECT count(*) AS value FROM inventory_allocation_decisions d
      JOIN inventory_locations l ON l.id=d.location_id WHERE l.code='norte'`)).toBe(1);
  });

  it('una carrera por la última secundaria deja un ganador y ninguna evidencia parcial', async () => {
    const db = new SqliteD1();
    seedPaidOrder(db, true);
    seedCompetingOrder(db);
    const first = createFulfillmentOperations(db.asD1(), runtime('race_a'), { routingEnabled: true });
    const second = createFulfillmentOperations(db.asD1(), runtime('race_b'), { routingEnabled: true });
    const outcomes = await Promise.all([
      first.ship({ orderId: 39, tracking: { carrier: 'GLS', number: 'RACE-1' }, idempotencyKey: 'allocation-race-one' }),
      second.ship({ orderId: 40, tracking: { carrier: 'GLS', number: 'RACE-2' }, idempotencyKey: 'allocation-race-two' }),
    ]);
    expect(outcomes.map(({ outcome }) => outcome).sort()).toEqual(['applied', 'conflict']);
    expect(db.value('SELECT count(*) AS value FROM fulfillments')).toBe(1);
    expect(db.value('SELECT count(*) AS value FROM inventory_allocation_decisions')).toBe(1);
    expect(db.value('SELECT count(*) AS value FROM inventory_allocation_lines')).toBe(1);
    expect(db.value('SELECT count(*) AS value FROM inventory_allocation_movements')).toBe(2);
    expect(db.value(`SELECT on_hand AS value FROM inventory_location_balances
      WHERE location_id=(SELECT id FROM inventory_locations WHERE code='norte') AND variant_id=1`)).toBe(0);
    expect(db.query('PRAGMA foreign_key_check')).toEqual([]);
  });
});
