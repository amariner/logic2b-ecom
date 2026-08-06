import { readOutbox } from './application/outbox-reader';
import { createD1OutboxReader } from './infrastructure/d1-outbox-reader';
import { createD1OutboxWriter } from './infrastructure/d1-outbox-writer';

export type { OutboxEmail } from './application/outbox-reader';
export const getOutbox = (db: D1Database, limit: number) => readOutbox(createD1OutboxReader(db), limit);

export { SUBSCRIBED_ORDER_EVENTS, orderNotificationsFor } from './application/order-messages';
export type { EmailMessage, OrderEmailData } from '../../lib/emails';
export const createOutboxWriter = (db: D1Database) => createD1OutboxWriter(db);
