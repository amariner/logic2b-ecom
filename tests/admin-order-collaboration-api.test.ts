import { describe, expect, it, vi } from 'vitest';
import { POST as createNote } from '../src/pages/api/admin/order-notes/index';
import { PATCH as updateNote } from '../src/pages/api/admin/order-notes/[id]';
import { POST as createTag } from '../src/pages/api/admin/order-tags/index';
import { POST as changeTag } from '../src/pages/api/admin/order-tags/assignments';
import { SqliteD1 } from './sqlite-d1';

vi.mock('../src/composition/runtime-platform', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/composition/runtime-platform')>();
  return { runtimePlatform: { ...actual.runtimePlatform, hasCapabilityFlag: () => true } };
});

function context<T extends (value: never) => unknown>(
  _handler: T,
  db: SqliteD1,
  url: string,
  method: string,
  body: unknown,
  demoMode = 'false',
  params: Record<string, string> = {},
): Parameters<T>[0] {
  return {
    params,
    request: new Request(url, {
      method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }),
    locals: { runtime: { env: { DB: db.asD1(), DEMO_MODE: demoMode } } },
  } as unknown as Parameters<T>[0];
}

function database(): SqliteD1 {
  const db = new SqliteD1();
  db.sqlite.exec(`INSERT INTO orders (
    id, order_number, email, customer_name, address_json,
    subtotal_cents, shipping_cents, total_cents, status
  ) VALUES (7, 'COL-API-7', 'qa@example.test', 'QA', '{}', 1000, 0, 1000, 'paid')`);
  return db;
}

describe('API admin R3.2 de colaboración de pedidos', () => {
  it('crea, revisa y etiqueta un pedido real', async () => {
    const db = database();
    const created = await createNote(context(createNote, db, 'http://localhost/api/admin/order-notes', 'POST', {
      order_id: 7, body: 'Revisar embalaje', visibility: 'internal',
    }));
    expect(created.status).toBe(201);
    const noteId = String(db.value('SELECT id AS value FROM order_notes'));
    const updated = await updateNote(context(updateNote, db, `http://localhost/api/admin/order-notes/${noteId}`, 'PATCH', {
      order_id: 7, expected_version: 1, body: 'Embalaje confirmado', visibility: 'customer',
    }, 'false', { id: noteId }));
    expect(updated.status).toBe(200);

    const tag = await createTag(context(createTag, db, 'http://localhost/api/admin/order-tags', 'POST', { label: 'Prioritario' }));
    expect(tag.status).toBe(201);
    const tagId = Number(db.value('SELECT id AS value FROM order_tags'));
    const assigned = await changeTag(context(changeTag, db, 'http://localhost/api/admin/order-tags/assignments', 'POST', {
      order_id: 7, tag_id: tagId, action: 'assign',
    }));
    expect(assigned.status).toBe(200);
    expect(db.value('SELECT count(*) AS value FROM audit_log')).toBe(4);
  });

  it('rechaza cualquier alta antes de leer el cuerpo en la demo pública', async () => {
    const db = database();
    const response = await createNote(context(createNote, db, 'http://localhost/api/admin/order-notes', 'POST', {}, 'true'));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('solo lectura') });
    expect(db.value('SELECT count(*) AS value FROM order_notes')).toBe(0);
  });
});
