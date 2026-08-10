/** Colección `alva` — marroquinería y calzado escandinavo de autor. */
import type { CollectionConfig } from './types';

export const alvaCollection: CollectionConfig = {
  id: 'alva',
  themeId: 'alva',

  name: 'ALVA',
  tagline: 'Objetos para llevar, hechos con calma.',
  description: 'Bolsos y sandalias de piel con formas serenas, materiales honestos y una sensibilidad escandinava contemporánea.',
  categories: [
    { id: 'alv-bags', label: 'Bolsos' },
    { id: 'alv-shoes', label: 'Calzado' },
  ],
};
