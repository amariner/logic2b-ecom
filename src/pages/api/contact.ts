/**
 * POST /api/contact — solicitudes de proyecto de la landing.
 *
 * Dos formas de llegar, misma lógica:
 *  · `application/json` (el diálogo «Iniciar proyecto», con JS) → responde JSON.
 *  · `form-urlencoded` (envío nativo del formulario, sin JS) → 303 a la página
 *    de confirmación. La landing es estática, así que la confirmación no puede
 *    ser un query param de `/`: es una página propia.
 *
 * El lead se GUARDA SIEMPRE en `contact_requests` (ver migración 0003: no va a
 * `emails_outbox` porque esa bandeja es pública, se vacía en cada reset y no se
 * entrega en modo demo). El aviso por email es best-effort encima del guardado:
 * si falla o no hay clave de Resend, el lead sigue en la base y `notified`
 * queda a 0.
 */
import type { APIRoute } from 'astro';
import { buildContactEmail, contactSchema } from '../../lib/contact';
import { RateLimiter } from '../../lib/rate-limit';
import { buildResendRequest } from '../../lib/send-email';

export const prerender = false;

/** Vive en el isolate: freno de spam barato, no una garantía. Ver rate-limit.ts. */
const limiter = new RateLimiter();
const RULE = { limit: 5, windowMs: 10 * 60 * 1000 };

const CONFIRM_PATH = '/proyecto-recibido';

export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  const contentType = request.headers.get('content-type') ?? '';
  const wantsJson = contentType.includes('application/json');

  const fail = (status: number, error: string): Response =>
    wantsJson
      ? Response.json({ error }, { status })
      : new Response(error, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  const done = (): Response =>
    wantsJson ? Response.json({ ok: true }) : Response.redirect(new URL(CONFIRM_PATH, request.url), 303);

  const key = clientAddress || request.headers.get('cf-connecting-ip') || 'anon';
  if (!limiter.check(key, RULE)) {
    return fail(429, 'Demasiados envíos seguidos. Prueba dentro de un rato o escríbenos por WhatsApp.');
  }

  let raw: unknown;
  try {
    raw = wantsJson ? await request.json() : Object.fromEntries(await request.formData());
  } catch {
    return fail(400, 'No hemos podido leer el formulario.');
  }

  const parsed = contactSchema.safeParse(raw);
  if (!parsed.success) {
    return fail(400, 'Revisa los campos: hacen falta tu nombre, un email válido y qué necesitas.');
  }
  // Trampa anti-bot rellena: se acepta en silencio y no se guarda nada.
  if (parsed.data.website) return done();

  const data = parsed.data;
  const env = locals.runtime.env;
  const inserted = await env.DB.prepare(
    'INSERT INTO contact_requests (name, email, phone, sells, catalog, needs, source) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id',
  )
    .bind(data.name, data.email, data.phone || null, data.sells || null, data.catalog || null, data.needs, data.source || null)
    .first<{ id: number }>();

  // Aviso por email. A diferencia de los transaccionales de la tienda, este sale
  // AUNQUE DEMO_MODE esté activo: ecom.logic2b.com corre en demo y aun así los
  // leads son reales. Sin clave configurada no se envía nada y el lead queda
  // pendiente en la tabla (visible en el panel).
  if (env.RESEND_API_KEY && inserted) {
    const message = buildContactEmail(data);
    const notify = async (): Promise<void> => {
      try {
        const { url, init } = buildResendRequest(message, env.RESEND_API_KEY!);
        const response = await fetch(url, init);
        if (response.ok) {
          await env.DB.prepare('UPDATE contact_requests SET notified = 1 WHERE id = ?').bind(inserted.id).run();
        }
      } catch {
        // El lead ya está guardado; el aviso se puede recuperar desde el panel.
      }
    };
    locals.runtime.ctx.waitUntil(notify());
  }

  return done();
};
