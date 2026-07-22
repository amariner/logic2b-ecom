/**
 * Colección `launch` — Vector (producto estrella + accesorios).
 *
 * Tienda del tema 07 · Launch (ref. P1): landing de lanzamiento de UN producto
 * (patinete eléctrico urbano) con sus accesorios. PRESENTACIÓN, no motor.
 */
import type { CollectionConfig } from './types';

export const launchCollection: CollectionConfig = {
  id: 'launch',
  themeId: 'launch',

  name: 'Vector',
  tagline: 'Movilidad urbana, sin humo',
  description:
    'Vector One, el patinete eléctrico urbano, y los accesorios que lo acompañan. Envío en 48 horas.',

  categories: [
    { id: 'lau-vehiculo', label: 'Vector One' },
    { id: 'lau-accesorios', label: 'Accesorios' },
  ],
};
