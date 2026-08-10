/** Colección `nera` — sastrería femenina editorial NERA. */
import type { CollectionConfig } from './types';

export const neraCollection: CollectionConfig = {
  id: 'nera',
  themeId: 'nera',

  name: 'NERA',
  tagline: 'Sastrería que deja espacio.',
  description:
    'NERA reúne blazers, pantalones, vestidos y punto de líneas precisas en una colección femenina sobria y contemporánea.',
  categories: [
    { id: 'ner-tailoring', label: 'Sastrería' },
    { id: 'ner-pants', label: 'Pantalones' },
    { id: 'ner-tops', label: 'Tops' },
    { id: 'ner-knit', label: 'Punto' },
  ],
};
