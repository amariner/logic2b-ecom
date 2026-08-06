export type ContactRecord = Readonly<{
  name: string;
  email: string;
  phone: string | null;
  sells: string | null;
  catalog: string | null;
  needs: string;
  source: string | null;
}>;

export interface ContactRepository {
  insert(contact: ContactRecord): Promise<number | null>;
  markNotified(id: number): Promise<void>;
}

export const createContactRecorder = (repository: ContactRepository) => Object.freeze({
  record: (contact: ContactRecord) => repository.insert(contact),
  markNotified: (id: number) => repository.markNotified(id),
});
