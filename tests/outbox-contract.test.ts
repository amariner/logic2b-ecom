import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import schema from '../docs/plataforma/sql/0004_event_outbox.proposed.sql?raw';
import migration from '../migrations/0004_event_outbox.sql?raw';
import {
  CLAIM_OUTBOX_DELIVERIES_SQL,
  OUTBOX_POLICY,
  decideOutboxFailure,
} from '../src/platform/events/outbox-contract';

const NOW = '2026-08-06T12:00:00.000Z';
const LEASE_END = '2026-08-06T12:01:00.000Z';

function database(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(schema);
  return db;
}

function insertEvent(db: DatabaseSync, eventId = 'evt_1', idempotencyKey = 'order:1:paid'): void {
  db.prepare(`
    INSERT INTO event_outbox_events (
      event_id, event_type, event_version, occurred_at,
      actor_kind, actor_id, actor_label,
      entity_type, entity_id, entity_reference,
      correlation_id, causation_id, idempotency_key, payload_json, created_at
    ) VALUES (?, 'orders.order_paid', 1, ?, 'provider', 'stripe', 'Stripe',
      'order', '1', 'BM-1', 'order:BM-1', 'evt_stripe', ?, '{"order_id":1}', ?)
  `).run(eventId, NOW, idempotencyKey, NOW);
}

function insertDelivery(db: DatabaseSync, eventId: string, consumerId: string, availableAt = NOW): void {
  db.prepare(`
    INSERT INTO event_outbox_deliveries (
      event_id, consumer_id, available_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?)
  `).run(eventId, consumerId, availableAt, NOW, NOW);
}

describe('contrato propuesto del outbox (R1.6)', () => {
  it('el SQL exacto se ejecuta en SQLite y crea las dos tablas y cuatro índices operativos', () => {
    const db = database();
    const tables = db.prepare(`
      SELECT name FROM sqlite_schema WHERE type = 'table' AND name LIKE 'event_outbox_%' ORDER BY name
    `).all().map((row) => row.name);
    const indexes = db.prepare(`
      SELECT name FROM sqlite_schema WHERE type = 'index' AND name LIKE 'idx_event_outbox_%' ORDER BY name
    `).all().map((row) => row.name);
    expect(tables).toEqual(['event_outbox_deliveries', 'event_outbox_events']);
    expect(indexes).toEqual([
      'idx_event_outbox_deliveries_claim',
      'idx_event_outbox_deliveries_event',
      'idx_event_outbox_deliveries_lease',
      'idx_event_outbox_deliveries_retention',
      'idx_event_outbox_events_correlation',
    ]);
  });

  it('deduplica el hecho y cada entrega sin mezclar consumidores', () => {
    const db = database();
    insertEvent(db);
    insertDelivery(db, 'evt_1', 'notifications');
    insertDelivery(db, 'evt_1', 'integrations');
    expect(() => insertEvent(db, 'evt_2')).toThrow(/UNIQUE/);
    expect(() => insertDelivery(db, 'evt_1', 'notifications')).toThrow(/UNIQUE/);
    expect(db.prepare('SELECT count(*) AS total FROM event_outbox_deliveries').get()?.total).toBe(2);
  });

  it('el claim atómico selecciona las más antiguas, respeta el límite y excluye una lease ya tomada', () => {
    const db = database();
    for (let index = 1; index <= 3; index += 1) {
      insertEvent(db, `evt_${index}`, `order:${index}:paid`);
      insertDelivery(db, `evt_${index}`, 'notifications', `2026-08-06T11:59:0${index}.000Z`);
    }
    const claim = db.prepare(CLAIM_OUTBOX_DELIVERIES_SQL);
    const first = claim.all(NOW, LEASE_END, 'worker-a', OUTBOX_POLICY.maxAttempts, 2);
    const second = claim.all(NOW, LEASE_END, 'worker-b', OUTBOX_POLICY.maxAttempts, 2);
    expect(first.map((row) => row.event_id).toSorted()).toEqual(['evt_1', 'evt_2']);
    expect(second.map((row) => row.event_id)).toEqual(['evt_3']);
    expect(db.prepare("SELECT count(*) AS total FROM event_outbox_deliveries WHERE status='processing'").get()?.total).toBe(3);
  });

  it('las constraints rechazan estados incoherentes, payload inválido y entregas huérfanas', () => {
    const db = database();
    insertEvent(db);
    expect(() => db.prepare(`
      INSERT INTO event_outbox_deliveries (
        event_id, consumer_id, status, available_at, created_at, updated_at
      ) VALUES ('evt_1', 'notifications', 'delivered', ?, ?, ?)
    `).run(NOW, NOW, NOW)).toThrow(/CHECK/);
    expect(() => db.prepare(`
      INSERT INTO event_outbox_deliveries (
        event_id, consumer_id, available_at, created_at, updated_at
      ) VALUES ('missing', 'notifications', ?, ?, ?)
    `).run(NOW, NOW, NOW)).toThrow(/FOREIGN KEY/);
    expect(() => db.prepare(`
      UPDATE event_outbox_events SET payload_json = 'no-json' WHERE event_id='evt_1'
    `).run()).toThrow(/CHECK/);
  });

  it('el esquema no abre columnas para PII ni cuerpos de proveedor', () => {
    const columns = database().prepare('PRAGMA table_info(event_outbox_events)').all()
      .map((row) => row.name);
    for (const forbidden of ['email', 'customer_name', 'address_json', 'provider_response', 'stack']) {
      expect(columns).not.toContain(forbidden);
    }
  });

  it('fija siete demoras y convierte el octavo fallo en dead-letter', () => {
    expect(Array.from({ length: 7 }, (_, index) => decideOutboxFailure(index + 1))).toEqual(
      OUTBOX_POLICY.retryDelaysSeconds.map((retryAfterSeconds) => ({ state: 'pending', retryAfterSeconds })),
    );
    expect(decideOutboxFailure(8)).toEqual({ state: 'dead', retryAfterSeconds: null });
    expect(decideOutboxFailure(12)).toEqual({ state: 'dead', retryAfterSeconds: null });
    expect(() => decideOutboxFailure(0)).toThrow(RangeError);
  });

  it('conserva la propuesta R1.6 como evidencia de la puerta de esquema', () => {
    expect(schema).toContain('PROPUESTA R1.6. NO ES UNA MIGRACION APLICABLE');
    expect(schema).toContain('idempotency_key TEXT NOT NULL UNIQUE');
    expect(schema).toContain('WHERE status = \'pending\'');
  });

  it('la migración aprobada conserva exactamente el DDL ensayado en R1.6', () => {
    const ddl = (sql: string) => sql.slice(sql.indexOf('CREATE TABLE')).trim();
    expect(ddl(migration)).toBe(ddl(schema));
  });
});
