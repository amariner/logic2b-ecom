import { readOutbox } from './application/outbox-reader';
import { createD1OutboxReader } from './infrastructure/d1-outbox-reader';

export type { OutboxEmail } from './application/outbox-reader';
export const getOutbox = (db: D1Database, limit: number) => readOutbox(createD1OutboxReader(db), limit);
