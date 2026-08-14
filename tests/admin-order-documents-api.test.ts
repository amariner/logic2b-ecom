import { beforeEach, describe, expect, it, vi } from 'vitest';
import { seedStatements } from '../seed/seed';
import { GET as LIST, POST as CREATE } from '../src/pages/api/admin/order-documents/index';
import { GET as DETAIL } from '../src/pages/api/admin/order-documents/[id]/index';
import { GET as ARTIFACT } from '../src/pages/api/admin/order-documents/[id]/artifact';
import { POST as VOID } from '../src/pages/api/admin/order-documents/[id]/void';
import { SqliteD1 } from './sqlite-d1';

const capability = vi.hoisted(() => ({ routes: true, sideEffects: true }));
vi.mock('../src/composition/runtime-platform', () => ({
  runtimePlatform: { hasCapabilityFlag: (_id: string, flag: keyof typeof capability) => capability[flag] },
}));

function context(
  db: SqliteD1,
  method: string,
  path: string,
  body?: unknown,
  demo = 'false',
  params: Record<string, string> = {},
): never {
  return { params, request: new Request(`http://localhost${path}`, {
    method, ...(body === undefined ? {} : {
      headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }),
  }), locals: { runtime: { env: { DB: db.asD1(), DEMO_MODE: demo } } } } as never;
}

describe('API admin de documentos R3.11', () => {
  let db: SqliteD1;
  let orderId: number;
  let fulfillmentId: number;
  beforeEach(async () => {
    capability.routes = true;
    capability.sideEffects = true;
    db = new SqliteD1();
    await db.batch(seedStatements().map((sql) => db.prepare(sql)));
    orderId = Number(db.value("SELECT id AS value FROM orders WHERE order_number='BM-DEMO-1004'"));
    fulfillmentId = Number(db.value(`SELECT id AS value FROM fulfillments WHERE order_id=${orderId} LIMIT 1`));
  });

  it('genera, lista, lee, sirve y anula un artefacto privado', async () => {
    const created = await CREATE(context(db, 'POST', '/api/admin/order-documents', {
      kind: 'generated', document_type: 'internal_label', order_id: orderId,
      fulfillment_id: fulfillmentId, template_id: 'tpl_internal_label_v1',
      idempotency_key: 'document:api:label:create',
    }));
    expect(created.status).toBe(201);
    const id = String(db.value("SELECT id AS value FROM order_documents WHERE idempotency_key='document:api:label:create'"));
    expect((await LIST(context(db, 'GET', `/api/admin/order-documents?order_id=${orderId}`))).status).toBe(200);
    expect((await DETAIL(context(db, 'GET', `/api/admin/order-documents/${id}`, undefined, 'false', { id }))).status).toBe(200);
    const artifact = await ARTIFACT(context(db, 'GET', `/api/admin/order-documents/${id}/artifact`, undefined, 'false', { id }));
    expect(artifact.status).toBe(200);
    expect(artifact.headers.get('cache-control')).toContain('private');
    expect(artifact.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(await artifact.text()).toContain('Documento no fiscal');

    expect((await VOID(context(db, 'POST', `/api/admin/order-documents/${id}/void`, {
      expected_version: 1, idempotency_key: 'document:api:label:void', reason: 'Etiqueta descartada',
    }, 'false', { id }))).status).toBe(200);
    expect((await ARTIFACT(context(db, 'GET', `/api/admin/order-documents/${id}/artifact`, undefined, 'false', { id }))).status).toBe(410);
  });

  it('corta la demo y las flags antes de cualquier efecto', async () => {
    expect((await CREATE(context(db, 'POST', '/api/admin/order-documents', {}, 'true'))).status).toBe(403);
    expect((await VOID(context(db, 'POST', '/api/admin/order-documents/x/void', {}, 'true', { id: 'x' }))).status).toBe(403);
    capability.routes = false;
    expect((await LIST(context(db, 'GET', '/api/admin/order-documents'))).status).toBe(403);
    expect((await DETAIL(context(db, 'GET', '/api/admin/order-documents/x', undefined, 'false', { id: 'x' }))).status).toBe(403);
    expect((await ARTIFACT(context(db, 'GET', '/api/admin/order-documents/x/artifact', undefined, 'false', { id: 'x' }))).status).toBe(403);
  });
});
