import { beforeEach, describe, expect, it } from 'vitest';
import { createFulfillmentOperations } from '../src/composition/fulfillment-operations';
import { createOrderHoldOperations } from '../src/composition/order-hold-operations';
import { createEventFactory, type EventClock, type EventIdSource } from '../src/shared-kernel/events';
import { seedStatements } from '../seed/seed';
import { SqliteD1 } from './sqlite-d1';

function dependencies() {
  let sequence = 0;
  let now = '2026-08-13T08:00:00.000Z';
  const clock: EventClock = { now: () => new Date(Date.parse(now) + sequence * 1000) };
  const ids: EventIdSource = { next: () => `hold-event-${++sequence}` };
  return {
    emit: createEventFactory({ clock, ids }),
    now: () => now,
    nextHoldId: () => `hold-runtime-${sequence + 1}`,
    advance(value: string) { now = value; },
  };
}

describe('runtime R3.4 de holds e incidencias', () => {
  let db: SqliteD1;
  let orderId: number;

  beforeEach(async () => {
    db = new SqliteD1();
    await db.batch(seedStatements().map((sql) => db.prepare(sql)));
    orderId = Number(db.value(`SELECT id AS value FROM orders WHERE order_number = 'BM-DEMO-1006'`));
  });

  it('crea y reintenta un hold sin duplicar proyección, histórico, outbox o auditoría', async () => {
    const deps = dependencies();
    const operations = createOrderHoldOperations(db.asD1(), deps);
    const input = {
      orderId,
      source: 'manual' as const,
      reasonCode: 'address_issue' as const,
      owner: { kind: 'admin' as const, id: 'operations', label: 'Operaciones' },
      dueAt: '2026-08-13T12:00:00.000Z',
      idempotencyKey: 'order:1005:hold:address',
    };
    expect((await operations.create(input)).outcome).toBe('applied');
    expect((await operations.create(input)).outcome).toBe('replayed');
    expect((await operations.create({ ...input, reasonCode: 'risk_review' })).outcome).toBe('conflict');

    expect(db.value("SELECT count(*) AS value FROM order_holds WHERE idempotency_key = 'order:1005:hold:address'"))
      .toBe(1);
    expect(db.value("SELECT count(*) AS value FROM order_hold_events WHERE hold_id = (SELECT id FROM order_holds WHERE idempotency_key = 'order:1005:hold:address')"))
      .toBe(1);
    expect(db.value("SELECT count(*) AS value FROM event_outbox_events WHERE event_type = 'orders.order_hold_created'"))
      .toBe(1);
    expect(db.value("SELECT count(*) AS value FROM audit_log WHERE action = 'orders.hold_created'"))
      .toBe(1);
  });

  it('trata dos altas simultáneas con la misma clave como aplicación y replay', async () => {
    const deps = dependencies();
    const operations = createOrderHoldOperations(db.asD1(), deps);
    const input = {
      orderId,
      source: 'automatic' as const,
      reasonCode: 'inventory_issue' as const,
      owner: { kind: 'system' as const, id: 'inventory-policy', label: 'Política de inventario' },
      dueAt: '2026-08-13T12:00:00.000Z',
      idempotencyKey: 'hold:concurrent:inventory',
    };
    const attempts = await Promise.all([operations.create(input), operations.create(input)]);
    expect(attempts.map(({ outcome }) => outcome).sort()).toEqual(['applied', 'replayed']);
    expect(attempts[0].hold?.id).toBe(attempts[1].hold?.id);
    expect(db.value(`SELECT count(*) AS value FROM order_holds
      WHERE idempotency_key = 'hold:concurrent:inventory'`)).toBe(1);
    expect(db.value(`SELECT count(*) AS value FROM order_hold_events
      WHERE hold_id = (SELECT id FROM order_holds WHERE idempotency_key = 'hold:concurrent:inventory')`))
      .toBe(1);
  });

  it('permite varios holds y deja un solo ganador al reasignar la misma versión', async () => {
    const deps = dependencies();
    const operations = createOrderHoldOperations(db.asD1(), deps);
    const first = await operations.create({
      orderId, source: 'manual', reasonCode: 'address_issue',
      owner: { kind: 'admin', id: 'operations', label: 'Operaciones' },
      dueAt: '2026-08-13T12:00:00.000Z', idempotencyKey: 'hold:first',
    });
    await operations.create({
      orderId, source: 'automatic', reasonCode: 'inventory_issue',
      owner: { kind: 'system', id: 'inventory-policy', label: 'Política de inventario' },
      dueAt: '2026-08-13T10:00:00.000Z', idempotencyKey: 'hold:second',
    });
    expect(db.value(`SELECT count(*) AS value FROM order_holds WHERE order_id = ${orderId} AND status = 'active'`))
      .toBe(2);

    deps.advance('2026-08-13T09:00:00.000Z');
    const attempts = await Promise.all([
      operations.assign({
        holdId: first.hold!.id, expectedVersion: 1,
        owner: { kind: 'admin', id: 'warehouse', label: 'Almacén' },
      }),
      operations.assign({
        holdId: first.hold!.id, expectedVersion: 1,
        owner: { kind: 'admin', id: 'support', label: 'Atención al cliente' },
      }),
    ]);
    expect(attempts.map(({ outcome }) => outcome).sort()).toEqual(['applied', 'conflict']);
    expect(db.value(`SELECT version AS value FROM order_holds WHERE id = '${first.hold!.id}'`)).toBe(2);
    expect(db.value(`SELECT count(*) AS value FROM order_hold_events WHERE hold_id = '${first.hold!.id}'`)).toBe(2);
  });

  it('resuelve con versión optimista sin filtrar responsable o notas al sobre y auditoría', async () => {
    const deps = dependencies();
    const operations = createOrderHoldOperations(db.asD1(), deps);
    const created = await operations.create({
      orderId, source: 'manual', reasonCode: 'customer_request',
      owner: { kind: 'admin', id: 'andreu-private', label: 'Nombre privado' },
      dueAt: '2026-08-13T12:00:00.000Z', idempotencyKey: 'hold:resolve',
    });
    deps.advance('2026-08-13T09:00:00.000Z');
    expect((await operations.resolve({
      holdId: created.hold!.id, expectedVersion: 1, resolutionCode: 'cleared',
    })).outcome).toBe('applied');
    expect((await operations.resolve({
      holdId: created.hold!.id, expectedVersion: 1, resolutionCode: 'duplicate',
    })).outcome).toBe('conflict');

    expect(db.query(`SELECT status, resolution_code, version FROM order_holds WHERE id = '${created.hold!.id}'`)[0]).toEqual({
      status: 'resolved', resolution_code: 'cleared', version: 2,
    });
    const serializedEvidence = JSON.stringify(db.query(`
      SELECT payload_json FROM event_outbox_events
      WHERE event_type LIKE 'orders.order_hold_%'
      UNION ALL SELECT diff_json FROM audit_log WHERE action LIKE 'orders.hold_%'
    `));
    expect(serializedEvidence).not.toContain('andreu-private');
    expect(serializedEvidence).not.toContain('Nombre privado');
  });

  it('impide preparar con cualquier hold activo y permite hacerlo tras resolver el último', async () => {
    const deps = dependencies();
    const holds = createOrderHoldOperations(db.asD1(), deps);
    const created = await holds.create({
      orderId, source: 'manual', reasonCode: 'fulfillment_issue',
      owner: { kind: 'admin', id: 'operations', label: 'Operaciones' },
      dueAt: '2026-08-13T12:00:00.000Z', idempotencyKey: 'hold:shipment',
    });
    const fulfillmentsBefore = Number(db.value('SELECT count(*) AS value FROM fulfillments'));
    const shipmentEventsBefore = Number(db.value(
      "SELECT count(*) AS value FROM event_outbox_events WHERE event_type = 'fulfillment.fulfillment_shipped'",
    ));
    const blocked = await createFulfillmentOperations(db.asD1(), deps.emit).ship({
      orderId,
      tracking: { carrier: 'SEUR', number: 'HOLD-1' },
      idempotencyKey: 'shipment-blocked',
    });
    expect(blocked.outcome).toBe('conflict');
    expect(db.value('SELECT count(*) AS value FROM fulfillments')).toBe(fulfillmentsBefore);
    expect(db.value("SELECT count(*) AS value FROM event_outbox_events WHERE event_type = 'fulfillment.fulfillment_shipped'"))
      .toBe(shipmentEventsBefore);

    deps.advance('2026-08-13T09:00:00.000Z');
    await holds.resolve({
      holdId: created.hold!.id, expectedVersion: 1, resolutionCode: 'cleared',
    });
    const shipped = await createFulfillmentOperations(db.asD1(), deps.emit).ship({
      orderId,
      tracking: { carrier: 'SEUR', number: 'HOLD-2' },
      idempotencyKey: 'shipment-after-resolution',
    });
    expect(shipped.outcome).toBe('applied');
    expect(db.value('SELECT count(*) AS value FROM fulfillments')).toBe(fulfillmentsBefore + 1);
  });

  it('serializa la carrera entre abrir un hold y preparar el envío completo', async () => {
    const deps = dependencies();
    const holds = createOrderHoldOperations(db.asD1(), deps);
    const fulfillments = createFulfillmentOperations(db.asD1(), deps.emit);
    const holdEventsBefore = Number(db.value(
      "SELECT count(*) AS value FROM event_outbox_events WHERE event_type = 'orders.order_hold_created'",
    ));
    const shipmentEventsBefore = Number(db.value(
      "SELECT count(*) AS value FROM event_outbox_events WHERE event_type = 'fulfillment.fulfillment_shipped'",
    ));

    const [holdResult, shipmentResult] = await Promise.all([
      holds.create({
        orderId, source: 'automatic', reasonCode: 'risk_review',
        owner: { kind: 'system', id: 'risk-policy', label: 'Política de riesgo' },
        dueAt: '2026-08-13T12:00:00.000Z', idempotencyKey: 'hold:race:shipment',
      }),
      fulfillments.ship({
        orderId,
        tracking: { carrier: 'SEUR', number: 'HOLD-RACE' },
        idempotencyKey: 'shipment-race-hold',
      }),
    ]);

    expect([holdResult.outcome, shipmentResult.outcome].sort()).toEqual(['applied', 'conflict']);
    const newHoldEvents = Number(db.value(
      "SELECT count(*) AS value FROM event_outbox_events WHERE event_type = 'orders.order_hold_created'",
    )) - holdEventsBefore;
    const newShipmentEvents = Number(db.value(
      "SELECT count(*) AS value FROM event_outbox_events WHERE event_type = 'fulfillment.fulfillment_shipped'",
    )) - shipmentEventsBefore;
    expect(newHoldEvents + newShipmentEvents).toBe(1);
    expect(Number(db.value(`SELECT count(*) AS value FROM order_holds
      WHERE order_id = ${orderId} AND status = 'active'`)) +
      Number(db.value(`SELECT count(*) AS value FROM fulfillments WHERE order_id = ${orderId}`)))
      .toBe(1);
  });
});
