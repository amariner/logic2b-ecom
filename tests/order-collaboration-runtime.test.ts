import { beforeEach, describe, expect, it } from 'vitest';
import { createD1OrderCollaboration, createOrderReader } from '../src/modules/orders';
import { SqliteD1 } from './sqlite-d1';

function identitySource() {
  let sequence = 0;
  return () => ({
    event_id: `collaboration-${++sequence}`,
    occurred_at: `2026-08-12T10:00:${String(sequence).padStart(2, '0')}.000Z`,
  });
}

describe('runtime R3.2 de notas, etiquetas y timeline', () => {
  let db: SqliteD1;

  beforeEach(() => {
    db = new SqliteD1();
    db.sqlite.exec(`INSERT INTO orders (
      order_number, email, customer_name, address_json,
      subtotal_cents, shipping_cents, total_cents, status, created_at, updated_at
    ) VALUES ('COL-1001', 'qa@example.test', 'Cliente QA', '{}', 1000, 0, 1000, 'paid',
      '2026-08-12T09:00:00.000Z', '2026-08-12T09:00:00.000Z')`);
  });

  it('crea y revisa una nota con actor, visibilidad y auditoría sin contenido', async () => {
    const collaboration = createD1OrderCollaboration(db.asD1(), identitySource());
    expect(await collaboration.createNote(1, { body: 'Solo el equipo', visibility: 'internal' })).toBe('applied');
    const note = db.query<{ id: string; version: number }>('SELECT id, version FROM order_notes')[0]!;
    expect(await collaboration.updateNote(1, note.id, {
      body: 'Mensaje que también verá el cliente', visibility: 'customer', expectedVersion: 1,
    })).toBe('applied');

    expect(db.value('SELECT version AS value FROM order_notes')).toBe(2);
    expect(db.value('SELECT count(*) AS value FROM order_note_revisions')).toBe(2);
    expect(db.value("SELECT count(*) AS value FROM audit_log WHERE action LIKE 'orders.note_%'")).toBe(2);
    const audit = String(db.value("SELECT diff_json AS value FROM audit_log WHERE action = 'orders.note_updated'"));
    expect(audit).toContain('content_changed');
    expect(audit).not.toContain('Mensaje que también verá');
    const timeline = await createOrderReader(db.asD1()).detail(1);
    expect(timeline?.timeline.map((item) => item.kind)).toEqual(['note', 'note']);
    expect(timeline?.timeline[0]).toMatchObject({ visibility: 'customer', actor_label: 'Panel de administración' });
  });

  it('deja un único ganador cuando dos revisiones parten de la misma versión', async () => {
    const collaboration = createD1OrderCollaboration(db.asD1(), identitySource());
    await collaboration.createNote(1, { body: 'Inicial', visibility: 'internal' });
    const noteId = String(db.value('SELECT id AS value FROM order_notes'));
    const outcomes = await Promise.all([
      collaboration.updateNote(1, noteId, { body: 'A', visibility: 'internal', expectedVersion: 1 }),
      collaboration.updateNote(1, noteId, { body: 'B', visibility: 'internal', expectedVersion: 1 }),
    ]);
    expect(outcomes.sort()).toEqual(['applied', 'conflict']);
    expect(db.value('SELECT version AS value FROM order_notes')).toBe(2);
    expect(db.value('SELECT count(*) AS value FROM order_note_revisions')).toBe(2);
  });

  it('asigna y retira etiquetas de forma idempotente, filtrable y trazable', async () => {
    const collaboration = createD1OrderCollaboration(db.asD1(), identitySource());
    expect(await collaboration.createTag('Revisar dirección')).toBe('applied');
    expect(await collaboration.createTag('Revisar dirección')).toBe('unchanged');
    const tagId = Number(db.value("SELECT id AS value FROM order_tags WHERE slug = 'revisar-direccion'"));
    expect(await collaboration.changeTag(1, tagId, 'assign')).toBe('applied');
    expect(await collaboration.changeTag(1, tagId, 'assign')).toBe('unchanged');

    const reader = createOrderReader(db.asD1());
    const filtered = await reader.list({ tag: 'revisar-direccion', limit: 25 });
    expect(filtered.orders.map(({ id }) => id)).toEqual([1]);
    expect((await reader.detail(1))?.timeline[0]).toMatchObject({
      kind: 'tag', title: 'Etiqueta asignada', detail: 'Revisar dirección', visibility: 'internal',
    });
    expect(await collaboration.changeTag(1, tagId, 'remove')).toBe('applied');
    expect(await collaboration.changeTag(1, tagId, 'remove')).toBe('unchanged');
    expect((await reader.list({ tag: 'revisar-direccion', limit: 25 })).total).toBe(0);
    expect(db.value('SELECT count(*) AS value FROM order_tag_events')).toBe(2);
    expect(db.value("SELECT count(*) AS value FROM audit_log WHERE action LIKE 'orders.tag_%'")).toBe(3);
  });
});
