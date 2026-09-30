import type { CartLine } from '../../../../lib/cart-client';

/** El avance explícito prepara una muestra una sola vez, sin sustituir la cesta. */
export function guideCartWithSample(lines: readonly CartLine[], slug: string): CartLine[] {
  return lines.some((line) => line.slug === slug) ? [...lines] : [...lines, { slug, qty: 1 }];
}

export const GUIDE_CUSTOMER = {
  name: 'Cliente de demostración', email: 'cliente@example.com',
  street: 'Calle de ejemplo 1', postal_code: '12001', city: 'Castellón',
} as const;
