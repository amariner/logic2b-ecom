/** Formateo de dinero para UI. El dato siempre viaja en céntimos enteros. */

import { shopConfig } from '../../shop.config';

export function formatEurCents(cents: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: shopConfig.currency.toUpperCase() }).format(cents / 100);
}

/**
 * Serializa un objeto para insertarlo con `set:html` en un `<script type="application/ld+json">`.
 * Escapa cada "<" a su secuencia unicode: si algún campo (p. ej. el nombre de un
 * producto editado desde el admin) contuviera "</script>", no debe poder cerrar
 * la etiqueta e inyectar HTML.
 */
export function jsonLdScript(obj: object): string {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapa texto para insertarlo en HTML construido con plantillas de string (emails). */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]!);
}
