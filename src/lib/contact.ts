/**
 * Formulario «Iniciar proyecto» de la landing.
 * ============================================================================
 *
 * La landing es una página de CAPTACIÓN: el formulario es su producto. Aquí
 * vive todo lo que se puede probar sin red — validación y construcción del
 * email — para que la ruta (`/api/contact`) quede en cuatro líneas.
 *
 * Dónde acaba el aviso: en `emails_outbox`, la misma tabla que ya usan los
 * pedidos. Sin migración, sin dependencia nueva y sin servicio de formularios
 * de terceros (coste 0 €, CLAUDE.md §2). En producción `deliverPendingEmails()`
 * lo entrega por Resend; en demo se queda en la bandeja de /demo/admin/emails,
 * que es exactamente lo que se quiere enseñar en una llamada de venta.
 */
import { z } from 'zod';
import { escapeHtml } from './format';

/** Dónde llegan los avisos de proyecto nuevo. La agencia, no la tienda demo. */
export const AGENCY_EMAIL = 'hola@logic2b.com';
/** Formato internacional sin «+» ni espacios. Vacío = el CTA cae a email. */
export const AGENCY_WHATSAPP = '34626434316';
/** Texto comercial compartido por el acceso flotante. La ruta se añade en SSR. */
export const AGENCY_WHATSAPP_MESSAGE =
  'Hola, me interesa Logic2B Ecommerce. Vengo de la página';

/**
 * Construye el enlace directo sin depender del navegador ni de JavaScript.
 * Solo conserva el pathname: una query puede contener un identificador de
 * checkout, un filtro o el destino del login y nunca debe viajar a un tercero.
 * Un clon de cliente cambia número y texto en este único módulo.
 */
export function agencyWhatsappHref(sourcePath: string): string | null {
  if (!AGENCY_WHATSAPP) return null;
  const pathname = sourcePath.split(/[?#]/, 1)[0] || '/';
  const source = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const message = `${AGENCY_WHATSAPP_MESSAGE} ${source}.`;
  return `https://wa.me/${AGENCY_WHATSAPP}?text=${encodeURIComponent(message)}`;
}

/** Tamaño del catálogo — la pregunta que más ordena el presupuesto. */
export const CATALOG_SIZES = [
  { value: 'hasta-10', label: 'Hasta 10 productos' },
  { value: '10-50', label: 'Entre 10 y 50' },
  { value: '50-200', label: 'Entre 50 y 200' },
  { value: 'mas-200', label: 'Más de 200' },
  { value: 'no-lo-se', label: 'Todavía no lo sé' },
] as const;

const catalogValues = CATALOG_SIZES.map((size) => size.value) as [string, ...string[]];

/**
 * Campos del formulario. Son los MISMOS en las tres apariciones (cabecera,
 * arriba de la landing y cierre): un solo esquema, un solo email, una sola
 * conversión que medir.
 */
export const contactSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(120),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  sells: z.string().trim().max(120).optional().or(z.literal('')),
  catalog: z.enum(catalogValues).optional().or(z.literal('')),
  needs: z.string().trim().min(10).max(2000),
  /** Origen del envío (cabecera / arriba / cierre): sirve para saber qué CTA convierte. */
  source: z.string().trim().max(40).optional().or(z.literal('')),
  /** Trampa anti-bot: campo invisible que una persona nunca rellena. */
  website: z.string().max(0).optional().or(z.literal('')),
});

export type ContactRequest = z.infer<typeof contactSchema>;

const catalogLabel = (value: string | undefined): string =>
  CATALOG_SIZES.find((size) => size.value === value)?.label ?? 'sin indicar';

/**
 * Email de aviso interno. Todo campo viene de un formulario público, así que
 * TODO se escapa antes de entrar en el HTML (mismo criterio que emails.ts).
 */
export function buildContactEmail(data: ContactRequest): {
  to_addr: string;
  subject: string;
  body_html: string;
} {
  const rows: [string, string][] = [
    ['Nombre', data.name],
    ['Email', data.email],
    ['Teléfono', data.phone || 'sin indicar'],
    ['Qué vende', data.sells || 'sin indicar'],
    ['Catálogo', catalogLabel(data.catalog || undefined)],
    ['Origen', data.source || 'landing'],
  ];

  return {
    to_addr: AGENCY_EMAIL,
    subject: `Nuevo proyecto — ${data.name}`,
    body_html: `<!doctype html>
<html lang="es"><body style="font-family:system-ui,sans-serif;color:#1a1a1a;max-width:560px;margin:0 auto;padding:24px">
<h1 style="font-size:18px">Nueva solicitud de proyecto</h1>
<table style="width:100%;border-collapse:collapse;font-size:14px">
${rows
  .map(
    ([label, value]) =>
      `<tr><td style="padding:4px 12px 4px 0;color:#6b7280">${label}</td><td>${escapeHtml(value)}</td></tr>`,
  )
  .join('\n')}
</table>
<h2 style="font-size:15px;margin-top:24px">Qué necesita</h2>
<p style="white-space:pre-wrap;line-height:1.6">${escapeHtml(data.needs)}</p>
<p style="margin-top:32px;font-size:13px;color:#6b7280">Responder a ${escapeHtml(data.email)}</p>
</body></html>`,
  };
}
