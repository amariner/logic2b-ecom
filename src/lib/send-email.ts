/**
 * Entrega real de emails via Resend (https://resend.com).
 *
 * La outbox (emails_outbox) es siempre la fuente de verdad: todo email se
 * inserta ahí primero. En demo (DEMO_MODE=true) se queda ahí — bandeja
 * visible en /demo/admin/emails, nada se envía. En producción, tras cada
 * inserción se llama a deliverPendingEmails(): entrega los pendientes
 * (sent = 0) y los marca sent = 1. Un envío fallido queda pendiente y se
 * reintenta en el siguiente disparo (próximo pedido o cambio de estado).
 */

import { shopConfig } from '../../shop.config';
import type { EmailMessage } from './emails';

type SendEnv = {
  DEMO_MODE: string;
  RESEND_API_KEY?: string;
};

/** Decisión pura: solo se envía de verdad fuera de demo y con clave configurada. */
export function shouldDeliver(env: SendEnv): env is SendEnv & { RESEND_API_KEY: string } {
  return env.DEMO_MODE !== 'true' && typeof env.RESEND_API_KEY === 'string' && env.RESEND_API_KEY.length > 0;
}

/** Petición a la API de Resend para un email de la outbox. Pura (testeable). */
export function buildResendRequest(
  message: EmailMessage,
  apiKey: string,
): { url: string; init: { method: 'POST'; headers: Record<string, string>; body: string } } {
  return {
    url: 'https://api.resend.com/emails',
    init: {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: `${shopConfig.name} <${shopConfig.email}>`,
        to: [message.to_addr],
        subject: message.subject,
        html: message.body_html,
      }),
    },
  };
}

/**
 * Entrega los emails pendientes de la outbox. Devuelve cuántos se entregaron.
 * Pensada para ctx.waitUntil(): nunca lanza, no bloquea la respuesta HTTP.
 */
export async function deliverPendingEmails(db: D1Database, env: SendEnv): Promise<number> {
  if (!shouldDeliver(env)) return 0;
  const apiKey = env.RESEND_API_KEY;

  const pending = (
    await db
      .prepare('SELECT id, to_addr, subject, body_html FROM emails_outbox WHERE sent = 0 ORDER BY id LIMIT 10')
      .all<EmailMessage & { id: number }>()
  ).results;

  let delivered = 0;
  for (const message of pending) {
    // Reclamo atómico ANTES de enviar: marcamos sent=1 condicionado a que siga
    // en 0. D1 serializa las escrituras, así que de dos entregas concurrentes
    // (dos pedidos pagados casi a la vez → dos waitUntil) solo una obtiene
    // changes===1 y hace el fetch; la otra ve 0 y salta el email. Sin esto,
    // ambas leerían el mismo pendiente y Resend lo enviaría por duplicado.
    const claim = await db
      .prepare('UPDATE emails_outbox SET sent = 1 WHERE id = ? AND sent = 0')
      .bind(message.id)
      .run();
    if (claim.meta.changes !== 1) continue; // otra invocación ya lo reclamó

    try {
      const { url, init } = buildResendRequest(message, apiKey);
      const response = await fetch(url, init);
      if (response.ok) {
        delivered++;
      } else {
        // Resend rechazó: liberamos el reclamo para reintentar en el próximo disparo.
        await db.prepare('UPDATE emails_outbox SET sent = 0 WHERE id = ?').bind(message.id).run();
      }
    } catch {
      // Red caída o Resend fuera: liberamos el reclamo y se reintentará.
      await db.prepare('UPDATE emails_outbox SET sent = 0 WHERE id = ?').bind(message.id).run();
    }
  }
  return delivered;
}
