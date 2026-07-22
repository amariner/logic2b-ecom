/**
 * Colección `minimal` — Forma Interior (mobiliario e interior).
 *
 * Tienda del tema 06 · Minimal (ref. propro): mobiliario de líneas simples
 * sobre gris claro. PRESENTACIÓN, no motor.
 */
import type { CollectionConfig } from './types';

export const minimalCollection: CollectionConfig = {
  id: 'minimal',
  themeId: 'minimal',

  name: 'Forma Interior',
  tagline: 'Mobiliario esencial',
  description:
    'Sofás, butacas y mesas de líneas simples. Mobiliario contemporáneo fabricado en pequeñas series.',

  categories: [
    { id: 'min-sofas', label: 'Sofás y butacas' },
    { id: 'min-mesas', label: 'Mesas' },
    { id: 'min-accesorios', label: 'Accesorios' },
  ],
};
