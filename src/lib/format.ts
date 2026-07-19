/** Formateo de dinero para UI. El dato siempre viaja en céntimos enteros. */

export function formatEurCents(cents: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(cents / 100);
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
