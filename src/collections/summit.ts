/** Colección `summit` — equipamiento alpino de autor SUMMIT. */
import type { CollectionConfig } from './types';

export const summitCollection: CollectionConfig = {
  id: 'summit',
  themeId: 'summit',

  name: 'SUMMIT',
  tagline: 'Diseñado para ganar altura.',
  description:
    'SUMMIT reúne prendas técnicas y equipamiento alpino de precisión en una colección sobria, resistente y construida para la alta montaña.',
  categories: [
    { id: 'sum-outerwear', label: 'Abrigo' },
    { id: 'sum-snow', label: 'Nieve' },
    { id: 'sum-accessories', label: 'Equipo' },
  ],
};
