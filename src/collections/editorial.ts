/**
 * Colección `editorial` — Módulo Audio (audio y objeto de diseño).
 *
 * Tienda del tema 01 · Editorial (ref. Teenage Engineering): audio compacto y
 * objeto de diseño con anotaciones técnicas. PRESENTACIÓN, no motor.
 */
import type { CollectionConfig } from './types';

export const editorialCollection: CollectionConfig = {
  id: 'editorial',
  themeId: 'editorial',

  name: 'Módulo Audio',
  tagline: 'Audio y objeto de diseño',
  description:
    'Sintetizadores de bolsillo, altavoces y accesorios de audio con vocación de objeto de diseño.',

  categories: [
    { id: 'edi-sintes', label: 'Sintetizadores' },
    { id: 'edi-altavoces', label: 'Altavoces' },
    { id: 'edi-accesorios', label: 'Accesorios' },
  ],
};
