/**
 * Cuidado con la inyección de fórmulas CSV: si un campo (p. ej. el nombre del
 * cliente, que el comprador teclea libremente en el checkout) empieza por
 * =, +, - o @, Excel/Sheets pueden interpretarlo como fórmula al abrir este
 * CSV — que el manual del comercio (docs/CLIENTE.md) pide abrir para
 * importar a Packlink/SendCloud. Se antepone un apóstrofe para forzar texto.
 */
export function csvField(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
