import { createContactRecorder } from './application/contact-recorder';
import { createD1ContactRepository } from './infrastructure/d1-contact-repository';

export type { ContactRecord } from './application/contact-recorder';
export const createContactService = (db: D1Database) => createContactRecorder(createD1ContactRepository(db));
