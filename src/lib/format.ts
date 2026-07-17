/** Formateo de dinero para UI. El dato siempre viaja en céntimos enteros. */

export function formatEurCents(cents: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}
