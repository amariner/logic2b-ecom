import type { OutboxEmail, OutboxReader } from '../application/outbox-reader';

export function createD1OutboxReader(db: D1Database): OutboxReader {
  return {
    async recent(limit) {
      return (await db
        .prepare('SELECT id, to_addr, subject, body_html, created_at FROM emails_outbox ORDER BY id DESC LIMIT ?')
        .bind(limit)
        .all<OutboxEmail>()).results;
    },
    async count() {
      return (await db.prepare('SELECT COUNT(*) AS n FROM emails_outbox').first<{ n: number }>())?.n ?? 0;
    },
  };
}
