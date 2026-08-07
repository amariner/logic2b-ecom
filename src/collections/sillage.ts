/** Colección `sillage` — perfumería de autor SILLAGE. */
import type { CollectionConfig } from './types';

export const sillageCollection: CollectionConfig = {
  id: 'sillage',
  themeId: 'sillage',

  name: 'SILLAGE',
  tagline: 'Perfumería de autor, elegida una a una.',
  description:
    'SILLAGE reúne perfumes de autor, aceites aromáticos y cuidado corporal en una galería olfativa independiente.',
  categories: [
    { id: 'sil-perfume', label: 'Perfume' },
    { id: 'sil-oil', label: 'Aceites' },
    { id: 'sil-body-care', label: 'Cuidado corporal' },
  ],
};
