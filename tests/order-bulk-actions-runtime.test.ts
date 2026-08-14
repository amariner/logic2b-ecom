import { beforeEach, describe, expect, it } from 'vitest';
import {
  createOrderBulkActionOperations,
  runOrderBulkActionJob,
} from '../src/composition/order-bulk-action-operations';
import { createOrderHoldOperations } from '../src/composition/order-hold-operations';
import { createEventFactory, type EventClock, type EventIdSource } from '../src/shared-kernel/events';
import { seedStatements } from '../seed/seed';
import { SqliteD1 } from './sqlite-d1';

function dependencies(initial = '2026-08-14T08:00:00.000Z') {
  let sequence = 0;
  let current = initial;
  const clock: EventClock = { now: () => new Date(Date.parse(current) + sequence * 10) };
  const ids: EventIdSource = { next: () => `bulk-runtime-event-${++sequence}` };
  return {
    emit: createEventFactory({ clock, ids }),
    now: () => current,
    advance(value: string) { current = value; },
  };
}

describe('runtime R3.5 de acciones masivas', () => {
  let db: SqliteD1;

  beforeEach(async () => {
    db = new SqliteD1();
    await db.batch(seedStatements().map((sql) => db.prepare(sql)));
  });

  it('confirma, ejecuta y reintenta etiquetas sin duplicar efecto ni evidencia', async () => {
    const deps = dependencies();
    const operations = createOrderBulkActionOperations(db.asD1(), deps);
    const tagId = Number(db.value("SELECT id AS value FROM order_tags WHERE slug = 'prioritario'"));
    const orderIds = db.query<{ id: number }>(`SELECT o.id FROM orders o
      WHERE NOT EXISTS (SELECT 1 FROM order_tag_assignments a
        WHERE a.order_id = o.id AND a.tag_id = ${tagId}) ORDER BY o.id LIMIT 2`).map((row) => row.id);
    const preview = await operations.preview({ orderIds, action: { type: 'add_tag', tagId } });
    const confirmed = await operations.confirm(preview);
    expect(confirmed.created).toBe(true);
    expect(confirmed.view.progress).toMatchObject({ total: 2, pending: 2 });

    const job = await runOrderBulkActionJob(db.asD1(), confirmed.view.batch.id, deps);
    expect(job.status).toBe('succeeded');
    const completed = await operations.get(confirmed.view.batch.id);
    expect(completed?.batch.status).toBe('completed');
    expect(completed?.progress).toMatchObject({ applied: 2, completed: 2, pending: 0 });
    expect(db.value(`SELECT count(*) AS value FROM order_tag_assignments
      WHERE tag_id = ${tagId} AND order_id IN (${orderIds.join(',')})`)).toBe(2);
    expect(db.value(`SELECT count(*) AS value FROM order_tag_events
      WHERE id LIKE 'bulk-tag:${confirmed.view.batch.id}:%'`)).toBe(2);
    expect(db.value("SELECT count(*) AS value FROM audit_log WHERE action = 'orders.bulk_created'")).toBe(1);

    const duplicateConfirmation = await operations.confirm(preview);
    expect(duplicateConfirmation.created).toBe(false);
    expect((await runOrderBulkActionJob(db.asD1(), confirmed.view.batch.id, deps)).status).toBe('duplicate');
    expect(db.value(`SELECT count(*) AS value FROM order_tag_events
      WHERE id LIKE 'bulk-tag:${confirmed.view.batch.id}:%'`)).toBe(2);
  });

  it('crea holds por fila con outbox y auditoría en la misma unidad', async () => {
    const deps = dependencies();
    const operations = createOrderBulkActionOperations(db.asD1(), deps);
    const orderIds = db.query<{ id: number }>(`SELECT id FROM orders
      WHERE status IN ('pending', 'paid', 'shipped') ORDER BY id LIMIT 2`).map((row) => row.id);
    const preview = await operations.preview({
      orderIds,
      action: {
        type: 'create_hold', reasonCode: 'risk_review',
        owner: { kind: 'admin', id: 'operations' },
        dueAt: '2026-08-14T12:00:00.000Z',
      },
    });
    const confirmed = await operations.confirm(preview);
    expect((await runOrderBulkActionJob(db.asD1(), confirmed.view.batch.id, deps)).status).toBe('succeeded');
    expect(db.value(`SELECT count(*) AS value FROM order_holds
      WHERE reason_code = 'risk_review' AND order_id IN (${orderIds.join(',')})`)).toBe(2);
    expect(db.value(`SELECT count(*) AS value FROM event_outbox_events
      WHERE event_type = 'orders.order_hold_created'
        AND payload_json LIKE '%bulk-hold:${confirmed.view.batch.id}:%'`)).toBe(2);
    expect(db.value(`SELECT count(*) AS value FROM order_bulk_batch_rows
      WHERE batch_id = '${confirmed.view.batch.id}' AND outcome = 'applied'
        AND evidence_type = 'order_hold'`)).toBe(2);
  });

  it('revalida cada pedido y conserva resultados parciales explicables', async () => {
    const deps = dependencies();
    const operations = createOrderBulkActionOperations(db.asD1(), deps);
    const orderIds = db.query<{ id: number }>(`SELECT id FROM orders
      WHERE status IN ('pending', 'paid') ORDER BY id LIMIT 2`).map((row) => row.id);
    const preview = await operations.preview({
      orderIds,
      action: {
        type: 'create_hold', reasonCode: 'address_issue',
        owner: { kind: 'admin', id: 'operations' },
        dueAt: '2026-08-14T12:00:00.000Z',
      },
    });
    const confirmed = await operations.confirm(preview);
    await createOrderHoldOperations(db.asD1(), {
      emit: deps.emit, now: deps.now, nextHoldId: () => 'concurrent-hold-address',
    }).create({
      orderId: orderIds[0]!, source: 'manual', reasonCode: 'address_issue',
      owner: { kind: 'admin', id: 'operations', label: 'Operaciones' },
      dueAt: '2026-08-14T12:00:00.000Z', idempotencyKey: 'concurrent:address',
    });
    db.sqlite.prepare("UPDATE orders SET status = 'delivered' WHERE id = ?").run(orderIds[1]!);

    await runOrderBulkActionJob(db.asD1(), confirmed.view.batch.id, deps);
    const view = await operations.get(confirmed.view.batch.id);
    expect(view?.batch.status).toBe('completed_with_errors');
    expect(view?.rows.map((row) => [row.outcome, row.result_code])).toEqual([
      ['skipped', 'active_hold_same_reason'],
      ['conflict', 'status_not_supported'],
    ]);
    expect(db.value(`SELECT count(*) AS value FROM order_holds
      WHERE id LIKE 'bulk-hold:${confirmed.view.batch.id}:%'`)).toBe(0);
  });

  it('procesa selecciones mayores que un chunk y un runner concurrente no duplica filas', async () => {
    const deps = dependencies();
    const operations = createOrderBulkActionOperations(db.asD1(), deps);
    const tagId = Number(db.value("SELECT id AS value FROM order_tags WHERE slug = 'revisar-direccion'"));
    const insert = db.sqlite.prepare(`INSERT INTO orders (
      order_number, email, customer_name, address_json,
      subtotal_cents, shipping_cents, total_cents, status, created_at, updated_at
    ) VALUES (?, ?, 'QA', '{}', 1000, 0, 1000, 'paid', ?, ?)`);
    for (let index = 1; index <= 30; index += 1) {
      insert.run(`BULK-${index}`, `bulk-${index}@example.test`, deps.now(), deps.now());
    }
    const orderIds = db.query<{ id: number }>("SELECT id FROM orders WHERE order_number LIKE 'BULK-%' ORDER BY id")
      .map((row) => row.id);
    const preview = await operations.preview({ orderIds, action: { type: 'add_tag', tagId } });
    const confirmed = await operations.confirm(preview);
    const jobs = await Promise.all([
      runOrderBulkActionJob(db.asD1(), confirmed.view.batch.id, deps),
      runOrderBulkActionJob(db.asD1(), confirmed.view.batch.id, deps),
    ]);
    expect(jobs.map((job) => job.status).sort()).toEqual(['duplicate', 'succeeded']);
    expect((await operations.get(confirmed.view.batch.id))?.progress.applied).toBe(30);
    expect(db.value(`SELECT count(*) AS value FROM order_tag_assignments
      WHERE tag_id = ${tagId} AND order_id IN (${orderIds.join(',')})`)).toBe(30);
  });

  it('solo reabre lotes con fallos reintentables y purga filas sin borrar evidencia', async () => {
    const deps = dependencies();
    const operations = createOrderBulkActionOperations(db.asD1(), deps);
    const tagId = Number(db.value("SELECT id AS value FROM order_tags WHERE slug = 'prioritario'"));
    const orderId = Number(db.value("SELECT id AS value FROM orders WHERE order_number = 'BM-DEMO-1004'"));
    const preview = await operations.preview({ orderIds: [orderId], action: { type: 'add_tag', tagId } });
    const confirmed = await operations.confirm(preview);
    await runOrderBulkActionJob(db.asD1(), confirmed.view.batch.id, deps);
    expect(await operations.prepareReplay(confirmed.view.batch.id)).toBe(false);
    expect(await operations.purgeTerminal('2099-01-01T00:00:00.000Z')).toBe(1);
    expect(await operations.get(confirmed.view.batch.id)).toBeNull();
    expect(db.value(`SELECT count(*) AS value FROM order_tag_events
      WHERE id LIKE 'bulk-tag:${confirmed.view.batch.id}:%'`)).toBe(1);
  });

  it.each(['pending', 'dead'] as const)(
    'reanuda un lote interrumpido cuyo job quedó %s sin repetir filas',
    async (jobStatus) => {
      const deps = dependencies();
      const operations = createOrderBulkActionOperations(db.asD1(), deps);
      const tagId = Number(db.value("SELECT id AS value FROM order_tags WHERE slug = 'prioritario'"));
      const orderId = Number(db.value("SELECT id AS value FROM orders WHERE order_number = 'BM-DEMO-1004'"));
      const preview = await operations.preview({ orderIds: [orderId], action: { type: 'add_tag', tagId } });
      const confirmed = await operations.confirm(preview);
      const runId = `interrupted-${jobStatus}`;
      const jobKey = `orders.bulk:${confirmed.view.batch.id}:attempt:0`;
      db.sqlite.prepare(`INSERT INTO platform_job_runs (
        run_id, job_id, trigger_kind, scheduled_for, idempotency_key,
        status, attempt_count, available_at, dead_at, created_at, updated_at
      ) VALUES (?, 'orders.execute-bulk-action', 'one-off', ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(
          runId, deps.now(), jobKey, jobStatus, jobStatus === 'dead' ? 5 : 0,
          deps.now(), jobStatus === 'dead' ? deps.now() : null, deps.now(), deps.now(),
        );
      db.sqlite.prepare(`UPDATE order_bulk_batches SET
        status = 'running', execution_run_id = ?, started_at = ?, updated_at = ?
        WHERE id = ?`).run(runId, deps.now(), deps.now(), confirmed.view.batch.id);

      expect(await operations.prepareReplay(confirmed.view.batch.id)).toBe(true);
      if (jobStatus === 'dead') {
        expect(db.value(`SELECT count(*) AS value FROM platform_job_runs
          WHERE run_id = '${runId}' AND status = 'pending' AND attempt_count = 0 AND replay_count = 1`)).toBe(1);
      }
      expect((await runOrderBulkActionJob(db.asD1(), confirmed.view.batch.id, deps)).status).toBe('succeeded');
      expect((await operations.get(confirmed.view.batch.id))?.progress).toMatchObject({
        applied: 1,
        pending: 0,
      });
      expect(db.value(`SELECT count(*) AS value FROM order_tag_events
        WHERE id LIKE 'bulk-tag:${confirmed.view.batch.id}:%'`)).toBe(1);
    },
  );
});
