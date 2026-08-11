import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import schema from '../docs/plataforma/sql/0012_fulfillment_lines.proposed.sql?raw';
import {
  canTransitionFulfillment,
  normalizeFulfillmentIdempotencyKey,
  normalizeFulfillmentTracking,
  planOutstandingFulfillment,
  remainingFulfillableQuantity,
  trackingRequiredForFulfillment,
} from '../src/modules/fulfillment';

const NOW = '2026-08-11T12:00:00.000Z';

function database(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE orders (id INTEGER PRIMARY KEY);
    CREATE TABLE order_items (
      id INTEGER PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      qty INTEGER NOT NULL CHECK (qty > 0)
    );
    INSERT INTO orders (id) VALUES (1), (2);
    INSERT INTO order_items (id, order_id, qty) VALUES (10, 1, 2), (20, 2, 1);
  `);
  db.exec(schema);
  return db;
}

function insertShipped(db: DatabaseSync, idempotencyKey = 'fulfillment:event:evt_1'): number {
  return Number(db.prepare(`
    INSERT INTO fulfillments (
      order_id, status, carrier, tracking_number, idempotency_key,
      shipped_at, created_at, updated_at
    ) VALUES (1, 'shipped', 'SEUR', 'ES123', ?, ?, ?, ?)
    RETURNING id
  `).get(idempotencyKey, NOW, NOW, NOW)?.id);
}

describe('diseño de fulfillment por líneas R2.11', () => {
  it('mantiene el DDL fuera de migrations y crea solo las tablas e índices previstos', () => {
    const db = database();
    expect(schema).toContain('PROPUESTA R2.11. NO ES UNA MIGRACION APLICABLE');
    expect(db.prepare(`SELECT name FROM sqlite_schema
      WHERE type='table' AND name LIKE 'fulfillment%' ORDER BY name`).all()).toEqual([
      { name: 'fulfillment_items' },
      { name: 'fulfillments' },
    ]);
    expect(db.prepare(`SELECT name FROM sqlite_schema
      WHERE type='index' AND name LIKE 'idx_fulfillment%' ORDER BY name`).all()).toEqual([
      { name: 'idx_fulfillment_items_order_item' },
      { name: 'idx_fulfillments_operation' },
      { name: 'idx_fulfillments_order' },
    ]);
  });

  it('asigna todas las cantidades netas pendientes sin exceder ninguna línea', () => {
    const lines = [
      { order_item_id: 10, ordered_quantity: 3, cancelled_quantity: 1, fulfilled_quantity: 0 },
      { order_item_id: 11, ordered_quantity: 4, cancelled_quantity: 0, fulfilled_quantity: 1 },
    ] as const;
    expect(planOutstandingFulfillment(lines)).toEqual([
      { order_item_id: 10, quantity: 2 },
      { order_item_id: 11, quantity: 3 },
    ]);
    expect(remainingFulfillableQuantity({ ...lines[0], fulfilled_quantity: 2 })).toBe(0);
    expect(() => remainingFulfillableQuantity({ ...lines[0], fulfilled_quantity: 3 })).toThrow(/cantidad neta/);
    expect(() => planOutstandingFulfillment([lines[0], lines[0]])).toThrow(/no puede repetirse/);
  });

  it('fija transiciones terminales y exige tracking para estados enviados', () => {
    expect(canTransitionFulfillment('pending', 'shipped')).toBe(true);
    expect(canTransitionFulfillment('ready', 'cancelled')).toBe(true);
    expect(canTransitionFulfillment('shipped', 'delivered')).toBe(true);
    expect(canTransitionFulfillment('delivered', 'pending')).toBe(false);
    expect(trackingRequiredForFulfillment('ready')).toBe(false);
    expect(trackingRequiredForFulfillment('shipped')).toBe(true);
    expect(normalizeFulfillmentTracking({ carrier: ' SEUR ', number: ' ES123 ' })).toEqual({
      carrier: 'SEUR', number: 'ES123',
    });
    expect(normalizeFulfillmentIdempotencyKey(' fulfillment:event:evt_1 ')).toBe('fulfillment:event:evt_1');
    expect(() => normalizeFulfillmentTracking({ carrier: '', number: 'ES123' })).toThrow(/carrier/);
  });

  it('rechaza estados incoherentes, claves repetidas y cantidades no positivas', () => {
    const db = database();
    const fulfillmentId = insertShipped(db);
    db.prepare(`INSERT INTO fulfillment_items
      (fulfillment_id, order_id, order_item_id, quantity, created_at)
      VALUES (?, 1, 10, 2, ?)`).run(fulfillmentId, NOW);
    expect(() => insertShipped(db)).toThrow(/UNIQUE/);
    expect(() => db.prepare(`INSERT INTO fulfillments (
      order_id, status, carrier, tracking_number, idempotency_key, created_at, updated_at
    ) VALUES (1, 'shipped', 'SEUR', 'SIN-FECHA', 'bad:missing-date', ?, ?)`).run(NOW, NOW)).toThrow(/CHECK/);
    expect(() => db.prepare(`INSERT INTO fulfillment_items
      (fulfillment_id, order_id, order_item_id, quantity)
      VALUES (?, 1, 10, 0)`).run(fulfillmentId)).toThrow(/CHECK/);
  });

  it('impide asociar una línea de otro pedido aunque ambos ids existan', () => {
    const db = database();
    const fulfillmentId = insertShipped(db);
    expect(() => db.prepare(`INSERT INTO fulfillment_items
      (fulfillment_id, order_id, order_item_id, quantity)
      VALUES (?, 1, 20, 1)`).run(fulfillmentId)).toThrow(/FOREIGN KEY/);
  });

  it('no incorpora PII, dinero, SKU ni respuestas de transportista', () => {
    const db = database();
    const columns = ['fulfillments', 'fulfillment_items']
      .flatMap((table) => db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name));
    for (const forbidden of [
      'email', 'customer_name', 'address_json', 'price_cents', 'sku', 'provider_response',
    ]) {
      expect(columns).not.toContain(forbidden);
    }
  });
});
