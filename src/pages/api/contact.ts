/**
 * POST /api/contact — solicitudes de proyecto de la landing.
 *
 * Dos formas de llegar, misma lógica:
 *  · `application/json` (el diálogo «Iniciar proyecto», con JS) → responde JSON.
 *  · `form-urlencoded` (envío nativo del formulario, sin JS) → 303 a la página
 *    de confirmación. La landing es estática, así que la confirmación no puede
 *    ser un query param de `/`: es una página propia.
 *
 * En un despliegue cliente el lead se guarda en `contact_requests` (no va a
 * `emails_outbox`, cuya vista pública enseña mensajes de ejemplo). En demo no
 * se procesa ningún formulario. El aviso por email en cliente es best-effort:
 * si falla o no hay clave de Resend, el lead sigue en la base y `notified`
 * queda a 0.
 */
import type { APIRoute } from 'astro';
import { buildLeadNotificationRequest, contactSchema, leadNotificationConfig } from '../../lib/contact';
import { RateLimiter } from '../../lib/rate-limit';
import { createContactService } from '../../modules/marketing';
import { runtimePlatform } from '../../composition/runtime-platform';

export const prerender = false;

/** Vive en el isolate: freno de spam barato, no una garantía. Ver rate-limit.ts. */
const limiter = new RateLimiter();
const RULE = { limit: 5, windowMs: 10 * 60 * 1000 };

const CONFIRM_PATH = '/proyecto-recibido';

export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  if (locals.runtime.env.DEMO_MODE === 'true' || runtimePlatform.manifest.deployment.mode === 'demo') {
    return Response.json({ error: 'El formulario de esta muestra se simula localmente y no envía solicitudes.' }, {
      status: 403, headers: { 'cache-control': 'no-store' },
    });
  }
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
  const contacts = createContactService(env.DB);
  const contactId = await contacts.record({
    name: data.name,
    email: data.email,
    phone: data.phone || null,
    sells: data.sells || null,
    catalog: data.catalog || null,
    needs: data.needs,
    source: data.source || null,
  });

  // Aviso por email únicamente en un despliegue cliente. Usa
  // LEADS_RESEND_API_KEY o RESEND_API_KEY. Sin clave queda pendiente en
  // la tabla; si Resend lo rechaza, el motivo queda en los logs del Worker.
  const notification = leadNotificationConfig(env);
  if (notification && contactId !== null) {
    const notify = async (): Promise<void> => {
      try {
        const { url, init } = buildLeadNotificationRequest(data, notification);
        const response = await fetch(url, init);
        if (response.ok) {
          await contacts.markNotified(contactId);
        } else {
          console.error(`Aviso del lead ${contactId} rechazado por Resend: HTTP ${response.status}`);
        }
      } catch {
        // El lead ya está guardado; el aviso se puede recuperar desde la tabla.
        console.error(`Aviso del lead ${contactId} no enviado: error de red`);
      }
    };
    locals.runtime.ctx.waitUntil(notify());
  }

  return done();
};
