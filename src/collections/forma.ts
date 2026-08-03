import type { CollectionConfig } from './types';

export const formaCollection: CollectionConfig = {
  id: 'forma',
  themeId: 'forma',

  name: 'Forma',
  tagline: 'La belleza está en cómo ves',
  description: 'Gafas con carácter, diseñadas para mirar el mundo con otra perspectiva.',

  categories: [
    { id: 'for-opticas', label: 'Ópticas' },
    { id: 'for-solares', label: 'Solares' },
    { id: 'for-ediciones', label: 'Ediciones' },
  ],
};
