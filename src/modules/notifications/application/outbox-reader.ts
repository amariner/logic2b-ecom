export type OutboxEmail = Readonly<{
  id: number;
  to_addr: string;
  subject: string;
  body_html: string;
  created_at: string;
}>;

export interface OutboxReader {
  recent(limit: number): Promise<readonly OutboxEmail[]>;
  count(): Promise<number>;
}

export async function readOutbox(reader: OutboxReader, limit: number) {
  const [emails, total] = await Promise.all([reader.recent(limit), reader.count()]);
  return Object.freeze({ emails, total });
}
