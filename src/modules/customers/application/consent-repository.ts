import type {
  ConsentCommand,
  ConsentEvidence,
  ConsentScope,
  ConsentState,
  ConsentSubject,
  ConsentWriteOutcome,
} from '../domain/consent';

/**
 * Puerto R5.2 previo al esquema. La implementación debe insertar evidencia y
 * avanzar la versión en una única transacción; nunca sobrescribe ni borra el
 * historial y no admite búsquedas públicas por email.
 */
export interface ConsentRepository {
  history(subject: ConsentSubject, scope: ConsentScope): Promise<readonly ConsentEvidence[]>;
  current(subject: ConsentSubject, scope: ConsentScope): Promise<ConsentState>;
  append(command: ConsentCommand): Promise<ConsentWriteOutcome>;
}
