/** Colección `argent` — moda urbana de construcción y capas. */
import type { CollectionConfig } from './types';

export const argentCollection: CollectionConfig = {
  id: 'argent',
  themeId: 'argent',

  name: 'ARGENT.',
  tagline: 'Prendas para moverse fuera del encuadre',
  description: 'Moda urbana de silueta precisa, capas técnicas y campañas de pulso cinematográfico.',

  categories: [
    { id: 'arg-mujer', label: 'Mujer' },
    { id: 'arg-unisex', label: 'Unisex' },
    { id: 'arg-archivo', label: 'Archivo' },
  ],
};
