import type { ContactRecord, ContactRepository } from '../application/contact-recorder';

export function createD1ContactRepository(db: D1Database): ContactRepository {
  return {
    async insert(contact: ContactRecord) {
      const row = await db.prepare(
        'INSERT INTO contact_requests (name, email, phone, sells, catalog, needs, source) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id',
      )
        .bind(contact.name, contact.email, contact.phone, contact.sells, contact.catalog, contact.needs, contact.source)
        .first<{ id: number }>();
      return row?.id ?? null;
    },
    async markNotified(id: number) {
      await db.prepare('UPDATE contact_requests SET notified = 1 WHERE id = ?').bind(id).run();
    },
  };
}
