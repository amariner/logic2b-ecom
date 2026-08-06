/**
 * Adaptador de escritura de la bandeja de salida. Devuelve sentencias en vez de
 * ejecutarlas: el mensaje tiene que entrar en la MISMA batch que la transición
 * que lo provoca, o un fallo dejaría el pedido cambiado y el aviso sin encolar.
 * La unidad de trabajo la compone el composition root.
 */

import type { EmailMessage } from '../../../lib/emails';

export function createD1OutboxWriter(db: D1Database) {
  return {
    statementsFor(messages: readonly EmailMessage[]): D1PreparedStatement[] {
      return messages.map((message) =>
        db
          .prepare('INSERT INTO emails_outbox (to_addr, subject, body_html) VALUES (?, ?, ?)')
          .bind(message.to_addr, message.subject, message.body_html),
      );
    },
  };
}

export type D1OutboxWriter = ReturnType<typeof createD1OutboxWriter>;
