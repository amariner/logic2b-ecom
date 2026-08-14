import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as previewBulk } from '../src/pages/api/admin/order-bulk-actions/preview';
import { POST as confirmBulk } from '../src/pages/api/admin/order-bulk-actions/index';
import { GET as getBulk, POST as replayBulk } from '../src/pages/api/admin/order-bulk-actions/[id]';
import { seedStatements } from '../seed/seed';
import { SqliteD1 } from './sqlite-d1';

const capability = vi.hoisted(() => ({ routes: true, jobs: true, sideEffects: true }));

vi.mock('../src/composition/runtime-platform', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/composition/runtime-platform')>();
  return {
    runtimePlatform: {
      ...actual.runtimePlatform,
      hasCapabilityFlag: (_id: string, flag: keyof typeof capability) => capability[flag],
    },
  };
});

function context(
  db: SqliteD1,
  url: string,
  body?: unknown,
  demoMode = 'false',
  params: Record<string, string> = {},
): never {
  return {
    params,
    request: new Request(url, body === undefined
      ? { method: 'GET' }
      : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    locals: { runtime: { env: { DB: db.asD1(), DEMO_MODE: demoMode } } },
  } as never;
}

describe('API admin R3.5 de acciones masivas', () => {
  let db: SqliteD1;
  let tagId: number;
  let orderIds: number[];

  beforeEach(async () => {
    capability.routes = true;
    capability.jobs = true;
    capability.sideEffects = true;
    db = new SqliteD1();
    await db.batch(seedStatements().map((sql) => db.prepare(sql)));
    tagId = Number(db.value("SELECT id AS value FROM order_tags WHERE slug = 'prioritario'"));
    orderIds = db.query<{ id: number }>(`SELECT o.id FROM orders o
      WHERE NOT EXISTS (SELECT 1 FROM order_tag_assignments a
        WHERE a.order_id = o.id AND a.tag_id = ${tagId}) ORDER BY o.id LIMIT 2`).map((row) => row.id);
  });

  async function createPreview(demoMode = 'false') {
    const response = await previewBulk(context(
      db,
      'http://localhost/api/admin/order-bulk-actions/preview',
      { order_ids: orderIds, action: { type: 'add_tag', tagId } },
      demoMode,
    ));
    return { response, json: await response.json() as { preview: Record<string, unknown> } };
  }

  it('previsualiza, confirma, ejecuta y consulta resultados por pedido', async () => {
    const preview = await createPreview();
    expect(preview.response.status).toBe(200);
    expect(preview.json.preview).toMatchObject({ counts: { total: 2, ready: 2, skipped: 0 } });
    const confirmation = await confirmBulk(context(
      db,
      'http://localhost/api/admin/order-bulk-actions',
      { preview: preview.json.preview },
    ));
    expect(confirmation.status).toBe(201);
    const body = await confirmation.json() as {
      batch: { batch: { id: string; status: string }; progress: { applied: number } };
    };
    expect(body.batch.batch.status).toBe('completed');
    expect(body.batch.progress.applied).toBe(2);
    const read = await getBulk(context(
      db,
      `http://localhost/api/admin/order-bulk-actions/${body.batch.batch.id}`,
      undefined,
      'false',
      { id: body.batch.batch.id },
    ));
    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({ batch: { rows: [{ outcome: 'applied' }, { outcome: 'applied' }] } });
  });

  it('rechaza un preview manipulado o caducado sin persistir lotes', async () => {
    const preview = await createPreview();
    const tampered = {
      ...preview.json.preview,
      counts: { total: 2, ready: 1, skipped: 1 },
    };
    const response = await confirmBulk(context(
      db,
      'http://localhost/api/admin/order-bulk-actions',
      { preview: tampered },
    ));
    expect(response.status).toBe(409);
    expect(db.value('SELECT count(*) AS value FROM order_bulk_batches')).toBe(0);
  });

  it('permite dry-run en demo pero rechaza confirmación antes de tocar D1', async () => {
    const preview = await createPreview('true');
    expect(preview.response.status).toBe(200);
    const response = await confirmBulk(context(
      db,
      'http://localhost/api/admin/order-bulk-actions',
      { preview: preview.json.preview },
      'true',
    ));
    expect(response.status).toBe(403);
    expect(db.value('SELECT count(*) AS value FROM order_bulk_batches')).toBe(0);
    expect(db.value('SELECT count(*) AS value FROM platform_job_runs')).toBe(0);
  });

  it('replay solo retoma filas reintentables y reconoce evidencia del mismo lote', async () => {
    orderIds = orderIds.slice(0, 1);
    const preview = await createPreview();
    const confirmation = await confirmBulk(context(
      db,
      'http://localhost/api/admin/order-bulk-actions',
      { preview: preview.json.preview },
    ));
    const body = await confirmation.json() as { batch: { batch: { id: string } } };
    const batchId = body.batch.batch.id;
    db.sqlite.prepare(`UPDATE order_bulk_batch_rows SET
      outcome = 'retryable_failure', result_code = 'retryable_failure',
      evidence_type = NULL, evidence_id = NULL, completed_at = NULL
      WHERE batch_id = ?`).run(batchId);
    db.sqlite.prepare(`UPDATE order_bulk_batches SET status = 'completed_with_errors'
      WHERE id = ?`).run(batchId);
    const replay = await replayBulk(context(
      db,
      `http://localhost/api/admin/order-bulk-actions/${batchId}`,
      { action: 'replay' },
      'false',
      { id: batchId },
    ));
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({
      batch: { batch: { status: 'completed' }, rows: [{ outcome: 'replayed' }] },
    });
    expect(db.value(`SELECT count(*) AS value FROM order_tag_events
      WHERE id LIKE 'bulk-tag:${batchId}:%'`)).toBe(1);
  });

  it('cierra rutas o efectos por capability de forma independiente', async () => {
    capability.routes = false;
    expect((await createPreview()).response.status).toBe(403);
    capability.routes = true;
    const preview = await createPreview();
    capability.sideEffects = false;
    const response = await confirmBulk(context(
      db,
      'http://localhost/api/admin/order-bulk-actions',
      { preview: preview.json.preview },
    ));
    expect(response.status).toBe(403);
  });
});
